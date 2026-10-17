// Disposable PostgreSQL acceptance only. Never connects to a network, live DB or E2E container.
// Run: node docs/m2/isolated-acceptance.mjs --container m2-webinar-sql-<owned-name>
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const container = process.argv[process.argv.indexOf('--container') + 1];
assert.match(container ?? '', /^m2-webinar-sql-[a-z0-9-]+$/, 'Only an owned M2 SQL container is allowed');
const root = resolve('.');
const require = createRequire(import.meta.url);
const ts = require('typescript');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const info = JSON.parse(docker(['inspect', container, '--format', '{{json .}}']));
assert.equal(info.Config.Labels['codex.task'], 'm2-webinar-72e');
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.deepEqual(info.HostConfig.PortBindings ?? {}, {});
assert.ok(info.HostConfig.Memory > 0 && info.HostConfig.NanoCpus > 0);
assert.equal(info.State.Running, true);
console.log(JSON.stringify({ container: info.Id, image: info.Image, network: 'none', ports: {}, synthetic: true }));

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const member = uuid(2), other = uuid(3), admin = uuid(1);
const source = p => readFileSync(resolve(root, p), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source('lib/webinars/contracts.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, URL, Date, Number });
const phase15 = source('sql/phase15_security.sql').split('\n').filter(line =>
  /^(REVOKE|GRANT|ALTER FUNCTION) .*public\.(?:is_admin|fn_user_access|verify_payment|fail_payment|register_for_webinar|create_payment|payments_guard|set_updated_at|deny_mutation|fn_entitlements_guard)\(/.test(line)
).join('\n');
// Existing test auth/bootstrap is synthetic. Production table, ledger, registration,
// entitlement and relevant phase15 ACL/search_path definitions are source SQL.
// No assumption that this fixture is the installed production schema/ACL snapshot.
const portfolioTable = source('sql/archive/supabase_schema.sql').match(/CREATE TABLE IF NOT EXISTS public\.portfolios \([\s\S]*?\);/)[0];
const prefix = 'm2_' + randomUUID().replaceAll('-', '').slice(0, 10);
let passed = 0;
const expect = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const expectAsync = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };

for (const profile of ['legacy', 'strict']) {
  const legacyDb = prefix + '_' + profile;
  let db = legacyDb;
  docker(['exec', container, 'createdb', '-U', 'postgres', db]);
  const dbArgs = name => ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', name];
  let args = dbArgs(db);
  function raw(sql, shouldFail = false) {
    const r = spawnSync('docker', args, { input: sql, encoding: 'utf8', timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
    if (shouldFail) { assert.notEqual(r.status, 0, 'SQL unexpectedly succeeded'); return r.stderr; }
    assert.equal(r.status, 0, r.stderr || r.error?.message || r.stdout);
    return r.stdout.trim();
  }
  function claims(role, user = member) {
    return `SET ROLE ${role}; SET request.jwt.claims='{"role":"${role}","sub":"${user}"}';`;
  }
  const call = (expr, role = 'authenticated', user = member) =>
    JSON.parse(raw(claims(role, user) + 'SELECT ' + expr + ';').split('\n').at(-1));
  const svc = expr => call(expr, 'service_role');
  const run = sql => raw(sql);
  const deny = sql => assert.match(raw(sql, true), /ERROR:/);
  const amount = 100;
  const gateway = auth => 'https://payment.zarinpal.com/pg/StartPay/' + auth;
  const webinar = (id, price = amount, capacity = 'NULL', status = 'published', open = true) =>
    run(claims('authenticated', admin) + `INSERT INTO public.webinars(id,title,starts_at,ends_at,price_toman,max_capacity,status,registration_open,platform_url,access_enabled,access_starts_at,access_ends_at)
      VALUES('${id}','Synthetic only',now()+interval '1 day',now()+interval '2 days',${price},${capacity},'${status}',${open},'https://session.invalid/${id}',true,'2020-01-01','2099-01-01');`);
  const register = (id, user = member) => call(`public.register_for_webinar('${id}')`, 'authenticated', user);
  const prepare = id => call(`public.prepare_webinar_payment('${id}')`);
  const attach = (id, auth) => svc(`public.attach_webinar_payment('${id}','${auth}','${gateway(auth)}',100)`);
  const context = (id, auth) => svc(`public.read_webinar_payment_context('${auth}','${id}')`);
  const settle = (id, auth, pay, ref = '201') =>
    svc(`public.settle_webinar_payment('${auth}','${id}','${pay}',100,'${ref}')`);
  const access = (id, user = member) => call(`public.webinar_access('${id}')`, 'authenticated', user);
  const rpc = (role, user) => async (name, values = {}) => {
    assert.match(name, /^(register_for_webinar|prepare_webinar_payment|attach_webinar_payment|mark_webinar_payment_unknown|read_webinar_payment_context|settle_webinar_payment|reject_webinar_payment|list_public_webinars|webinar_access)$/);
    const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
    try {
      const parameters = Object.entries(values).map(([key,value]) => { assert.match(key,/^p_[a-z_]+$/); return key + ' => ' + literal(value); });
      return { data: call('public.' + name + '(' + parameters.join(',') + ')',role,user), error: null };
    } catch (error) { return { data:null,error:{message:String(error)} }; }
  };
  const routes = (user = member) => {
    const requests = [], verifications = [];
    const session = { auth:{ getUser:async () => ({data:{user:{id:user}}}) }, rpc:rpc('authenticated',user) };
    const service = { rpc:rpc('service_role',user) };
    function load(path) {
      const moduleExports = {};
      const dependencies = {
        'next/server':{ NextResponse:{ json:Response.json, redirect:url => Response.redirect(url,307) } },
        '@/lib/supabase/server':{ createClient:async () => session },
        '@/lib/supabase/admin':{ tryCreateAdminClient:() => service },
        '@/lib/webinars/contracts':exports,
        '@/lib/zarinpal':{
          requestPayment:async (amount,title,url) => { requests.push({amount,title,url}); return {ok:true,authority:'SYNTHETIC_ROUTE',startPayUrl:gateway('SYNTHETIC_ROUTE')}; },
          verifyPayment:async (authority,amount) => { verifications.push({authority,amount}); return {outcome:'verified',code:100,refId:'204'}; },
        },
      };
      runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
        { exports:moduleExports, require:key => { assert.ok(Object.hasOwn(dependencies,key),'Unexpected route dependency ' + key); return dependencies[key]; },
          process:{env:{}}, URL, Date, fetch:() => assert.fail('No network is permitted in SQL-backed route tests') });
      return moduleExports;
    }
    return { requests,verifications,load, req:(path,body) => ({nextUrl:new URL(path,'https://offline.invalid'),json:async () => body}) };
  };
  const count = table => Number(raw('SELECT count(*) FROM public.' + table + ';'));
  async function concurrent(statements) {
    return await Promise.all(statements.map(sql => new Promise((resolvePromise, reject) => {
      const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('bounded SQL concurrency timeout')); }, 12000);
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
      child.on('error', reject);
      child.on('exit', code => { clearTimeout(timeout); resolvePromise({ code, out: out.trim(), err }); });
      child.stdin.end(sql);
    })));
  }

  const installSource = () => {
    raw(source('sql/test/supabase_bootstrap.sql'));
    raw(source(profile === 'legacy' ? 'sql/test/profile_legacy_default_privileges.sql' : 'sql/test/profile_explicit_grants.sql'));
    raw(portfolioTable + '\n' + source('sql/archive/supabase_portfolio_versioning.sql'));
    raw(source('sql/phase5_payments_telegram.sql') + '\n' + source('sql/phase8_webinars.sql') + '\n' + source('sql/phase11_access_tiers.sql'));
    raw(phase15 + '\n' + source('sql/phase30_contain_create_payment.sql'));
    raw(`GRANT SELECT ON public.webinars TO anon,authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.webinars,public.webinar_registrations TO authenticated;
      GRANT SELECT ON public.entitlements TO authenticated;
      INSERT INTO auth.users(id) VALUES('${admin}'),('${member}'),('${other}');
      INSERT INTO public.profiles(id,role) VALUES('${admin}','admin'),('${member}','user'),('${other}','user');`);
  };
  installSource();
  // Explicit app/admin table grants make the strict profile runnable; the broad
  // legacy default grants remain, so RLS must prevent forged member writes.
  const unqualifiedFixture = `INSERT INTO public.webinars(id,title,starts_at,price_toman,status,platform_url)
      VALUES('${uuid(80)}','Legacy free',now(),0,'published','https://session.invalid/legacy-free'),
        ('${uuid(81)}','Legacy paid',now(),100,'published','https://session.invalid/legacy-paid');
    INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status)
      VALUES('${uuid(80)}','${member}','free'),('${uuid(81)}','${member}','paid');
    INSERT INTO public.entitlements(user_id,kind,source,starts_at,expires_at)
      VALUES('${other}','manual','synthetic-legitimate-grant',now()-interval '1 day',now()+interval '1 day');`;
  raw(unqualifiedFixture);
  expect(profile + ' original public whole-row session URL leak is reproduced only on synthetic rows', () =>
    assert.equal(raw(claims('anon') + "SELECT count(*) FROM public.webinars WHERE platform_url IS NOT NULL;"), '2'));
  expect(profile + ' original member INSERT can forge paid on a closed synthetic webinar', () => {
    raw(claims('authenticated',other) + `INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status) VALUES('${uuid(80)}','${other}','paid');`);
  });
  expect(profile + ' legacy installation aborts atomically; rights/schema transition stays blocked', () => {
    assert.match(raw(source('docs/m2/proposed-exact-webinar.sql'), true), /legacy registrations require reviewed reconciliation/);
    assert.equal(raw("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='webinars' AND column_name='access_enabled';"), '0');
    assert.equal(raw('SELECT count(*) FROM public.webinar_registrations;'), '3');
    assert.equal(raw("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='webinars' AND policyname='webinars_public_read';"), '1');
    assert.equal(count('entitlements'), 1);
  });
  // A separate empty database exercises NEW registrations. Do not delete,
  // promote or relabel the legacy rows to make installation appear accepted.
  db = prefix + '_' + profile + '_fresh';
  docker(['exec', container, 'createdb', '-U', 'postgres', db]);
  args = dbArgs(db);
  installSource();
  raw(source('docs/m2/proposed-exact-webinar.sql'));
  // These post-install synthetic unqualified states test denial/counting only.
  // They are not a legacy migration or proof of preserved legacy access.
  raw(unqualifiedFixture);
  raw(`INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status)
    VALUES('${uuid(80)}','${other}','paid');`);
  expect(profile + ' full proposal grammar and DDL apply on PostgreSQL 17', () => {
    assert.equal(raw("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('webinar_access','prepare_webinar_payment','attach_webinar_payment','settle_webinar_payment');"), '4');
  });
  expect(profile + ' metadata and direct public SELECT disclose no session URL', () => {
    assert.equal(raw(claims('anon') + 'SELECT count(*) FROM public.webinars;'), '0');
    const list = call('public.list_public_webinars()', 'anon');
    assert.equal(list.length, 2);
    assert.ok(list.every(row => !Object.hasOwn(row, 'platform_url')));
    assert.equal(raw(claims('authenticated') + 'SELECT count(*) FROM public.webinars;'), '0');
    assert.equal(raw(claims('authenticated', admin) + 'SELECT count(*) FROM public.webinars;'), '2');
  });
  expect(profile + ' new synthetic unqualified rows deny access; separate legacy records remain untouched', () => {
    assert.equal(raw("SELECT count(*) FROM public.webinar_registrations WHERE access_qualified;"), '0');
    assert.equal(raw(claims('authenticated', other) + `SELECT public.fn_user_access('${other}');`), 'full');
    assert.equal(count('entitlements'), 1);
    assert.equal(docker(dbArgs(legacyDb), 'SELECT count(*) FROM public.webinar_registrations;'), '3');
  });
  const a = uuid(11), b = uuid(12), free = uuid(13), capped = uuid(14), closed = uuid(15), draft = uuid(16);
  webinar(a); webinar(b); webinar(free, 0, 1); webinar(capped, 100, 1); webinar(closed, 0, 'NULL', 'published', false); webinar(draft, 0, 'NULL', 'draft');
  expect(profile + ' direct member forged paid/free/qualified inserts and capacity/status bypass denied', () => {
    for (const [id, status, qualified] of [[a,'paid',true],[a,'free',true],[free,'free',false],[closed,'free',true],[draft,'paid',false],[capped,'paid',true]]) {
      deny(claims('authenticated') + `INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status,access_qualified) VALUES('${id}','${member}','${status}',${qualified});`);
    }
  });
  expect(profile + ' exact access RPC cannot be invoked by anon; service financial RPCs deny member and anonymous', () => {
    deny(claims('anon') + `SELECT public.webinar_access('${a}');`);
    for (const role of ['authenticated','anon']) {
      deny(claims(role) + `SELECT public.attach_webinar_payment('${uuid(99)}','FORGED','${gateway('FORGED')}',100);`);
      deny(claims(role) + `SELECT public.settle_webinar_payment('FORGED','${uuid(99)}','${uuid(98)}',100,'201');`);
    }
    assert.equal(raw("SELECT has_function_privilege('authenticated','public.create_payment(integer,text)','EXECUTE');"), 'f');
  });
  expect(profile + ' validated RPC blocks closed/draft/capped-paid registrations', () => {
    for (const id of [closed,draft,capped]) deny(claims('authenticated') + `SELECT public.register_for_webinar('${id}');`);
  });
  let regA, regB;
  expect(profile + ' source registration DTO uses registration_id with pending needs_payment and no guessed free success', () => {
    regA = register(a); regB = register(b);
    assert.equal(regA.payment_status, 'pending'); assert.equal(regA.needs_payment, true);
    assert.ok(typeof regA.registration_id === 'string' && !Object.hasOwn(regA, 'id'));
    assert.deepEqual(register(a), { ...regA, already_registered: true });
    assert.equal(access(a).allowed, false); assert.equal(access(b).allowed, false);
    assert.equal(access(a, other).allowed, false);
  });
  await expectAsync(profile + ' concurrent prepare starts exactly once and preserves one durable attempt', async () => {
    const statements = [1,2].map(() => claims('authenticated') + `BEGIN; SELECT public.prepare_webinar_payment('${regA.registration_id}'); SELECT pg_sleep(0.15); COMMIT;`);
    const results = await concurrent(statements);
    assert.ok(results.every(r => r.code === 0), JSON.stringify(results));
    const dtos = results.map(r => JSON.parse(r.out.split('\n').find(line => line.startsWith('{'))));
    assert.equal(dtos.filter(dto => dto.started === true).length, 1);
    assert.equal(count('webinar_payment_attempts'), 1);
  });
  let boundA;
  expect(profile + ' authority+canonical amount+user+webinar persist before URL, and attach replay has one ledger', () => {
    boundA = attach(regA.registration_id, 'SYNTHETIC_A');
    assert.equal(boundA.amount, 100); assert.equal(boundA.user_id, member); assert.equal(boundA.webinar_id, a);
    assert.equal(boundA.authority, 'SYNTHETIC_A'); assert.equal(boundA.payment_url, gateway('SYNTHETIC_A'));
    assert.deepEqual(attach(regA.registration_id, 'SYNTHETIC_A'), boundA);
    assert.equal(count('payments'), 1);
    assert.ok(exports.paymentContext(context(regA.registration_id,'SYNTHETIC_A'),'SYNTHETIC_A',regA.registration_id));
    deny(claims('service_role') + `SELECT public.attach_webinar_payment('${regA.registration_id}','SYNTHETIC_REPLACE','${gateway('SYNTHETIC_REPLACE')}',100);`);
    deny(claims('authenticated', admin) + `UPDATE public.webinars SET price_toman=101 WHERE id='${a}';`);
    deny(claims('authenticated', admin) + `UPDATE public.webinars SET access_ends_at='2100-01-01' WHERE id='${a}';`);
  });
  expect(profile + ' another webinar/member cannot settle or read this payment binding', () => {
    deny(claims('service_role') + `SELECT public.settle_webinar_payment('SYNTHETIC_A','${regB.registration_id}','${boundA.payment_id}',100,'201');`);
    deny(claims('service_role') + `SELECT public.read_webinar_payment_context('SYNTHETIC_A','${regB.registration_id}');`);
    deny(claims('authenticated', other) + `SELECT public.prepare_webinar_payment('${regA.registration_id}');`);
    assert.equal(access(a,other).allowed, false); assert.equal(access(b).allowed, false);
  });
  expect(profile + ' injected post-ledger audit failure rolls back ledger+registration+audit atomically', () => {
    raw(`CREATE FUNCTION public.m2_test_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='webinar.payment_settled' THEN RAISE EXCEPTION 'synthetic settlement audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER m2_test_audit_failure BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.m2_test_injected_failure();`);
    const audits = count('audit_log');
    deny(claims('service_role') + `SELECT public.settle_webinar_payment('SYNTHETIC_A','${regA.registration_id}','${boundA.payment_id}',100,'201');`);
    assert.equal(context(regA.registration_id,'SYNTHETIC_A').payment_status, 'pending');
    assert.equal(context(regA.registration_id,'SYNTHETIC_A').access_qualified, false);
    assert.equal(count('audit_log'), audits); assert.equal(access(a).allowed, false);
    raw('DROP TRIGGER m2_test_audit_failure ON public.audit_log; DROP FUNCTION public.m2_test_injected_failure();');
  });
  await expectAsync(profile + ' concurrent settlement and exact replay grant A once, never B/full/channel', async () => {
    const proof = exports.paymentContext(context(regA.registration_id,'SYNTHETIC_A'),'SYNTHETIC_A',regA.registration_id);
    assert.ok(proof);
    const audits = count('audit_log');
    const results = await concurrent([1,2].map(() => claims('service_role') + `SELECT public.settle_webinar_payment('SYNTHETIC_A','${regA.registration_id}','${boundA.payment_id}',100,'201');`));
    assert.ok(results.every(r => r.code === 0), JSON.stringify(results));
    const dtos = results.map(r => JSON.parse(r.out.split('\n').at(-1)));
    assert.equal(dtos.filter(dto => dto.reused === false).length, 1);
    assert.ok(dtos.every(dto => exports.settledReceipt(dto,proof,'201')));
    assert.equal(count('audit_log'), audits + 2);
    const replay = settle(regA.registration_id,'SYNTHETIC_A',boundA.payment_id);
    assert.equal(replay.reused,true); assert.equal(count('audit_log'),audits + 2);
    assert.equal(access(a).allowed,true); assert.equal(access(a).platform_url,'https://session.invalid/' + a);
    assert.equal(access(b).allowed,false); assert.equal(access(a,other).allowed,false);
    assert.equal(raw(claims('authenticated') + `SELECT public.fn_user_access('${member}');`),'registered');
    assert.equal(count('entitlements'),1); assert.equal(raw("SELECT count(*) FROM public.payments WHERE invite_link IS NOT NULL;"),'0');
    // fresh docker/psql session simulates re-login with the same synthetic identity.
    assert.equal(access(a).allowed,true);
    deny(claims('service_role') + `SELECT public.settle_webinar_payment('SYNTHETIC_A','${regA.registration_id}','${boundA.payment_id}',100,'202');`);
  });
  expect(profile + ' paid capacity remains blocked while preserving historical registration and its financial history', () => {
    raw(claims('authenticated',admin) + `UPDATE public.webinars SET max_capacity=1 WHERE id='${b}';`);
    deny(claims('authenticated') + `SELECT public.prepare_webinar_payment('${regB.registration_id}');`);
    assert.equal(raw(`SELECT count(*) FROM public.webinar_registrations WHERE id='${regB.registration_id}';`),'1');
    raw(claims('authenticated',admin) + `UPDATE public.webinars SET max_capacity=NULL WHERE id='${b}';`);
  });
  expect(profile + ' unknown never starts replacement; known ready survives observation ambiguity', () => {
    assert.equal(prepare(regB.registration_id).started,true);
    assert.equal(svc(`public.mark_webinar_payment_unknown('${regB.registration_id}')`).state,'unknown');
    assert.equal(prepare(regB.registration_id).started,false);
    assert.equal(count('payments'),1);
    const bound = attach(regB.registration_id,'SYNTHETIC_B');
    assert.equal(svc(`public.mark_webinar_payment_unknown('${regB.registration_id}')`).state,'ready');
    assert.equal(prepare(regB.registration_id).authority,'SYNTHETIC_B');
    assert.equal(count('payments'),2);
    const proof=exports.paymentContext(context(regB.registration_id,'SYNTHETIC_B'),'SYNTHETIC_B',regB.registration_id);
    assert.ok(proof);
    const rejected=svc(`public.reject_webinar_payment('SYNTHETIC_B','${regB.registration_id}','${bound.payment_id}',100)`);
    assert.ok(exports.rejectedReceipt(rejected,proof));
    assert.equal(context(regB.registration_id,'SYNTHETIC_B').payment_status,'failed');
    const ready=prepare(regB.registration_id);
    assert.equal(ready.authority,'SYNTHETIC_B'); assert.equal(ready.payment_url,null); assert.equal(ready.started,false);
    const audits=count('audit_log');
    svc(`public.reject_webinar_payment('SYNTHETIC_B','${regB.registration_id}','${bound.payment_id}',100)`);
    assert.equal(count('audit_log'),audits); assert.equal(access(b).allowed,false);
  });
  await expectAsync(profile + ' capped free concurrent registration never overbooks and replay preserves one seat', async () => {
    const results=await concurrent([member,other].map(user => claims('authenticated',user) + `BEGIN; SELECT public.register_for_webinar('${free}'); SELECT pg_sleep(0.15); COMMIT;`));
    assert.equal(results.filter(r => r.code===0).length,1,JSON.stringify(results));
    assert.equal(raw(`SELECT count(*) FROM public.webinar_registrations WHERE webinar_id='${free}' AND payment_status='free';`),'1');
    const owner=raw(`SELECT user_id FROM public.webinar_registrations WHERE webinar_id='${free}';`);
    assert.equal(register(free,owner).already_registered,true);
    assert.equal(access(free,owner).allowed,true); assert.equal(count('entitlements'),1);
  });
  expect(profile + ' cancel/disable deny access without undoing ledger or legitimate prior grant', () => {
    raw(claims('authenticated',admin) + `UPDATE public.webinars SET access_enabled=false,status='cancelled' WHERE id='${a}';`);
    assert.equal(access(a).allowed,false); assert.equal(access(a,other).allowed,false);
    assert.equal(context(regA.registration_id,'SYNTHETIC_A').payment_status,'paid');
    assert.equal(raw(claims('authenticated',other) + `SELECT public.fn_user_access('${other}');`),'full');
  });
  await expectAsync(profile + ' real register/payment/callback/access/list routes consume actual SQL DTOs with a synthetic provider', async () => {
    const id=uuid(17); webinar(id);
    const route=routes();
    const registered=await route.load('app/api/webinars/register/route.ts').POST(route.req('/api/webinars/register',{webinar_id:id}));
    assert.equal(registered.status,200);
    const dto=(await registered.json()).registration;
    assert.ok(dto.registration_id); assert.equal(dto.needs_payment,true); assert.equal(dto.payment_status,'pending');
    const pay=await route.load('app/api/webinars/payment/route.ts').POST(route.req('/api/webinars/payment',{registration_id:dto.registration_id}));
    assert.equal(pay.status,200); assert.equal((await pay.json()).payment_url,gateway('SYNTHETIC_ROUTE'));
    assert.equal(route.requests.length,1); assert.equal(route.requests[0].amount,100);
    const callback=new URL(route.requests[0].url);
    assert.equal(callback.pathname,'/api/webinars/payment/callback'); assert.equal(callback.searchParams.get('registration_id'),dto.registration_id);
    callback.searchParams.set('Authority','SYNTHETIC_ROUTE'); callback.searchParams.set('Status','OK');
    const handler=route.load('app/api/webinars/payment/callback/route.ts');
    const verified=await handler.GET(route.req(callback.href));
    assert.equal(new URL(verified.headers.get('location')).searchParams.get('status'),'success');
    assert.equal(new URL(verified.headers.get('location')).searchParams.get('webinar_id'),id);
    assert.equal(route.verifications.length,1); assert.equal(route.verifications[0].amount,100);
    await handler.GET(route.req(callback.href)); assert.equal(route.verifications.length,1);
    const accessHandler=route.load('app/api/webinars/access/route.ts');
    const allowed=await accessHandler.GET(route.req('/api/webinars/access?webinar_id='+id));
    assert.equal((await allowed.json()).access.allowed,true); assert.equal(allowed.headers.get('cache-control'),'private, no-store');
    const denied=await accessHandler.GET(route.req('/api/webinars/access?webinar_id='+b));
    assert.deepEqual((await denied.json()).access,{allowed:false,reason:'not_available'});
    const stranger=routes(other).load('app/api/webinars/access/route.ts');
    assert.equal((await (await stranger.GET(route.req('/api/webinars/access?webinar_id='+id))).json()).access.allowed,false);
    const list=await route.load('app/api/webinars/list/route.ts').GET();
    assert.ok((await list.json()).webinars.every(w=>!Object.hasOwn(w,'platform_url')));
    assert.equal(count('entitlements'),1);
  });
  expect(profile + ' manager closure during provider request preserves authority but withholds URL and exact access', () => {
    const id=uuid(18); webinar(id); const reg=register(id); prepare(reg.registration_id);
    raw(claims('authenticated',admin) + `UPDATE public.webinars SET registration_open=false,access_enabled=false,status='cancelled' WHERE id='${id}';`);
    const bound=attach(reg.registration_id,'SYNTHETIC_CLOSED');
    assert.equal(bound.authority,'SYNTHETIC_CLOSED'); assert.equal(bound.payment_url,null); assert.equal(bound.release_allowed,false);
    deny(claims('authenticated') + `SELECT public.prepare_webinar_payment('${reg.registration_id}');`);
    const proof=exports.paymentContext(context(reg.registration_id,'SYNTHETIC_CLOSED'),'SYNTHETIC_CLOSED',reg.registration_id);
    assert.ok(exports.settledReceipt(settle(reg.registration_id,'SYNTHETIC_CLOSED',bound.payment_id,'205'),proof,'205'));
    assert.equal(access(id).allowed,false); assert.equal(count('entitlements'),1);
  });
  expect(profile + ' unconfigured synthetic rows deny access and source paid/free occupied count stays unchanged', () => {
    raw(claims('authenticated',admin) + `UPDATE public.webinars SET access_enabled=true,access_starts_at='2020-01-01',access_ends_at='2099-01-01' WHERE id='${uuid(81)}';`,true);
    // This exercises immutable unqualified states, not legacy reconciliation.
    assert.equal(access(uuid(80)).allowed,false); assert.equal(access(uuid(81)).allowed,false);
    const list=call('public.list_public_webinars()','anon');
    assert.equal(list.find(w=>w.id===uuid(80)).registered_count,2);
    assert.equal(list.find(w=>w.id===uuid(81)).registered_count,1);
    assert.ok(list.every(row=>!Object.hasOwn(row,'platform_url')));
  });
  console.log(JSON.stringify({ profile, database:db, grammar:true, isolation:'disposable synthetic fixture', live:false }));
}
console.log(JSON.stringify({ passed, failed:0, realGateway:false, realAuth:false, productionDatabase:false }));
