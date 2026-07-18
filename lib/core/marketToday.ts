// محاسبات خالص داشبورد «امروز بازار» — نبض بازار، صف‌ها، جریان پول حقیقی، برترین‌ها.
// منبع: اسنپ‌شات موجود رله (IrStockRow) — صفر درخواست جدید به BrsApi.
// قانون سخت: دادهٔ غایب → null/خالی؛ هیچ عدد ساختگی. همهٔ توابع pure و تست‌پذیر.
import type { IrStockRow } from "@/lib/market-ir";

/* ── نبض بازار: هیستوگرام پراکندگی بازدهی ─────────────────────────────── */

export interface PulseBucket {
  /** برچسب فارسی بازه */
  label: string;
  /** حد پایین/بالا (درصد) — برای رنگ‌بندی UI */
  min: number;
  max: number;
  count: number;
}

export interface MarketPulse {
  buckets: PulseBucket[];
  posCount: number;
  negCount: number;
  flatCount: number;
  totalTraded: number;
  /** درصد نمادهای مثبت از کل معامله‌شده (۰..۱۰۰) — null اگر هیچ معامله‌ای نبود */
  posShare: number | null;
}

const BUCKET_DEFS: Array<{ label: string; min: number; max: number }> = [
  { label: "بیش از ۴٪+", min: 4, max: Infinity },
  { label: "۲ تا ۴٪+", min: 2, max: 4 },
  { label: "۰.۵ تا ۲٪+", min: 0.5, max: 2 },
  { label: "±۰.۵٪", min: -0.5, max: 0.5 },
  { label: "−۰.۵ تا −۲٪", min: -2, max: -0.5 },
  { label: "−۲ تا −۴٪", min: -4, max: -2 },
  { label: "کمتر از −۴٪", min: -Infinity, max: -4 },
];

/** درصد تغییر مبنا: پایانی (closingChangePercent)؛ نبودش → آخرین (changePercent). */
export function rowChangePercent(r: IrStockRow): number | null {
  const cp = r.closingChangePercent;
  if (typeof cp === "number" && isFinite(cp)) return cp;
  const lp = r.changePercent;
  if (typeof lp === "number" && isFinite(lp)) return lp;
  return null;
}

/** فقط نمادهای معامله‌شدهٔ امروز (ارزش > ۰). */
export function tradedRows(stocks: IrStockRow[]): IrStockRow[] {
  return (stocks || []).filter((r) => Number(r?.value) > 0);
}

export function computeMarketPulse(stocks: IrStockRow[]): MarketPulse {
  const traded = tradedRows(stocks);
  const buckets = BUCKET_DEFS.map((b) => ({ ...b, count: 0 }));
  let pos = 0, neg = 0, flat = 0;
  for (const r of traded) {
    const cp = rowChangePercent(r);
    if (cp === null) continue;
    if (cp > 0.5) pos++;
    else if (cp < -0.5) neg++;
    else flat++;
    for (const b of buckets) {
      // بازه‌ها نیم‌باز: [min, max) برای مثبت‌ها و (min, max] برای منفی‌ها — با
      // تعریف زیر هر عدد دقیقاً در یک سطل می‌افتد.
      if (b.min === -Infinity ? cp < b.max : b.max === Infinity ? cp >= b.min : cp >= b.min && cp < b.max) {
        b.count++;
        break;
      }
    }
  }
  const total = pos + neg + flat;
  return {
    buckets,
    posCount: pos,
    negCount: neg,
    flatCount: flat,
    totalTraded: traded.length,
    posShare: total > 0 ? (pos / total) * 100 : null,
  };
}

/* ── صف‌های خرید و فروش ────────────────────────────────────────────────── */

export interface QueueItem {
  id: string;
  faName: string;
  /** ارزش تقریبی صف = حجم سطر اول × قیمت سطر اول (تومان) */
  queueValueToman: number;
  changePercent: number | null;
}

export interface QueuesSummary {
  buy: QueueItem[];
  sell: QueueItem[];
  buyCount: number;
  sellCount: number;
  buyValueToman: number;
  sellValueToman: number;
  /** آیا فیلدهای دفتر سفارش اصلاً در داده هست؟ (برای حالت خالی صادق) */
  fieldsAvailable: boolean;
}

/** صف خرید: بهترین تقاضا روی سقف دامنه و عرضهٔ سطر اول صفر. فیلد غایب → قضاوت نمی‌شود. */
export function isBuyQueueRow(r: IrStockRow): boolean {
  return (
    Number(r?.bandHigh) > 0 &&
    Number(r?.bestBidPrice) > 0 &&
    typeof r?.bestAskVolume === "number" &&
    Number(r.bestBidPrice) >= Number(r.bandHigh) &&
    r.bestAskVolume === 0
  );
}

/** صف فروش: بهترین عرضه روی کف دامنه و تقاضای سطر اول صفر. */
export function isSellQueueRow(r: IrStockRow): boolean {
  return (
    Number(r?.bandLow) > 0 &&
    Number(r?.bestAskPrice) > 0 &&
    typeof r?.bestBidVolume === "number" &&
    Number(r.bestAskPrice) <= Number(r.bandLow) &&
    r.bestBidVolume === 0
  );
}

/** صف‌ها را می‌سازد؛ هر فهرست نزولی بر اساس ارزش صف. topN پیش‌فرض ۸. */
export function computeQueues(stocks: IrStockRow[], topN = 8): QueuesSummary {
  const rows = stocks || [];
  const fieldsAvailable = rows.some(
    (r) => typeof r?.bestBidVolume === "number" || typeof r?.bestAskVolume === "number",
  );
  const buy: QueueItem[] = [];
  const sell: QueueItem[] = [];
  let buyVal = 0, sellVal = 0;
  for (const r of rows) {
    if (isBuyQueueRow(r)) {
      const v = (Number(r.bestBidVolume) || 0) * (Number(r.bestBidPrice) || 0);
      buyVal += v;
      buy.push({ id: r.id, faName: r.faName, queueValueToman: v, changePercent: rowChangePercent(r) });
    } else if (isSellQueueRow(r)) {
      const v = (Number(r.bestAskVolume) || 0) * (Number(r.bestAskPrice) || 0);
      sellVal += v;
      sell.push({ id: r.id, faName: r.faName, queueValueToman: v, changePercent: rowChangePercent(r) });
    }
  }
  buy.sort((a, b) => b.queueValueToman - a.queueValueToman);
  sell.sort((a, b) => b.queueValueToman - a.queueValueToman);
  return {
    buy: buy.slice(0, topN),
    sell: sell.slice(0, topN),
    buyCount: buy.length,
    sellCount: sell.length,
    buyValueToman: buyVal,
    sellValueToman: sellVal,
    fieldsAvailable,
  };
}

/* ── جریان پول حقیقی امروز ─────────────────────────────────────────────── */

export interface MoneyFlowToday {
  /** خالص خرید حقیقی کل بازار (تومان؛ منفی = خروج) — null اگر داده نبود */
  netRealFlowToman: number | null;
  /** سرانهٔ خرید هر کد حقیقی (تومان) */
  perCapitaBuyToman: number | null;
  /** سرانهٔ فروش هر کد حقیقی (تومان) */
  perCapitaSellToman: number | null;
  /** نسبت قدرت خریدار به فروشنده (سرانهٔ خرید ÷ سرانهٔ فروش) */
  powerRatio: number | null;
}

export function computeMoneyFlow(stocks: IrStockRow[]): MoneyFlowToday {
  const traded = tradedRows(stocks);
  let buyToman = 0, sellToman = 0, buyCnt = 0, sellCnt = 0;
  let any = false;
  for (const r of traded) {
    const close = Number(r.closingPrice) || 0;
    if (close <= 0) continue;
    const bi = Number(r.buyI) || 0;
    const si = Number(r.sellI) || 0;
    if (bi > 0 || si > 0) any = true;
    buyToman += bi * close;
    sellToman += si * close;
    buyCnt += Number(r.buyCountI) || 0;
    sellCnt += Number(r.sellCountI) || 0;
  }
  if (!any) return { netRealFlowToman: null, perCapitaBuyToman: null, perCapitaSellToman: null, powerRatio: null };
  const pcb = buyCnt > 0 ? buyToman / buyCnt : null;
  const pcs = sellCnt > 0 ? sellToman / sellCnt : null;
  return {
    netRealFlowToman: buyToman - sellToman,
    perCapitaBuyToman: pcb,
    perCapitaSellToman: pcs,
    powerRatio: pcb !== null && pcs !== null && pcs > 0 ? pcb / pcs : null,
  };
}

/* ── روند تاریخی جریان پول (از market_breadth؛ ریال → تومان) ──────────── */

export interface BreadthRow {
  jdate: string;
  net_real_flow: number | null;
  per_capita_buy: number | null;
  per_capita_sell: number | null;
  trade_value: number | null;
  pos_count: number | null;
  neg_count: number | null;
  total_traded: number | null;
}

export interface FlowTrendPoint {
  jdate: string;
  /** خالص خرید حقیقی (میلیارد تومان) */
  netFlowBToman: number;
}

/** ردیف‌های market_breadth → نقاط روند مرتب صعودی. ردیف بی‌داده حذف؛ jdate تکراری فقط اولی. */
export function buildFlowTrend(rows: BreadthRow[]): FlowTrendPoint[] {
  const seen = new Set<string>();
  return (rows || [])
    .filter((r) => {
      if (!r?.jdate || seen.has(r.jdate)) return false;
      if (typeof r.net_real_flow !== "number" || !isFinite(r.net_real_flow)) return false;
      seen.add(r.jdate);
      return true;
    })
    .sort((a, b) => a.jdate.localeCompare(b.jdate))
    .map((r) => ({
      jdate: r.jdate,
      // ریال → میلیارد تومان: ÷۱۰ (تومان) ÷ ۱e9
      netFlowBToman: (Number(r.net_real_flow) / 10) / 1e9,
    }));
}

/* ── برترین‌های امروز ─────────────────────────────────────────────────── */

export interface TopItem {
  id: string;
  faName: string;
  changePercent: number | null;
  /** ارزش معاملات (ریال خام اسنپ‌شات) */
  value: number;
  /** خالص خرید حقیقی (تومان) */
  netRealToman: number | null;
}

function toTopItem(r: IrStockRow): TopItem {
  const close = Number(r.closingPrice) || 0;
  const bi = Number(r.buyI) || 0;
  const si = Number(r.sellI) || 0;
  return {
    id: r.id,
    faName: r.faName,
    changePercent: rowChangePercent(r),
    value: Number(r.value) || 0,
    netRealToman: close > 0 && (bi > 0 || si > 0) ? (bi - si) * close : null,
  };
}

export interface TopLists {
  gainers: TopItem[];
  losers: TopItem[];
  byValue: TopItem[];
  byNetReal: TopItem[];
}

/** چهار فهرست برتر از نمادهای معامله‌شده. n پیش‌فرض ۵. */
export function computeTopLists(stocks: IrStockRow[], n = 5): TopLists {
  const traded = tradedRows(stocks).map(toTopItem);
  const withCp = traded.filter((t) => t.changePercent !== null);
  const gainers = [...withCp].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0)).slice(0, n);
  const losers = [...withCp].sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0)).slice(0, n);
  const byValue = [...traded].sort((a, b) => b.value - a.value).slice(0, n);
  const byNetReal = traded
    .filter((t) => t.netRealToman !== null)
    .sort((a, b) => (b.netRealToman ?? 0) - (a.netRealToman ?? 0))
    .slice(0, n);
  return { gainers, losers, byValue, byNetReal };
}

/* ── اسپارک‌لاین‌های نوار وضعیت ─────────────────────────────────────────── */

export interface SparkPoint {
  label: string;
  value: number;
}

/** سری عددی خام → نقاط اسپارک‌لاین معتبر (فقط عددهای مثبت متناهی، مرتب به همان ترتیب ورودی). */
export function toSparkPoints(rows: Array<{ label: string; value: unknown }>): SparkPoint[] {
  return (rows || [])
    .filter((r) => r && typeof r.label === "string" && isFinite(Number(r.value)) && Number(r.value) > 0)
    .map((r) => ({ label: r.label, value: Number(r.value) }));
}
