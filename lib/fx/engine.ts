// ─────────────────────────────────────────────────────────────────────
// موتور تحلیلی نرخ ارز — پورت TypeScript از models.py و sensitivity.py
// (داشبورد نرخ ارز آرش — نسخهٔ پایتون تست‌شده، این پورت با تست عددی
// مقابل خروجی پایتون اعتبارسنجی می‌شود؛ ر.ک. engine.test.ts)
//
// فقط مدل‌های «سبک» (حساب قطعی): PPP چندپایه، پولی (+سرعت گردش)،
// فرنکل–بیلسون، میانگین هندسی وزن‌دار (ensemble)، شکاف حباب،
// پیش‌بینی ماهانهٔ رو به جلو، و تحلیل حساسیت (کشش OLS تک‌متغیره).
// مدل‌های سنگین (PSY/GSADF، GARCH، Monte Carlo، BEER/ECM) عمداً پورت
// نمی‌شوند — پیش‌محاسبهٔ پایتونی در مرحلهٔ ۲ (تصمیم سه‌جانبه، 22 Jul).
// ─────────────────────────────────────────────────────────────────────

/** یک ردیف دادهٔ کلان سالانه (معادل ردیف‌های اکسل Data) */
export interface MacroRow {
  year_shamsi: number;
  /** تورم بانک مرکزی ایران (٪) */
  infl_cbi: number | null;
  /** تورم مرکز آمار (٪) */
  infl_sci?: number | null;
  /** تورم آمریکا (٪) */
  usa_infl: number | null;
  /** رشد نقدینگی ایران (٪) */
  m2_growth: number | null;
  /** رشد M2 آمریکا (٪) */
  usa_m2_growth: number | null;
  /** رشد GDP ایران (٪) */
  gdp_growth: number | null;
  /** رشد GDP آمریکا (٪) */
  usa_gdp_growth: number | null;
  /** صادرات نفت (میلیارد دلار) */
  oil_exports?: number | null;
}

const n0 = (v: number | null | undefined): number => (v == null || Number.isNaN(v) ? 0 : v);

// ── PPP (کاسل): E_t = E_base × Π (1+π_ir)/(1+π_us) ───────────────────
export function pppSeries(
  rows: MacroRow[],
  baseYear: number,
  baseRate: number,
): Map<number, number> {
  // مطابق پایتون (models.ppp_series): فقط سال پایه به بعد، تجمعی ضربی
  const sorted = [...rows].sort((a, b) => a.year_shamsi - b.year_shamsi);
  const out = new Map<number, number>();
  let rate = baseRate;
  out.set(baseYear, baseRate);
  for (const r of sorted) {
    if (r.year_shamsi <= baseYear) continue;
    rate *= (1 + n0(r.infl_cbi) / 100) / (1 + n0(r.usa_infl) / 100);
    out.set(r.year_shamsi, rate);
  }
  return out;
}

/** PPP چندپایه: میانگین هندسی سال‌به‌سال مسیرهای هر سال‌پایه */
export function pppMultiBase(
  rows: MacroRow[],
  bases: Record<number, number>,
): { mean: Map<number, number>; individual: Map<number, Map<number, number>> } {
  const individual = new Map<number, Map<number, number>>();
  for (const [byStr, brate] of Object.entries(bases)) {
    const by = Number(byStr);
    individual.set(by, pppSeries(rows, by, brate));
  }
  const years = new Set<number>();
  for (const m of individual.values()) for (const y of m.keys()) years.add(y);
  const mean = new Map<number, number>();
  for (const y of [...years].sort((a, b) => a - b)) {
    const vals: number[] = [];
    for (const m of individual.values()) {
      const v = m.get(y);
      if (v != null && v > 0) vals.push(v);
    }
    if (vals.length) {
      mean.set(y, Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length));
    }
  }
  return { mean, individual };
}

// ── مدل پولی: ΔE% = (Δm2_ir − Δm2_us) − (Δy_ir − Δy_us) ─────────────
export function monetarySeries(
  rows: MacroRow[],
  baseYear: number,
  baseRate: number,
  deltaVPct = 0,
): Map<number, number> {
  const sorted = [...rows].sort((a, b) => a.year_shamsi - b.year_shamsi);
  const out = new Map<number, number>();
  out.set(baseYear, baseRate);
  let rate = baseRate;
  for (const r of sorted) {
    if (r.year_shamsi <= baseYear) continue;
    const hasAll = r.m2_growth != null && r.usa_m2_growth != null
      && r.gdp_growth != null && r.usa_gdp_growth != null;
    if (hasAll) {
      const delta = ((r.m2_growth! - r.usa_m2_growth!) - (r.gdp_growth! - r.usa_gdp_growth!)
        + deltaVPct) / 100;
      rate *= 1 + delta;
    }
    // اگر داده ناقص بود: نرخ همان سال قبل می‌ماند (مطابق پایتون)
    out.set(r.year_shamsi, rate);
  }
  return out;
}

/** فرنکل–بیلسون: مدل پولی + λ×(i_ir − i_us) — نرخ بهره سالانه (٪) */
export function frenkelBilsonSeries(
  rows: (MacroRow & { i_ir?: number | null; i_us?: number | null })[],
  baseYear: number,
  baseRate: number,
  lambda = 0.5,
): Map<number, number> {
  const sorted = [...rows].sort((a, b) => a.year_shamsi - b.year_shamsi);
  const out = new Map<number, number>();
  out.set(baseYear, baseRate);
  let rate = baseRate;
  for (const r of sorted) {
    if (r.year_shamsi <= baseYear) continue;
    const hasAll = r.m2_growth != null && r.usa_m2_growth != null
      && r.gdp_growth != null && r.usa_gdp_growth != null;
    if (hasAll) {
      let delta = ((r.m2_growth! - r.usa_m2_growth!) - (r.gdp_growth! - r.usa_gdp_growth!)) / 100;
      if (r.i_ir != null && r.i_us != null) delta += (lambda * (r.i_ir - r.i_us)) / 100;
      rate *= 1 + delta;
    }
    out.set(r.year_shamsi, rate);
  }
  return out;
}

// ── ترکیب مدل‌ها: میانگین هندسی وزن‌دار ──────────────────────────────
export function ensembleValuation(
  valuations: Record<string, number>,
  errors?: Record<string, number>,
): number | null {
  const names = Object.keys(valuations).filter((k) => valuations[k] > 0);
  if (!names.length) return null;
  let weights: number[];
  if (errors && names.every((k) => errors[k] != null && errors[k]! > 0)) {
    const inv = names.map((k) => 1 / errors[k]!);
    const s = inv.reduce((a, b) => a + b, 0);
    weights = inv.map((w) => w / s);
  } else {
    weights = names.map(() => 1 / names.length);
  }
  const lnSum = names.reduce((s, k, i) => s + weights[i] * Math.log(valuations[k]), 0);
  return Math.exp(lnSum);
}

// ── شکاف حباب: (بازار − مدل) / مدل × ۱۰۰ ─────────────────────────────
export function bubbleGap(market: number | null, model: number | null): number | null {
  if (market == null || model == null || model === 0) return null;
  return Math.round(((market - model) / model) * 1000) / 10;
}

// ── پیش‌بینی ماهانهٔ رو به جلو (ترکیب ماهانه از نرخ سالانه) ──────────
export interface ForecastAssumptions {
  inflIran: number;
  inflUsa: number;
  m2Iran: number;
  m2Usa: number;
  gdpIran: number;
  gdpUsa: number;
  deltaV?: number;
}

export interface ForecastPoint {
  monthIndex: number;
  monthLabel: string;
  ppp: number;
  monetary: number;
}

const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/** برچسب ماه‌های شمسی رو به جلو از نقطهٔ شروع "yyyy/mm" */
export function forwardMonthLabels(startShamsi: string, n: number): string[] {
  const [y0, m0] = startShamsi.split('/').map((x) => parseInt(x, 10));
  const labels: string[] = [];
  for (let i = 1; i <= n; i++) {
    const total = (m0 - 1) + i;
    const y = y0 + Math.floor(total / 12);
    const m = (total % 12) + 1;
    labels.push(`${FA_MONTHS[m - 1]} ${y}`);
  }
  return labels;
}

export function forecastForward(
  startRate: number,
  startShamsi: string,
  nMonths: number,
  a: ForecastAssumptions,
): ForecastPoint[] {
  const labels = forwardMonthLabels(startShamsi, nMonths);
  // نرخ ماهانهٔ PPP: ((1+π_ir)/(1+π_us))^(1/12) − 1
  const mPpp = ((1 + a.inflIran / 100) / (1 + a.inflUsa / 100)) ** (1 / 12) - 1;
  // نرخ ماهانهٔ پولی: (1+annual)^(1/12) − 1 (مطابق پایتون: annual≤−1 → 0)
  const annualMon = ((a.m2Iran - a.m2Usa) - (a.gdpIran - a.gdpUsa) + (a.deltaV ?? 0)) / 100;
  const mMon = annualMon > -1 ? (1 + annualMon) ** (1 / 12) - 1 : 0;
  const out: ForecastPoint[] = [];
  let ppp = startRate;
  let mon = startRate;
  for (let i = 0; i < nMonths; i++) {
    ppp *= 1 + mPpp;
    mon *= 1 + mMon;
    out.push({ monthIndex: i + 1, monthLabel: labels[i], ppp, monetary: mon });
  }
  return out;
}

// ── نرخ بازار سالانه (میانگین close سال شمسی) ────────────────────────
export function annualMean(rows: { year_shamsi: number; value: number }[]): Map<number, number> {
  const groups = new Map<number, number[]>();
  for (const r of rows) {
    if (!groups.has(r.year_shamsi)) groups.set(r.year_shamsi, []);
    groups.get(r.year_shamsi)!.push(r.value);
  }
  const out = new Map<number, number>();
  for (const [y, vals] of groups) out.set(y, vals.reduce((a, b) => a + b, 0) / vals.length);
  return out;
}

// ── تحلیل حساسیت (پورت sensitivity.py) ──────────────────────────────
export interface ElasticityResult {
  oilElasticityPer5usd: number;
  deficitToInflation: number;
  beta1LogOil?: number;
  seBeta1?: number;
  r2?: number;
  n?: number;
  estimated: boolean;
}

/** OLS تک‌متغیره: gap ~ 1 + log(oil)؛ n<8 یا oil<5 → fallback */
export function estimateElasticities(
  years: number[],
  market: Map<number, number>,
  ppp: Map<number, number>,
  oil: Map<number, number>,
): ElasticityResult {
  const xs: number[] = [];
  const ys: number[] = [];
  const oilVals: number[] = [];
  for (const y of years) {
    const m = market.get(y);
    const p = ppp.get(y);
    const o = oil.get(y);
    if (m == null || p == null || o == null || p === 0 || o < 5) continue;
    ys.push(((m - p) / p) * 100);
    xs.push(Math.log(o));
    oilVals.push(o);
  }
  const fallback: ElasticityResult = {
    oilElasticityPer5usd: -0.3,
    deficitToInflation: 0.6,
    estimated: false,
  };
  const n = xs.length;
  if (n < 8) return fallback;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return fallback;
  const beta1 = sxy / sxx;
  const beta0 = my - beta1 * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (beta0 + beta1 * xs[i])) ** 2;
  const r2 = syy === 0 ? 0 : 1 - sse / syy;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const oilMean = oilVals.reduce((a, b) => a + b, 0) / oilVals.length;
  return {
    oilElasticityPer5usd: (beta1 * 5) / oilMean,
    deficitToInflation: 0.6,
    beta1LogOil: beta1,
    seBeta1: se,
    r2,
    n,
    estimated: true,
  };
}

export interface SensitivityBase {
  baseRate: number;
  baseInflation: number;
  baseOilPrice: number;
  baseMoneyGrowth: number;
  oilElasticityPer5usd: number;
  deficitToInflation: number;
}

/** حساسیت نفت: قیمت‌های ۴۰..۱۲۰ (گام ۵) */
export function oilSensitivity(b: SensitivityBase): { oil: number; rate: number }[] {
  const el = b.oilElasticityPer5usd / 5;
  const out: { oil: number; rate: number }[] = [];
  for (let oil = 40; oil <= 120; oil += 5) {
    const change = el * (oil - b.baseOilPrice);
    out.push({ oil, rate: Math.round(b.baseRate * (1 + change / 100)) });
  }
  return out;
}

/** حساسیت کسری بودجه: ۰..۵۰٪ (گام ۵) */
export function deficitSensitivity(b: SensitivityBase): { deficit: number; rate: number }[] {
  const out: { deficit: number; rate: number }[] = [];
  for (let d = 0; d <= 50; d += 5) {
    const change = d * b.deficitToInflation;
    out.push({ deficit: d, rate: Math.round(b.baseRate * (1 + change / 100)) });
  }
  return out;
}

/** نقشهٔ حرارتی: نفت ۴۰..۱۲۰ (گام ۱۰) × کسری ۰..۵۰ (گام ۵) */
export function buildHeatmap(b: SensitivityBase): { oils: number[]; deficits: number[]; matrix: number[][] } {
  const oils: number[] = [];
  for (let o = 40; o <= 120; o += 10) oils.push(o);
  const deficits: number[] = [];
  for (let d = 0; d <= 50; d += 5) deficits.push(d);
  const el = b.oilElasticityPer5usd / 5;
  const matrix = deficits.map((d) => oils.map((o) => {
    const oilEff = el * (o - b.baseOilPrice);
    const defEff = d * b.deficitToInflation;
    return Math.round(b.baseRate * (1 + (oilEff + defEff) / 100));
  }));
  return { oils, deficits, matrix };
}

/** نمودار تورنادو: شوک ±۲۰٪ روی ۴ عامل */
export function tornadoData(b: SensitivityBase, shock = 0.2): {
  factor: string; low: number; high: number; range: number;
}[] {
  const el = b.oilElasticityPer5usd / 5;
  const items = [
    { factor: 'قیمت نفت', delta: Math.abs(el * b.baseOilPrice * shock * 100) / 100 },
    { factor: 'رشد نقدینگی', delta: Math.abs(b.baseMoneyGrowth * shock * 0.9) / 100 },
    { factor: 'تورم', delta: Math.abs(b.baseInflation * shock * 0.8) / 100 },
    { factor: 'کسری بودجه', delta: Math.abs(15 * 0.6) / 100 },
  ].map(({ factor, delta }) => {
    const low = Math.round(b.baseRate * (1 - delta));
    const high = Math.round(b.baseRate * (1 + delta));
    return { factor, low, high, range: high - low };
  });
  return items.sort((a, z) => z.range - a.range);
}
