"""Create only synthetic real GoTrue users; do not create consultation consent."""
import json,pathlib,secrets,urllib.request,subprocess,os,time
r=pathlib.Path('/opt/portfolio-accept195');os.umask(0o077)
s=json.loads((r/'private/secrets.json').read_text());p=r/'private/reviewer.json'
review=json.loads(p.read_text()) if p.exists() else {'origin':'https://62.60.191.24:8443','anon':s['anon'],'accounts':{}}
for role in ['A','B','adviser','admin']:
 if role in review['accounts']:continue
 email='accept195-'+role.lower()+'-'+secrets.token_hex(4)+'@example.test';password=secrets.token_urlsafe(24)
 body=json.dumps({'email':email,'password':password,'email_confirm':True,'user_metadata':{'full_name':'SYNTHETIC ACCEPT195 '+role}}).encode()
 req=urllib.request.Request('http://127.0.0.1:55451/admin/users',data=body,method='POST',headers={'Authorization':'Bearer '+s['service'],'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=15) as response:
  user=json.load(response);http=response.status
 profileRole='admin' if role in ['adviser','admin'] else 'user'
 sql="INSERT INTO public.profiles(id,full_name,email,role) VALUES('%s','SYNTHETIC ACCEPT195 %s','%s','%s') ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,role=excluded.role;"%(user['id'],role,email,profileRole)
 result=subprocess.run(['docker','exec','-i','portfolio-accept195-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True)
 if result.returncode:raise RuntimeError('Synthetic profile setup failed')
 review['accounts'][role]={'id':user['id'],'email':email,'password':password,'profileRole':profileRole,'creationHTTP':http};p.write_text(json.dumps(review))
advisor=review['accounts']['adviser']['id']
sql="INSERT INTO public.consultation_advisors(user_id,display_name,enabled) VALUES('%s','SYNTHETIC ACCEPT195 ADVISER',true) ON CONFLICT(user_id) DO NOTHING;"%advisor
result=subprocess.run(['docker','exec','-i','portfolio-accept195-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True)
if result.returncode:raise RuntimeError('Synthetic adviser registry prerequisite failed')
manifest={'environment':'portfolio-accept195','applicationSHA':'31c44ab635b672b589b7833bcbc78b41d36f1e75','createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
 'accounts':{role:{k:v for k,v in account.items() if k in ['id','profileRole','creationHTTP']} for role,account in review['accounts'].items()},
 'source':'Real native GoTrue admin API, confirmed synthetic accounts. UI-issued session exists only after browser login. Adviser profile admin and enabled registry per phase35 contract; consent is NOT seeded.',
 'advisorRegistry':{'userId':advisor,'enabled':True,'relationSeeded':False},
 'credentialLocation':'/opt/portfolio-accept195/private/reviewer.json (root only)'}
(r/'fixtures.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'status':'REAL_SYNTHETIC_ACCOUNTS_CREATED','roles':list(review['accounts'])}))
