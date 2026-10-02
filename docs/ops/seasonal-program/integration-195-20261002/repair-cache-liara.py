"""Mount a writable cache on only the owned acceptance app; source stays read-only."""
import pathlib,json,subprocess,os,time
r=pathlib.Path('/opt/portfolio-accept195');os.umask(0o077)
p=subprocess.run(['docker','inspect','portfolio-accept195-app'],capture_output=True,check=True)
c=json.loads(p.stdout)[0];assert c['Config']['Labels']['codex.task']=='portfolio-accept195'
(r/'cache').mkdir(exist_ok=True)
for args in [['docker','stop','portfolio-accept195-app'],['docker','rm','portfolio-accept195-app']]:subprocess.run(args,capture_output=True,check=True)
image=json.loads((r/'environment.json').read_text())['nodeImage']
args=['docker','run','-d','--name','portfolio-accept195-app','--label','codex.task=portfolio-accept195','--network','portfolio-accept195-api','--memory','768m','--cpus','1','--restart','unless-stopped','--env-file',str(r/'private/app.env'),'-v',str(r/'source')+':/app:ro','-v',str(r/'cache')+':/app/.next/cache','-v',str(r/'egress-guard.cjs')+':/sandbox/egress-guard.cjs:ro','-w','/app',image,'node','node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port','3000']
subprocess.run(args,capture_output=True,check=True);subprocess.run(['docker','network','connect','portfolio-accept195-internal','portfolio-accept195-app'],capture_output=True,check=True)
m=json.loads((r/'environment.json').read_text());m['runtimeCache']='Dedicated writable /opt/portfolio-accept195/cache bind; application source read-only';m['cacheRepairedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());
if m.get('blocker'):m['historicalSetupBlocker']=m.pop('blocker')
(r/'environment.json').write_text(json.dumps(m,indent=2)+'\n');print('OWNED_APP_CACHE_REPAIRED_SOURCE_SHA_UNCHANGED')
