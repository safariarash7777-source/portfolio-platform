"""Fresh synthetic sandbox only. Run on the owned /opt/portfolio-accept195 directory.
No credential values or raw command exceptions are emitted.
"""
import base64, hashlib, hmac, json, os, pathlib, secrets, subprocess, time, urllib.request, urllib.parse

ROOT = pathlib.Path('/opt/portfolio-accept195')
SHA = '31c44ab635b672b589b7833bcbc78b41d36f1e75'
ORIGIN = 'https://62.60.191.24:8443'
PREFIX = 'portfolio-accept195'
os.umask(0o077)
assert pathlib.Path.cwd() == ROOT and ROOT.resolve() == ROOT
manifest_path = ROOT / 'environment.json'
state = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
    'environment': PREFIX, 'applicationSHA': SHA, 'origin': ORIGIN,
    'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'steps': [],
    'data': 'fresh synthetic only; no restored database', 'status': 'PREPARING'}

def save():
    manifest_path.write_text(json.dumps(state, indent=2) + '\n')

def pg_url(role, password, query=''):
    authority = role + ':' + urllib.parse.quote(password, safe='') + '@' + PREFIX + '-db:5432'
    return urllib.parse.urlunparse(('postgres', authority, '/postgres', '', query, ''))

def run(args, data=None, timeout=90):
    p = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if p.returncode:
        (ROOT/'private'/'last-error.log').write_bytes(p.stderr)
        raise RuntimeError('Operation failed: ' + ' '.join(args[:2]) + ' (private diagnostics retained)')
    return p.stdout.decode().strip()

def exists(name):
    return subprocess.run(['docker', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def envfile(name, values):
    p = ROOT / 'private' / (name + '.env')
    p.write_text(''.join(k + '=' + str(v) + '\n' for k, v in values.items()))
    return str(p)

def sql(text):
    return run(['docker','exec','-i',PREFIX+'-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'], text.encode() if isinstance(text,str) else text)

def start(name, image, values, extra=(), memory='128m', network=None):
    full = PREFIX + '-' + name
    if exists(full): return
    run(['docker','run','-d','--name',full,'--label','codex.task='+PREFIX,'--network',network or PREFIX+'-internal','--memory',memory,'--restart','unless-stopped','--env-file',envfile(name,values),*extra,image])

def waiturl(url):
    for _ in range(60):
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200: return r.read().decode()
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('Service health timeout: '+url)

try:
    (ROOT/'private').mkdir(exist_ok=True,mode=0o700)
    secret_path = ROOT/'private/secrets.json'
    if secret_path.exists():
        s = json.loads(secret_path.read_text())
    else:
        if any(exists(PREFIX+'-'+n) for n in ['db','auth','rest','storage','gateway','app']):
            raise RuntimeError('Refuse existing sandbox without matching private configuration')
        s = {'password':secrets.token_hex(28),'jwtSecret':secrets.token_hex(48)}
        def token(role):
            enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
            parts=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'iss':'supabase','role':role,'iat':int(time.time()),'exp':int(time.time())+7*86400})
            return parts+'.'+base64.urlsafe_b64encode(hmac.new(s['jwtSecret'].encode(),parts.encode(),hashlib.sha256).digest()).decode().rstrip('=')
        s['anon']=token('anon');s['service']=token('service_role')
        secret_path.write_text(json.dumps(s))
    for n, internal in [(PREFIX+'-internal',True),(PREFIX+'-api',False)]:
        if subprocess.run(['docker','network','inspect',n],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
            run(['docker','network','create',*(['--internal'] if internal else []),'--label','codex.task='+PREFIX,n])
    for name in [PREFIX+'-data',PREFIX+'-files']:
        run(['docker','volume','create','--label','codex.task='+PREFIX,name])
    start('db','postgres:17-alpine',{'POSTGRES_PASSWORD':s['password']},['-v',PREFIX+'-data:/var/lib/postgresql/data'],memory='512m')
    for _ in range(60):
        # TCP distinguishes the final server from initdb's temporary socket-only server.
        if subprocess.run(['docker','exec',PREFIX+'-db','pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
        time.sleep(1)
    if not state.get('rolesInstalled'):
        sql("CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '"+s['password']+"';GRANT anon,authenticated,service_role TO authenticator;CREATE ROLE supabase_storage_admin LOGIN BYPASSRLS PASSWORD '"+s['password']+"';GRANT anon,authenticated,service_role TO supabase_storage_admin;CREATE SCHEMA auth;CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE EXTENSION \"uuid-ossp\" WITH SCHEMA extensions;GRANT USAGE ON SCHEMA auth,public,extensions,storage TO anon,authenticated,service_role,supabase_storage_admin;")
        state['rolesInstalled']=True;save()
    start('auth','public.ecr.aws/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',{
        'GOTRUE_API_HOST':'0.0.0.0','GOTRUE_API_PORT':'9999','API_EXTERNAL_URL':ORIGIN+'/supabase/auth/v1',
        'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':pg_url('postgres',s['password'],'search_path=auth'),
        'GOTRUE_SITE_URL':ORIGIN,'GOTRUE_URI_ALLOW_LIST':ORIGIN+'/**','GOTRUE_JWT_SECRET':s['jwtSecret'],
        'GOTRUE_JWT_ISSUER':ORIGIN+'/supabase/auth/v1','GOTRUE_JWT_EXP':'900','GOTRUE_JWT_AUD':'authenticated',
        'GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_ADMIN_ROLES':'service_role',
        'GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_EXTERNAL_PHONE_ENABLED':'false','GOTRUE_DISABLE_SIGNUP':'true',
        'GOTRUE_MAILER_AUTOCONFIRM':'false','GOTRUE_LOG_LEVEL':'error'},['-p','127.0.0.1:55451:9999'])
    # Only this service's dedicated bridge permits host health checks; the DB has no published port.
    for name in ['auth']:
        subprocess.run(['docker','network','connect',PREFIX+'-api',PREFIX+'-'+name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    state['authHealth']=json.loads(waiturl('http://127.0.0.1:55451/health'))
    if not state.get('authHelpersInstalled'):
        sql("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claim.role',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')) $$;CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;GRANT EXECUTE ON FUNCTION auth.uid(),auth.role(),auth.jwt() TO anon,authenticated,service_role,supabase_storage_admin;")
        state['initialAuthUsers']=int(sql('SELECT count(*) FROM auth.users'))
        state['authHelpersInstalled']=True;save()
    start('rest','docker-mirror.liara.ir/postgrest/postgrest:v14.17@sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c',{
        'PGRST_DB_URI':pg_url('authenticator',s['password']),'PGRST_DB_SCHEMAS':'public',
        'PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':s['jwtSecret'],'PGRST_DB_POOL':'5'})
    start('storage','public.ecr.aws/supabase/storage-api:v1.77.6@sha256:c99920016d603cfb9d11ee6f37844f6fd432aab950785b3bf6147c953164ad08',{
        'ANON_KEY':s['anon'],'SERVICE_KEY':s['service'],'AUTH_JWT_SECRET':s['jwtSecret'],'PGRST_JWT_SECRET':s['jwtSecret'],
        'POSTGREST_URL':'http://'+PREFIX+'-rest:3000','DATABASE_URL':pg_url('supabase_storage_admin',s['password']),
        'FILE_SIZE_LIMIT':'5242880','STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage',
        'TENANT_ID':PREFIX,'REGION':'local','GLOBAL_S3_BUCKET':PREFIX,'ENABLE_IMAGE_TRANSFORMATION':'false','LOG_LEVEL':'error'},
        ['-p','127.0.0.1:55453:5000','-v',PREFIX+'-files:/var/lib/storage'],memory='256m')
    subprocess.run(['docker','network','connect',PREFIX+'-api',PREFIX+'-storage'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    waiturl('http://127.0.0.1:55453/status')
    state['storageNativeTables']=int(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='storage'"));save()
    plan=json.loads((ROOT/'migration-plan.json').read_text())
    assert plan['sha']==SHA
    for item in plan['files']:
        raw=(ROOT/'source'/item['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==item['sha256'], 'Migration checksum mismatch'
        if any(x['file']==item['file'] and x['status']=='APPLIED_NATIVE_SANDBOX_ONLY' for x in state['steps']):continue
        sql(raw)
        state['steps'].append({'file':item['file'],'sha256':item['sha256'],'status':'APPLIED_NATIVE_SANDBOX_ONLY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())});save()
    # Historical portfolio SQL relies on the hosted platform's table grants.
    # Preserve pv_self_read RLS and restore only the native read privilege.
    sql("GRANT SELECT ON public.profiles TO authenticated;GRANT SELECT ON public.portfolio_versions TO authenticated,service_role;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;NOTIFY pgrst,'reload schema';")
    cert='/opt/fx-dashboard/caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/62.60.191.24/62.60.191.24'
    start('gateway','docker-mirror.liara.ir/library/caddy:2',{'SANDBOX_ANON':s['anon'],'SANDBOX_SERVICE':s['service']},
          ['-p','8443:8443','-v',str(ROOT/'Caddyfile')+':/etc/caddy/Caddyfile:ro','-v',cert+'.crt:/cert/leaf.crt:ro','-v',cert+'.key:/cert/leaf.key:ro'],memory='64m')
    subprocess.run(['docker','network','connect',PREFIX+'-api',PREFIX+'-gateway'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    state['status']='NATIVE_BACKEND_READY_APP_PENDING';save()
    print(json.dumps({'status':state['status'],'migrations':len(state['steps']),'initialAuthUsers':state['initialAuthUsers'],'storageNativeTables':state['storageNativeTables']}))
except Exception as e:
    state['status']='BLOCKED_SETUP';state['blocker']=str(e);save()
    print(json.dumps({'status':state['status'],'blocker':str(e)}));raise SystemExit(1)
