// PF10: existing CI-local disposable Postgres only. Synthetic SQL actor seam,
// not real GoTrue, PostgREST, browser authentication or a bank payment.
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { execFileSync, psqlAsync } from "../ops/test-postgres";
import { validateCashFlowPayload, type CashFlowPayload } from "./cashFlowApiContract";
import { declaredInstallmentTotal, validateDebtPaymentsRead, type DebtPaymentPayload, type DebtPaymentReceipt, type DebtPaymentRequest, type DebtPaymentsReady } from "./debtPayments";
import { getDebtPayments, postDebtPayment, type DebtPaymentsDb } from "./debtPaymentsServer";
import { createDebtPaymentAttempt, recoverDebtPayment, sendDebtPayment } from "./debtPaymentsRequest";
const ENV = { ...process.env };
assert.ok(ENV.GITHUB_ACTIONS === "true" && ENV.CI === "true" && ENV.PGHOST === "127.0.0.1" && ENV.PGPORT === "5433" && ENV.PGUSER === "postgres" && ENV.PGPASSWORD === "postgres", "PF10 requires the existing disposable GitHub CI service");
assert.ok(!ENV.PGSERVICE && !ENV.PGSERVICEFILE && !ENV.PGHOSTADDR, "Indirect DB configuration forbidden");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", ADMIN = "33333333-3333-4333-8333-333333333333";
const period = { startOn: "2026-10-01", endOn: "2026-10-31" };
const quote = (x: unknown): string => x === null ? "NULL" : typeof x === "number" ? String(x) : "'" + (typeof x === "object" ? JSON.stringify(x) : String(x)).replaceAll("'", "''") + "'";
const wrap = (actor: string | null, q: string) => `BEGIN; SELECT set_config('request.jwt.claims',${quote(actor ? { sub: actor, role: "authenticated" } : { role: "anon" })},true); SET LOCAL ROLE ${actor ? "authenticated" : "anon"}; ${q}; COMMIT;`;
const args = (db: string, q: string) => ["-d", db, "-XqAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", q];
const sql = (db: string, q: string) => execFileSync("psql", args(db, q), { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const last = (s: string) => s.split("\n").filter(Boolean).at(-1)!;
const as = (db: string, actor: string | null, q: string) => last(sql(db, wrap(actor, q)));
function detail(error: unknown) { return String((error as { stderr?: unknown }).stderr ?? error); }
function denied(db: string, actor: string | null, q: string) { try { sql(db, wrap(actor, q)); return ""; } catch (error) { return detail(error); } }
const expense = (entryKey: string, amountToman: number | null) => ({ entryKey, basis: "actual" as const, kind: "expense" as const, amountToman, occurredOn: "2026-10-25", source: null, category: null, note: null, accountKey: "cash" });
const cashPayload = (amount = 3000, remove = false): CashFlowPayload => validateCashFlowPayload({ contractVersion: 1, period, accountDefinitions: [{ accountKey: "cash", label: "حساب مصنوعی" }, { accountKey: "other", label: "حساب دوم مصنوعی" }], scopeAccountKeys: ["cash", "other"], opening: null, coverage: { planned: { status: "partial", memberAffirmed: false, source: null }, actual: { status: "partial", memberAffirmed: false, source: null } }, entries: [
  ...(remove ? [] : [expense("one", amount)]), expense("two", 2000), expense("over", 15000), expense("zero", 0), expense("unknown", null),
  { ...expense("planned", 10000), basis: "planned" }, { ...expense("income", 9000), kind: "income" },
  { entryKey: "transfer", basis: "actual", kind: "transfer", amountToman: 7000, occurredOn: "2026-10-25", source: null, category: null, note: null, fromAccountKey: "cash", toAccountKey: "other" },
] });

for (const profile of ["legacy", "explicit"]) describe(`PF10 actual expense links / native Postgres / ${profile}`, () => {
  const owner = randomUUID(), db = `pf10_${profile}_${owner.replaceAll("-", "").slice(0, 12)}`;
  let created = false, hv: string, cf: string, fingerprint: string;
  const calls: string[] = [];
  const rpcSql = (name: string, values: Record<string, unknown>) => `SELECT public.${name}(${Object.entries(values).map(([key, value]) => `${key}=>${quote(value)}`).join(",")})`;
  const adapter = (actor = A): DebtPaymentsDb => ({ async authenticate() { return { user: { id: actor }, error: null }; }, async rpc(name, values) {
    assert.ok(["load_member_debt_payments", "lookup_member_debt_payment", "record_member_debt_payment"].includes(name)); calls.push(name);
    try { return { data: JSON.parse(as(db, actor, rpcSql(name, values))), error: null }; }
    catch (error) { return { data: null, error: { code: detail(error).match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] ?? "XX000" } }; }
  } });
  const basePayload = (entryKey: string, paymentKey = randomUUID()): DebtPaymentPayload => ({ contractVersion: 1, paymentKey, holdingVersionId: hv, debtKey: "debt", dueOn: "2026-10-25", cashFlowVersionId: cf, entryKey, reference: null });
  const request = (payload: DebtPaymentPayload, baseVersion = 0, clientToken = randomUUID()): DebtPaymentRequest => ({ contractVersion: "debt-payment-request.v1", expectedActorId: A, clientToken, baseVersion, period, payload });
  const post = (body: DebtPaymentRequest, actor = A) => postDebtPayment(new Request("http://localhost/api/personal-finance/debt-payments", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) }), async () => adapter(actor));
  const read = async (id = hv, beforeSequence?: number): Promise<DebtPaymentsReady> => {
    const query = new URLSearchParams({ holdingVersionId: id, ...period, ...(beforeSequence ? { beforeSequence: String(beforeSequence) } : {}) });
    const response = await getDebtPayments(new Request(`http://localhost/pf10?${query}`), async () => adapter());
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
    const result = validateDebtPaymentsRead(await response.json(), { holdingVersionId: id, period, beforeSequence }, A);
    assert.equal(result.state, "ready"); return result as DebtPaymentsReady;
  };
  const moneyHash = () => sql(db, "SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.member_holding_versions v),(SELECT jsonb_agg(to_jsonb(p) ORDER BY version_id,position_key) FROM public.member_holding_positions p),(SELECT jsonb_agg(to_jsonb(d) ORDER BY version_id,debt_key) FROM public.member_debt_positions d),(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.member_cash_flow_versions v),(SELECT jsonb_agg(to_jsonb(e) ORDER BY version_id,entry_key) FROM public.member_cash_flow_entries e))::text)");
  const unchanged = () => assert.equal(moneyHash(), fingerprint, "PF10 changed an existing financial or CF table");
  const cfWrite = (base: number, payload: CashFlowPayload) => JSON.parse(as(db, A, `SELECT public.record_member_cash_flow(${quote(payload)}::jsonb,${quote(randomUUID())},${base})`)).version_id as string;
  const direct = (r: DebtPaymentRequest) => rpcSql("record_member_debt_payment", { p_payload: r.payload, p_client_token: r.clientToken, p_base_version: r.baseVersion });
  before(async () => {
    // Never drop a pre-existing database. Only this test's attested database is cleaned.
    sql("postgres", `CREATE DATABASE ${db}`); created = true;
    sql("postgres", `COMMENT ON DATABASE ${db} IS ${quote(`pf10:${owner}`)}`);
    for (const file of ["sql/test/supabase_bootstrap.sql", `sql/test/profile_${profile === "legacy" ? "legacy_default_privileges" : "explicit_grants"}.sql`, "sql/test/portfolio_precondition.sql", "sql/phase32_member_holdings.sql", "supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql", "supabase/migrations/20261019215549_personal_cash_flow_versions.sql"]) {
      execFileSync("psql", ["-d", db, "-Xq", "-v", "ON_ERROR_STOP=1", "-f", join(process.cwd(), file)], { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      if (file === "sql/test/portfolio_precondition.sql") sql(db, `INSERT INTO auth.users(id) VALUES('${A}'),('${B}'),('${ADMIN}'); INSERT INTO public.profiles(id,role) VALUES('${A}','user'),('${B}','user'),('${ADMIN}','admin')`);
    }
    const assets = [{ position_key: "gold", manual_label: "دارایی مصنوعی", asset_class: "gold", unit: "کل قلم", qty: null, as_of: "2026-10-20", ownership_pct: 100, valuation_mode: "declared", declared_value: 2000, valuation_source: "اظهار مصنوعی", valuation_as_of: "2026-10-20", valuation_status: "valid" }, { position_key: "unpriced", manual_label: "قلم بی‌قیمت", asset_class: "gold", unit: "گرم", qty: 12, as_of: "2026-10-20", ownership_pct: 100, valuation_mode: "unpriced", valuation_status: "missing" }];
    as(db, A, `SELECT to_jsonb(r) FROM public.record_member_holdings(${quote(assets)}::jsonb,NULL,'pf10-assets',0) r`);
    const debt = [{ debt_key: "debt", title: "قسط مصنوعی", kind: "installment", balance_toman: 200000, currency: "IRT", balance_as_of: "2026-10-20", next_installment_toman: 10000, next_due_on: "2026-10-25", note: null }];
    hv = JSON.parse(as(db, A, `SELECT to_jsonb(r) FROM public.record_member_debts(${quote(debt)}::jsonb,1,'pf10-debt') r`)).version_id;
    cf = cfWrite(0, cashPayload()); fingerprint = moneyHash();
    const absent = await getDebtPayments(new Request(`http://localhost/pf10?holdingVersionId=${hv}&startOn=${period.startOn}&endOn=${period.endOn}`), async () => adapter());
    assert.equal(absent.status, 200); const unavailable = await absent.json(); assert.equal(unavailable.state, "unavailable"); assert.equal(unavailable.writeAllowed, false);
    calls.length = 0; assert.equal((await post(request(basePayload("one")))).status, 409); assert.ok(!calls.includes("record_member_debt_payment")); unchanged();
    execFileSync("psql", ["-d", db, "-Xq", "-v", "ON_ERROR_STOP=1", "-f", join(process.cwd(), "sql/debt_payment_links.sql")], { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  });
  after(() => {
    if (!created) return;
    assert.equal(sql("postgres", `SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=${quote(db)}`), `pf10:${owner}`);
    sql("postgres", `DROP DATABASE ${db}`);
  });
  let first: DebtPaymentReceipt, second: DebtPaymentReceipt, original: DebtPaymentRequest;
  test("reader-first absent schema closed writer; installed reader accepts only known actual expense", async () => {
    const loaded = await read(); assert.deepEqual(loaded.sources.map(s => s.entryKey).sort(), ["one", "over", "two", "zero"]); assert.equal(loaded.installments[0].installmentToman, 10000);
    for (const entry of ["planned", "transfer", "income", "unknown"]) assert.match(denied(db, A, direct(request(basePayload(entry)))), /22023/);
    unchanged();
  });
  test("two actual partial expenses produce 5000 declared without new money; lost response resolves by independent GET", async () => {
    original = request(basePayload("one")); const attempt = createDebtPaymentAttempt(original); const methods: string[] = [];
    const transport: typeof fetch = async (url, options) => {
      methods.push(options?.method ?? "GET");
      if (options?.method === "POST") { const response = await post(JSON.parse(String(options.body))); first = await response.json(); assert.equal(response.status, 201); throw Error("Synthetic response loss after native commit"); }
      return getDebtPayments(new Request(`http://localhost${url}`), async () => adapter());
    };
    assert.equal((await sendDebtPayment(attempt, { actorId: A, transport })).status, "unknown");
    const recovered = await recoverDebtPayment(attempt, { actorId: A, transport }); assert.equal(recovered.status, "confirmed");
    if (recovered.status === "confirmed") { assert.equal(recovered.receipt.id, first.id); assert.equal(recovered.receipt.reused, true); }
    assert.deepEqual(methods, ["POST", "GET"]); assert.equal(attempt.body, JSON.stringify(original));
    const another = await post(request(basePayload("two"))); assert.equal(another.status, 201); second = await another.json();
    const items = (await read()).history.items; assert.equal(items.length, 2); assert.equal(declaredInstallmentTotal(items, original.payload), 5000); assert.ok(items.every(i => i.allocation === null)); unchanged();
  });
  test("exact replay reuses ID, changed token payload and stale CAS cannot append", async () => {
    const repeated = await post(original); assert.equal(repeated.status, 200); const row = await repeated.json(); assert.equal(row.id, first.id); assert.equal(row.reused, true);
    assert.equal((await post({ ...original, payload: { ...original.payload, reference: "changed" } })).status, 409);
    assert.equal((await post(request(original.payload, 0))).status, 409);
    const correction = await post(request({ ...original.payload, reference: "ارجاع اصلاح‌شده" }, 1)); assert.equal(correction.status, 201);
    const history = (await read()).history.items; assert.equal(history.length, 3); assert.equal(history.find(i => i.id === first.id)?.latestForPayment, false); assert.equal(history.find(i => i.id === first.id)?.payload.reference, null); unchanged();
  });
  test("duplicate source blocked across concurrent payment keys; explicit overpayment and zero remain metadata", async () => {
    assert.equal((await post(request(basePayload("two")))).status, 409);
    const trials = [request(basePayload("over")), request(basePayload("over"))];
    const results = await Promise.allSettled(trials.map(r => psqlAsync(args(db, wrap(A, direct(r))), ENV)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.ok(results.some(r => r.status === "rejected" && /PT409/.test(String(r.reason))));
    assert.equal((await post(request(basePayload("zero")))).status, 201);
    assert.ok((await read()).history.items.some(i => i.amountToman === 15000 && i.allocation === null)); unchanged();
  });
  test("owner and admin isolation, direct writes and privileged helper execution closed", async () => {
    for (const actor of [B, ADMIN]) {
      assert.equal(as(db, actor, "SELECT count(*) FROM public.member_debt_payment_links"), "0");
      const response = await getDebtPayments(new Request(`http://localhost/pf10?holdingVersionId=${hv}&startOn=${period.startOn}&endOn=${period.endOn}`), async () => adapter(actor)); assert.equal(response.status, 403);
      assert.match(denied(db, actor, direct(request(basePayload("one")))) , /PT409|42501/);
    }
    for (const mutation of ["INSERT INTO public.member_debt_payment_links DEFAULT VALUES", "UPDATE public.member_debt_payment_links SET reference='x'", "DELETE FROM public.member_debt_payment_links", "TRUNCATE public.member_debt_payment_links"]) assert.match(denied(db, A, mutation), /42501/);
    assert.match(denied(db, null, "SELECT public.lookup_member_debt_payment('x')"), /42501/);
    assert.equal(sql(db, "SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE oid IN ('public.record_member_debt_payment(jsonb,text,integer)'::regprocedure,'public.lookup_member_debt_payment(text)'::regprocedure,'public.load_member_debt_payments(uuid,date,date,bigint)'::regprocedure)"), "t");
    assert.equal(sql(db, "SELECT has_function_privilege('service_role','public.record_member_debt_payment(jsonb,text,integer)','EXECUTE') OR has_function_privilege('authenticated','debt_payment_private.payload(public.member_debt_payment_links)','EXECUTE')"), "f");
    assert.equal(sql(db, "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.member_debt_payment_links'::regclass"), "t"); unchanged();
  });
  test("CF revision retains pinned amount; explicit correction only, duplicate family remains reserved; removed expense reads removed", async () => {
    const oldCf = cf; cf = cfWrite(1, cashPayload(4000)); fingerprint = moneyHash();
    let loaded = await read(); const pinned = loaded.history.items.find(i => i.id === first.id)!; assert.equal(pinned.amountToman, 3000); assert.equal(pinned.sourceState, "stale");
    assert.equal((await post(request(basePayload("one")))).status, 409);
    assert.equal((await post(request({ ...original.payload, cashFlowVersionId: oldCf }, 2))).status, 409);
    const corrected = await post(request({ ...original.payload, cashFlowVersionId: cf, reference: "تأیید هزینهٔ اصلاح‌شده" }, 2)); assert.equal(corrected.status, 201);
    loaded = await read(); assert.equal(loaded.history.items[0].amountToman, 4000); assert.equal(loaded.history.items[0].sourceState, "current"); assert.equal(loaded.history.items.find(i => i.id === second.id)?.sourceState, "stale"); unchanged();
    cf = cfWrite(2, cashPayload(4000, true)); fingerprint = moneyHash(); loaded = await read(); assert.equal(loaded.history.items.find(i => i.id === first.id)?.sourceState, "removed"); assert.equal(loaded.sources.some(i => i.entryKey === "one"), false); unchanged();
  });
  test("new financial basis makes prior links read-only; exact original receipt still recoverable", async () => {
    const oldHv = hv;
    hv = JSON.parse(as(db, A, "SELECT to_jsonb(r) FROM public.record_member_debts('[{\"debt_key\":\"debt\",\"title\":\"قسط مصنوعی\",\"kind\":\"installment\",\"balance_toman\":200000,\"currency\":\"IRT\",\"balance_as_of\":\"2026-10-30\",\"next_installment_toman\":10000,\"next_due_on\":\"2026-10-25\",\"note\":null}]'::jsonb,2,'pf10-new-financial') r")).version_id;
    fingerprint = moneyHash(); const old = await read(oldHv); assert.equal(old.writeAllowed, false); assert.ok(old.history.items.every(i => !i.basisCurrent));
    assert.equal((await post(request({ ...basePayload("two"), holdingVersionId: oldHv }))).status, 409);
    assert.equal((await post(original)).status, 200);
    const corrected = await post(request({ ...second.payload, holdingVersionId: hv, cashFlowVersionId: cf, reference: "تأیید مبنای مالی جاری" }, 1)); assert.equal(corrected.status, 201);
    const all = await read(); assert.equal(all.history.items[0].basisCurrent, true); assert.equal(all.history.items[0].amountToman, 2000); assert.ok(all.history.items.some(i => !i.basisCurrent)); unchanged();
  });
  test("bounded 50-row history uses independent strict cursor and preserves earlier versions", async () => {
    const key = second.payload.paymentKey;
    for (let version = 2; version < 53; version++) {
      const r = request({ ...second.payload, holdingVersionId: hv, cashFlowVersionId: cf, paymentKey: key, reference: `synthetic revision ${version}` }, version);
      const response = await post(r); assert.equal(response.status, 201);
    }
    const one = await read(); assert.equal(one.history.items.length, 50); assert.ok(one.history.nextBeforeSequence);
    const two = await read(hv, one.history.nextBeforeSequence!); assert.equal(two.consistencyKey, one.consistencyKey); assert.ok(two.history.items.length > 0); assert.equal(new Set([...one.history.items, ...two.history.items].map(i => i.id)).size, one.history.items.length + two.history.items.length); unchanged();
  });
  test("consistency witness changes on correction and another referenced CF period, even with unchanged selected financial/CF IDs", async () => {
    assert.equal(sql(db, "SELECT bool_and(provolatile='s') FROM pg_proc WHERE oid IN ('debt_payment_private.load_links(uuid,date,date,bigint)'::regprocedure,'public.load_member_debt_payments(uuid,date,date,bigint)'::regprocedure)"), "t");
    const firstPage = await read(), head = firstPage.history.items.find(i => i.payload.paymentKey === second.payload.paymentKey && i.latestForPayment)!;
    assert.ok(firstPage.history.nextBeforeSequence); const correction = await post(request({ ...head.payload, reference: "native coverage correction" }, head.version)); assert.equal(correction.status, 201);
    const changedPage = await read(hv, firstPage.history.nextBeforeSequence!); assert.notEqual(changedPage.consistencyKey, firstPage.consistencyKey); assert.equal(changedPage.basis.latestId, firstPage.basis.latestId); assert.equal(changedPage.sourceVersion?.id, firstPage.sourceVersion?.id); unchanged();
    const september = validateCashFlowPayload({ ...cashPayload(), period: { startOn: "2026-09-01", endOn: "2026-09-30" }, entries: [{ ...expense("september", 2000), occurredOn: "2026-09-25" }] });
    const sepId = cfWrite(0, september); fingerprint = moneyHash();
    const declaration = await post({ ...request({ ...basePayload("september"), cashFlowVersionId: sepId }), period: september.period }); assert.equal(declaration.status, 201); const sepReceipt: DebtPaymentReceipt = await declaration.json(); unchanged();
    const beforeOther = await read();
    cfWrite(1, { ...september, entries: [{ ...september.entries[0], amountToman: 4000 }] }); fingerprint = moneyHash();
    const afterOtherPage = await read(hv, beforeOther.history.nextBeforeSequence!); assert.notEqual(afterOtherPage.consistencyKey, beforeOther.consistencyKey); assert.equal(afterOtherPage.basis.latestId, beforeOther.basis.latestId); assert.equal(afterOtherPage.sourceVersion?.id, beforeOther.sourceVersion?.id);
    const refreshed = await read(), pinned = refreshed.history.items.find(i => i.id === sepReceipt.id)!; assert.equal(pinned.amountToman, 2000); assert.equal(pinned.sourceState, "stale"); unchanged();
  });
});
