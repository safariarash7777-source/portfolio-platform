// Explicit standalone real PostgreSQL acceptance, never a production destination.
// node --test lib/media/layout-setting.integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const name = 'media-layout-synthetic-' + randomUUID().slice(0, 8), label = 'media-layout-20261017';
const file = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const admin = '11111111-1111-4111-8111-111111111111', member = '22222222-2222-4222-8222-222222222222';
function docker(args, input, failure = false) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (!failure) assert.equal(r.status, 0, r.stderr || r.error?.message || r.stdout);
  return r;
}
function sql(query, failure = false) { return docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres'], query, failure); }
const as = (role, id, query, spoof = false) => `BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claims','${JSON.stringify({ role, ...(id ? { sub: id } : {}), ...(spoof ? { user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } } : {}) })}',true); ${query} COMMIT;`;

test('persistent media layout uses authoritative DB admin, scalar public projection and immutable history', { timeout: 90000 }, async t => {
  let owned = false;
  try {
    docker(['create', '--pull', 'never', '--name', name, '--label', 'codex.task=' + label, '--network', 'none',
      '--memory', '256m', '--cpus', '1', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']); owned = true;
    docker(['start', name]); const until = Date.now() + 15000;
    while (docker(['exec', name, 'pg_isready', '-U', 'postgres'], undefined, true).status !== 0) {
      assert.ok(Date.now() < until); await new Promise(resolve => setTimeout(resolve, 100));
    }
    const info = JSON.parse(docker(['inspect', name, '--format', '{{json .}}']).stdout);
    assert.equal(info.HostConfig.NetworkMode, 'none'); assert.deepEqual(info.HostConfig.PortBindings ?? {}, {});
    assert.equal(info.Mounts.some(m => m.Type === 'bind' || m.Type === 'volume'), false);
    console.log(JSON.stringify({ image: info.Image, network: 'none', hostPorts: [], hostMounts: [], synthetic: true }));
    for (const profile of ['legacy_default_privileges', 'explicit_grants']) {
      // Separate source fixtures in separate DBs. Roles are container-local only.
      const db = 'media_' + profile;
      docker(['exec', name, 'createdb', '-U', 'postgres', db]);
      const query = (text, failure = false) => docker(['exec', '-i', name, 'psql', '-d', db, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres'], text, failure);
      // Helpers use PGDATABASE in this owned container only, never a host/network DB.
      const prefix = `\\connect ${db}\n`;
      sql(prefix + file('sql/test/supabase_bootstrap.sql') + '\n' + file('sql/test/profile_' + profile + '.sql') +
        `\nINSERT INTO auth.users(id) VALUES('${admin}'),('${member}'); INSERT INTO public.profiles(id,role) VALUES('${admin}','admin'),('${member}','user');`);
      query(file('sql/media_layout_settings_20261017.sql'));
      const read = text => query(text).stdout.trim().split('\n').at(-1);
      const history = () => read('SELECT count(*) FROM public.media_layout_versions;');
      const reject = (text, code = '42501') => { const before = history(), r = query(text, true); assert.notEqual(r.status, 0); assert.match(r.stderr, new RegExp('ERROR:\\s+' + code + ':')); assert.equal(history(), before); };
      await t.test(profile + ': public read is scalar default, never audit actor/history', () => {
        for (const role of ['anon', 'authenticated', 'service_role']) {
          assert.equal(read(as(role, role === 'anon' ? null : member, 'SELECT public.get_media_layout();')), '1');
          reject(as(role, member, 'SELECT * FROM public.media_layout_versions;'));
        }
        assert.equal(history(), '0');
        assert.equal(read("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.media_layout_versions'::regclass;"), 't');
      });
      await t.test(profile + ': anon, missing uid, member and spoofed metadata cannot append', () => {
        reject(as('anon', null, 'SELECT public.set_media_layout(2);'));
        reject(as('authenticated', null, 'SELECT public.set_media_layout(2);'));
        reject(as('authenticated', member, 'SELECT public.set_media_layout(2);', true));
        reject(as('authenticated', member, `INSERT INTO public.media_layout_versions(media_layout,actor_id) VALUES(2,'${admin}');`));
      });
      await t.test(profile + ': admin changes 1/2/3 persist across independent reads with audit', () => {
        for (const layout of [1, 2, 3]) {
          assert.equal(read(as('authenticated', admin, `SELECT public.set_media_layout(${layout});`)), String(layout));
          assert.equal(read(as('anon', null, 'SELECT public.get_media_layout();')), String(layout));
        }
        assert.equal(history(), '3');
        assert.equal(read(`SELECT bool_and(actor_id='${admin}'::uuid AND created_at IS NOT NULL) FROM public.media_layout_versions;`), 't');
      });
      await t.test(profile + ': invalid values and immutable-history mutations leave history unchanged', () => {
        for (const layout of ['NULL', '0', '4', '-1']) reject(as('authenticated', admin, `SELECT public.set_media_layout(${layout});`), '22023');
        reject('UPDATE public.media_layout_versions SET media_layout=1;');
        reject('DELETE FROM public.media_layout_versions;');
        reject('TRUNCATE public.media_layout_versions;');
        reject(as('authenticated', admin, 'TRUNCATE public.media_layout_versions;'));
        assert.equal(read('SELECT public.get_media_layout();'), '3');
      });
      await t.test(profile + ': revoked DB role wins over stale admin claims', () => {
        query(`UPDATE public.profiles SET role='user' WHERE id='${admin}';`);
        reject(as('authenticated', admin, 'SELECT public.set_media_layout(1);', true));
        assert.equal(read('SELECT public.get_media_layout();'), '3');
      });
    }
  } finally {
    if (owned) {
      const info = JSON.parse(docker(['inspect', name, '--format', '{{json .}}']).stdout);
      assert.equal(info.Config.Labels['codex.task'], label); assert.equal(info.Name, '/' + name);
      docker(['rm', '-f', name]); console.log('Owned media-layout container removed.');
    }
  }
});
