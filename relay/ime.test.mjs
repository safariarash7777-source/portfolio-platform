// ime.test.mjs — تست‌های واحد نگاشت گواهی کالایی و فیزیکی (بدون شبکه)
import test from "node:test";
import assert from "node:assert/strict";
import { mapCertRow, mapPhysicalRow, planCertEod } from "./ime.mjs";
import { mapCommodityRow } from "./commodity.mjs";

test("mapCertRow: قیمت‌ها ریال→تومان و tval هزارریال→تومان (×۱۰۰)", () => {
  const r = mapCertRow({
    contract_code: "CD1GOB0001",
    commodity: "شمش طلا",
    contract_description: "گواهی شمش طلای ۹۹۵",
    contract_size: 1,
    pl: 500000, pc: 498000, py: 490000, pmax: 510000, pmin: 495000,
    plp: 2.04, tno: 120, tvol: 3000,
    tval: 1500000, // هزار ریال
    date_update: "1405/04/25", time_update: "12:30",
  });
  assert.equal(r.id, "CD1GOB0001");
  assert.equal(r.price, 50000);      // pl ریال → تومان
  assert.equal(r.close, 49800);      // pc
  assert.equal(r.yesterday, 49000);  // py
  assert.equal(r.high, 51000);
  assert.equal(r.low, 49500);
  assert.equal(r.changePercent, 2.04); // درصد دست‌نخورده
  assert.equal(r.tradeCount, 120);
  assert.equal(r.volume, 3000);
  // tval واحدش «هزار ریال» است → تومان = ×۱۰۰۰÷۱۰ = ×۱۰۰
  assert.equal(r.valueToman, 150000000);
});

test("mapCertRow: فیلد غایب/نامعتبر → null، نه صفر ساختگی", () => {
  const r = mapCertRow({ contract_code: "CD1SAF0001", pl: "abc" });
  assert.equal(r.id, "CD1SAF0001");
  assert.equal(r.price, null);
  assert.equal(r.yesterday, null);
  assert.equal(r.valueToman, null);
});

test("mapCertRow: pc غایب → close از pl پر می‌شود", () => {
  const r = mapCertRow({ contract_code: "X", pl: 1000 });
  assert.equal(r.close, 100);
});

test("IME numeric absence stays null; genuine zero is retained", () => {
  for (const value of [null, undefined, "", "  ", true, false, [], [12], {}, NaN, Infinity, "invalid"]) {
    assert.equal(mapCertRow({ pl: value, tval: value }).price, null);
    assert.equal(mapCertRow({ pl: value, tval: value }).valueToman, null);
    assert.equal(mapPhysicalRow({ pl: value, tval: value }, "2026-01-01").price_close_rial, null);
    assert.equal(mapPhysicalRow({ pl: value, tval: value }, "2026-01-01").value_krial, null);
  }
  assert.equal(mapCertRow({ pl: 0 }).price, 0);
  assert.equal(mapPhysicalRow({ pl: "0" }, "2026-01-01").price_close_rial, 0);
});

test("certificate history keeps each quote's source day across midnight and holidays", () => {
  const rows = [mapCertRow({ contract_code: "SYNTHETIC", pl: 123, date_update: "1405/06/25" })];
  const first = planCertEod(rows, new Date("2026-09-16T16:00:00Z"));
  const retained = planCertEod(rows, new Date("2026-09-17T16:00:00Z"));
  assert.equal(first.rows[0].trade_date, "2026-09-16");
  assert.deepEqual(retained.rows, first.rows);
  assert.equal(planCertEod(rows, new Date("2026-09-16T21:00:00Z")).skip, "before-close");
});

test("certificate history rejects missing, invalid and future source dates", () => {
  const rows = [null, "invalid", "1405/13/01", "1405/06/26"].map(date =>
    mapCertRow({ contract_code: "SYNTHETIC", pl: 123, date_update: date }));
  const plan = planCertEod(rows, new Date("2026-09-16T16:00:00Z"));
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.rejected, 4);
  assert.equal(plan.skip, "no-source-session-date");
});

test("physical storage failure stays incomplete without extra same-day provider requests", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-16T13:00:00Z") });
  const ime = await import(`./ime.mjs?storage-failure=${Date.now()}`);
  let providerCalls = 0;
  let storageAvailable = false;
  const client = { request: async ({ params }) => {
    providerCalls++;
    return [{ date_trade: params.date_start, l18: "SYNTHETIC", pl: 123, producer: "synthetic", volume_contract: 1 }];
  } };
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /^https:\/\/storage\.invalid\/rest\/v1\/ime_physical_trades/);
    return { ok: storageAvailable, status: storageAvailable ? 201 : 404 };
  });
  const config = { base: "https://provider.invalid", key: "synthetic", headers: {},
    supabaseUrl: "https://storage.invalid", serviceKey: "synthetic", client };
  await ime.runPhysicalDaily(config);
  assert.equal(ime.imeStatus().physical.lastAttemptDay, "2026-09-16");
  assert.equal(ime.imeStatus().physical.lastRunDay, null);
  assert.equal(ime.imeStatus().physical.backfillCursor, 0);
  assert.equal(providerCalls, 2);
  storageAvailable = true;
  await ime.runPhysicalDaily(config);
  assert.equal(providerCalls, 2, "same-day failure cannot multiply provider traffic");
  t.mock.timers.tick(24 * 60 * 60_000);
  await ime.runPhysicalDaily(config);
  assert.equal(providerCalls, 4);
  assert.equal(ime.imeStatus().physical.lastRunDay, "2026-09-17");
  assert.equal(ime.imeStatus().physical.backfillCursor, 1);
  assert.equal(ime.imeStatus().physical.lastError, null);
});

test("certificate writer persists source day after retaining a quote overnight", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-16T14:00:00Z") });
  const ime = await import(`./ime.mjs?retained-certificate=${Date.now()}`);
  await ime.refreshCertificates({ base: "https://provider.invalid", key: "synthetic", headers: {},
    client: { request: async () => [{ contract_code: "SYNTHETIC", pl: 123, date_update: "1405/06/25" }] } });
  const written = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.match(String(url), /^https:\/\/storage\.invalid\/rest\/v1\/ime_certificate_history/);
    written.push(JSON.parse(init.body));
    return { ok: true, status: 201 };
  });
  t.mock.timers.tick(26 * 60 * 60_000);
  await ime.pushCertEod({ supabaseUrl: "https://storage.invalid", serviceKey: "synthetic" });
  assert.equal(written.length, 1);
  assert.equal(written[0][0].trade_date, "2026-09-16");
  assert.equal(ime.imeStatus().certificate.eod.lastPushDay, "2026-09-17");
});

test("mapPhysicalRow: اعداد خام ریال حفظ می‌شود و تاریخ جلالی نرمال (خط‌تیره)", () => {
  const r = mapPhysicalRow({
    date_trade: "1405/04/25",
    l18: "MSC-HSR00000-00",
    l30: "شمش بلوم",
    market_hall: "صنعتی",
    producer: "فولاد خوزستان",
    supplier: "فولاد خوزستان",
    type_contract: "نقدی",
    unit: "تن",
    currency: "ریال",
    price_base_offer: 250000000,
    volume_contract: 10000,
    volume_offer: 20000,
    demand: 30000,
    pmin: 249000000,
    pmax: 255000000,
    pl: 252000000,
    pc: 251500000,
    tval: 2520000000,
  }, "2026-07-18");
  assert.equal(r.trade_jdate, "1405-04-25"); // اسلش → خط‌تیره
  assert.equal(r.fetch_date, "2026-07-18");
  assert.equal(r.symbol_code, "MSC-HSR00000-00");
  assert.equal(r.commodity_name, "شمش بلوم");
  assert.equal(r.price_close_rial, 252000000); // خام ریال — هیچ تبدیل
  assert.equal(r.price_wavg_rial, 251500000);
  assert.equal(r.price_base_rial, 250000000);
  assert.equal(r.value_krial, 2520000000);     // هزار ریال خام مطابق مستند
  assert.equal(r.producer, "فولاد خوزستان");
  assert.equal(r.source, "brsapi_ime_physical");
});

test("mapPhysicalRow: تاریخ از قبل خط‌تیره‌دار دست نمی‌خورد", () => {
  const r = mapPhysicalRow({ date_trade: "1405-04-25", l18: "X" }, "2026-07-18");
  assert.equal(r.trade_jdate, "1405-04-25");
});

test("mapCommodityRow: دلار خام می‌ماند (هیچ تبدیل ریالی)", () => {
  const r = mapCommodityRow({
    symbol: "XAU", name: "طلای جهانی", price: 3352.5,
    change_percent: -0.4, unit: "دلار/اونس", date: "2026-07-18", time: "12:00",
  });
  assert.equal(r.id, "XAU");
  assert.equal(r.price, 3352.5);
  assert.equal(r.changePercent, -0.4);
  assert.equal(r.unit, "دلار/اونس");
});

let physicalHarnessId = 0;
async function physicalHarness(t) {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-13T12:00:00Z") });
  const api = await import(`./ime.mjs?bounded-storage=${physicalHarnessId++}`);
  const dates = [], posts = [], legacy = [];
  const row = date => ({ date_trade: date, l18: "SYNTHETIC", producer: "synthetic", pl: 123, volume_contract: 1 });
  let source = date => [row(date)];
  let storage = () => new Response(null, { status: 201 });
  const client = { request: async ({ params }) => {
    assert.equal(params.date_start, params.date_end);
    dates.push(params.date_start);
    return source(params.date_start);
  } };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const u = new URL(url);
    assert.equal(u.hostname, "offline.invalid", "unexpected network destination is blocked");
    if (u.pathname === "/IME/Physical.php") return Response.json(await client.request({ params: Object.fromEntries(u.searchParams) }));
    assert.equal(u.pathname, "/rest/v1/ime_physical_trades");
    assert.equal(u.searchParams.get("on_conflict"), "trade_jdate,symbol_code,producer,price_close_rial,volume_contract");
    assert.match(init.headers.Prefer, /resolution=ignore-duplicates/);
    const rows = JSON.parse(init.body);
    posts.push(rows);
    return storage(rows);
  });
  const options = { base: "https://offline.invalid", key: "synthetic", headers: {}, client,
    supabaseUrl: "https://offline.invalid", serviceKey: "synthetic" };
  return { api, dates, posts, row, legacy, run: () => api.runPhysicalDaily(options),
    status: () => api.imeStatus().physical, advance: ms => t.mock.timers.tick(ms),
    setSource: fn => { source = fn; }, setStorage: fn => { storage = fn; },
    useLegacy: () => { options.client = null; options.countLegacy = async (...args) => legacy.push(args); } };
}
const HOUR = 60 * 60_000;

test("physical DB retries are bounded, retain pending rows, and never refetch today's provider", async (t) => {
  const h = await physicalHarness(t);
  h.setStorage(() => new Response(null, { status: 404 }));
  await h.run();
  assert.equal(h.dates.length, 2);
  assert.equal(h.posts.length, 2);
  for (let i = 0; i < 5; i++) await h.run();
  assert.equal(h.posts.length, 2);
  h.advance(HOUR);
  await h.run();
  assert.equal(h.posts.length, 4);
  h.advance(HOUR);
  await h.run();
  assert.equal(h.posts.length, 4, "second storage backoff is two hours");
  h.advance(HOUR);
  await h.run();
  assert.equal(h.posts.length, 6);
  h.advance(HOUR);
  await h.run();
  assert.equal(h.posts.length, 6);
  assert.equal(h.dates.length, 2);
  assert.equal(h.status().lastRunDay, null);
  assert.equal(h.status().backfillCursor, 0);
  assert.ok(h.status().targets.every(target => target.storageAttempts === 3 && target.pendingRows === 1 && target.nextRetryAt === null));
});

test("physical partial success is retained while only the failed DB target retries", async (t) => {
  const h = await physicalHarness(t);
  h.setStorage(rows => new Response(null, { status: rows[0].trade_jdate === "1405-07-20" ? 503 : 201 }));
  await h.run();
  assert.deepEqual(h.status().targets.map(target => target.complete), [true, false]);
  assert.equal(h.status().lastRunDay, null);
  h.setStorage(() => new Response(null, { status: 201 }));
  h.advance(HOUR);
  await h.run();
  assert.equal(h.posts.length, 3);
  assert.equal(h.posts.filter(rows => rows[0].trade_jdate === "1405-07-21").length, 1);
  assert.equal(h.dates.length, 2);
  assert.equal(h.status().lastRunDay, "2026-10-13");
  assert.equal(h.status().backfillCursor, 1);
  assert.equal(h.status().lastError, null);
});

test("physical lost response replays identical complete keys without a provider retry", async (t) => {
  const h = await physicalHarness(t);
  const persisted = new Map();
  let lost = true;
  h.setStorage(rows => {
    for (const row of rows) {
      const key = JSON.stringify([row.trade_jdate, row.symbol_code, row.producer, row.price_close_rial, row.volume_contract]);
      if (!persisted.has(key)) persisted.set(key, row);
    }
    if (lost) { lost = false; throw new Error("synthetic response lost after commit"); }
    return new Response(null, { status: 201 });
  });
  await h.run();
  assert.equal(persisted.size, 2);
  h.advance(HOUR);
  await h.run();
  assert.deepEqual(h.posts[2], h.posts[0]);
  assert.equal(persisted.size, 2);
  assert.equal(h.dates.length, 2);
  assert.equal(h.status().lastRunDay, "2026-10-13");
});

test("physical source failures never retry same day, including the permissive legacy path", async (t) => {
  const h = await physicalHarness(t);
  h.useLegacy();
  h.setSource(() => { throw new Error("synthetic provider failure"); });
  await h.run();
  for (let i = 0; i < 4; i++) { h.advance(HOUR); await h.run(); }
  assert.equal(h.dates.length, 2);
  assert.deepEqual(h.legacy, [["ime-physical", "bulk"], ["ime-physical", "bulk"]]);
  assert.equal(h.posts.length, 0);
  assert.equal(h.status().backfillCursor, 0);
});

test("physical day rollover expires exhausted storage and reports abandoned pending observations", async (t) => {
  const h = await physicalHarness(t);
  h.setStorage(() => new Response(null, { status: 503 }));
  await h.run();
  h.advance(HOUR); await h.run();
  h.advance(2 * HOUR); await h.run();
  h.advance(21 * HOUR);
  h.setStorage(() => new Response(null, { status: 201 }));
  await h.run();
  assert.deepEqual(h.status().expired, { day: "2026-10-13", incompleteTargets: 2, pendingRows: 2 });
  assert.equal(h.status().cycleDay, "2026-10-14");
  assert.equal(h.status().targets.length, 2);
  assert.equal(h.status().lastRunDay, "2026-10-14");
  assert.equal(h.dates.length, 4);
  assert.ok(h.status().targets.every(target => target.storageAttempts === 1));
});

test("completed empty physical targets expire so a later backfill re-reads the source", async (t) => {
  const h = await physicalHarness(t);
  h.setSource(() => ({ successful: true, code_http: 200, status: "no_data" }));
  await h.run();
  assert.equal(h.status().backfillCursor, 1);
  assert.equal(h.posts.length, 0);
  h.advance(24 * HOUR);
  h.setSource(date => [h.row(date)]);
  await h.run();
  assert.deepEqual(h.dates, ["1405-07-21", "1405-07-20", "1405-07-22", "1405-07-20"]);
  assert.equal(h.posts.length, 2);
  assert.equal(h.status().targets.length, 2);
});

for (const [name, envelope] of [
  ["unknown", {}], ["unverified no_data", { status: "no_data", data: [] }],
  ["contradictory no_data", { successful: true, code_http: 200, status: "no_data", data: [{}] }],
  ["rejected", { successful: false, code_http: 200, data: [] }],
  ["error", { status: "error", data: [] }], ["unknown status", { status: "unknown", data: [] }],
]) test(`physical ${name} cannot certify an empty successful day`, async (t) => {
  const h = await physicalHarness(t);
  h.setSource(() => envelope);
  await h.run();
  assert.equal(h.status().lastRunDay, null);
  assert.equal(h.status().backfillCursor, 0);
  assert.equal(h.posts.length, 0);
  assert.ok(h.status().lastError);
});

for (const [name, change] of [
  ["null producer", { producer: null }], ["blank price", { pl: " " }],
  ["boolean volume", { volume_contract: false }], ["array price", { pl: [] }],
  ["invalid date", { date_trade: "invalid" }], ["wrong date", { date_trade: "1405-07-01" }],
]) test(`physical ${name} blocks the entire target and exposes rejection count`, async (t) => {
  const h = await physicalHarness(t);
  h.setSource(date => [h.row(date), { ...h.row(date), l18: "SYNTHETIC-SECOND", ...change }]);
  await h.run();
  assert.equal(h.posts.length, 0);
  assert.equal(h.status().lastRunDay, null);
  assert.equal(h.status().backfillCursor, 0);
  assert.ok(h.status().targets.every(target => target.sourceRows === 2 && target.rejectedRows === 1 && !target.complete));
});

test("physical valid zero values survive admission; simultaneous callers share one cycle", async (t) => {
  const h = await physicalHarness(t);
  h.setSource(date => [{ ...h.row(date), pl: "0", volume_contract: 0 }]);
  await Promise.all([h.run(), h.run(), h.run()]);
  assert.equal(h.dates.length, 2);
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[0][0].price_close_rial, 0);
  assert.equal(h.posts[0][0].volume_contract, 0);
  assert.equal(h.status().lastRunDay, "2026-10-13");
});

test("a rejected target does not discard its successful neighbour or claim cycle completeness", async (t) => {
  const h = await physicalHarness(t);
  h.setSource(date => [{ ...h.row(date), ...(date === "1405-07-21" ? { producer: null } : {}) }]);
  await h.run();
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0][0].trade_jdate, "1405-07-20");
  assert.deepEqual(h.status().targets.map(target => target.complete), [false, true]);
  assert.equal(h.status().targets[0].rejectedRows, 1);
  assert.equal(h.status().lastRunDay, null);
  assert.equal(h.status().backfillCursor, 0);
  h.advance(HOUR);
  await h.run();
  assert.equal(h.posts.length, 1);
  assert.equal(h.dates.length, 2);
});

test("a valid empty array completes a target without fabricating a database row", async (t) => {
  const h = await physicalHarness(t);
  h.setSource(() => []);
  await h.run();
  assert.equal(h.posts.length, 0);
  assert.equal(h.status().lastRunDay, "2026-10-13");
  assert.equal(h.status().backfillCursor, 1);
});

test("physical request spanning midnight does not start a second old-cycle provider job", async (t) => {
  const h = await physicalHarness(t);
  h.setSource(date => { h.advance(10 * HOUR); return [h.row(date)]; });
  await h.run();
  assert.equal(h.dates.length, 1);
  assert.equal(h.status().lastRunDay, null);
  assert.equal(h.status().targets[1].sourceAttempts, 0);
  await h.run(); // now before the next day's 15:00 gate: just expire state
  assert.equal(h.status().cycleDay, null);
  assert.equal(h.dates.length, 1);
});
