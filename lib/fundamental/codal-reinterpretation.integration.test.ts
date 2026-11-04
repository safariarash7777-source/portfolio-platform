// Only the existing disposable CI Postgres. No destination credentials/config.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { candidateFor, reinterpretationFixture } from "../../relay/fixtures/reinterpretation.mjs";
import { restorePayload, rowHash } from "../../relay/codal-reinterpretation.mjs";
import { latestParserRows, dedupeByPeriod, type CodalRow } from "./supabase";
import { bindSelectedMonthlyQuantity } from "./monthly-quantity-binding";
import { withKnownMonthlyQuantities } from "../core/monthly-quantity";
import { buildMonthlySales } from "../core/monthlyReport";

const DB = "codal_reinterpretation_isolated_test";
// Omit inherited libpq settings entirely: an empty PGSERVICEFILE is still a
// filename to libpq. Keep only the explicit disposable-runner connection below.
const ENV = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key))),
  PGHOST: "127.0.0.1", PGHOSTADDR: "127.0.0.1", PGPORT: "5433", PGUSER: "postgres",
  PGPASSWORD: "postgres", PGOPTIONS: "-c statement_timeout=5000" };
const lit = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
function sql(query: string, db = DB): string {
  return execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", query],
    { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function asyncSql(query: string): Promise<string> {
  return new Promise((resolve, reject) => execFile("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", query],
    { env: ENV, encoding: "utf8" }, (err, stdout, stderr) => err ? reject(new Error(stderr)) : resolve(stdout.trim())));
}
const role = (query: string) => `SET ROLE service_role; ${query}`;
const rows = () => JSON.parse(sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM codal_reports r"));
const invoke = (p: { p_baseline: unknown; p_baseline_id: number; p_candidate: unknown }) =>
  `SELECT public.codal_reinterpret_one(${lit(p.p_baseline)},${p.p_baseline_id},${lit(p.p_candidate)})`;
function failure(query: string, pattern: RegExp) {
  let stderr = "";
  try { sql(query); } catch (e) { stderr = String((e as { stderr?: string }).stderr ?? e); }
  assert.match(stderr, pattern);
}

before(() => {
  if (process.env.CI !== "true") throw new Error("Run only in existing isolated CI Postgres job; local execution not allocated");
  // No DROP of an existing DB: a collision means stop, never reuse unknown state.
  sql(`CREATE DATABASE ${DB}`, "postgres");
  sql(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;`);
  const original = readFileSync(join(process.cwd(), "sql/terminal_t0.sql"), "utf8");
  const table = original.match(/create table public\.codal_reports \([\s\S]*?\n\);/i)?.[0];
  assert.ok(table, "Use actual codal_reports schema");
  sql(`${table}
    ALTER TABLE codal_reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY codal_read ON codal_reports FOR SELECT TO anon, authenticated USING(true);
    CREATE FUNCTION codal_test_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only'; END $$;
    CREATE TRIGGER codal_test_guard BEFORE UPDATE OR DELETE OR TRUNCATE ON codal_reports FOR EACH STATEMENT EXECUTE FUNCTION codal_test_guard();
    GRANT SELECT ON codal_reports TO anon, authenticated;
    GRANT SELECT,INSERT ON codal_reports TO service_role;
    GRANT USAGE,SELECT ON SEQUENCE codal_reports_id_seq TO service_role;`);
  sql(readFileSync(join(process.cwd(), "sql/codal_single_report_reinterpretation_20261104.sql"), "utf8"));
});

test("SQL candidate is invoker with narrow lock helper; no public execute or mutation grants", () => {
  assert.equal(sql("SELECT prosecdef FROM pg_proc WHERE oid='public.codal_reinterpret_one(jsonb,bigint,jsonb)'::regprocedure"), "f");
  assert.equal(sql("SELECT has_function_privilege('anon','public.codal_reinterpret_one(jsonb,bigint,jsonb)','EXECUTE')"), "f");
  assert.equal(sql("SELECT has_function_privilege('authenticated','codal_private.reinterpret_lock()','EXECUTE')"), "f");
  assert.equal(sql("SELECT has_schema_privilege('authenticated','codal_private','USAGE')"), "f");
  assert.equal(sql("SELECT has_table_privilege('service_role','codal_reports','UPDATE') OR has_table_privilege('service_role','codal_reports','DELETE') OR has_table_privilege('service_role','codal_reports','TRUNCATE')"), "f");
  failure("SET ROLE anon; SELECT codal_private.reinterpret_lock()", /permission denied/);
});

test("real archive adoption, exact idempotency and selected-row quantity binding", async () => {
  const f = reinterpretationFixture();
  const old = structuredClone(f.old);
  Reflect.deleteProperty(old, "id"); Reflect.deleteProperty(old, "captured_at");
  const columns = Object.keys(old);
  sql(`INSERT INTO codal_reports(${columns.join(",")}) SELECT ${columns.map(c => `r.${c}`).join(",")} FROM jsonb_populate_record(NULL::codal_reports,${lit(old)}) r`);
  const baseline = rows(), payload = await candidateFor(baseline);
  const result = JSON.parse(sql(role(invoke(payload))));
  assert.equal(result.id, 2);
  assert.equal(result.raw.reinterpretation.original_body_sha256, null);
  assert.deepEqual(rows()[0], baseline[0]);
  assert.deepEqual(JSON.parse(sql(role(invoke(payload)))), result);
  assert.equal(rows().length, 2);
  const selected = latestParserRows(rows())[0];
  assert.equal(selected.id, 2);
  const bound = bindSelectedMonthlyQuantity(selected, "فولاد");
  assert.equal(bound.quantity_binding?.reportId, result.id);
  const checked = withKnownMonthlyQuantities(bound), model = buildMonthlySales([checked]);
  assert.deepEqual(model?.quantitySeries?.map(s => [s.market, s.points[0].production, s.points[0].sales]),
    [["داخلی",279,238],["صادراتی",0,66]]);
  assert.ok(checked.products.every(p => p.sales_rate === null));
});

test("version collision, stale baseline, changed money and foreign identity have no effect", async () => {
  const all = rows(), baseline = [all[0]], payload = await candidateFor(baseline);
  const collision = structuredClone(payload); collision.p_candidate.data.period_total_amount++;
  failure(role(invoke(collision)), /collision/);
  const next = structuredClone(payload); next.p_candidate.source_url = next.p_candidate.source_url.replace("#pv3", "#pv4");
  next.p_candidate.raw.parser_version = 4;
  failure(role(invoke(next)), /baseline changed/);
  const borrowed = structuredClone(payload); borrowed.p_candidate.period_end = "2026-08-22";
  failure(role(invoke(borrowed)), /identity/);
  assert.deepEqual(rows(), all);
});

test("forward restore is appended, exactly idempotent, preserves every old row and reader selection", () => {
  const all = rows(), adopted = all[1];
  const p = restorePayload({ rows: all, id: adopted.id, version: 3, sha256: rowHash(adopted) }, 1, 4,
    "00000000-0000-4000-8000-000000000002");
  const restored = JSON.parse(sql(role(invoke(p))));
  assert.equal(restored.id, 3);
  assert.deepEqual(restored.data, all[0].data);
  assert.equal(restored.raw.quantity_capture, undefined);
  assert.deepEqual(JSON.parse(sql(role(invoke(p)))), restored);
  assert.deepEqual(rows().slice(0,2), all);
  assert.equal(latestParserRows(rows())[0].id, 3);
  failure("UPDATE codal_reports SET title='changed' WHERE id=1", /append-only/);
  failure("DELETE FROM codal_reports WHERE id=2", /append-only/);
});

test("pre-commit rollback leaves no row and amendment remains reader winner", async () => {
  const all = rows(), latest = all[2];
  const p = restorePayload({ rows: all, id: latest.id, version: 4, sha256: rowHash(latest) }, 1, 5,
    "00000000-0000-4000-8000-000000000003");
  sql(role(`BEGIN; ${invoke(p)}; ROLLBACK;`));
  assert.deepEqual(rows(), all);
  // Real reader logic, synthetic later amendment, not a claim about live winner.
  const amendment = { ...all[0], id: 50, source_url: "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-amendment#pv2",
    raw: { ...all[0].raw, announcement_link: "https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-amendment", date_publish: "1405/08/01", time_publish: "12:00:00" } };
  assert.equal(dedupeByPeriod(latestParserRows([...all, amendment] as CodalRow[]))[0].id, 50);
});

test("deadline must be armed before statement; missing timeout has no effect", () => {
  const all = rows();
  failure(`SET statement_timeout=0; SET ROLE service_role; SELECT codal_reinterpret_one('[]',1,'{}')`, /pre-armed/);
  assert.deepEqual(rows(), all);
});

async function waitForLock(app: string) {
  for (let i = 0; i < 60; i++) {
    if (sql(`SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='${app}' AND l.relation='codal_reports'::regclass AND l.granted AND l.mode IN ('RowExclusiveLock','ShareRowExclusiveLock')`) !== "0") return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("test writer failed to reach lock barrier");
}

test("ordinary legacy INSERT lock blocks CAS; bounded busy fails without insertion", async () => {
  const all = rows(), latest = all[2];
  const p = restorePayload({ rows: all, id: latest.id, version: 4, sha256: rowHash(latest) }, 1, 5,
    "00000000-0000-4000-8000-000000000004");
  const holder = asyncSql("SET application_name='codal_busy_test'; BEGIN; SET LOCAL ROLE service_role; INSERT INTO codal_reports(symbol,source_url) VALUES('synthetic','https://test.invalid/busy'); SELECT pg_sleep(3); ROLLBACK;");
  await waitForLock("codal_busy_test");
  const started = Date.now();
  failure(role(invoke(p)), /lock timeout/);
  assert.ok(Date.now() - started < 4500);
  await holder;
  assert.deepEqual(rows(), all);
});

test("ordinary INSERT committed while waiting invalidates baseline inside locked transaction", async () => {
  const all = rows(), latest = all[2];
  const p = restorePayload({ rows: all, id: latest.id, version: 4, sha256: rowHash(latest) }, 1, 5,
    "00000000-0000-4000-8000-000000000005");
  const holder = asyncSql(`SET application_name='codal_race_test'; BEGIN; SET LOCAL ROLE service_role;
    INSERT INTO codal_reports(symbol,report_kind,period_end,title,source_url,data,raw)
    SELECT symbol,report_kind,period_end,title,'https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-race#pv2',data,
      raw || '{"announcement_link":"https://codal.ir/Reports/Decision.aspx?LetterSerial=synthetic-race","date_publish":"1405/08/01","time_publish":"12:00:00"}'::jsonb FROM codal_reports WHERE id=1;
    SELECT pg_sleep(0.7); COMMIT;`);
  await waitForLock("codal_race_test");
  failure(role(invoke(p)), /baseline changed/);
  await holder;
  assert.equal(rows().length, all.length + 1);
  assert.equal(rows().filter((r: CodalRow) => r.raw?.parser_version === 5).length, 0);
});

test("concurrent identical requests append once; newer amendment remains winner", async () => {
  const all = rows(), latest = all.find((r: CodalRow) => r.raw?.parser_version === 4);
  const p = restorePayload({ rows: all, id: latest.id, version: 4, sha256: rowHash(latest) }, 1, 5,
    "00000000-0000-4000-8000-000000000006");
  const [a,b] = await Promise.all([asyncSql(role(invoke(p))), asyncSql(role(invoke(p)))]);
  assert.deepEqual(JSON.parse(a), JSON.parse(b));
  assert.equal(rows().length, all.length + 1);
  assert.deepEqual(rows().slice(0, all.length), all);
  assert.match(dedupeByPeriod(latestParserRows(rows()))[0].source_url ?? "", /synthetic-race/);
});
