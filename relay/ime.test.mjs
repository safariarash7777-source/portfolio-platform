// ime.test.mjs — تست‌های واحد نگاشت گواهی کالایی و فیزیکی (بدون شبکه)
import test from "node:test";
import assert from "node:assert/strict";
import { mapCertRow, mapPhysicalRow } from "./ime.mjs";
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
