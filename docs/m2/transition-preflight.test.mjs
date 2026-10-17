// Real PostgreSQL transition-gate tests, synthetic only. Explicit standalone run:
// node --test docs/m2/transition-preflight.test.mjs
// Uses an already installed postgres:17-alpine image; never pulls an image.
// Not registered in package.json or CI. No network, host ports or host mounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const proposal = source('docs/m2/proposed-exact-webinar.sql');
const container = 'm2-transition-pg-' + randomUUID().slice(0, 8);
const label = 'm2-transition-preflight-20261017';
function docker(args, input, allowedFailure = false) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (!allowedFailure) assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return result;
}
const args = db => ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
  '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', db];
const sql = (db, query, failure = false) => docker(args(db), query, failure);
const scalar = (db, query) => sql(db, query).stdout.trim();
const uid = '00000000-0000-4000-8000-000000000002';
const webinarId = '00000000-0000-4000-8000-000000000011';
const registration = status => `INSERT INTO auth.users(id) VALUES('${uid}');
  INSERT INTO public.webinars(id,title,starts_at,price_toman,status)
    VALUES('${webinarId}','Synthetic transition only',now(),100,'published');
  INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status)
    VALUES('${webinarId}','${uid}','${status}');`;
const phase15 = source('sql/phase15_security.sql').split('\n').filter(line =>
  /^(REVOKE|GRANT|ALTER FUNCTION) .*public\.(?:is_admin|fn_user_access|verify_payment|fail_payment|register_for_webinar|create_payment|payments_guard|set_updated_at|deny_mutation|fn_entitlements_guard)\(/.test(line)
).join('\n');
const portfolioTable = source('sql/archive/supabase_schema.sql').match(/CREATE TABLE IF NOT EXISTS public\.portfolios \([\s\S]*?\);/)[0];
const fixture = source('sql/test/supabase_bootstrap.sql') + '\n' + portfolioTable + '\n' +
  source('sql/archive/supabase_portfolio_versioning.sql') + '\n' + source('sql/phase5_payments_telegram.sql') + '\n' +
  source('sql/phase8_webinars.sql') + '\n' + source('sql/phase11_access_tiers.sql') + '\n' + phase15 + '\n' +
  source('sql/phase30_contain_create_payment.sql');
const grants = `GRANT SELECT,INSERT,UPDATE,DELETE ON public.webinars TO authenticated;
  GRANT SELECT ON public.webinar_registrations TO authenticated;`;
const oldState = db => scalar(db, `SELECT jsonb_build_object(
  'new_column',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webinars' AND column_name='access_enabled'),
  'new_attempts',to_regclass('public.webinar_payment_attempts') IS NOT NULL,
  'old_public_policy',EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webinars' AND policyname='webinars_public_read'),
  'registrations',(SELECT count(*) FROM public.webinar_registrations));`);

test('M2 installation preflight rejects unsafe transitions atomically on real PostgreSQL', { timeout: 120000 }, async t => {
  let owned = false;
  try {
    docker(['create', '--pull', 'never', '--name', container, '--label', 'codex.task=' + label,
      '--network', 'none', '--memory', '512m', '--cpus', '1', '--pids-limit', '128',
      '--tmpfs', '/var/lib/postgresql/data:rw,size=536870912',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
    owned = true;
    docker(['start', container]);
    const deadline = Date.now() + 15000;
    while (docker(['exec', container, 'pg_isready', '-U', 'postgres'], undefined, true).status !== 0) {
      assert.ok(Date.now() < deadline, 'isolated PostgreSQL did not become ready');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const info = JSON.parse(docker(['inspect', container, '--format', '{{json .}}']).stdout);
    assert.equal(info.Config.Labels['codex.task'], label);
    assert.equal(info.HostConfig.NetworkMode, 'none');
    assert.deepEqual(info.HostConfig.PortBindings ?? {}, {});
    assert.equal(info.Mounts.some(m => m.Type === 'bind' || m.Type === 'volume'), false);
    assert.ok(info.HostConfig.Memory > 0 && info.HostConfig.NanoCpus > 0);
    console.log(JSON.stringify({ image: info.Image, network: 'none', ports: {}, hostMounts: false,
      postgres: scalar('postgres', 'SELECT version();'), synthetic: true }));

    let sequence = 0;
    for (const profile of ['legacy', 'strict']) {
      const template = 'm2_template_' + profile;
      docker(['exec', container, 'createdb', '-U', 'postgres', template]);
      const privileges = source('sql/test/' + (profile === 'legacy' ? 'profile_legacy_default_privileges.sql' : 'profile_explicit_grants.sql'));
      // Default grants must precede source table creation, as in the existing harness.
      sql(template, source('sql/test/supabase_bootstrap.sql') + '\n' + privileges);
      sql(template, fixture + '\n' + grants);
      let previous;
      const clone = () => {
        // Cases are serial: keep only one clone, so fixture databases/WAL do not
        // accumulate until the bounded tmpfs is full.
        if (previous) docker(['exec', container, 'dropdb', '-U', 'postgres', previous]);
        const db = 'm2_case_' + (++sequence);
        docker(['exec', container, 'createdb', '-U', 'postgres', '-T', template, db]);
        previous = db;
        return db;
      };
      const blocked = (db, code) => {
        const before = oldState(db);
        const result = sql(db, proposal, true);
        assert.notEqual(result.status, 0, 'unsafe proposal unexpectedly installed');
        assert.match(result.stderr, new RegExp('ERROR:\\s+' + code + ':'));
        assert.equal(oldState(db), before, 'preflight rejection changed schema, policies or data');
      };
      await t.test(profile + ': empty reviewed baseline permits complete proposal', () => {
        const db = clone();
        sql(db, proposal);
        assert.equal(scalar(db, "SELECT to_regprocedure('public.webinar_access(uuid)') IS NOT NULL;"), 't');
        assert.equal(scalar(db, "SELECT has_function_privilege('anon','public.webinar_access(uuid)','EXECUTE');"), 'f');
        assert.equal(scalar(db, 'SELECT count(*) FROM public.webinar_registrations;'), '0');
      });
      for (const status of ['pending', 'paid', 'free', 'refunded']) await t.test(profile + ': legacy ' + status + ' aborts without mutating rights/schema', () => {
        const db = clone(); sql(db, registration(status)); blocked(db, 'PT409');
      });
      for (const [name, change, code] of [
        ['RLS disabled', 'ALTER TABLE public.webinars DISABLE ROW LEVEL SECURITY;', 'PT409'],
        ['forced RLS differs', 'ALTER TABLE public.webinar_registrations FORCE ROW LEVEL SECURITY;', 'PT409'],
        ['missing session table grant', 'REVOKE UPDATE ON public.webinars FROM authenticated;', '42501'],
        ['missing session registration read', 'REVOKE SELECT ON public.webinar_registrations FROM authenticated;', '42501'],
        ['extra permissive read policy', 'CREATE POLICY unexpected_url_read ON public.webinars FOR SELECT USING(true);', 'PT409'],
        ['changed named admin policy', 'ALTER POLICY webinars_admin_all ON public.webinars USING(true);', 'PT409'],
        ['changed named member insert', 'ALTER POLICY wr_user_insert ON public.webinar_registrations WITH CHECK(true);', 'PT409'],
        ['missing source policy', 'DROP POLICY wr_user_read ON public.webinar_registrations;', 'PT409'],
        ['canonical settlement exposed to members', 'GRANT EXECUTE ON FUNCTION public.verify_payment(text,text,integer,text) TO authenticated;', '42501'],
        ['canonical failure RPC exposed publicly', 'GRANT EXECUTE ON FUNCTION public.fail_payment(text) TO PUBLIC;', '42501'],
      ]) await t.test(profile + ': ' + name + ' is rejected before DDL', () => {
        const db = clone(); sql(db, change); blocked(db, code);
      });
      await t.test(profile + ': a concurrent old writer cannot race the emptiness check', async () => {
        const db = clone();
        const holder = spawn('docker', args(db), { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', stderr = '';
        const locked = new Promise((resolve, reject) => {
          holder.stdout.on('data', data => { output += data; if (output.includes('M2_WRITER_LOCKED')) resolve(); });
          holder.stderr.on('data', data => { stderr += data; });
          holder.once('error', reject);
          holder.once('exit', code => { if (!output.includes('M2_WRITER_LOCKED')) reject(new Error(stderr || 'writer exited: ' + code)); });
        });
        try {
          holder.stdin.write('BEGIN; ' + registration('paid') + "SELECT 'M2_WRITER_LOCKED';\n");
          await Promise.race([locked, new Promise((_, reject) => setTimeout(() => reject(new Error('writer lock timeout')), 10000))]);
          const before = oldState(db); // writer's synthetic rows are still uncommitted
          const result = sql(db, proposal.replace("lock_timeout = '5s'", "lock_timeout = '150ms'"), true);
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /ERROR:\s+55P03:/);
          assert.equal(oldState(db), before);
        } finally {
          holder.stdin.end('ROLLBACK;\n');
          await new Promise(resolve => holder.once('close', resolve));
        }
      });
      if (previous) docker(['exec', container, 'dropdb', '-U', 'postgres', previous]);
      docker(['exec', container, 'dropdb', '-U', 'postgres', template]);
    }
  } finally {
    if (owned) {
      const info = JSON.parse(docker(['inspect', container, '--format', '{{json .}}']).stdout);
      assert.equal(info.Config.Labels['codex.task'], label, 'refuse cleanup of a foreign container');
      assert.equal(info.Name, '/' + container);
      docker(['rm', '-f', container]);
      console.log('Owned isolated container removed; no production database or gateway used.');
    }
  }
});
