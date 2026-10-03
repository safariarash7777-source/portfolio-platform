"""Prepare/install only the P00-coordinated status image; preserve container config/data."""
import argparse,datetime as dt,hashlib,http.client,json,os,socket,time
from pathlib import Path
RELEASE_DIR=Path('/opt/fx-dashboard/releases/recovery01-status-20261003')
DATA_DIR=Path('/opt/fx-dashboard/data-health')
class UnixConnection(http.client.HTTPConnection):
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')
def api(method,path,body=None):
 c=UnixConnection('localhost',timeout=20);c.request(method,path,json.dumps(body).encode() if body is not None else None,{'Content-Type':'application/json'});r=c.getresponse();raw=r.read();c.close()
 if r.status>=400:raise RuntimeError('Docker operation failed: '+str(r.status))
 return json.loads(raw) if raw else None
def digest(raw):return hashlib.sha256(raw).hexdigest()
def store(path,body):
 raw=json.dumps(body,indent=2).encode();fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'wb') as f:f.write(raw)
 assert digest(path.read_bytes())==digest(raw)
def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','install','rollback']);p.add_argument('--manifest',required=True);p.add_argument('--receipt');args=p.parse_args()
 manifest=json.loads(Path(args.manifest).read_text());base=manifest['base_image_id'];candidate=manifest['candidate_image_id']
 folder=RELEASE_DIR;folder.mkdir(parents=True,exist_ok=True);backup=folder/'container-before.private.json';statefile=folder/'release-state.json';name='fx-dashboard';oldname='fx-dashboard-recovery01-status-backup';failedname='fx-dashboard-recovery01-status-failed'
 if args.mode=='prepare':
  current=api('GET','/containers/'+name+'/json');assert current['Image']==base
  assert api('GET','/images/'+candidate+'/json')['Id']==candidate
  assert any(m['Source']=='/opt/fx-dashboard/data-health' and m['Destination']=='/data-health' and m['RW'] for m in current['Mounts'])
  store(backup,current)
  metadata=folder/'metadata-before';metadata.mkdir(exist_ok=True)
  for filename in ['agent-status.json','agent-status-publication.json']:
   source=DATA_DIR/filename
   if source.exists():(metadata/filename).write_bytes(source.read_bytes());assert (metadata/filename).read_bytes()==source.read_bytes()
  state={'mission':'RECOVERY-01','prepared':True,'installed':False,'base_image_id':base,'candidate_image_id':candidate,'config_backup_sha256':digest(backup.read_bytes()),'metadata_backup_present':True,'old_container_name':oldname,'data_mount_unchanged':True}
  store(statefile,state);print(json.dumps(state));return
 before=json.loads(backup.read_bytes());state=json.loads(statefile.read_bytes());assert state['config_backup_sha256']==digest(backup.read_bytes())
 def rollback():
  try:
   current=api('GET','/containers/'+name+'/json')
   if current['Image']==candidate:
    if current['State']['Running']:api('POST','/containers/'+name+'/stop?t=15')
    api('POST','/containers/'+name+'/rename?name='+failedname)
  except RuntimeError:pass
  api('POST','/containers/'+oldname+'/rename?name='+name);api('POST','/containers/'+name+'/start')
  assert api('GET','/containers/'+name+'/json')['Image']==base
  state.update(installed=False,rollback_completed=True);store(statefile,state)
 if args.mode=='rollback':rollback();print(json.dumps({'status':'rolled_back','image_id':base}));return
 receipt=json.loads(Path(args.receipt).read_text());assert receipt.get('approved_by')=='P00' and receipt.get('candidate_image_id')==candidate and receipt.get('base_image_id')==base and receipt.get('mission')=='RECOVERY-01'
 current=api('GET','/containers/'+name+'/json');assert current['Id']==before['Id'] and current['Image']==base
 config=dict(before['Config']);config['Image']=candidate;config['HostConfig']=before['HostConfig'];config['NetworkingConfig']={'EndpointsConfig':{network:{k:settings.get(k) for k in ['IPAMConfig','Aliases','Links'] if settings.get(k) is not None} for network,settings in before['NetworkSettings']['Networks'].items()}}
 # Docker inspect includes additional config metadata accepted by the create API; strip deprecated runtime-only fields.
 config.pop('ArgsEscaped',None);api('POST','/containers/'+name+'/rename?name='+oldname)
 try:
  api('POST','/containers/create?name='+name,config);api('POST','/containers/'+oldname+'/stop?t=15');api('POST','/containers/'+name+'/start')
  deadline=time.monotonic()+60
  while time.monotonic()<deadline:
   after=api('GET','/containers/'+name+'/json')
   if after['State'].get('Health',{}).get('Status')=='healthy':break
   if not after['State']['Running']:raise RuntimeError('New status runtime stopped')
   time.sleep(2)
  else:raise RuntimeError('New status runtime health deadline')
  assert after['Image']==candidate and sorted(after['Config']['Env'])==sorted(before['Config']['Env'])
  assert [(m['Source'],m['Destination'],m['RW']) for m in after['Mounts']]==[(m['Source'],m['Destination'],m['RW']) for m in before['Mounts']]
  assert after['HostConfig']['RestartPolicy']==before['HostConfig']['RestartPolicy']
  state.update(installed=True,installed_at=dt.datetime.now(dt.timezone.utc).isoformat(),health='healthy',env_preserved=True);store(statefile,state);print(json.dumps(state))
 except Exception:
  rollback();raise
if __name__=='__main__':main()
