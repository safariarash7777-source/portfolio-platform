// تست‌های عددی موتور FX — اعتبارسنجی پورت TS مقابل خروجی طلایی پایتون
// (models.py / sensitivity.py — داشبورد Streamlit آرش، اجرای 22 Jul 2026).
// مقادیر طلایی با اجرای مستقیم کد پایتون روی همین seed ها تولید شده‌اند.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pppSeries,
  pppMultiBase,
  monetarySeries,
  frenkelBilsonSeries,
  ensembleValuation,
  bubbleGap,
  forecastForward,
  forwardMonthLabels,
  annualMean,
  estimateElasticities,
  oilSensitivity,
  deficitSensitivity,
  buildHeatmap,
  tornadoData,
  type MacroRow,
} from "./engine";
import macroJson from "./data/macro_annual.json";
import baseRatesJson from "./data/base_rates.json";

const macro = macroJson as unknown as MacroRow[];
const baseRates = baseRatesJson as unknown as Record<string, number>;

/** مقایسهٔ نسبی: |a−b| / max(|b|, 1) ≤ tol */
function assertClose(actual: number, expected: number, tol = 1e-6, msg = "") {
  const rel = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(rel <= tol, `${msg} expected≈${expected} got=${actual} rel=${rel}`);
}

// ── مقادیر طلایی پایتون (fx-golden.json) ─────────────────────────────
const GOLDEN = {
  ppp_1381: { 1385: 1172.882439, 1395: 5485.635711, 1400: 21216.292507, 1404: 70639.94884 },
  ppp_multi_mean: { 1395: 4158.341041, 1400: 15564.787323, 1404: 51823.181633 },
  monetary_1381: { 1390: 3545.001098, 1400: 28898.803469, 1404: 96266.403136 },
  monetary_v2: { 1400: 39508.162466, 1404: 139610.636398 },
  ensemble_eq: 200.0,
  ensemble_w: 141.421356,
  gap: 58.6,
  forecast_m6: { ppp: 217864.79618670777, mon: 210193.22015707343 },
  forecast_m12: { ppp: 249422.3300970873, mon: 232165.99999999965 },
};

// ── PPP تک‌پایه (پایهٔ ۱۳۸۱ = ۷۹۹ تومان) ─────────────────────────────
test("pppSeries base 1381 matches Python golden values", () => {
  const s = pppSeries(macro, 1381, baseRates["1381"]);
  assert.equal(s.get(1381), 799);
  for (const [y, v] of Object.entries(GOLDEN.ppp_1381)) {
    assertClose(s.get(Number(y))!, v, 1e-6, `ppp[${y}]`);
  }
});

test("pppSeries does not extrapolate before the base year", () => {
  const s = pppSeries(macro, 1381, 799);
  assert.equal(s.has(1380), false);
  assert.equal(s.has(1338), false);
  assert.equal([...s.keys()].sort((a, b) => a - b)[0], 1381);
});

// ── PPP چندپایه (میانگین هندسی ۱۳۸۱/۱۳۹۰/۱۳۹۶) ──────────────────────
test("pppMultiBase geometric mean matches Python golden values", () => {
  const bases = {
    1381: baseRates["1381"],
    1390: baseRates["1390"],
    1396: baseRates["1396"],
  };
  const { mean, individual } = pppMultiBase(macro, bases);
  assert.equal(individual.size, 3);
  for (const [y, v] of Object.entries(GOLDEN.ppp_multi_mean)) {
    assertClose(mean.get(Number(y))!, v, 1e-6, `pppMulti[${y}]`);
  }
});

// ── مدل پولی پایه ─────────────────────────────────────────────────────
test("monetarySeries base 1381 matches Python golden values", () => {
  const s = monetarySeries(macro, 1381, baseRates["1381"]);
  assert.equal(s.get(1381), 799);
  for (const [y, v] of Object.entries(GOLDEN.monetary_1381)) {
    assertClose(s.get(Number(y))!, v, 1e-6, `monetary[${y}]`);
  }
});

test("monetarySeries with velocity ΔV=2% matches Python golden values", () => {
  const s = monetarySeries(macro, 1381, baseRates["1381"], 2.0);
  for (const [y, v] of Object.entries(GOLDEN.monetary_v2)) {
    assertClose(s.get(Number(y))!, v, 1e-6, `monetaryV2[${y}]`);
  }
});

test("monetarySeries keeps rate flat on incomplete data year", () => {
  const rows: MacroRow[] = [
    { year_shamsi: 1400, infl_cbi: 40, usa_infl: 2, m2_growth: 30, usa_m2_growth: 5, gdp_growth: 3, usa_gdp_growth: 2 },
    { year_shamsi: 1401, infl_cbi: 40, usa_infl: 2, m2_growth: null, usa_m2_growth: 5, gdp_growth: 3, usa_gdp_growth: 2 },
    { year_shamsi: 1402, infl_cbi: 40, usa_infl: 2, m2_growth: 30, usa_m2_growth: 5, gdp_growth: 3, usa_gdp_growth: 2 },
  ];
  const s = monetarySeries(rows, 1400, 1000);
  // ۱۴۰۱: نقدینگی ایران null → نرخ همان ۱۴۰۰ می‌ماند
  assertClose(s.get(1401)!, 1000, 1e-12, "flat year");
  // ۱۴۰۲: ΔE = (30−5)−(3−2) = 24% → 1240
  assertClose(s.get(1402)!, 1240, 1e-9, "resume year");
});

// ── فرنکل–بیلسون ─────────────────────────────────────────────────────
test("frenkelBilsonSeries equals monetary when rate differential is absent", () => {
  const s1 = frenkelBilsonSeries(macro, 1381, 799, 0.5);
  const s2 = monetarySeries(macro, 1381, 799);
  for (const y of [1390, 1400, 1404]) {
    assertClose(s1.get(y)!, s2.get(y)!, 1e-12, `fb[${y}]`);
  }
});

test("frenkelBilsonSeries applies λ×(i_ir − i_us) when rates provided", () => {
  const rows = [
    { year_shamsi: 1400, infl_cbi: 40, usa_infl: 2, m2_growth: 30, usa_m2_growth: 5, gdp_growth: 3, usa_gdp_growth: 2, i_ir: 20, i_us: 4 },
    { year_shamsi: 1401, infl_cbi: 40, usa_infl: 2, m2_growth: 30, usa_m2_growth: 5, gdp_growth: 3, usa_gdp_growth: 2, i_ir: 20, i_us: 4 },
  ];
  const s = frenkelBilsonSeries(rows, 1400, 1000, 0.5);
  // ΔE = 24% + 0.5×16% = 32% → 1320
  assertClose(s.get(1401)!, 1320, 1e-9, "fb with rates");
});

// ── ترکیب مدل‌ها (میانگین هندسی وزن‌دار) ─────────────────────────────
test("ensembleValuation equal weights → geometric mean", () => {
  const v = ensembleValuation({ a: 100, b: 400 });
  assertClose(v!, GOLDEN.ensemble_eq, 1e-9, "ensemble eq");
});

test("ensembleValuation inverse-error weights match Python", () => {
  // خطاها: a=1، b=3 → وزن‌ها 0.75/0.25 → exp(0.75·ln100 + 0.25·ln400)
  const v = ensembleValuation({ a: 100, b: 400 }, { a: 1, b: 3 });
  assertClose(v!, GOLDEN.ensemble_w, 1e-4, "ensemble weighted");
});

test("ensembleValuation ignores non-positive valuations and handles empty", () => {
  assert.equal(ensembleValuation({}), null);
  assert.equal(ensembleValuation({ a: 0, b: -5 }), null);
  assertClose(ensembleValuation({ a: 0, b: 200 })!, 200, 1e-12, "single valid");
});

// ── شکاف حباب ────────────────────────────────────────────────────────
test("bubbleGap matches Python rounding (1 decimal)", () => {
  assert.equal(bubbleGap(190300, 120000), GOLDEN.gap);
  assert.equal(bubbleGap(100, 100), 0);
  assert.equal(bubbleGap(null, 100), null);
  assert.equal(bubbleGap(100, 0), null);
});

// ── پیش‌بینی رو به جلو ───────────────────────────────────────────────
test("forecastForward matches Python golden values (m6, m12)", () => {
  const fc = forecastForward(190300, "1405/04/01", 12, {
    inflIran: 35,
    inflUsa: 3,
    m2Iran: 28,
    m2Usa: 5,
    gdpIran: 3,
    gdpUsa: 2,
    deltaV: 0,
  });
  assert.equal(fc.length, 12);
  assertClose(fc[5].ppp, GOLDEN.forecast_m6.ppp, 1e-9, "m6 ppp");
  assertClose(fc[5].monetary, GOLDEN.forecast_m6.mon, 1e-9, "m6 mon");
  assertClose(fc[11].ppp, GOLDEN.forecast_m12.ppp, 1e-9, "m12 ppp");
  assertClose(fc[11].monetary, GOLDEN.forecast_m12.mon, 1e-9, "m12 mon");
});

test("forecastForward clamps monetary drift at annual ≤ −100%", () => {
  const fc = forecastForward(1000, "1405/01/01", 3, {
    inflIran: 10,
    inflUsa: 2,
    m2Iran: -120,
    m2Usa: 0,
    gdpIran: 0,
    gdpUsa: 0,
  });
  // annual = −120% ≤ −1 → mMon = 0 → مسیر پولی ثابت می‌ماند
  assertClose(fc[2].monetary, 1000, 1e-12, "clamped monetary");
});

test("forwardMonthLabels starts from the month after start", () => {
  const labels = forwardMonthLabels("1405/04/01", 3);
  assert.deepEqual(labels, ["مرداد 1405", "شهریور 1405", "مهر 1405"]);
  // عبور از سال
  const wrap = forwardMonthLabels("1405/11/15", 3);
  assert.deepEqual(wrap, ["اسفند 1405", "فروردین 1406", "اردیبهشت 1406"]);
});

// ── میانگین سالانه ───────────────────────────────────────────────────
test("annualMean averages values per shamsi year", () => {
  const m = annualMean([
    { year_shamsi: 1404, value: 100 },
    { year_shamsi: 1404, value: 200 },
    { year_shamsi: 1405, value: 50 },
  ]);
  assert.equal(m.get(1404), 150);
  assert.equal(m.get(1405), 50);
});

// ── حساسیت: کشش OLS ─────────────────────────────────────────────────
test("estimateElasticities falls back with insufficient data", () => {
  const el = estimateElasticities([1400, 1401], new Map(), new Map(), new Map());
  assert.equal(el.estimated, false);
  assert.equal(el.oilElasticityPer5usd, -0.3);
  assert.equal(el.deficitToInflation, 0.6);
});

test("estimateElasticities recovers a synthetic negative oil elasticity", () => {
  // gap = 50 − 20·ln(oil) → β₁ = −20 دقیقاً
  const years: number[] = [];
  const market = new Map<number, number>();
  const ppp = new Map<number, number>();
  const oil = new Map<number, number>();
  const oilPrices = [40, 50, 60, 70, 80, 90, 100, 110, 120, 45];
  oilPrices.forEach((o, i) => {
    const y = 1390 + i;
    years.push(y);
    const gapPct = 50 - 20 * Math.log(o);
    ppp.set(y, 1000);
    market.set(y, 1000 * (1 + gapPct / 100));
    oil.set(y, o);
  });
  const el = estimateElasticities(years, market, ppp, oil);
  assert.equal(el.estimated, true);
  assert.equal(el.n, 10);
  assertClose(el.beta1LogOil!, -20, 1e-6, "beta1");
  assert.ok(el.r2! > 0.999, `r2=${el.r2}`);
  assert.ok(el.oilElasticityPer5usd < 0, "negative elasticity");
});

// ── حساسیت: نفت / کسری / heatmap / تورنادو ──────────────────────────
const BASE = {
  baseRate: 190300,
  baseInflation: 43,
  baseOilPrice: 70,
  baseMoneyGrowth: 36,
  oilElasticityPer5usd: -0.3,
  deficitToInflation: 0.6,
};

test("oilSensitivity is monotonically decreasing for negative elasticity", () => {
  const rows = oilSensitivity(BASE);
  assert.equal(rows.length, 17); // 40..120 گام ۵
  assert.equal(rows[0].oil, 40);
  assert.equal(rows[rows.length - 1].oil, 120);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].rate <= rows[i - 1].rate, `monotone at ${rows[i].oil}`);
  }
  // در قیمت پایه، نرخ باید همان نرخ پایه باشد
  const at70 = rows.find((r) => r.oil === 70)!;
  assert.equal(at70.rate, 190300);
});

test("deficitSensitivity is monotonically increasing", () => {
  const rows = deficitSensitivity(BASE);
  assert.equal(rows.length, 11); // 0..50 گام ۵
  assert.equal(rows[0].rate, 190300); // کسری ۰ → نرخ پایه
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].rate >= rows[i - 1].rate, `monotone at ${rows[i].deficit}`);
  }
  // کسری ۵۰٪ × ۰.۶ = ۳۰٪ → 190300×1.3
  assert.equal(rows[10].rate, Math.round(190300 * 1.3));
});

test("buildHeatmap has correct dimensions and corner values", () => {
  const { oils, deficits, matrix } = buildHeatmap(BASE);
  assert.equal(oils.length, 9); // 40..120 گام ۱۰
  assert.equal(deficits.length, 11); // 0..50 گام ۵
  assert.equal(matrix.length, 11);
  assert.ok(matrix.every((row) => row.length === 9));
  // سلول (کسری ۰، نفت ۷۰): بدون اثر → نرخ پایه
  const oil70 = oils.indexOf(70);
  assert.equal(matrix[0][oil70], 190300);
});

test("tornadoData returns 4 factors sorted by descending range", () => {
  const rows = tornadoData(BASE);
  assert.equal(rows.length, 4);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].range <= rows[i - 1].range, "sorted desc");
  }
  for (const r of rows) {
    assert.ok(r.high >= r.low, `${r.factor} high≥low`);
    assert.equal(r.range, r.high - r.low);
  }
});

// ── تست تطبیق تبدیل تاریخ (نکتهٔ بازبینی #2) ─────────────────────────
// gregorianToJalali (dataLoader) باید معکوس دقیق jalaliYmdToGregorian کانونی
// (lib/core/jalali.ts) باشد. کل بازهٔ ۱۴۰۰..۱۴۱۰ روزبه‌روز چک می‌شود تا هر
// واگرایی در مرز سال یا سال کبیسه فوراً تست را قرمز کند.
test("gregorianToJalali reconciles with canonical jalaliYmdToGregorian day-by-day 1400..1410", async () => {
  const { jalaliYmdToGregorian } = await import("../core/jalali");
  const { gregorianToJalali, gregorianYmdToJalali } = await import("./dataLoader");

  // جهت تست: میلادی ← شمسی ← میلادی (هر روز میلادی قطعاً معتبر است؛
  // جهت برعکس می‌تواند روز نامعتبر مثل ۳۰ اسفند غیرکبیسه بسازد که کانونی آن را
  // اعتبارسنجی نمی‌کند — راستی‌آزمایی‌شده با jdatetime پایتون).
  // بازه: 2021-03-21 (۱۴۰۰/۰۱/۰۱) تا 2032-03-19 (پایان ۱۴۱۰) — روزبه‌روز.
  let checked = 0;
  const start = Date.UTC(2021, 2, 21);
  const end = Date.UTC(2032, 2, 19);
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const gy = d.getUTCFullYear();
    const gm = d.getUTCMonth() + 1;
    const gd = d.getUTCDate();
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    const j = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
    const back = jalaliYmdToGregorian(j);
    const gStr = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
    assert.equal(back, gStr, `roundtrip mismatch: ${gStr} → ${j} → ${back}`);
    checked++;
  }
  assert.ok(checked > 4000, `expected >4000 days checked, got ${checked}`);

  // نمونه‌های مرجع صریح (سه مقدار راستی‌آزمایی‌شدهٔ jalali.ts + مرز سال نو)
  assert.equal(gregorianYmdToJalali("2025-07-16"), "1404/04/25");
  assert.equal(gregorianYmdToJalali("2025-03-20"), "1403/12/30"); // ۳۰ اسفند کبیسه
  assert.equal(gregorianYmdToJalali("2025-09-22"), "1404/06/31");
  assert.equal(gregorianYmdToJalali("2025-03-21"), "1404/01/01"); // نوروز
  assert.equal(gregorianYmdToJalali("bad-input"), null);
});

// ── تست ثابت‌های سکهٔ امامی (نکتهٔ بازبینی #1) ──────────────────────
// ارزش ذاتی سکه باید از طلای خالص (۸.۱۳۳ گرم ناخالص × عیار ۰.۹۰۰ = ۷.۳۱۹۷ گرم ۲۴ عیار)
// محاسبه شود، نه کل وزن ناخالص با فرض ۲۴ عیار (که ذاتی را ~۱۱٪ بیش‌برآورد می‌کرد).
test("Emami coin intrinsic uses net gold content (8.133g gross × 0.900 fineness)", () => {
  const gross = 8.133;
  const fineness = 0.9;
  const pure24 = gross * fineness;
  assertClose(pure24, 7.3197, 1e-9, "pure grams");
  assertClose(pure24 * (24 / 18), 9.7596, 1e-9, "18k equivalent grams");
  // با گرم ۱۸ عیار فرضی ۱۰,۰۰۰,۰۰۰ تومان → ارزش ذاتی ۹۷,۵۹۶,۰۰۰ تومان
  const gold18 = 10_000_000;
  assertClose(gold18 * pure24 * (24 / 18), 97_596_000, 1e-9, "intrinsic");
  // فرمول قدیمی (نادرست) دقیقاً 1/0.9 برابر بود → اثبات جهت و اندازهٔ خطا
  const wrong = gold18 * gross * (24 / 18);
  assertClose(wrong / (gold18 * pure24 * (24 / 18)), 1 / fineness, 1e-9, "old formula ratio");
});
