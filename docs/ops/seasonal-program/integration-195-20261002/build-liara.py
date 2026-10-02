"""Build the pinned source in the dedicated sandbox, with no provider credentials."""
import json, pathlib, subprocess, os, time
ROOT=pathlib.Path('/opt/portfolio-accept195');os.umask(0o077)
assert pathlib.Path.cwd()==ROOT
s=json.loads((ROOT/'private/secrets.json').read_text())
origin='https://62.60.191.24:8443';image='docker-mirror.liara.ir/library/node:22-bookworm-slim'
env={'NEXT_PUBLIC_LIARA_API_URL':origin+'/supabase','NEXT_PUBLIC_LIARA_ANON_KEY':s['anon'],
     'NEXT_PUBLIC_SUPABASE_URL':origin+'/supabase','NEXT_PUBLIC_SUPABASE_ANON_KEY':s['anon'],
     'NEXT_TELEMETRY_DISABLED':'1','NODE_OPTIONS':'--max-old-space-size=2048','SOURCE_SHA':'31c44ab635b672b589b7833bcbc78b41d36f1e75'}
def envfile(name, values):
 p=ROOT/'private'/name;p.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));return str(p)
def run(args,log,timeout=900):
 with (ROOT/'private'/log).open('wb') as output:
  p=subprocess.run(args,stdout=output,stderr=subprocess.STDOUT,timeout=timeout)
 if p.returncode:raise RuntimeError('Sandbox '+log+' failed; private diagnostics retained')
try:
 run(['docker','pull',image],'node-pull.log',180)
 digest=json.loads(subprocess.check_output(['docker','image','inspect',image]))[0]['RepoDigests'][0]
 run(['docker','run','--rm','--name','portfolio-accept195-build','--label','codex.task=portfolio-accept195','--memory','2560m',
      '--cpus','1.5','--env-file',envfile('build.env',env),'-v',str(ROOT/'source')+':/app','-w','/app',digest,
      'sh','-c','npm ci --no-audit --no-fund && npm run build'],'app-build.log',1200)
 # Runtime guard limits outgoing fetch to this sandbox; it returns failures rather than contacting market providers.
 (ROOT/'egress-guard.cjs').write_text("const original=globalThis.fetch;globalThis.fetch=(input,...args)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(u.origin!=='https://62.60.191.24:8443')return Promise.reject(new Error('Acceptance sandbox external fetch blocked'));return original(input,...args)};\n")
 runtime={**env,'NODE_ENV':'production','SUPABASE_SERVICE_ROLE_KEY':s['service'],'NODE_OPTIONS':'--require=/sandbox/egress-guard.cjs --max-old-space-size=512'}
 run(['docker','run','-d','--name','portfolio-accept195-app','--label','codex.task=portfolio-accept195','--network','portfolio-accept195-api','--memory','768m','--cpus','1','--restart','unless-stopped',
      '--env-file',envfile('app.env',runtime),'-v',str(ROOT/'source')+':/app:ro','-v',str(ROOT/'egress-guard.cjs')+':/sandbox/egress-guard.cjs:ro','-w','/app',digest,
      'node','node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port','3000'],'app-run.log',60)
 run(['docker','network','connect','portfolio-accept195-internal','portfolio-accept195-app'],'app-network.log',30)
 m=json.loads((ROOT/'environment.json').read_text());m.update(status='APP_STARTED_ACCEPTANCE_PENDING',nodeImage=digest,builtAt=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()));(ROOT/'environment.json').write_text(json.dumps(m,indent=2)+'\n')
 print(json.dumps({'status':m['status'],'applicationSHA':m['applicationSHA'],'origin':origin,'nodeImage':digest}))
except Exception as e:
 print(json.dumps({'status':'BLOCKED_BUILD','blocker':str(e)}));raise SystemExit(1)
