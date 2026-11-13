"""Explicit caller-only provider. Import performs no native I/O. No CLI/action.

The existing wrapper owns encrypted partial retention and the reviewed controller
owns attempt/unknown-result reconciliation. This module never retries or writes.
"""
import base64,datetime,hashlib,json,os,stat,sys,types
from pathlib import Path

POLICY_SHA='c905b8a11fa740b4ff34bda468d567ef1382aaaf3cffa46325ede8f194c55494'
GATE_SHA='a90996ce371a97701c50d5937fa11f866911f9387cbf9f4a1b130e4563c1fc3a'
BINDING_SHA='390fc73da29c3b53e267c4566eb538ebb0142c6426a032b41e27e969eaa5ac27'
ENVELOPE_SHA='f6f47835716e95b381f8f638e5c0afc9844b8e0e165a0b3cfcb9fe5a5c11793e'

def require(value):
    if not value:raise ValueError('v3_provider_guard')

def digest(raw):return hashlib.sha256(raw).hexdigest()
def signature(s):return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_uid,s.st_mode,s.st_nlink)
def publicstat(s):return dict(device=s.st_dev,inode=s.st_ino,length=s.st_size,mtimeNs=s.st_mtime_ns,ctimeNs=s.st_ctime_ns,owner=s.st_uid,mode=oct(stat.S_IMODE(s.st_mode)),links=s.st_nlink)

def load(packet):
    require(set(packet)=={'policy','gate','binding','envelope'})
    blobs={k:base64.b64decode(v,validate=True) for k,v in packet.items()}
    for k,pin in [('policy',POLICY_SHA),('gate',GATE_SHA),('binding',BINDING_SHA),('envelope',ENVELOPE_SHA)]:
        require(len(blobs[k])<=65536 and digest(blobs[k])==pin)
    policy=json.loads(blobs['policy'])
    require(policy['actualNativeArchiveRecords'] is None and policy['actualNativeArchiveStreams'] is None)
    gate=types.ModuleType('reviewed_v3_read_gate')
    exec(compile(blobs['gate'],'/in-memory/checkpoint-read-gate.py','exec'),gate.__dict__)
    return policy,gate,blobs

def parent(base,relative):
    parts=relative.split('/')
    require(parts and all(x not in ('','.','..') for x in parts) and not relative.startswith('/'))
    require(base.resolve(strict=True)==base)
    fd=os.open(base,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            s=os.fstat(fd);require(s.st_uid==0 and s.st_mode&0o077==0)
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=child
        s=os.fstat(fd);require(s.st_uid==0 and s.st_mode&0o077==0)
        return fd,parts[-1],(s.st_dev,s.st_ino,s.st_uid,s.st_mode)
    except BaseException:os.close(fd);raise

def observe(base,relative,role,sink=None):
    # Parent ENOENT is outside the child exception handler: never absence evidence.
    fd,name,pid=parent(base,relative)
    try:
        try:child=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
        except FileNotFoundError:
            require(role['observedState']=='observed_absent' and sink is None)
            other,n,pid2=parent(base,relative)
            try:
                require(pid2==pid)
                try:os.stat(n,dir_fd=other,follow_symlinks=False)
                except FileNotFoundError:
                    return {'state':'absent','length':None,'sha256':None,'observation':{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ownedParent':True,'nofollow':True,'reopenedSameParent':True,'secondChildENOENT':True,'neverCreated':None,'historicalNotDeleted':None}}
                raise ValueError('v3_child_appeared')
            finally:os.close(other)
        try:
            require(role['observedState']=='present')
            before=os.fstat(child)
            require(stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_mode&0o077==0 and before.st_nlink==1)
            require(publicstat(before)==role['observedStat'] and before.st_size==role['length'])
            require(role['role']=='original.dump' or before.st_size<=524288)
            h=hashlib.sha256();n=0
            while True:
                data=os.read(child,65536)
                if not data:break
                n+=len(data);require(n<=role['length']);h.update(data)
                if sink is not None:sink.write(data)
            require(n==role['length'] and h.hexdigest()==role['sha256'] and signature(before)==signature(os.fstat(child)))
            other,oname,pid2=parent(base,relative)
            try:
                require(pid2==pid)
                reopened=os.open(oname,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=other)
                try:require(signature(before)==signature(os.fstat(reopened)))
                finally:os.close(reopened)
            finally:os.close(other)
            return {'state':'present','length':n,'sha256':h.hexdigest(),'stat':publicstat(before),'ownedParent':True,'nofollow':True,'fdStable':True,'reopenIdentityEqual':True}
        finally:os.close(child)
    finally:os.close(fd)

def validate_gate(proof,policy,gate):
    require(proof['status']=='PASS_PINNED_SQL_RESTORE_READ_GATE' and proof['checkpoint']==policy['checkpoint'])
    require(proof['bindingSha256']==BINDING_SHA and proof['sourceId']==gate.SOURCE_ID and proof['targetId']==gate.TARGET_ID)
    require(proof['dumpSha256']==policy['roles'][0]['sha256'] and proof['dumpBytes']==policy['roles'][0]['length'])
    require(proof['sourceHealthy'] is True and proof['proofStopped'] is True and proof['proofNetwork']=='none')
    require(proof['releaseAuthorized'] is False and proof['sqlExecuted'] is False and proof['backupRetried'] is False and proof['proofPortsPublished'] is False)

def run(packet,mode,index=-1,length=0,sha=''):
    require(os.name=='posix' and mode in ('metadata','file'))
    import fcntl
    policy,gate,blobs=load(packet)
    roles=policy['roles'];require(len(roles)==26)
    if mode=='file':
        require(type(index) is int and 0<=index<24 and roles[index]['observedState']=='present')
        require(type(length) is int and length==roles[index]['length'] and sha==roles[index]['sha256'])
    with gate.opened(gate.BASE,'.cashflow-release.lock',private=False) as lock:
        require(os.fstat(lock.fileno()).st_nlink==1)
        fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
        gate.validate_states(gate.inspect(gate.SOURCE),gate.inspect(gate.TARGET))
        if mode=='metadata':
            proof=gate.run(blobs['binding'],BINDING_SHA);validate_gate(proof,policy,gate)
            entries=[]
            for role in roles:
                if role['origin']=='memory':
                    raw=blobs['binding' if role['role']=='binding' else 'envelope']
                    require(len(raw)==role['length'] and digest(raw)==role['sha256'])
                    entry={'state':'present','length':len(raw),'sha256':digest(raw),'recordedEvidenceOnly':True}
                else:
                    relative=(policy['checkpoint']+'/' if role['origin']=='checkpoint' else '')+role['name']
                    entry=observe(gate.BASE,relative,role)
                entries.append(dict(role=role['role'],name=role['name'],origin=role['origin'],**entry))
            gate.validate_states(gate.inspect(gate.SOURCE),gate.inspect(gate.TARGET))
            print(json.dumps({'artifacts':entries,'freshReadGate':proof,'policySha256':POLICY_SHA,'releaseAuthorized':False,'readiness':False},separators=(',',':')))
        else:
            role=roles[index];relative=(policy['checkpoint']+'/' if role['origin']=='checkpoint' else '')+role['name']
            observe(gate.BASE,relative,role,sys.stdout.buffer)
            gate.validate_states(gate.inspect(gate.SOURCE),gate.inspect(gate.TARGET))
