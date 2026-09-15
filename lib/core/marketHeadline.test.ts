import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarketHeadline, indexChangePercent, MAX_INDEX_DAILY_MOVE_PCT } from "./marketHeadline";
import type { IrIndices, IrStockRow, IrRow } from "../market-ir";

const IDX: IrIndices = {
  total: 2_000_000, totalChange: 20_000,
  equalWeight: 700_000, equalWeightChange: -7_000,
  marketValue: 0, trades: 0, volume: 0, value: 0,
  state: "بازار باز است", date: null, time: null,
};

/** ردیفِ سهم — `value` به **ریال** است (خامِ tsetmc)، مثلِ اسنپ‌شاتِ واقعی. */
function stock(id: string, over: Partial<IrStockRow> = {}): IrStockRow {
  return { id, faName: id, price: 1000, unit: "toman", changePercent: 1, value: 10_000_000, buyI: 0, sellI: 0, ...over };
}

function usdRow(price: number, pct: number | null = null): IrRow {
  return { id: "USD", faName: "دلار", price, unit: "toman", changePercent: pct };
}

/* ── درصدِ تغییرِ شاخص ────────────────────────────────────────────────────── */

test("درصدِ شاخص از تغییرِ امتیازی و مبنای دیروز حساب می‌شود", () => {
  // 2_000_000 امروز، +20_000 امتیاز ⇒ مبنا 1_980_000 ⇒ ≈ 1.01٪
  assert.equal(indexChangePercent(2_000_000, 20_000), 1.01);
});

test("تغییرِ صفر، صفرِ واقعی است (نه null)", () => {
  assert.equal(indexChangePercent(2_000_000, 0), 0);
});

test("جهشِ نامعقولِ شاخص null می‌دهد، نه عددِ غلط", () => {
  const huge = 2_000_000 * (MAX_INDEX_DAILY_MOVE_PCT / 100) * 2;
  assert.equal(indexChangePercent(2_000_000, huge), null);
});

test("مبنای نامعتبر (تغییر ≥ مقدار) null می‌دهد", () => {
  assert.equal(indexChangePercent(100, 100), null);
  assert.equal(indexChangePercent(100, 200), null);
  assert.equal(indexChangePercent(0, 5), null);
});

/* ── واحد ────────────────────────────────────────────────────────────────── */

test("شاخص واحدِ index دارد — هرگز تومان", () => {
  const h = buildMarketHeadline({ indices: IDX, stocks: [], gold: [], currency: [] });
  const total = h.metrics.find((m) => m.key === "index-total")!;
  assert.equal(total.unit, "index");
  const eq = h.metrics.find((m) => m.key === "index-equal")!;
  assert.equal(eq.unit, "index");
});

test("ارزش معاملات تومان است — ورودیِ ریالِ اسنپ‌شات تقسیم بر ۱۰ می‌شود", () => {
  // ۶۰ نماد × ۱۰٬۰۰۰٬۰۰۰ ریال = ۶۰۰٬۰۰۰٬۰۰۰ ریال = ۶۰٬۰۰۰٬۰۰۰ تومان
  const stocks = Array.from({ length: 60 }, (_, i) => stock(`ن${i}`));
  const h = buildMarketHeadline({ indices: IDX, stocks, gold: [], currency: [] });
  const tv = h.metrics.find((m) => m.key === "trade-value")!;
  assert.equal(tv.unit, "toman");
  assert.equal(tv.value, 60_000_000);
});

test("همهٔ سنجه‌های پولی واحدِ تومان دارند (هیچ ریالی به نما نمی‌رسد)", () => {
  const h = buildMarketHeadline({
    indices: IDX,
    stocks: Array.from({ length: 60 }, (_, i) => stock(`ن${i}`)),
    gold: [{ id: "IR_GOLD_18K", faName: "طلا", price: 5_000_000, unit: "toman" }],
    currency: [usdRow(90_000)],
  });
  for (const m of h.metrics) {
    assert.ok(m.unit === "index" || m.unit === "toman" || m.unit === "percent", `واحدِ ناشناخته: ${m.key}`);
  }
});

/* ── ناموجود ≠ صفر ───────────────────────────────────────────────────────── */

test("اسنپ‌شاتِ خالی هیچ سنجه‌ای را صفر نمی‌کند", () => {
  const h = buildMarketHeadline({ indices: null, stocks: [], gold: [], currency: [] });
  for (const m of h.metrics) {
    assert.equal(m.value, null, `${m.key} باید null باشد نه ${m.value}`);
    assert.ok(m.absentReason && m.absentReason.length > 0, `${m.key} باید دلیلِ نبود داشته باشد`);
  }
});

test("هر سنجهٔ دارای مقدار، absentReason ندارد", () => {
  const h = buildMarketHeadline({ indices: IDX, stocks: [], gold: [], currency: [usdRow(90_000, 0.5)] });
  const usd = h.metrics.find((m) => m.key === "usd")!;
  assert.equal(usd.value, 90_000);
  assert.equal(usd.absentReason, null);
});

test("قیمتِ صفر یا منفی «داده» نیست — ناموجود می‌شود", () => {
  const h = buildMarketHeadline({ indices: IDX, stocks: [], gold: [], currency: [usdRow(0)] });
  const usd = h.metrics.find((m) => m.key === "usd")!;
  assert.equal(usd.value, null);
  assert.ok(usd.absentReason);
});

test("پوششِ ناکافی ⇒ null با دلیل، نه جمعِ ناقصِ بی‌برچسب", () => {
  // کمتر از آستانهٔ پوششِ breadth (۵۰ نماد)
  const h = buildMarketHeadline({ indices: IDX, stocks: [stock("الف"), stock("ب")], gold: [], currency: [] });
  const tv = h.metrics.find((m) => m.key === "trade-value")!;
  assert.equal(tv.value, null);
  assert.match(tv.absentReason!, /پوشش/);
});

/* ── پوشش و جامعه ────────────────────────────────────────────────────────── */

test("سنجهٔ تجمیعی پوشش و جامعه را همراه می‌برد", () => {
  const stocks = Array.from({ length: 60 }, (_, i) => stock(`ن${i}`));
  const h = buildMarketHeadline({ indices: IDX, stocks, gold: [], currency: [] });
  const flow = h.metrics.find((m) => m.key === "real-flow")!;
  assert.ok(flow.coverage, "پوشش باید گزارش شود");
  assert.equal(flow.coverage!.population, 60);
});

test("tradedCount فقط نمادهای دارای ارزشِ معامله را می‌شمارد", () => {
  const h = buildMarketHeadline({
    indices: IDX,
    stocks: [stock("الف"), stock("ب", { value: 0 }), stock("ج", { value: undefined })],
    gold: [], currency: [],
  });
  assert.equal(h.tradedCount, 1);
  assert.equal(h.universe, 3);
});

test("خارج از ساعاتِ بازار دلیلِ متفاوتی از «پوششِ ناکافی» می‌دهد", () => {
  const h = buildMarketHeadline({ indices: IDX, stocks: [], gold: [], currency: [] });
  const tv = h.metrics.find((m) => m.key === "trade-value")!;
  assert.match(tv.absentReason!, /ساعات/);
});

/* ── ترتیب و یکتایی ──────────────────────────────────────────────────────── */

test("۶ سنجه با کلیدِ یکتا برمی‌گردد", () => {
  const h = buildMarketHeadline({ indices: IDX, stocks: [], gold: [], currency: [] });
  assert.equal(h.metrics.length, 6);
  assert.equal(new Set(h.metrics.map((m) => m.key)).size, 6);
});
