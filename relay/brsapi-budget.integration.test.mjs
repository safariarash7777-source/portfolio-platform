import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PersistentDailyBudget, tehranDayKey } from './brsapi-client.mjs';
import { LegacyMeter } from './brsapi-legacy-meter.mjs';

// Explicit opt-in and loopback/label checks: never connects to our live DB.
assert.equal(process.env.BRSAPI_BUDGET_TEST_ISOLATED, '1', 'isolated DB opt-in required');
const container = process.env.BRSAPI_BUDGET_TEST_CONTAINER;
if (container) {
  assert.match(container, /^liara-budget-test-[a-z0-9-]+$/);
  const label = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "codex.task" }}', container], { encoding: 'utf8' });
  assert.equal(label.status, 0);
  assert.match(label.stdout.trim(), /^liara-budget-/);
} else {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST), 'test DB must be loopback');
}
const dbs = ['brsapi_guard_legacy_test', 'brsapi_guard_explicit_test'];
const migration = readFileSync(new URL('../sql/phase28_brsapi_budget.sql', import.meta.url), 'utf8');
function command(db) {
  const args = ['-U', process.env.PGUSER || 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
  return container ? ['docker', ['exec', '-i', container, 'psql', ...args]] : ['psql', args];
}
function sql(db, text) {
  return new Promise((resolve, reject) => {
    const [bin, args] = command(db);
    const p = spawn(bin, args, { env: process.env });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim())));
    p.stdin.end(text);
  });
}
const literal = s => `'${String(s).replaceAll("'", "''")}'`;
const day = tehranDayKey();
function store(db) {
  return {
    async lease(key, want, hard) {
      const r = JSON.parse(await sql(db, `set role service_role; select row_to_json(r) from public.brsapi_budget_lease(${literal(key)},${want},${hard}) r;`));
      return { granted: r.granted, leasedBefore: r.leased_before, hardCeiling: r.hard_ceiling };
    },
    async release(key, back) {
      return Number(await sql(db, `set role service_role; select public.brsapi_budget_release(${literal(key)},${back});`));
    },
  };
}
async function baseline(db, key, used, hard) {
  await sql(db, `insert into public.brsapi_budget_days(day_key,leased,hard_ceiling,usage_verified,baseline_note)
    values(${literal(key)},${used},${hard},true,'isolated synthetic test baseline');`);
}
function budget(st, hard = 100, now = () => Date.now()) {
  return new PersistentDailyBudget({ store: st, softBudget: hard, hardCeiling: hard, leaseSize: 7, lowWaterRatio: 0, degradedCeiling: 100, now });
}
// Exactly the legacy send boundary: budget rejection precedes mocked upstream.
async function send(meter, wire) {
  await meter.count('isolated-producer', 'critical');
  wire.count += 1;
}
before(async () => {
  await sql('postgres', `do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  for (const db of dbs) {
    await sql('postgres', `drop database if exists ${db}; create database ${db};`);
    await sql(db, 'grant usage on schema public to anon,authenticated,service_role;');
    if (db.includes('legacy')) await sql(db, `alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    await sql(db, migration);
    await sql(db, migration); // reapplying must not restore permissive grants
  }
});
after(async () => { for (const db of dbs) await sql('postgres', `drop database if exists ${db};`); });

for (const db of dbs) {
  test(`${db}: unknown baseline sends nothing; tomorrow is not assumed unused`, async () => {
    const b = budget(store(db)), wire = { count: 0 };
    const meter = new LegacyMeter(() => b, { enforced: () => true });
    await assert.rejects(() => send(meter, wire));
    assert.equal(wire.count, 0);
    assert.equal(b.snapshot().remaining, null);
    assert.equal(b.snapshot().remainingKnown, false);
    await sql(db, `insert into public.brsapi_budget_days(day_key,leased,hard_ceiling) values(${literal(day)},0,100);`);
    await assert.rejects(() => send(meter, wire));
    assert.equal(wire.count, 0);
    await assert.rejects(() => store(db).lease('2099-01-01',1,100), /unverified/);
  });
  test(`${db}: 8 concurrent consumers share one real DB ceiling`, async () => {
    const key = `${day}:concurrent`;
    await baseline(db, key, 13, 100);
    const st = store(db);
    const grants = await Promise.all(Array.from({ length: 40 }, () => st.lease(key,7,100)));
    assert.equal(grants.reduce((n,r) => n+r.granted,0), 87);
    assert.equal(Number(await sql(db, `select leased from public.brsapi_budget_days where day_key=${literal(key)};`)),100);
  });
  test(`${db}: restart and duplicate release cannot reopen a full day`, async () => {
    const key = `${day}:restart`, st = store(db);
    await baseline(db,key,100,100);
    for (let i=0;i<3;i++) {
      assert.equal((await st.lease(key,10,100)).granted,0);
      assert.equal(await st.release(key,100),0);
    }
    assert.equal(Number(await sql(db,`select leased from public.brsapi_budget_days where day_key=${literal(key)};`)),100);
  });
  test(`${db}: reduced ceiling freezes allocation; larger request cannot raise it`, async () => {
    const key = `${day}:lower`, st = store(db);
    await baseline(db,key,80,100);
    assert.deepEqual(await st.lease(key,10,50),{granted:0,leasedBefore:80,hardCeiling:80});
    assert.equal((await st.lease(key,100,9000)).granted,0);
    const key2 = `${day}:lower-available`;
    await baseline(db,key2,30,100);
    assert.equal((await st.lease(key2,30,50)).granted,20);
    assert.equal((await st.lease(key2,1,100)).granted,0);
  });
  test(`${db}: anon/member cannot call/read/write; service can only read and lease`, async () => {
    for (const role of ['anon','authenticated']) {
      await assert.rejects(() => sql(db,`set role ${role}; select * from public.brsapi_budget_days;`),/permission denied/);
      await assert.rejects(() => sql(db,`set role ${role}; select * from public.brsapi_budget_lease('x',1,100);`),/permission denied/);
      await assert.rejects(() => sql(db,`set role ${role}; select public.brsapi_budget_release('x',100);`),/permission denied/);
    }
    await sql(db,'set role service_role; select count(*) from public.brsapi_budget_days;');
    await assert.rejects(() => sql(db,`set role service_role; update public.brsapi_budget_days set leased=0;`),/permission denied/);
  });
  test(`${db}: real persistent budget rejects BEFORE mocked upstream`, async () => {
    // Own day was inserted unverified above: an operator verifies an existing
    // conservative prior usage (93), not zero inferred from process startup.
    await sql(db,`update public.brsapi_budget_days set leased=93,usage_verified=true where day_key=${literal(day)};`);
    const wire = {count:0};
    const consumers = Array.from({length:8},() => {
      const b=budget(store(db)); return new LegacyMeter(()=>b,{enforced:()=>true});
    });
    await Promise.all(consumers.map(async meter => {
      for(let i=0;i<10;i++) await send(meter,wire).catch(()=>{});
    }));
    assert.equal(wire.count,7);
    const restarted=budget(store(db));
    await assert.rejects(()=>send(new LegacyMeter(()=>restarted,{enforced:()=>true}),wire));
    assert.equal(wire.count,7);
    assert.equal(Number(await sql(db,`select leased from public.brsapi_budget_days where day_key=${literal(day)};`)),100);
  });
}
test('DB connection fails across restarts: no critical emergency request', async () => {
  // A real SQL connection failure (database unavailable), never a fake grant.
  const st = store('brsapi_unavailable_guard_test');
  const wire = {count:0};
  for(let i=0;i<5;i++) {
    const b=budget(st);
    await assert.rejects(()=>send(new LegacyMeter(()=>b,{enforced:()=>true}),wire));
    assert.equal(b.snapshot().remaining,null);
  }
  assert.equal(wire.count,0);
});
if (container) test('isolated PostgreSQL restart preserves allocations; shutdown blocks sends', async () => {
  const stopped=spawnSync('docker',['stop','--time','3',container],{encoding:'utf8'});
  assert.equal(stopped.status,0);
  const wire={count:0};
  try {
    for(let i=0;i<3;i++) {
      const b=budget(store(dbs[0]));
      await assert.rejects(()=>send(new LegacyMeter(()=>b,{enforced:()=>true}),wire));
    }
    assert.equal(wire.count,0);
  } finally {
    assert.equal(spawnSync('docker',['start',container],{encoding:'utf8'}).status,0);
    let ready=false;
    for(let i=0;i<100;i++) {
      if(spawnSync('docker',['exec',container,'pg_isready','-U','postgres'],{encoding:'utf8'}).status===0){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(ready,true);
  }
  assert.equal(Number(await sql(dbs[0],`select leased from public.brsapi_budget_days where day_key=${literal(day)};`)),100);
  const b=budget(store(dbs[0]));
  await assert.rejects(()=>send(new LegacyMeter(()=>b,{enforced:()=>true}),wire));
  assert.equal(wire.count,0);
});
