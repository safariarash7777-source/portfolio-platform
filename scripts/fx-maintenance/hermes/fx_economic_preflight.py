"""Deterministic source checks before the maintenance model sees metadata only."""
import json
from pathlib import Path
import subprocess
import sys
import datetime as dt
import time
import os
import msvcrt

project=Path(os.environ['FX_MAINTENANCE_ROOT']).resolve()
python=Path(os.environ['FX_LOCAL_PYTHON'])
dashboard=project/'work/liara-deploy-20260929/fx-dashboard'
sys.path.insert(0,str(project/'work'))

lock_file=open(project/'outputs/hermes-fx-preflight.lock','a+b')
try:
    lock_file.seek(0)
    msvcrt.locking(lock_file.fileno(),msvcrt.LK_NBLCK,1)
except OSError:
    print(json.dumps({'status':'another_preflight_running'}))
    sys.exit(0)

status_path=dashboard/'.data_health/agent-status.json'
run_state={'run_id':dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'),'started_at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'running','cadence_days':5,'local_dependency':True,'stages':[]}
last_remote_publication=0.0
def save_state(force=False):
    global last_remote_publication
    from publish_agent_status import publish_status, publish, schedule_metadata
    run_state['schedule']=schedule_metadata()
    run_state['updated_at']=dt.datetime.now(dt.timezone.utc).isoformat()
    status_path.parent.mkdir(parents=True,exist_ok=True)
    tmp=status_path.with_suffix('.tmp');tmp.write_text(json.dumps(run_state,ensure_ascii=False),encoding='utf-8');os.replace(tmp,status_path)
    (project/'outputs/hermes-fx-agent-status.json').write_text(json.dumps(run_state,ensure_ascii=False),encoding='utf-8')
    if not force and time.monotonic()-last_remote_publication<60:return
    receipt=publish_status(status_path)
    run_state['status_publication']=receipt['status']
    last_remote_publication=time.monotonic()
    if force:
        run_state['source_status_publications']={}
        for name in ['relay-health.json','cbi-tsd-health.json','source-registry.json','ifb-bond-health.json','cbi-model-mapping.json']:
            path=dashboard/'.data_health'/name
            if path.exists():run_state['source_status_publications'][name]=publish(path)['status']
    # Keep the exact published bytes intact. Publication result lives in a separate receipt.

import atexit
def finalize_unexpected_exit():
    if not run_state.get('finished_at'):
        run_state.update(status='execution_failed',execution_result='failed',readiness='execution_failed',finished_at=dt.datetime.now(dt.timezone.utc).isoformat())
        for stage in run_state['stages']:
            if stage['status']=='running':stage['status']='failed'
        try:save_state(force=True)
        except Exception:pass
atexit.register(finalize_unexpected_exit)

save_state()

def execute(script):
    try:
        result=subprocess.run([str(python),str(script)],cwd=project,capture_output=True,text=True,encoding='utf-8',timeout=420 if script.name in ('publish_annual_gdp.py','publish_additional_annual.py','publish_sci_inflation.py','check_ifb_bonds.py','publish_ifb_bonds.py','cbi_tsd_catalog.py') else 180)
    except subprocess.TimeoutExpired:
        return {'script':script.name,'status':'timed_out'}
    if result.returncode:
        return {'script':script.name,'status':'failed','exit_code':result.returncode}
    try:
        from metadata_contract import normalize
        return normalize(json.loads(result.stdout),script.name)
    except ValueError:return {'script':script.name,'status':'invalid_metadata_output'}

def run(script):
    from metadata_contract import LABELS,display_status
    stage={'stage':LABELS.get(script.name,script.name),'script':script.name,'status':'running','started_at':dt.datetime.now(dt.timezone.utc).isoformat()}
    run_state['stages'].append(stage)
    save_state()
    result=execute(script)
    stage.update(status=display_status(result.get('status','checked')),result_status=result.get('status','checked'),finished_at=dt.datetime.now(dt.timezone.utc).isoformat())
    for key in ('official_period','source_last_updated','updated_cells','changed_cells'):
        if key in result:stage[key]=result[key]
    if result.get('series'):
        stage['series']=[{k:x[k] for k in ('id','series_id','title','status','catalog_last_year','excel_binding','official_period','last_period') if k in x} for x in result['series'] if isinstance(x,dict)]
    if stage['status'] in ('failed','timed_out','invalid_metadata_output'):run_state['status']='attention_required'
    save_state()
    return result

reports={
    'existing_relay':run(project/'work/check_existing_relay.py'),
    'ifb_treasury':run(project/'work/check_ifb_bonds.py'),
    'cbi_tsd':run(project/'work/cbi_tsd_catalog.py'),
    'cbi_mapping':run(project/'work/validate_cbi_mapping.py'),
    'official_documents':run(dashboard/'economic_release_check.py'),
    'definitions':run(project/'work/fetch_fred_metadata.py'),
    'macro':run(dashboard/'macro_health.py'),
    'remaining':run(project/'work/liara-deploy-20260929/audit_remaining_inputs.py'),
}
if reports['ifb_treasury'].get('status')=='official_treasury_quotes_validated':
    reports['ifb_publication']=run(project/'work/liara-deploy-20260929/publish_ifb_bonds.py')
reports['fred_publication']=run(project/'work/liara-deploy-20260929/publish_verified_fred.py')
reports['sci_official_check']=run(project/'work/fetch_sci_current.py')
if reports['sci_official_check'].get('status')=='official_tables_validated':
    reports['sci_revision']=run(project/'work/apply_sci_inflation.py')
    if reports['sci_revision'].get('status') in ('monthly_inflation_updated','already_current'):
        reports['sci_publication']=run(project/'work/liara-deploy-20260929/publish_sci_inflation.py')
reports['us_annual_gdp_check']=run(project/'work/check_worldbank_gdp.py')
if all(item.get('status')=='definition_and_snapshot_validated' for item in reports['us_annual_gdp_check'].get('series',[])) and reports['us_annual_gdp_check'].get('series'):
    reports['us_annual_gdp_revision']=run(project/'work/apply_verified_us_gdp.py')
    if reports['us_annual_gdp_revision'].get('status') in ('annual_observations_updated','already_current'):
        reports['us_annual_gdp_publication']=run(project/'work/liara-deploy-20260929/publish_annual_gdp.py')
reports['additional_annual_check']=run(project/'work/check_additional_annual.py')
if reports['additional_annual_check'].get('series') and all(item.get('status')=='definition_and_snapshot_validated' for item in reports['additional_annual_check']['series']):
    reports['additional_annual_revision']=run(project/'work/apply_additional_annual.py')
    if reports['additional_annual_revision'].get('status') in ('matching_annual_series_updated','already_current'):
        reports['additional_annual_publication']=run(project/'work/liara-deploy-20260929/publish_additional_annual.py')
run_state['status']='checks_finished' if run_state['status']=='running' else run_state['status']
from agent_readiness import assess
readiness=assess(reports)
run_state.update(readiness)
if readiness['pending_sources']:run_state['status']='attention_required'
run_state['finished_at']=dt.datetime.now(dt.timezone.utc).isoformat()
run_state['execution_result']='completed_with_errors' if any(s.get('result_status') in ('failed','timed_out','invalid_metadata_output') for s in run_state['stages']) else 'completed'
save_state(force=True)
archive=project/'outputs/hermes-fx-runs'/run_state['run_id']
archive.mkdir(parents=True,exist_ok=True)
(archive/'progress.json').write_text(json.dumps(run_state,ensure_ascii=False),encoding='utf-8')
(project/'outputs/hermes-fx-preflight.json').write_text(json.dumps(reports,ensure_ascii=False),encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
from write_agent_run_report import write
summary=write(reports,project,run_state['run_id'],readiness)
print(json.dumps(summary,ensure_ascii=False))
