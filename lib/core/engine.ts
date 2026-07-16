// ─────────────────────────────────────────────────────────────────────────────
// هستهٔ محاسباتی «قطب‌نمای بازار» — core engine (اصل «یک موتور، دو نما»)
// قوانین حاکم (TERMINAL-ANALYST + COMPREHENSIVE-QUANT-EXECUTION-PLAN):
//   ۱. ارزش‌گذاری همیشه «بازه + فروض» است، هرگز عدد هدف واحد.
//   ۲. هیچ واژهٔ سیگنال/خرید/فروش/توصیه در هیچ خروجی این ماژول نیست.
//   ۳. هر امتیاز باید driver (چرا) داشته باشد — عدد بدون دلیل ممنوع.
//   ۴. دادهٔ ناموجود = null صادقانه؛ هیچ عدد ساختگی.
//   ۵. ماسک کیفی (qualitative bands) تنها خروجی مجاز به‌سمت LLM است.
// ─────────────────────────────────────────────────────────────────────────────

// ── انواع ────────────────────────────────────────────────────────────────────

/** یک روز تاریخچهٔ نماد — نگاشت از symbol_history. */
export interface HistoryDay {
  trade_date: string; // Gregorian YYYY-MM-DD
  close: number | null;
  last_price: number | null;
  volume: number | null;
  value_traded: number | null;
  individual_buy_value: number | null;
  individual_sell_value: number | null;
  individual_buy_count: number | null;
  individual_sell_count: number | null;
  legal_buy_value: number | null;
  legal_sell_value: number | null;
  buyer_power: number | null;
}

/** ورودی بنیادی از codal_reports.data (ن-۱۰). */
export interface FundamentalInput {
  revenue: number; // میلیون ریال
  gross_profit: number;
  operating_profit: number;
  net_profit: number;
  eps_rial: number | null;
  capital: number | null; // میلیون ریال (سرمایهٔ ثبتی)
  period_months: number;
  audited: boolean;
  prior?: { revenue: number; net_profit: number } | null;
}

export interface Driver {
  label: string; // مثلاً «حاشیه سود خالص»
  value: string; // مقدار قابل‌نمایش، مثلاً «۲۹٫۶٪»
  effect: "positive" | "negative" | "neutral";
  note?: string; // توضیح «چرا»
}

export interface AxisScore {
  score: number | null; // 0..100 یا null وقتی داده کافی نیست
  drivers: Driver[];
  data_ok: boolean;
}

export interface Scorecard {
  fundamental: AxisScore;
  trend: AxisScore;
  liquidity: AxisScore;
  composite: number | null; // میانگین وزنیِ محورهای دارای داده
  as_of: string;
}

export interface ValuationBand {
  low: number; // ریال، ارزش هر سهم
  base: number;
  high: number;
  assumptions: string[]; // فروض شفاف هر سناریو
  method: string;
  caveat: string;
}

// ── ابزار عمومی ──────────────────────────────────────────────────────────────

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** میانگین ساده با نادیده‌گرفتن null. */
export function meanOf(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** بازده ساده بین دو قیمت (٪). */
export function returnPct(from: number, to: number): number | null {
  if (!isFinite(from) || from <= 0 || !isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

/** نوسان روزانهٔ EWMA (لاندا=0.94) روی بازده‌های لگاریتمی — درصد روزانه. */
export function ewmaVolatility(closes: number[], lambda = 0.94): number | null {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 20) return null;
  let v = rets[0] * rets[0];
  for (let i = 1; i < rets.length; i++) {
    v = lambda * v + (1 - lambda) * rets[i] * rets[i];
  }
  return Math.sqrt(v) * 100;
}

/** حداکثر افت (drawdown) دوره — درصد منفی. */
export function maxDrawdownPct(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let mdd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) mdd = Math.min(mdd, ((c - peak) / peak) * 100);
  }
  return mdd;
}

/** خالص ورود پول حقیقی یک روز (ریال). */
export function netIndividualFlow(d: HistoryDay): number | null {
  if (d.individual_buy_value == null || d.individual_sell_value == null) return null;
  return d.individual_buy_value - d.individual_sell_value;
}

/** تعداد روزهای متوالی اخیر با ورود خالص پول حقیقی (از انتهای سری). */
export function consecutiveInflowDays(days: HistoryDay[]): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const f = netIndividualFlow(days[i]);
    if (f == null || f <= 0) break;
    n++;
  }
  return n;
}

// ── نسبت‌های بنیادی ─────────────────────────────────────────────────────────

export interface Ratios {
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  revenue_growth: number | null; // نسبت به دورهٔ مشابه قبل
  net_profit_growth: number | null;
  pe_ttm: number | null; // نیازمند قیمت + EPS سالانه‌شده
}

export function computeRatios(f: FundamentalInput, lastPrice?: number | null): Ratios {
  const m = (num: number) => (f.revenue > 0 ? (num / f.revenue) * 100 : null);
  const annualFactor = f.period_months > 0 ? 12 / f.period_months : null;
  const epsAnnualized =
    f.eps_rial != null && annualFactor != null ? f.eps_rial * annualFactor : null;
  return {
    gross_margin: m(f.gross_profit),
    operating_margin: m(f.operating_profit),
    net_margin: m(f.net_profit),
    revenue_growth:
      f.prior && f.prior.revenue > 0
        ? ((f.revenue - f.prior.revenue) / f.prior.revenue) * 100
        : null,
    net_profit_growth:
      f.prior && f.prior.net_profit !== 0 && f.prior.net_profit != null
        ? ((f.net_profit - f.prior.net_profit) / Math.abs(f.prior.net_profit)) * 100
        : null,
    pe_ttm:
      lastPrice != null && epsAnnualized != null && epsAnnualized > 0
        ? lastPrice / epsAnnualized
        : null,
  };
}

// ── ارزش‌گذاری بازه‌ای (سناریویی — هرگز عدد واحد) ────────────────────────────

/**
 * بازهٔ ارزش مبتنی بر P/E سناریویی روی EPS سالانه‌شده.
 * سه سناریو: محافظه‌کارانه/پایه/خوش‌بینانه با P/E ورودی (پیش‌فرض ۴/۶/۸ برای تولیدی‌ها).
 * خروجی همیشه بازه + فروض است (قانون ۱).
 */
export function valuationBand(
  f: FundamentalInput,
  peScenarios: { low: number; base: number; high: number } = { low: 4, base: 6, high: 8 }
): ValuationBand | null {
  if (f.eps_rial == null || f.period_months <= 0) return null;
  const epsAnnual = f.eps_rial * (12 / f.period_months);
  if (!isFinite(epsAnnual) || epsAnnual <= 0) return null;
  const audited = f.audited ? "حسابرسی‌شده" : "حسابرسی‌نشده";
  return {
    low: Math.round(epsAnnual * peScenarios.low),
    base: Math.round(epsAnnual * peScenarios.base),
    high: Math.round(epsAnnual * peScenarios.high),
    assumptions: [
      `EPS سالانه‌شده از گزارش ${f.period_months} ماههٔ ${audited}: ${Math.round(epsAnnual).toLocaleString("fa-IR")} ریال`,
      `سناریوی محافظه‌کارانه: P/E=${peScenarios.low} — رکود نسبی بازار`,
      `سناریوی پایه: P/E=${peScenarios.base} — میانگین تاریخی صنعت`,
      `سناریوی خوش‌بینانه: P/E=${peScenarios.high} — رونق و ورود نقدینگی`,
      "سالانه‌سازی EPS میان‌دوره‌ای فرض تکرار عملکرد را دارد؛ فصلی‌بودن لحاظ نشده است",
    ],
    method: "P/E سناریویی روی EPS سالانه‌شده",
    caveat:
      "این بازه صرفاً چارچوب تحلیلی-آموزشی است، نه قیمت هدف؛ تصمیم‌گیری با خود سرمایه‌گذار است.",
  };
}

// ── کارت امتیاز سه‌محوره ────────────────────────────────────────────────────

const faPct = (x: number, digits = 1) =>
  `٪${x.toLocaleString("fa-IR", { maximumFractionDigits: digits })}`;

/** محور بنیادی: حاشیه‌ها + رشد. */
export function fundamentalAxis(r: Ratios): AxisScore {
  const drivers: Driver[] = [];
  let pts = 0;
  let max = 0;
  if (r.net_margin != null) {
    max += 40;
    const p = clamp((r.net_margin / 30) * 40, 0, 40); // ۳۰٪ حاشیه خالص = سقف
    pts += p;
    drivers.push({
      label: "حاشیه سود خالص",
      value: faPct(r.net_margin),
      effect: r.net_margin >= 15 ? "positive" : r.net_margin >= 5 ? "neutral" : "negative",
      note: "سقف امتیاز در حاشیهٔ ۳۰٪",
    });
  }
  if (r.gross_margin != null) {
    max += 20;
    pts += clamp((r.gross_margin / 40) * 20, 0, 20);
    drivers.push({
      label: "حاشیه سود ناخالص",
      value: faPct(r.gross_margin),
      effect: r.gross_margin >= 25 ? "positive" : r.gross_margin >= 10 ? "neutral" : "negative",
    });
  }
  if (r.revenue_growth != null) {
    max += 20;
    pts += clamp(((r.revenue_growth + 10) / 60) * 20, 0, 20); // −۱۰٪ = صفر، +۵۰٪ = سقف
    drivers.push({
      label: "رشد فروش",
      value: faPct(r.revenue_growth),
      effect: r.revenue_growth >= 30 ? "positive" : r.revenue_growth >= 0 ? "neutral" : "negative",
      note: "نسبت به دورهٔ مشابه سال قبل (اسمی، تورم لحاظ نشده)",
    });
  }
  if (r.net_profit_growth != null) {
    max += 20;
    pts += clamp(((r.net_profit_growth + 20) / 90) * 20, 0, 20);
    drivers.push({
      label: "رشد سود خالص",
      value: faPct(r.net_profit_growth),
      effect:
        r.net_profit_growth >= 30 ? "positive" : r.net_profit_growth >= 0 ? "neutral" : "negative",
    });
  }
  if (max === 0) return { score: null, drivers, data_ok: false };
  return { score: Math.round((pts / max) * 100), drivers, data_ok: true };
}

/** محور روند: بازده نسبی + فاصله از سقف + نوسان. */
export function trendAxis(days: HistoryDay[]): AxisScore {
  const closes = days.map((d) => d.close).filter((c): c is number => c != null && c > 0);
  if (closes.length < 30) {
    return { score: null, drivers: [], data_ok: false };
  }
  const drivers: Driver[] = [];
  let pts = 0;
  let max = 0;

  const last = closes[closes.length - 1];
  const d63 = closes.length >= 63 ? closes[closes.length - 63] : closes[0];
  const r3m = returnPct(d63, last);
  if (r3m != null) {
    max += 40;
    pts += clamp(((r3m + 20) / 60) * 40, 0, 40); // −۲۰٪=۰ ، +۴۰٪=سقف
    drivers.push({
      label: "بازده ~۳ ماهه",
      value: faPct(r3m),
      effect: r3m >= 10 ? "positive" : r3m >= -5 ? "neutral" : "negative",
    });
  }

  const peak = Math.max(...closes.slice(-250));
  const offPeak = peak > 0 ? ((last - peak) / peak) * 100 : null;
  if (offPeak != null) {
    max += 30;
    pts += clamp(((offPeak + 40) / 40) * 30, 0, 30); // −۴۰٪ از سقف=۰ ، روی سقف=سقف امتیاز
    drivers.push({
      label: "فاصله از سقف یک‌ساله",
      value: faPct(offPeak),
      effect: offPeak >= -5 ? "positive" : offPeak >= -20 ? "neutral" : "negative",
    });
  }

  const vol = ewmaVolatility(closes.slice(-120));
  if (vol != null) {
    max += 30;
    pts += clamp(((4 - vol) / 3) * 30, 0, 30); // نوسان ۱٪=سقف، ۴٪+=۰
    drivers.push({
      label: "نوسان روزانه (EWMA)",
      value: faPct(vol, 2),
      effect: vol <= 2 ? "positive" : vol <= 3 ? "neutral" : "negative",
      note: "نوسان بالاتر = ریسک بیشتر = امتیاز کمتر",
    });
  }

  if (max === 0) return { score: null, drivers, data_ok: false };
  return { score: Math.round((pts / max) * 100), drivers, data_ok: true };
}

/** محور نقدینگی: ورود پول حقیقی + قدرت خریدار + ارزش معاملات. */
export function liquidityAxis(days: HistoryDay[]): AxisScore {
  if (days.length < 10) return { score: null, drivers: [], data_ok: false };
  const drivers: Driver[] = [];
  let pts = 0;
  let max = 0;
  const recent = days.slice(-10);

  const flows = recent.map(netIndividualFlow).filter((f): f is number => f != null);
  if (flows.length >= 5) {
    const totalFlow = flows.reduce((a, b) => a + b, 0);
    const vals = recent
      .map((d) => d.value_traded)
      .filter((v): v is number => v != null && v > 0);
    const totalVal = vals.reduce((a, b) => a + b, 0);
    const flowRatio = totalVal > 0 ? (totalFlow / totalVal) * 100 : null;
    if (flowRatio != null) {
      max += 40;
      pts += clamp(((flowRatio + 15) / 30) * 40, 0, 40);
      drivers.push({
        label: "خالص ورود پول حقیقی (۱۰ روز/ارزش معاملات)",
        value: faPct(flowRatio),
        effect: flowRatio >= 3 ? "positive" : flowRatio >= -3 ? "neutral" : "negative",
      });
    }
    const streak = consecutiveInflowDays(days);
    max += 20;
    pts += clamp((streak / 5) * 20, 0, 20);
    drivers.push({
      label: "روزهای متوالی ورود پول حقیقی",
      value: streak.toLocaleString("fa-IR"),
      effect: streak >= 3 ? "positive" : streak >= 1 ? "neutral" : "negative",
    });
  }

  const bp = meanOf(recent.map((d) => d.buyer_power));
  if (bp != null) {
    max += 40;
    pts += clamp(((bp - 0.5) / 1.0) * 40, 0, 40); // ۰٫۵=۰ ، ۱٫۵=سقف
    drivers.push({
      label: "قدرت خریدار حقیقی (میانگین ۱۰ روز)",
      value: bp.toLocaleString("fa-IR", { maximumFractionDigits: 2 }),
      effect: bp >= 1.2 ? "positive" : bp >= 0.8 ? "neutral" : "negative",
      note: "سرانهٔ خرید حقیقی ÷ سرانهٔ فروش حقیقی",
    });
  }

  if (max === 0) return { score: null, drivers, data_ok: false };
  return { score: Math.round((pts / max) * 100), drivers, data_ok: true };
}

/** کارت امتیاز نهایی — میانگین وزنی محورهای دارای داده. */
export function buildScorecard(
  ratios: Ratios | null,
  days: HistoryDay[],
  asOf: string
): Scorecard {
  const fundamental = ratios ? fundamentalAxis(ratios) : { score: null, drivers: [], data_ok: false };
  const trend = trendAxis(days);
  const liquidity = liquidityAxis(days);
  const weighted: Array<[number, number]> = [];
  if (fundamental.score != null) weighted.push([fundamental.score, 0.45]);
  if (trend.score != null) weighted.push([trend.score, 0.3]);
  if (liquidity.score != null) weighted.push([liquidity.score, 0.25]);
  const wsum = weighted.reduce((a, [, w]) => a + w, 0);
  const composite =
    wsum > 0 ? Math.round(weighted.reduce((a, [s, w]) => a + s * w, 0) / wsum) : null;
  return { fundamental, trend, liquidity, composite, as_of: asOf };
}

// ── ماسک کیفی (تنها خروجی مجاز به‌سمت LLM) ───────────────────────────────────

export type QualBand =
  | "بسیار بالا"
  | "بالا"
  | "متوسط"
  | "پایین"
  | "بسیار پایین"
  | "نامشخص";

export function maskMargin(pct: number | null): QualBand {
  if (pct == null) return "نامشخص";
  if (pct >= 30) return "بسیار بالا";
  if (pct >= 18) return "بالا";
  if (pct >= 8) return "متوسط";
  if (pct >= 0) return "پایین";
  return "بسیار پایین";
}

export function maskGrowth(pct: number | null): QualBand {
  if (pct == null) return "نامشخص";
  if (pct >= 60) return "بسیار بالا";
  if (pct >= 30) return "بالا";
  if (pct >= 5) return "متوسط";
  if (pct >= -10) return "پایین";
  return "بسیار پایین";
}

/** خروجی ماسک‌شدهٔ کامل برای مصرف LLM — هیچ عدد خامی عبور نمی‌کند. */
export function qualitativeMask(r: Ratios): Record<string, QualBand> {
  return {
    gross_margin: maskMargin(r.gross_margin),
    operating_margin: maskMargin(r.operating_margin),
    net_margin: maskMargin(r.net_margin),
    revenue_growth: maskGrowth(r.revenue_growth),
    net_profit_growth: maskGrowth(r.net_profit_growth),
  };
}
