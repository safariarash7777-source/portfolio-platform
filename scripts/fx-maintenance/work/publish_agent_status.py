"""Publish metadata, re-read remote bytes, then publish a matching receipt."""
import os
import datetime as dt
import json
import subprocess
from pathlib import Path

PROJECT=Path(__file__).resolve().parent.parent
DASHBOARD=PROJECT/'work/liara-deploy-20260929/fx-dashboard'
RUNTIME=os.environ['FX_BUNDLED_PYTHON']
HELPER=PROJECT/'work/liara-deploy-20260929/vm_command.py'

def publish(path,remote_folder='/opt/fx-dashboard/data-health'):
    try:
        result=subprocess.run([RUNTIME,str(HELPER),'--upload-verified',str(path),remote_folder+'/'+path.name],capture_output=True,text=True,encoding='utf-8',timeout=90)
        output=json.loads(result.stdout)
        assert result.returncode==0 and output['status']=='verified'
        return output
    except (subprocess.TimeoutExpired, ValueError, AssertionError, KeyError):
        return {'status':'failed'}

def publish_status(path,remote_folder='/opt/fx-dashboard/data-health'):
    result=publish(path,remote_folder)
    receipt=dict(result,run_id=json.loads(path.read_text(encoding='utf-8'))['run_id'],verified_at=dt.datetime.now(dt.timezone.utc).isoformat())
    target=path.with_name('agent-status-publication.json')
    temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(receipt,ensure_ascii=False),encoding='utf-8');temporary.replace(target)
    if result['status']=='verified':
        published=publish(target,remote_folder)
        if published['status']!='verified':receipt.update(status='receipt_publication_failed')
    name='fx-agent-status-publication.json' if remote_folder=='/opt/fx-dashboard/data-health' else 'fx-agent-isolated-publication-20261001.json'
    (PROJECT/'outputs'/name).write_text(json.dumps(receipt),encoding='utf-8')
    return receipt

def schedule_metadata():
    try:
        jobs=json.loads((Path.home()/'AppData/Local/hermes/cron/jobs.json').read_text(encoding='utf-8'))
        if isinstance(jobs,dict):jobs=jobs.get('jobs',[])
        if isinstance(jobs,dict):jobs=list(jobs.values())
        job=next(j for j in jobs if j.get('id')=='9f78482170f4')
        return {k:job.get(k) for k in ('id','enabled','last_run_at','last_status','next_run_at')}
    except (OSError,ValueError,StopIteration,TypeError):return {'id':'9f78482170f4','next_run_at':None}

if __name__=='__main__':
    print(json.dumps(publish_status(DASHBOARD/'.data_health/agent-status.json')))
