"""Run archive verifier + adapter unit tests in the already-approved cached Linux image.

No runtime download, host mounts, ports, shared socket, DB target or operational action.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[3]
IMAGE='sha256:5789aa194f757888f41fa3d48e14b6feaa1b57c0af0b56fcb1372d6474d3bff0'
FILES=['scripts/testing/consultation-feedback/install-feedback.py','scripts/testing/consultation-feedback/install-feedback.test.py',
       'scripts/testing/consultation-next/install-native.py','supabase/migrations/20261029142010_consultation_feedback_states.sql',
       'supabase/migrations/20261029160723_consultation_feedback_rollout_guard.sql','docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql',
       'docs/ops/start-a-finance-v04-20261029/rollback-rollout.sql']
BOOT=r'''
import sys,tarfile,pathlib,zipfile,subprocess,json,platform,hashlib
with tarfile.open(fileobj=sys.stdin.buffer,mode="r|") as t:t.extractall("/work",filter="data")
with zipfile.ZipFile("/work/release.zip") as z:
 assert z.testzip() is None and all(not pathlib.PurePosixPath(n).is_absolute() and ".." not in pathlib.PurePosixPath(n).parts for n in z.namelist())
 z.extractall("/work/release")
v=subprocess.run([sys.executable,"/work/release/verify-transfer.py","/work/release"],capture_output=True,text=True)
u=subprocess.run([sys.executable,"/work/repo/scripts/testing/consultation-feedback/install-feedback.test.py"],capture_output=True,text=True)
tested={str(p.relative_to("/work/repo")):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path("/work/repo").rglob("*") if p.is_file() and "__pycache__" not in p.parts}
print(json.dumps({"kernel":platform.release(),"platform":platform.platform(),"python":sys.version,"archiveSha256":hashlib.sha256(pathlib.Path("/work/release.zip").read_bytes()).hexdigest(),"testedFileSha256":tested,"verifierExit":v.returncode,"verifierResult":json.loads(v.stdout) if v.returncode==0 else None,"unitExit":u.returncode,"unitSummary":u.stderr,"network":"none","databaseTransport":"MOCKED_IN_UNIT","realFcntl":True,"sqlRehearsal":"SEPARATE","nativeOnlineAcceptance":False}));sys.exit(v.returncode or u.returncode)
'''


def run(archive):
    stream=io.BytesIO()
    with tarfile.open(fileobj=stream,mode='w') as tar:
        for name in FILES:
            # Test snapshot uses the same LF convention as canonical Git blobs.
            raw=(ROOT/name).read_bytes().replace(b'\r\n',b'\n')
            item=tarfile.TarInfo('repo/'+name);item.size=len(raw);tar.addfile(item,io.BytesIO(raw))
        raw=archive.read_bytes();item=tarfile.TarInfo('release.zip');item.size=len(raw);tar.addfile(item,io.BytesIO(raw))
    name='start-a-linux-'+uuid4().hex[:12]
    command=['docker','run','--rm','-i','--pull','never','--name',name,'--label','start-a.linux-owner='+name,
             '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128',
             '--memory','256m','--cpus','1','--tmpfs','/work:rw,nosuid,size=67108864','--tmpfs','/tmp:rw,nosuid,size=33554432',IMAGE,'python','-c',BOOT]
    process=subprocess.run(command,input=stream.getvalue(),capture_output=True,timeout=90)
    if not process.stdout:
        raise RuntimeError('linux_runtime_failed_review_owned_container')
    result=json.loads(process.stdout)
    result.update({'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'image':IMAGE,
                   'imageSource':'docker.io/library/python:3.12-alpine','imageUncompressedBytes':74093534,
                   'containerExit':process.returncode,'containerName':name,'hostMounts':False,'ports':False,'sharedSocket':False,
                   'command':'python scripts/testing/consultation-feedback/linux-check.py --artifact R2_ARCHIVE'})
    result['ownedContainerRemoved']=subprocess.run(['docker','inspect',name],capture_output=True,timeout=10).returncode!=0
    print(json.dumps(result))
    return process.returncode


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact',required=True,type=Path)
    raise SystemExit(run(parser.parse_args().artifact))
