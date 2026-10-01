"""Publish validated public IFB snapshots, preserving every source vintage."""
import datetime as dt,hashlib,json,os,shutil,subprocess,sys,tarfile
from pathlib import Path
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def remote(stage):
    from source_health import DATA_DIR,atomic_write
    from ifb_bonds import parse
    meta=json.loads((stage/'latest.json').read_text(encoding='utf-8'));source=stage/meta['document_file'];snapshot=stage/meta['snapshot_file']
    assert source.parent==stage and snapshot.parent==stage
    assert digest(source)==meta['source_sha256'] and digest(snapshot)==meta['snapshot_sha256']
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).date();records,derived,checked=parse(source.read_bytes(),today);body=json.loads(snapshot.read_text(encoding='utf-8'))
    assert records==body['records'] and derived==body['derived_indicator'] and checked['last_trade_date']==meta['last_trade_date']
    folder=DATA_DIR/'ifb-treasury';folder.mkdir(parents=True,exist_ok=True);previous=folder/'latest.json'
    if previous.exists() and json.loads(previous.read_text(encoding='utf-8'))['snapshot_sha256']==meta['snapshot_sha256']:
        atomic_write(DATA_DIR/'ifb-bond-health.json',meta);print(json.dumps({'status':'already_published','last_trade_date':meta['last_trade_date']}));return
    if previous.exists():
        backup=DATA_DIR/'backups'/('ifb-'+stage.name);backup.mkdir(parents=True,exist_ok=True);shutil.copyfile(previous,backup/'latest.json')
    for filename in [meta['document_file'],meta['snapshot_file'],meta['snapshot_sha256']+'.xlsx']:
        candidate=stage/filename;assert candidate.parent==stage
        if candidate.exists():
            target=folder/filename
            if target.exists():assert digest(target)==digest(candidate)
            else:shutil.copyfile(candidate,target)
    atomic_write(previous,meta);atomic_write(DATA_DIR/'ifb-bond-health.json',meta)
    print(json.dumps({'status':'official_treasury_snapshot_published','last_trade_date':meta['last_trade_date'],'validated_instruments':meta['validated_instruments']}))
def local():
    root=Path(__file__).parent;sys.path.insert(0,str(root/'fx-dashboard'))
    from source_health import DATA_DIR
    from ifb_bonds import load_current
    meta,_=load_current();stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');package=root/('ifb-'+stamp+'.tar.gz');folder=DATA_DIR/'ifb-treasury'
    with tarfile.open(package,'w:gz') as archive:
        for name in ['latest.json',meta['document_file'],meta['snapshot_file'],meta['snapshot_sha256']+'.xlsx']:archive.add(folder/name,arcname=name)
    runtime=os.environ['FX_BUNDLED_PYTHON']
    def ssh(*args):
        result=subprocess.run([runtime,str(root/'vm_command.py'),*args],capture_output=True,text=True,encoding='utf-8',timeout=240)
        assert result.returncode==0,'IFB publication operation failed';return result.stdout.strip()
    ssh('--upload',str(package),'/tmp/ifb-'+stamp+'.tar.gz');ssh('--upload',str(Path(__file__)),'/tmp/publish_ifb_bonds.py')
    stage='/opt/fx-dashboard/data-health/staging/ifb-'+stamp
    result=json.loads(ssh(f'mkdir -p {stage} && tar -xzf /tmp/ifb-{stamp}.tar.gz -C {stage} && docker cp /tmp/publish_ifb_bonds.py fx-dashboard:/app/publish_ifb_bonds.py && docker exec -w /app fx-dashboard python publish_ifb_bonds.py --remote /data-health/staging/ifb-{stamp}'))
    print(json.dumps(result))
if __name__=='__main__':
    if '--remote' in sys.argv:remote(Path(sys.argv[-1]))
    else:local()
