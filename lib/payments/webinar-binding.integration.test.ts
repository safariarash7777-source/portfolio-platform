/** Existing CI PG service only. SQL role seam, never GoTrue/JWT or primary acceptance. */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { execFileSync, psqlAsync } from "../ops/test-postgres";

const lease = randomUUID();
const database = `p05_binding_${lease.replaceAll("-", "")}`;
const marker = `p05-binding:${lease}`;
let owned = false;
let sourceSHA = "UNOBSERVED";
function preflight() {
  assert.equal(process.platform, "linux", "P05_SQL_NOT_RUN: existing Linux CI service only");
  assert.equal(process.env.CI, "true", "P05_SQL_NOT_RUN: requires owned GitHub CI service");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "P05_SQL_NOT_RUN: requires GitHub Actions");
  for (const [key, value] of Object.entries({ PGHOST: "127.0.0.1", PGPORT: "5433", PGUSER: "postgres", PGPASSWORD: "postgres" })) assert.equal(process.env[key], value, `unsafe ${key}`);
  for (const key of ["PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGDATABASE", "PGOPTIONS", "PGPASSFILE", "PGSYSCONFDIR", "TEST_POSTGRES_CONTAINER"]) assert.ok(!process.env[key], `indirect ${key} forbidden`);
}
const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: "5433", PGUSER: "postgres", PGPASSWORD: "postgres" };
const args = (db: string) => ["-X", "-q", "-A", "-t", "-P", "null=__P05_NULL__", "-h", "127.0.0.1", "-p", "5433", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;
function admin(query: string) {
  preflight();
  return execFileSync("psql", [...args("postgres"), "-c", query], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }).trim();
}
function attest() {
  preflight(); assert.ok(owned, "unowned P05 database");
  assert.equal(admin(`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=${quote(database)}`), marker);
}
function sql(query: string) {
  attest(); return execFileSync("psql", [...args(database), "-c", query], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }).trim();
}
function file(path: string) {
  attest(); execFileSync("psql", [...args(database), "-f", join(process.cwd(), path)], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 });
}
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", O = "33333333-3333-4333-8333-333333333333";
const W = "44444444-4444-4444-8444-444444444444", LP = "55555555-5555-4555-8555-555555555555", LR = "66666666-6666-4666-8666-666666666666";
function as(role: "authenticated" | "service_role" | "anon", user: string | null, query: string) {
  return `BEGIN; SELECT set_config('request.jwt.claims',${quote(JSON.stringify({ role, sub: user, user_metadata: { role: "admin" } }))},true); SET LOCAL ROLE ${role}; ${query}; COMMIT;`;
}
function json(query: string) { const value = sql(query).split("\n").filter(Boolean).at(-1)!; return value === "__P05_NULL__" ? null : JSON.parse(value); }
function denied(query: string, state: string) {
  assert.throws(() => sql(query), (error: unknown) => String((error as { stderr?: unknown }).stderr ?? error).includes(state));
}
function enable(issuance = true, settlement = true) { sql(`UPDATE webinar_payment_private.gates SET issuance_enabled=${issuance},settlement_enabled=${settlement}`); }
function webinar(price = 100) {
  const id = randomUUID(); sql(`INSERT INTO public.webinars(id,title,starts_at,registration_open,price_toman,status) VALUES('${id}','Synthetic PG fixture','2099-01-01',true,${price},'published')`); return id;
}
function register(w: string, user = A) { return json(as("authenticated", user, `SELECT public.register_for_webinar_bound_v1('${w}')`)); }
function prepare(r: string, key = randomUUID(), user = A) { return json(as("authenticated", user, `SELECT public.prepare_webinar_payment('${r}','${key}')`)); }
function read(id: string) { return json(as("service_role", null, `SELECT public.read_webinar_payment_binding(NULL,'${id}')`)); }
function created(attach = true) {
  enable(); const w = webinar(), r = register(w).registration_id as string, p = prepare(r);
  const authority = `A${randomUUID().replaceAll("-", "")}`;
  if (attach) {
    json(as("service_role", null, `SELECT public.claim_webinar_payment_request('${p.paymentId}','${r}','${A}')`));
    json(as("service_role", null, `SELECT public.attach_webinar_authority('${p.paymentId}','${r}','${A}','${authority}')`));
  }
  return { w, r, p, authority };
}
function settle(f: ReturnType<typeof created>, outcome = "verified", ref = "201", amount = 100) {
  return json(as("service_role", null, `SELECT public.settle_webinar_payment('${f.p.paymentId}','${f.authority}','${outcome}',${outcome === "verified" ? quote(ref) : "NULL"},${amount})`));
}
let legacySnapshot = "";
before(() => {
  preflight();
  sourceSHA = execFileSync("git", ["rev-parse", "HEAD"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }).trim();
  assert.match(sourceSHA, /^[0-9a-f]{40}$/);
  admin(`CREATE DATABASE "${database}"`);
  admin(`COMMENT ON DATABASE "${database}" IS ${quote(marker)}`); owned = true; attest();
  file("sql/test/supabase_bootstrap.sql");
  file("sql/test/profile_legacy_default_privileges.sql");
  file("sql/test/portfolio_precondition.sql");
  file("sql/archive/supabase_portfolio_versioning.sql");
  file("sql/phase5_payments_telegram.sql");
  file("sql/phase8_webinars.sql");
  file("sql/phase30_contain_create_payment.sql");
  sql(`INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${O}');
    INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${O}','admin');
    INSERT INTO public.webinars(id,title,starts_at,registration_open,price_toman,status) VALUES('${W}','Legacy synthetic fixture','2099-01-01',true,100,'published');
    INSERT INTO public.payments(id,user_id,amount,authority,status,ref_id,verified_at) VALUES('${LP}','${A}',100,'LEGACY_FIXTURE','paid','101','2026-01-01T00:00:00Z');
    INSERT INTO public.webinar_registrations(id,user_id,webinar_id,payment_id,payment_status) VALUES('${LR}','${A}','${W}','${LP}','paid');`);
  legacySnapshot = sql(`SELECT json_build_object('p',(SELECT row_to_json(p) FROM public.payments p WHERE id='${LP}'),'r',(SELECT row_to_json(r) FROM public.webinar_registrations r WHERE id='${LR}'))`);
  file("sql/20261030133000_webinar_payment_binding.sql");
  console.log(JSON.stringify({ contract: "p05-sql-role-seam.v1", server: sql("SELECT version()"), database: "UUID-owned CI database", realJWT: false, primary: false }));
});
after(() => { if (owned) {
  attest(); admin(`DROP DATABASE "${database}"`); owned = false;
  assert.equal(admin(`SELECT count(*) FROM pg_database WHERE datname=${quote(database)}`), "0");
  console.log("P05_SQL_CLEANUP " + JSON.stringify({ absent: true, owned: true, sourceSHA, sourceKind: "ci-checkout", primary: false }));
} });

test("new gates are off; old free registration works without any payment/marker issuance", () => {
  assert.deepEqual(json("SELECT json_build_array(issuance_enabled,settlement_enabled) FROM webinar_payment_private.gates"), [false, false]);
  const w = webinar(0);
  denied(as("authenticated", A, `SELECT public.register_for_webinar_bound_v1('${w}')`), "55000");
  json(as("authenticated", A, `SELECT public.register_for_webinar('${w}')`));
  assert.equal(sql(`SELECT payment_status FROM public.webinar_registrations WHERE webinar_id='${w}' AND user_id='${A}'`), "free");
  assert.equal(sql("SELECT count(*) FROM webinar_payment_private.registration_issuances"), "0");
  assert.equal(sql("SELECT count(*) FROM public.payments"), "1");
});
test("legacy rows remain unbound; duplicate valid issuance reads its original marker without renewing it", () => {
  enable(); const old = register(W);
  assert.equal(old.binding_provenance, "unproven"); assert.equal(old.already_registered, true);
  denied(as("authenticated", A, `SELECT public.prepare_webinar_payment('${LR}','${randomUUID()}')`), "55000");
  const w = webinar(), fresh = register(w), clock = sql(`SELECT issued_at FROM webinar_payment_private.registration_issuances WHERE registration_id='${fresh.registration_id}'`);
  const duplicate = register(w);
  assert.equal(duplicate.binding_provenance, "register-webinar.v1"); assert.equal(duplicate.already_registered, true);
  assert.equal(sql(`SELECT issued_at FROM webinar_payment_private.registration_issuances WHERE registration_id='${fresh.registration_id}'`), clock);
  assert.equal(sql(`SELECT count(*) FROM webinar_payment_private.registration_issuances WHERE registration_id='${LR}'`), "0");
});
test("ACL/RLS deny client inserts, private reads and cross-member issuance even with an admin metadata claim", () => {
  const w = webinar();
  denied(as("authenticated", B, `INSERT INTO public.webinar_registrations(user_id,webinar_id) VALUES('${B}','${w}')`), "42501");
  for (const role of ["anon", "authenticated", "service_role"] as const) denied(as(role, A, "TRUNCATE public.payments, public.webinar_registrations"), "42501");
  for (const role of ["anon", "authenticated", "service_role"] as const) denied(as(role, A, "SELECT * FROM webinar_payment_private.registration_issuances"), "42501");
  const f = created(false);
  denied(as("authenticated", B, `SELECT public.prepare_webinar_payment('${f.r}','${randomUUID()}')`), "42501");
  const stateB = json(as("authenticated", B, `SELECT public.read_webinar_registration_state('${f.w}')`));
  assert.equal(stateB.state, "absent"); assert.equal(stateB.payment, null);
  denied(as("authenticated", A, `SELECT public.read_webinar_payment_binding(NULL,'${f.p.paymentId}')`), "42501");
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.create_payment(integer,text)','EXECUTE')"), "f");
});
test("prepare is idempotent and snapshots DB price; another intent cannot create a second payment", () => {
  const f = created(false), same = prepare(f.r, f.p.intentKey);
  assert.equal(same.paymentId, f.p.paymentId);
  denied(as("authenticated", A, `SELECT public.prepare_webinar_payment('${f.r}','${randomUUID()}')`), "23505");
  sql(`UPDATE public.webinars SET price_toman=999 WHERE id='${f.w}'`);
  assert.equal(read(f.p.paymentId).amountToman, 100);
  assert.equal(sql(`SELECT count(*) FROM public.payments WHERE bound_registration_id='${f.r}'`), "1");
});
test("concurrent claim has one acknowledged winner; attachment is one-time and rejects another authority", async () => {
  const f = created(false);
  const query = as("service_role", null, `SELECT public.claim_webinar_payment_request('${f.p.paymentId}','${f.r}','${A}')`);
  attest();
  const results = await Promise.all([psqlAsync([...args(database), "-c", query], env), psqlAsync([...args(database), "-c", query], env)]);
  assert.deepEqual(results.map(v => JSON.parse(v.trim().split("\n").at(-1)!).claimedNow).sort(), [false, true]);
  json(as("service_role", null, `SELECT public.attach_webinar_authority('${f.p.paymentId}','${f.r}','${A}','${f.authority}')`));
  json(as("service_role", null, `SELECT public.attach_webinar_authority('${f.p.paymentId}','${f.r}','${A}','${f.authority}')`));
  denied(as("service_role", null, `SELECT public.attach_webinar_authority('${f.p.paymentId}','${f.r}','${A}','OTHER_AUTHORITY')`), "55000");
  assert.equal(read(f.p.paymentId).authority, f.authority);
});
test("all binding fields and issuance markers are immutable; old generic money cannot be attached to a registration", () => {
  const f = created();
  for (const change of ["amount=101", `user_id='${B}'`, "purpose_code=NULL", `bound_webinar_id='${W}'`, "created_at=now()+interval '1 day'", "authority='OTHER'"]) {
    denied(`UPDATE public.payments SET ${change} WHERE id='${f.p.paymentId}'`, "55000");
  }
  denied(`UPDATE webinar_payment_private.registration_issuances SET issued_at=now() WHERE registration_id='${f.r}'`, "55000");
  denied(`UPDATE public.webinar_registrations SET payment_id='${LP}' WHERE id='${f.r}'`, "55000");
});
test("authority lengths 1, 255 and 256 attach on a genuinely claimed intent with gates on", () => {
  for (const size of [1, 255, 256]) {
    const f = created(false), candidate = "L" + "A".repeat(size - 1);
    const claim = json(as("service_role", null, `SELECT public.claim_webinar_payment_request('${f.p.paymentId}','${f.r}','${A}')`));
    assert.equal(claim.claimedNow, true);
    assert.deepEqual(json("SELECT json_build_array(issuance_enabled,settlement_enabled) FROM webinar_payment_private.gates"), [true, true]);
    const attached = json(as("service_role", null, `SELECT public.attach_webinar_authority('${f.p.paymentId}','${f.r}','${A}',${quote(candidate)})`));
    assert.equal(attached.authority, candidate); assert.equal(read(f.p.paymentId).authority.length, size);
  }
});
test("empty, 257, whitespace, newline and nonASCII authorities fail in the RPC and direct table constraint without consuming attachment", () => {
  const f = created(false);
  const claim = json(as("service_role", null, `SELECT public.claim_webinar_payment_request('${f.p.paymentId}','${f.r}','${A}')`));
  assert.equal(claim.claimedNow, true);
  assert.deepEqual(json("SELECT json_build_array(issuance_enabled,settlement_enabled) FROM webinar_payment_private.gates"), [true, true]);
  for (const authority of ["", "A".repeat(257), "A B", "A\n", "Aé", "Aا"]) {
    assert.equal(json(as("service_role", null, `SELECT public.attach_webinar_authority('${f.p.paymentId}','${f.r}','${A}',${quote(authority)})`)), null);
    denied(as("service_role", null, `UPDATE public.payments SET authority=${quote(authority)},provider_request_state='attached' WHERE id='${f.p.paymentId}'`), "23514");
    const current = read(f.p.paymentId); assert.equal(current.authority, null); assert.equal(current.providerState, "claimed");
  }
  const valid = "Z".repeat(256);
  assert.equal(json(as("service_role", null, `SELECT public.attach_webinar_authority('${f.p.paymentId}','${f.r}','${A}',${quote(valid)})`)).authority, valid);
});
test("settlement gate also blocks the old financial writer; reopening uses the issued amount rather than current price", () => {
  const f = created(); enable(true, false);
  denied(as("service_role", null, `SELECT public.verify_payment('${f.authority}','201',100,NULL)`), "55000");
  assert.equal(read(f.p.paymentId).status, "pending"); enable();
  sql(`UPDATE public.webinars SET price_toman=999 WHERE id='${f.w}'`);
  assert.equal(settle(f, "verified", "201", 999), null);
  const paid = settle(f);
  assert.equal(paid.status, "paid"); assert.equal(paid.registrationState, "paid"); assert.equal(paid.amountToman, 100);
  assert.equal(settle(f).refId, "201");
  assert.equal(sql(`SELECT count(*) FROM public.audit_log WHERE action='payment.verify' AND "after"->>'authority'='${f.authority}'`), "1");
});
test("old consumers cannot revive refunded/free rows or insert paid even with a genuine paid binding and both gates on", () => {
  for (const terminal of ["refunded", "free"]) {
    const f = created(); settle(f);
    sql(`UPDATE public.webinar_registrations SET payment_status='${terminal}' WHERE id='${f.r}'`);
    denied(as("service_role", null, `UPDATE public.webinar_registrations SET payment_status='paid' WHERE id='${f.r}'`), "55000");
    denied(as("authenticated", O, `UPDATE public.webinar_registrations SET payment_status='paid' WHERE id='${f.r}'`), "55000");
    denied(as("service_role", null, `UPDATE public.webinar_registrations SET payment_status='pending' WHERE id='${f.r}'`), "55000");
    assert.equal(settle(f).registrationState, terminal);
  }
  const f = created(); settle(f);
  denied(`INSERT INTO public.webinar_registrations(id,user_id,webinar_id,payment_id,payment_status) VALUES('${f.r}','${A}','${f.w}','${f.p.paymentId}','paid')`, "55000");
});
test("paid money survives missing service; deleted registration does not cascade history or permit a fresh issuance", () => {
  const f = created(); sql(`DELETE FROM public.webinar_registrations WHERE id='${f.r}'`);
  const result = settle(f);
  assert.equal(result.status, "paid"); assert.equal(result.registrationState, "unresolved");
  assert.equal(sql(`SELECT count(*) FROM webinar_payment_private.registration_issuances WHERE registration_id='${f.r}'`), "1");
  denied(`INSERT INTO public.webinar_registrations(id,user_id,webinar_id,payment_id) VALUES('${f.r}','${A}','${f.w}','${f.p.paymentId}')`, "55000");
  denied(as("authenticated", A, `SELECT public.register_for_webinar_bound_v1('${f.w}')`), "55000");
  const state = json(as("authenticated", A, `SELECT public.read_webinar_registration_state('${f.w}')`));
  assert.equal(state.state, "unresolved"); assert.equal(state.payment.status, "paid"); assert.equal("userId" in state, false);
});
test("legacy paid metadata is still editable without changing state; original legacy financial/history snapshot is preserved", () => {
  sql(`UPDATE public.webinar_registrations SET attended=true WHERE id='${LR}'`);
  assert.equal(sql(`SELECT attended FROM public.webinar_registrations WHERE id='${LR}'`), "t");
  sql(`UPDATE public.webinar_registrations SET attended=false WHERE id='${LR}'`);
  const current = json(`SELECT json_build_object('p',(SELECT to_jsonb(p)-ARRAY['purpose_code','bound_registration_id','bound_webinar_id','intent_key','provider_request_state'] FROM public.payments p WHERE id='${LP}'),'r',(SELECT row_to_json(r) FROM public.webinar_registrations r WHERE id='${LR}'))`);
  assert.deepEqual(current, JSON.parse(legacySnapshot));
});
