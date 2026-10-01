"""Use the official local source, then the same validated collector on Liara."""
import os
from pathlib import Path
import datetime as dt,json,hashlib,subprocess,sys
P=Path(__file__).resolve().parent.parent;D=P/'work/liara-deploy-20260929/fx-dashboard';sys.path.insert(0,str(D))
from ifb_bonds import parse
from source_health import DATA_DIR,atomic_write
def main():
    # An outer process deadline bounds the complete HTTP body transfer as well as connect/read timeouts.
    try:
        local=subprocess.run([sys.executable,str(D/'ifb_bonds.py')],capture_output=True,text=True,encoding='utf-8',timeout=65)
        result=json.loads(local.stdout);assert local.returncode==0 and isinstance(result,dict)
    except (subprocess.TimeoutExpired,ValueError,AssertionError):
        pointer=DATA_DIR/'ifb-treasury/latest.json'
        result={'status':'official_bond_source_check_failed','checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'error_type':'bounded_local_collection_failed','previous_snapshot_retained':pointer.exists(),'location_deadline_seconds':65}
        if pointer.exists():
            previous=json.loads(pointer.read_text(encoding='utf-8'));result.update(retained_last_trade_date=previous.get('last_trade_date'),retained_snapshot_sha256=previous.get('snapshot_sha256'))
        atomic_write(DATA_DIR/'ifb-bond-health.json',result)
    if result.get('status')!='official_treasury_quotes_validated':
        runtime=os.environ['FX_BUNDLED_PYTHON'];helper=P/'work/liara-deploy-20260929/vm_command.py'
        try:
            # Do not run an older, unbounded remote collector while code awaits publication.
            expected=hashlib.sha256((D/'ifb_bonds.py').read_bytes()).hexdigest()
            version=subprocess.run([runtime,str(helper),'docker exec fx-dashboard sha256sum /app/ifb_bonds.py'],capture_output=True,text=True,encoding='utf-8',timeout=60)
            if version.returncode or version.stdout.split()[0]!=expected:
                result['liara_fallback']='bounded_remote_collector_not_deployed';print(json.dumps(result,ensure_ascii=True));return
            remote=subprocess.run([runtime,str(helper),'docker exec -w /app fx-dashboard timeout 65s python ifb_bonds.py'],capture_output=True,text=True,encoding='utf-8',timeout=80)
            meta=json.loads(remote.stdout);assert remote.returncode==0 and meta['status']=='official_treasury_quotes_validated'
            folder=DATA_DIR/'ifb-treasury';folder.mkdir(parents=True,exist_ok=True)
            for name in [meta['snapshot_file'],meta['document_file'],meta['snapshot_sha256']+'.xlsx']:
                assert '/' not in name and '\\' not in name and '..' not in name
                downloaded=subprocess.run([runtime,str(helper),'--download','/opt/fx-dashboard/data-health/ifb-treasury/'+name,str(folder/name)],capture_output=True,timeout=90);assert downloaded.returncode==0
            source=folder/meta['document_file'];raw=folder/meta['snapshot_file'];assert hashlib.sha256(source.read_bytes()).hexdigest()==meta['source_sha256'];assert hashlib.sha256(raw.read_bytes()).hexdigest()==meta['snapshot_sha256']
            records,derived,_=parse(source.read_bytes(),dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).date());body=json.loads(raw.read_text(encoding='utf-8'));assert body['records']==records and body['derived_indicator']==derived
            meta['collection_location']='liara';atomic_write(folder/'latest.json',meta);atomic_write(DATA_DIR/'ifb-bond-health.json',meta);result=meta
        except (subprocess.TimeoutExpired,ValueError,KeyError,AssertionError,IndexError):result['liara_fallback']='unavailable_or_validation_failed'
    print(json.dumps(result,ensure_ascii=True))
if __name__=='__main__':main()
