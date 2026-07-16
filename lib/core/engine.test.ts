// تست واحد موتور هستهٔ «قطب‌نمای بازار» — اجرا: npm run test:core
// اعداد مرجع بنیادی: گزارش رسمی شبندر Q1 1404 (تأییدشده با کدال، docs/codal-ingestion-notes.md):
//   درآمد 1,442,603,668 · سود ناخالص 233,479,057 · سود عملیاتی 216,142,932
//   سود خالص 169,688,569 (میلیون ریال) · EPS دوره = 1263 ریال · دوره ۳ ماهه.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  meanOf,
  returnPct,
  ewmaVolatility,
  maxDrawdownPct,
  netIndividualFlow,
  consecutiveInflowDays,
  computeRatios,
  valuationBand,
  fundamentalAxis,
  trendAxis,
  liquidityAxis,
  buildScorecard,
  qualitativeMask,
  maskMargin,
  maskGrowth,
  type FundamentalInput,
  type HistoryDay,
} from "./engine";

// ── دادهٔ مرجع ───────────────────────────────────────────────────────────────

const SHABANDAR_Q1_1404: FundamentalInput = {
  revenue: 1_442_603_668,
  gross_profit: 233_479_057,
  operating_profit: 216_142_932,
  net_profit: 169_688_569,
  eps_rial: 1263,
  capital: 134_356_000,
  period_months: 3,
  audited: false,
  prior: { revenue: 1_100_000_000, net_profit: 120_000_000 }, // فرضی برای تست رشد
};

function mkDay(partial: Partial<HistoryDay> & { trade_date: string }): HistoryDay {
  return {
    close: null,
    last_price: null,
    volume: null,
    value_traded: null,
    individual_buy_value: null,
    individual_sell_value: null,
    individual_buy_count: null,
    individual_sell_count: null,
    legal_buy_value: null,
    legal_sell_value: null,
    buyer_power: null,
    ...partial,
  };
}

/** سری صعودی ملایم ۱۲۰ روزه با جریان پول مثبت — برای تست محور روند/نقدینگی. */
function makeUptrendDays(n = 120): HistoryDay[] {
  const days: HistoryDay[] = [];
  let price = 10000;
  for (let i = 0; i < n; i++) {
    price = price * (1 + 0.002 + 0.001 * Math.sin(i / 5)); // رشد ملایم با موج کوچک
    days.push(
      mkDay({
        trade_date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`,
        close: Math.round(price),
        value_traded: 1_000_000_000,
        individual_buy_value: 600_000_000,
        individual_sell_value: 400_000_000,
        buyer_power: 1.4,
      })
    );
  }
  return days;
}

// ── ابزار عمومی ──────────────────────────────────────────────────────────────

test("clamp: محدودسازی در بازه", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test("meanOf: نادیده‌گرفتن null و آرایهٔ خالی", () => {
  assert.equal(meanOf([2, 4, null, 6]), 4);
  assert.equal(meanOf([null, undefined]), null);
});

test("returnPct: بازده ساده و ورودی نامعتبر", () => {
  assert.equal(returnPct(100, 120), 20);
  assert.equal(returnPct(0, 120), null);
});

test("ewmaVolatility: سری ثابت نوسان صفر، دادهٔ کم null", () => {
  const flat = Array.from({ length: 60 }, () => 1000);
  const v = ewmaVolatility(flat);
  assert.ok(v != null && v < 1e-9);
  assert.equal(ewmaVolatility([100, 101, 102]), null); // کمتر از ۲۰ بازده
});

test("maxDrawdownPct: افت از سقف", () => {
  const mdd = maxDrawdownPct([100, 120, 90, 110]);
  assert.ok(mdd != null);
  assert.ok(Math.abs(mdd - -25) < 1e-9); // 90 از سقف 120 = -25٪
});

test("netIndividualFlow و consecutiveInflowDays", () => {
  const d1 = mkDay({ trade_date: "2026-01-01", individual_buy_value: 500, individual_sell_value: 300 });
  assert.equal(netIndividualFlow(d1), 200);
  const dNull = mkDay({ trade_date: "2026-01-02" });
  assert.equal(netIndividualFlow(dNull), null);
  const days = [
    mkDay({ trade_date: "a", individual_buy_value: 100, individual_sell_value: 300 }), // خروج
    mkDay({ trade_date: "b", individual_buy_value: 500, individual_sell_value: 300 }),
    mkDay({ trade_date: "c", individual_buy_value: 400, individual_sell_value: 100 }),
  ];
  assert.equal(consecutiveInflowDays(days), 2);
});

// ── نسبت‌های بنیادی (اعداد مرجع شبندر) ──────────────────────────────────────

test("computeRatios: حاشیه‌های شبندر Q1 1404 مطابق گزارش رسمی", () => {
  const r = computeRatios(SHABANDAR_Q1_1404);
  // 233,479,057 / 1,442,603,668 = 16.18٪
  assert.ok(Math.abs(r.gross_margin! - 16.184) < 0.01);
  // 216,142,932 / 1,442,603,668 = 14.98٪
  assert.ok(Math.abs(r.operating_margin! - 14.982) < 0.01);
  // 169,688,569 / 1,442,603,668 = 11.76٪
  assert.ok(Math.abs(r.net_margin! - 11.763) < 0.01);
});

test("computeRatios: رشد نسبت به دورهٔ مشابه", () => {
  const r = computeRatios(SHABANDAR_Q1_1404);
  // (1442603668-1100000000)/1100000000 = 31.146٪
  assert.ok(Math.abs(r.revenue_growth! - 31.146) < 0.01);
  // (169688569-120000000)/120000000 = 41.407٪
  assert.ok(Math.abs(r.net_profit_growth! - 41.407) < 0.01);
});

test("computeRatios: P/E سالانه‌شده با قیمت", () => {
  // EPS سالانه = 1263 × 4 = 5052 ریال؛ قیمت 25260 → P/E = 5
  const r = computeRatios(SHABANDAR_Q1_1404, 25_260);
  assert.ok(Math.abs(r.pe_ttm! - 5) < 1e-9);
  // بدون قیمت → null
  assert.equal(computeRatios(SHABANDAR_Q1_1404).pe_ttm, null);
});

test("computeRatios: دادهٔ ناقص = null نه عدد ساختگی", () => {
  const noPrior: FundamentalInput = { ...SHABANDAR_Q1_1404, prior: null };
  const r = computeRatios(noPrior);
  assert.equal(r.revenue_growth, null);
  assert.equal(r.net_profit_growth, null);
});

// ── ارزش‌گذاری بازه‌ای ──────────────────────────────────────────────────────

test("valuationBand: بازهٔ سه‌سناریویی با فروض — هرگز عدد واحد", () => {
  const b = valuationBand(SHABANDAR_Q1_1404);
  assert.ok(b);
  // EPS سالانه = 1263×4 = 5052 → low=20208, base=30312, high=40416
  assert.equal(b!.low, 20_208);
  assert.equal(b!.base, 30_312);
  assert.equal(b!.high, 40_416);
  assert.ok(b!.low < b!.base && b!.base < b!.high);
  assert.ok(b!.assumptions.length >= 4);
  assert.ok(b!.caveat.length > 0);
});

test("valuationBand: EPS منفی یا ناموجود → null (بدون عدد ساختگی)", () => {
  assert.equal(valuationBand({ ...SHABANDAR_Q1_1404, eps_rial: null }), null);
  assert.equal(valuationBand({ ...SHABANDAR_Q1_1404, eps_rial: -500 }), null);
});

test("valuationBand: بدون واژه‌های ممنوع (قانون ۲)", () => {
  const b = valuationBand(SHABANDAR_Q1_1404)!;
  const text = JSON.stringify(b);
  for (const banned of ["سیگنال", "توصیه", "پیشنهاد", "بخرید", "بفروشید"]) {
    assert.ok(!text.includes(banned), `واژهٔ ممنوع یافت شد: ${banned}`);
  }
});

// ── محورهای امتیاز ──────────────────────────────────────────────────────────

test("fundamentalAxis: هر driver دارای برچسب و اثر است (قانون ۳)", () => {
  const axis = fundamentalAxis(computeRatios(SHABANDAR_Q1_1404));
  assert.ok(axis.data_ok);
  assert.ok(axis.score != null && axis.score >= 0 && axis.score <= 100);
  assert.ok(axis.drivers.length >= 3);
  for (const d of axis.drivers) {
    assert.ok(d.label.length > 0);
    assert.ok(d.value.length > 0);
    assert.ok(["positive", "negative", "neutral"].includes(d.effect));
  }
});

test("fundamentalAxis: بدون هیچ داده → score=null", () => {
  const axis = fundamentalAxis({
    gross_margin: null,
    operating_margin: null,
    net_margin: null,
    revenue_growth: null,
    net_profit_growth: null,
    pe_ttm: null,
  });
  assert.equal(axis.score, null);
  assert.equal(axis.data_ok, false);
});

test("trendAxis: روند صعودی امتیاز بالاتر از روند نزولی می‌گیرد", () => {
  const up = trendAxis(makeUptrendDays());
  assert.ok(up.data_ok && up.score != null);
  const downDays = makeUptrendDays().map((d, i, arr) =>
    mkDay({ ...d, close: arr[arr.length - 1 - i].close })
  );
  const down = trendAxis(downDays);
  assert.ok(down.score != null);
  assert.ok(up.score! > down.score!, `up=${up.score} باید > down=${down.score}`);
});

test("trendAxis: دادهٔ کمتر از ۳۰ روز → null", () => {
  const axis = trendAxis(makeUptrendDays(10));
  assert.equal(axis.score, null);
  assert.equal(axis.data_ok, false);
});

test("liquidityAxis: ورود پول و قدرت خریدار بالا → امتیاز بالا", () => {
  const axis = liquidityAxis(makeUptrendDays());
  assert.ok(axis.data_ok && axis.score != null);
  assert.ok(axis.score! >= 60, `score=${axis.score}`);
  assert.ok(axis.drivers.length >= 2);
});

test("liquidityAxis: خروج پول → امتیاز پایین", () => {
  const days = makeUptrendDays().map((d) =>
    mkDay({
      ...d,
      individual_buy_value: 200_000_000,
      individual_sell_value: 700_000_000,
      buyer_power: 0.5,
    })
  );
  const axis = liquidityAxis(days);
  assert.ok(axis.score != null && axis.score! <= 30, `score=${axis.score}`);
});

// ── کارت امتیاز ─────────────────────────────────────────────────────────────

test("buildScorecard: وزن‌دهی ۴۵/۳۰/۲۵ و بازوزن‌دهی هنگام نبود داده", () => {
  const days = makeUptrendDays();
  const ratios = computeRatios(SHABANDAR_Q1_1404);
  const sc = buildScorecard(ratios, days, "2026-07-16");
  assert.ok(sc.composite != null && sc.composite >= 0 && sc.composite <= 100);
  // بازتولید دستی میانگین وزنی
  const expected = Math.round(
    (sc.fundamental.score! * 0.45 + sc.trend.score! * 0.3 + sc.liquidity.score! * 0.25) / 1.0
  );
  assert.equal(sc.composite, expected);
  // بدون بنیادی: فقط روند+نقدینگی با بازوزن‌دهی
  const sc2 = buildScorecard(null, days, "2026-07-16");
  assert.equal(sc2.fundamental.score, null);
  const expected2 = Math.round(
    (sc2.trend.score! * 0.3 + sc2.liquidity.score! * 0.25) / 0.55
  );
  assert.equal(sc2.composite, expected2);
});

test("buildScorecard: هیچ داده → composite=null (قانون ۴)", () => {
  const sc = buildScorecard(null, [], "2026-07-16");
  assert.equal(sc.composite, null);
});

// ── ماسک کیفی ───────────────────────────────────────────────────────────────

test("maskMargin/maskGrowth: مرزهای باند", () => {
  assert.equal(maskMargin(null), "نامشخص");
  assert.equal(maskMargin(35), "بسیار بالا");
  assert.equal(maskMargin(20), "بالا");
  assert.equal(maskMargin(10), "متوسط");
  assert.equal(maskMargin(3), "پایین");
  assert.equal(maskMargin(-5), "بسیار پایین");
  assert.equal(maskGrowth(70), "بسیار بالا");
  assert.equal(maskGrowth(-30), "بسیار پایین");
});

test("qualitativeMask: هیچ عدد خامی به LLM نمی‌رود (قانون ۵)", () => {
  const mask = qualitativeMask(computeRatios(SHABANDAR_Q1_1404));
  const text = JSON.stringify(mask);
  assert.ok(!/\d/.test(text.replace(/"[a-z_]+":/g, "")), "عدد خام در خروجی ماسک یافت شد");
  assert.equal(mask.net_margin, "متوسط"); // 11.76٪ در باند ۸–۱۸
  assert.equal(mask.revenue_growth, "بالا"); // 31.1٪ در باند ۳۰–۶۰
});
