import pathlib,json,subprocess,time,datetime,hashlib
root=pathlib.Path('/root/portfolio-recovery-backups/20261003T101406Z')
r=json.loads((root/'receipt.json').read_text())
name=r['target']
def run(args,inp=None):
 p=subprocess.run(args,input=inp,capture_output=True,text=True,timeout=30)
 if p.returncode: raise RuntimeError('private_probe_failed')
 return p.stdout
def query(sql):
 return run(['docker','exec','-i',name,'psql','-X','-q','-t','-A','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],sql).strip()
run(['docker','start',name])
try:
 ready=False
 for _ in range(20):
  if subprocess.run(['docker','exec',name,'pg_isready','-U','supabase_admin','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
   ready=True;break
  time.sleep(1)
 if not ready:raise RuntimeError('not_ready')
 if query('SHOW cron.launch_active_jobs;')!='off':raise RuntimeError('cron_safety_failed')
 source=json.loads((root/'cron.private.json').read_text())
 target=json.loads(query("BEGIN READ ONLY; SELECT coalesce(json_agg(j),'[]')::text FROM cron.job j; COMMIT;"))
 (root/'cron-target.private.json').write_text(json.dumps(target))
 canonical=lambda rows:json.dumps(sorted(rows,key=lambda row:row['jobid']),sort_keys=True,separators=(',',':'))
 r['cronConfigEqual']=canonical(source)==canonical(target)
 r['cronJobCounts']={'source':len(source),'target':len(target)}
 r['cronConfigCheckedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
finally:
 run(['docker','stop','-t','10',name])
 r['targetStopped']=True
 (root/'receipt.json').write_text(json.dumps(r,indent=2))
print(json.dumps({'cronConfigEqual':r.get('cronConfigEqual'),'cronJobCounts':r.get('cronJobCounts'),'cronConfigCheckedAt':r.get('cronConfigCheckedAt'),'targetStopped':r['targetStopped']}))
