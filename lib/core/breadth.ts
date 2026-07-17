// پهنای بازار روز + میز صنایع — ابرتسک «رصد بازار» M1 و M3.
// همهٔ محاسبات از خودِ اسنپ‌شات (~۵ دقیقه‌ای) روی کل نمادهاست — تابع خالص، بدون I/O.
// قانون سخت: هیچ عدد ساختگی؛ دادهٔ ناکافی → null / آرایهٔ خالی (حالت خالی صادقانه).

export interface BreadthStockLike {
  id?: string;
  faName?: string | null;
  changePercent?: number | null;
  closingChangePercent?: number | null;
  buyI?: number | null;
  sellI?: number | null;
  closingPrice?: number | null;
  price?: number | null;
  value?: number | null;
  marketValue?: number | null;
  industry?: string | null;
}

function num(x: unknown): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/** درصد تغییر مرجع هر نماد: قیمت پایانی، وگرنه آخرین معامله. */
function pct(s: BreadthStockLike): number | null {
  return num(s.closingChangePercent) ?? num(s.changePercent);
}

/** جریان خالص پول حقیقی یک نماد به تومان؛ null اگر داده ناقص. */
function realFlow(s: BreadthStockLike): number | null {
  const buyI = num(s.buyI);
  const sellI = num(s.sellI);
  const px = num(s.closingPrice) ?? num(s.price);
  if (buyI == null || sellI == null || px == null) return null;
  return (buyI - sellI) * px;
}

// ---------------------------------------------------------------------------
// M1 — پهنای بازار روز از اسنپ‌شات (کل نمادها)
// ---------------------------------------------------------------------------

export interface DailyBreadth {
  /** اندازهٔ جهان بررسی (تعداد نمادهای اسنپ‌شات) */
  universe: number;
  /** تعداد نمادهای مثبت امروز */
  upCount: number;
  /** تعداد نمادهای منفی امروز */
  downCount: number;
  /** تعداد نمادهای بدون تغییر / بدون داده */
  flatCount: number;
  /** درصد نمادهای مثبت (۰–۱۰۰، گرد یک رقم)؛ null اگر جهان خالی */
  upPct: number | null;
  /** درصد نمادهای منفی */
  downPct: number | null;
  /** خالص ورود پول حقیقی کل (تومان)؛ null اگر پوشش < ۵۰ نماد */
  netFlowToman: number | null;
  /** تعداد نمادهایی که در محاسبهٔ جریان پوشش داشتند */
  flowCovered: number;
  /** جمع ارزش معاملات (تومان)؛ null اگر پوشش < ۵۰ نماد */
  totalValueToman: number | null;
  /** ۲–۳ صنعت با بیشترین ورود خالص پول حقیقی (مثبت‌ها فقط) */
  topInflowIndustries: { industry: string; flowToman: number }[];
}

/** پهنای روزانهٔ کل بازار از ردیف‌های اسنپ‌شات — تابع خالص (M1). */
export function computeDailyBreadth(stocks: BreadthStockLike[]): DailyBreadth {
  let up = 0;
  let down = 0;
  let flat = 0;
  let net = 0;
  let flowCovered = 0;
  let totalValue = 0;
  let valueCovered = 0;
  const indFlow = new Map<string, number>();

  for (const s of stocks) {
    const p = pct(s);
    if (p == null || p === 0) flat++;
    else if (p > 0) up++;
    else down++;

    const v = num(s.value);
    if (v != null) {
      totalValue += v;
      valueCovered++;
    }

    const flow = realFlow(s);
    if (flow != null) {
      net += flow;
      flowCovered++;
      const ind = typeof s.industry === "string" && s.industry.trim() ? s.industry.trim() : null;
      if (ind) indFlow.set(ind, (indFlow.get(ind) ?? 0) + flow);
    }
  }

  const universe = stocks.length;
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const topInflowIndustries = [...indFlow.entries()]
    .filter(([, f]) => f > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([industry, flowToman]) => ({ industry, flowToman }));

  return {
    universe,
    upCount: up,
    downCount: down,
    flatCount: flat,
    upPct: universe > 0 ? round1((up / universe) * 100) : null,
    downPct: universe > 0 ? round1((down / universe) * 100) : null,
    netFlowToman: flowCovered >= 50 ? net : null,
    flowCovered,
    totalValueToman: valueCovered >= 50 ? totalValue : null,
    topInflowIndustries,
  };
}

// ---------------------------------------------------------------------------
// M3 — میز صنایع: رتبه‌بندی صنایع با جریان پول و پهنا
// ---------------------------------------------------------------------------

export interface IndustryRow {
  industry: string;
  /** تعداد نمادهای صنعت در اسنپ‌شات */
  symbolCount: number;
  /** خالص ورود/خروج پول حقیقی صنعت (تومان)؛ null اگر هیچ نمادی پوشش نداشت */
  netFlowToman: number | null;
  /** تعداد نمادهای دارای پوشش جریان */
  flowCovered: number;
  /** تعداد نمادهای مثبت */
  upCount: number;
  /** تعداد نمادهای منفی */
  downCount: number;
  /** جمع ارزش معاملات صنعت (تومان) */
  valueToman: number;
  /** سهم صنعت از کل ارزش معاملات بازار (۰–۱۰۰، گرد یک رقم)؛ null اگر کل صفر */
  valueSharePct: number | null;
  /** جمع ارزش بازار صنعت (تومان) */
  marketCapToman: number;
  /** میانگین وزنی تغییر صنعت (وزن = ارزش بازار)؛ null اگر داده ناکافی */
  weightedChangePct: number | null;
}

export interface IndustryDesk {
  rows: IndustryRow[];
  /** جمع ارزش معاملات نمادهای دارای صنعت (تومان) */
  totalValueToman: number;
  /** ارزش معاملات کل بازار شامل نمادهای بی‌صنعت (تومان) */
  marketTotalValueToman: number;
  /** تعداد نمادهای بدون صنعت (حذف صادقانه از میز) */
  excludedNoIndustry: number;
}

/** میز صنایع از ردیف‌های اسنپ‌شات — تابع خالص (M3). مرتب‌سازی پیش‌فرض: خالص ورود پول. */
export function computeIndustryDesk(stocks: BreadthStockLike[]): IndustryDesk {
  interface Acc {
    symbolCount: number;
    flow: number;
    flowCovered: number;
    up: number;
    down: number;
    value: number;
    mcap: number;
    wChangeNum: number; // Σ (change% × mcap)
    wChangeDen: number; // Σ mcap (فقط نمادهای دارای هر دو)
  }
  const acc = new Map<string, Acc>();
  let marketTotalValue = 0;
  let excluded = 0;

  for (const s of stocks) {
    const v = num(s.value) ?? 0;
    marketTotalValue += v;

    const ind = typeof s.industry === "string" && s.industry.trim() ? s.industry.trim() : null;
    if (!ind) {
      excluded++;
      continue;
    }
    let a = acc.get(ind);
    if (!a) {
      a = { symbolCount: 0, flow: 0, flowCovered: 0, up: 0, down: 0, value: 0, mcap: 0, wChangeNum: 0, wChangeDen: 0 };
      acc.set(ind, a);
    }
    a.symbolCount++;
    a.value += v;

    const p = pct(s);
    if (p != null && p > 0) a.up++;
    else if (p != null && p < 0) a.down++;

    const flow = realFlow(s);
    if (flow != null) {
      a.flow += flow;
      a.flowCovered++;
    }

    const mc = num(s.marketValue);
    if (mc != null && mc > 0) {
      a.mcap += mc;
      if (p != null) {
        a.wChangeNum += p * mc;
        a.wChangeDen += mc;
      }
    }
  }

  const totalValueWithIndustry = [...acc.values()].reduce((s, a) => s + a.value, 0);
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const round2 = (x: number) => Math.round(x * 100) / 100;

  const rows: IndustryRow[] = [...acc.entries()].map(([industry, a]) => ({
    industry,
    symbolCount: a.symbolCount,
    netFlowToman: a.flowCovered > 0 ? a.flow : null,
    flowCovered: a.flowCovered,
    upCount: a.up,
    downCount: a.down,
    valueToman: a.value,
    valueSharePct: marketTotalValue > 0 ? round1((a.value / marketTotalValue) * 100) : null,
    marketCapToman: a.mcap,
    weightedChangePct: a.wChangeDen > 0 ? round2(a.wChangeNum / a.wChangeDen) : null,
  }));

  rows.sort((a, b) => (b.netFlowToman ?? -Infinity) - (a.netFlowToman ?? -Infinity));

  return {
    rows,
    totalValueToman: totalValueWithIndustry,
    marketTotalValueToman: marketTotalValue,
    excludedNoIndustry: excluded,
  };
}
