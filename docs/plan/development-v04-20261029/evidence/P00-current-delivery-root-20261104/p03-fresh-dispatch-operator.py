import datetime,json,os,re,subprocess,sys,urllib.request,urllib.error
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
REPO='safariarash7777-source/portfolio-platform'
checkout=Path(r'C:\Users\Asus\Documents\ChatGPT\توسعه سایت\company-tools-20261024')
COMPOSITION_PROFILES={
 'd6ccafec6b0ea793c9cb7a90a11d4d43833a71c9': {'candidate':'e0b930927563d7f9f6d79e848917c4ba0d77ed6f','capsule':'54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255','driver':'e8b12e8f44e80e6fc41719028769ea126a16a4250f0a6b0e2433d8481b643850','ci':41815979013},
 '7cab80d679686bb09f7c1e1124fa2a9c3649ae05': {'candidate':'e0b930927563d7f9f6d79e848917c4ba0d77ed6f','capsule':'54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255','driver':'e8b12e8f44e80e6fc41719028769ea126a16a4250f0a6b0e2433d8481b643850','ci':41812805098},
 'af41371715f7b905d65876d0362b4a4dbd432041': {'candidate':'e0b930927563d7f9f6d79e848917c4ba0d77ed6f','capsule':'67d67bc171f92ee7308c738b9aedaa6ef730158aca75703fccd10c9b2d205afb','driver':'3da3f5babd4e668ca5f53d652efaca721bba2594b91d29c131b46d842e4a7d34','ci':41808965021},
 '8f2b6bd51460e097b8676efbe51ca8e6b09c3ffa': {'candidate':'e0b930927563d7f9f6d79e848917c4ba0d77ed6f','capsule':'f03a1e3528374db1ba45a48d1c6cc550df71b0e95de6604434834afca31e7711','driver':'fe100232e61504d2228c7ca6ea1108e64e1f35bff3011691065d849de83b22f4','ci':41796171731},
 'c5d6da6eecdbbe345ede09bda2f0e203028f8b5e': {'candidate':'e0b930927563d7f9f6d79e848917c4ba0d77ed6f','capsule':'67d67bc171f92ee7308c738b9aedaa6ef730158aca75703fccd10c9b2d205afb','driver':'3da3f5babd4e668ca5f53d652efaca721bba2594b91d29c131b46d842e4a7d34','ci':41804303212},
}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
def main():
 if len(sys.argv) not in (2,3) or (len(sys.argv)==3 and sys.argv[2]!='--readback'):raise ValueError('MODE_SCOPE')
 request_path=Path(sys.argv[1]).resolve()
 if request_path.parent!=Path(__file__).resolve().parent or request_path.suffix!='.json': raise ValueError('REQUEST_SCOPE')
 job=json.loads(request_path.read_text(encoding='utf-8'))
 if set(job)!={'workflow','ref','expectedHead','inputs','purpose'}: raise ValueError('REQUEST_KEYS')
 if job['workflow']=='relay-health.yml':
  passive=job['purpose']=='READ_ONLY_EXISTING_RELAY_DIAGNOSTIC' and set(job['inputs'])=={'note'}
  discovery=job['purpose']=='READ_ONLY_EXISTING_RELAY_BINDING_DISCOVERY' and set(job['inputs'])=={'note','operation'} and job['inputs'].get('operation')=='discovery' and bool(re.fullmatch('readonly-binding-discovery-[a-f0-9]{32}',job['inputs'].get('note','')))
  if job['ref']!='main' or not (passive or discovery): raise ValueError('READ_ONLY_SCOPE')
 elif job['workflow']=='ci.yml':
  parent=job['purpose']=='BOUNDED_OWNED_LINUX_NATIVE' and set(job['inputs'])=={'assembled_native','allocation_id','reviewed_helper_sha'}
  composition=job['purpose']=='BOUNDED_OWNED_LINUX_P03_COMPOSITION' and set(job['inputs'])=={'assembled_native','allocation_id','reviewed_helper_sha','acceptance_profile','candidate_sha','capsule_sha256','driver_sha256'}
  if job['ref']!='codex/assembled-native-ci-20261104' or not (parent or composition): raise ValueError('NATIVE_SCOPE')
  if composition:
   spec=COMPOSITION_PROFILES.get(job['expectedHead'])
   if spec is None or job['inputs']['acceptance_profile']!='p03-composition-e0-v1' or job['inputs']['candidate_sha']!=spec['candidate'] or job['inputs']['capsule_sha256']!=spec['capsule'] or job['inputs']['driver_sha256']!=spec['driver']: raise ValueError('COMPOSITION_BINDING')
  if job['inputs']['assembled_native']!='true' or job['inputs']['reviewed_helper_sha']!=job['expectedHead']: raise ValueError('NATIVE_HEAD')
 elif job['workflow']=='assembled-native-runner-observation.yml':
  if job['ref']!='main' or job['purpose']!='READ_ONLY_RUNNER_CHROME_OBSERVATION' or set(job['inputs'])!={'reviewed_source_sha'}: raise ValueError('RUNNER_OBSERVATION_SCOPE')
  if job['inputs']['reviewed_source_sha']!=job['expectedHead']: raise ValueError('RUNNER_OBSERVATION_HEAD')
 else: raise ValueError('WORKFLOW_SCOPE')
 if not re.fullmatch('[a-f0-9]{40}',job['expectedHead']): raise ValueError('HEAD_FORMAT')
 env=dict(os.environ,GIT_TERMINAL_PROMPT='0',GCM_INTERACTIVE='never')
 credentials=subprocess.run(['git','credential','fill'],cwd=checkout,env=env,input=b'protocol=https\nhost=github.com\n\n',capture_output=True,timeout=20)
 fields=dict(line.split('=',1) for line in credentials.stdout.decode('utf-8').splitlines() if '=' in line)
 token=fields.get('password')
 if credentials.returncode or not token: raise ValueError('EXISTING_CREDENTIAL_UNAVAILABLE')
 del fields,credentials
 def read_api(path):
  request=urllib.request.Request('https://api.github.com/repos/'+REPO+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
  with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:
   raw=response.read(2097153)
   if response.status!=200 or len(raw)>2097152:raise ValueError('API_RESPONSE_SCOPE')
  return json.loads(raw)
 def check_remote_head():
  try:ref=read_api('/git/ref/heads/'+job['ref'])
  except Exception:raise ValueError('REMOTE_HEAD_READ_UNAVAILABLE') from None
  if not isinstance(ref,dict) or ref.get('ref')!='refs/heads/'+job['ref'] or not isinstance(ref.get('object'),dict) or ref['object'].get('type')!='commit' or not re.fullmatch('[a-f0-9]{40}',str(ref['object'].get('sha',''))):raise ValueError('REMOTE_HEAD_READ_UNAVAILABLE')
  if ref['object']['sha']!=job['expectedHead']:raise ValueError('REMOTE_HEAD_CHANGED')
 check_remote_head()
 if len(sys.argv)==3:
  if job['purpose'] not in ('BOUNDED_OWNED_LINUX_P03_COMPOSITION','READ_ONLY_EXISTING_RELAY_BINDING_DISCOVERY'):raise ValueError('READBACK_SCOPE')
  accepted=json.loads(request_path.with_name(request_path.stem+'-result.json').read_text())
  if accepted.get('httpStatus')!=204:raise ValueError('ACCEPTED_DISPATCH_REQUIRED')
  started=datetime.datetime.fromisoformat(accepted['atUtc'])
  request=urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/workflows/'+job['workflow']+'/runs?event=workflow_dispatch&branch='+job['ref'].replace('/','%2F')+'&per_page=20',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
  with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:data=json.loads(response.read(2097152))
  del token,request
  matches=[r for r in data.get('workflow_runs',[]) if r.get('head_sha')==job['expectedHead'] and -3<=(datetime.datetime.fromisoformat(r['created_at'].replace('Z','+00:00'))-started).total_seconds()<=180]
  if len(matches)!=1:raise ValueError('RUN_READBACK_NOT_UNIQUE')
  run=matches[0]
  if run.get('event')!='workflow_dispatch' or run.get('run_attempt')!=1:raise ValueError('RUN_READBACK_SCOPE')
  result={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'automaticRetry':False,'allocationId':job['inputs'].get('allocation_id'),'note':job['inputs'].get('note'),'run':{k:run.get(k) for k in ['id','head_sha','head_branch','event','status','conclusion','run_attempt','created_at','updated_at','html_url']},'allocationBinding':'REQUEST_ASSOCIATION_ONLY_UNTIL_INDEPENDENT_ARTIFACT_READBACK'}
  with request_path.with_name(request_path.stem+'-readback-'+datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S%f')+'.json').open('x',encoding='utf-8') as stream:json.dump(result,stream,indent=2);stream.flush();os.fsync(stream.fileno())
  print(json.dumps(result));return 0
 if job['purpose']=='BOUNDED_OWNED_LINUX_P03_COMPOSITION':
  # Fresh source/mock CI must have finished; no simultaneous native allocation.
  ci=read_api('/actions/runs/'+str(COMPOSITION_PROFILES[job['expectedHead']]['ci']))
  if ci.get('head_sha')!=job['expectedHead'] or ci.get('status')!='completed' or ci.get('conclusion')!='success': raise ValueError('COMPOSITION_ORDINARY_CI_REQUIRED')
  for status in ('in_progress','queued','waiting','pending','requested'):
   runs=read_api('/actions/workflows/ci.yml/runs?event=workflow_dispatch&branch=codex%2Fassembled-native-ci-20261104&status='+status+'&per_page=100')
   if runs.get('total_count')!=0 or runs.get('workflow_runs')!=[]:raise ValueError('ACTIVE_NATIVE_ALLOCATION')
 registry_proof=None
 if job['purpose']=='READ_ONLY_EXISTING_RELAY_BINDING_DISCOVERY':
  for status in ('in_progress','queued'):
   request=urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/workflows/relay-health.yml/runs?event=workflow_dispatch&branch=main&status='+status+'&per_page=100',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
   with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:runs=json.loads(response.read(2097152))
   if runs.get('total_count')!=0 or runs.get('workflow_runs')!=[]:raise ValueError('ACTIVE_READ_ONLY_MAIN_ALLOCATION')
   del request
 if job['workflow']=='assembled-native-runner-observation.yml' or job['purpose']=='READ_ONLY_EXISTING_RELAY_BINDING_DISCOVERY':
  registry_request=urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/workflows/'+job['workflow'],headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
  with urllib.request.build_opener(NoRedirect).open(registry_request,timeout=20) as response:
   registry=json.loads(response.read(65536))
  del registry_request
  if not isinstance(registry.get('id'),int) or registry['id']<=0 or registry.get('path')!='.github/workflows/'+job['workflow'] or registry.get('state')!='active': raise ValueError('OBSERVER_WORKFLOW_NOT_REGISTERED')
  registry_proof={key:registry[key] for key in ('id','path','state')}
 check_remote_head()
 intent_path=request_path.with_name(request_path.stem+'-intent.json')
 intent={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request':job,'automaticRetry':False,'credentialSource':'EXISTING_GIT_CREDENTIAL_MEMORY_ONLY'}
 if registry_proof is not None:intent['workflowRegistryReadback']=registry_proof
 with intent_path.open('x',encoding='utf-8') as stream:
  json.dump(intent,stream,indent=2);stream.flush();os.fsync(stream.fileno())
 body=json.dumps({'ref':job['ref'],'inputs':job['inputs']}).encode()
 req=urllib.request.Request('https://api.github.com/repos/'+REPO+'/actions/workflows/'+job['workflow']+'/dispatches',data=body,method='POST',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'})
 result={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workflow':job['workflow'],'ref':job['ref'],'expectedHead':job['expectedHead'],'automaticRetry':False,'httpStatus':None,'state':'OUTCOME_UNKNOWN_READBACK_REQUIRED'}
 try:
  with urllib.request.build_opener(NoRedirect).open(req,timeout=30) as response:
   result['httpStatus']=response.status
   if response.status==204:result['state']='DISPATCH_ACCEPTED_RUN_READBACK_REQUIRED'
 except urllib.error.HTTPError as error:
  result.update(httpStatus=error.code,state='DISPATCH_HTTP_REJECTED')
 except Exception: pass
 finally: del token,req
 with request_path.with_name(request_path.stem+'-result.json').open('x',encoding='utf-8') as stream:json.dump(result,stream,indent=2);stream.flush();os.fsync(stream.fileno())
 print(json.dumps(result));return 0 if result['httpStatus']==204 else 1
try:sys.exit(main())
except Exception as error:
 code=str(error) if re.fullmatch('[A-Z_]{1,90}',str(error)) else type(error).__name__
 print(json.dumps({'state':'DISPATCH_NOT_CONFIRMED','reason':code,'automaticRetry':False}));sys.exit(1)
