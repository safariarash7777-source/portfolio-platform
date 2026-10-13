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
  for (const value of [null, undefined, "", "  ", true, false, "invalid"]) {
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
  const client = { request: async () => {
    providerCalls++;
    return [{ date_trade: "1405/06/25", l18: "SYNTHETIC", pl: 123 }];
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
  assert.equal(providerCalls, 1);
  storageAvailable = true;
  await ime.runPhysicalDaily(config);
  assert.equal(providerCalls, 1, "same-day failure cannot multiply provider traffic");
  t.mock.timers.tick(24 * 60 * 60_000);
  await ime.runPhysicalDaily(config);
  assert.equal(providerCalls, 3);
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
