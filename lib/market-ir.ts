import { withDeadline } from "./deadline";
import { validTimestamp } from "./market-quality";
// دادهٔ بازارِ ایران (طلا/سکه، ارزِ تومانی، صندوق‌ها، سهام، شاخص، کریپتو).
//
// معماری (چرا این‌طوری): منابعِ ایرانی به IPِ خارجی ۴۰۳ می‌دهند، پس یک «رلهٔ
// داخل ایران» (پوشهٔ relay/) داده را می‌کشد. اما به‌خاطرِ قطعیِ اینترنتِ بین‌الملل،
// سرورِ Vercel (خارج) نمی‌تواند زنده به رله وصل شود. راه‌حل: رله داده را به
// Supabase «می‌فرستد» (خروجی از سمتِ ایران، که تحمل‌پذیرتر است) و سایت از
// Supabase — که از همه‌جای دنیا در دسترس است — «می‌خواند». این‌طوری سایت به
// اتصالِ لحظه‌ایِ ایران↔خارج وابسته نیست و همیشه آخرین اسنپ‌شاتِ موفق را نشان می‌دهد.
//
// منبعِ اول: اسنپ‌شاتِ Supabase (جدولِ ir_market_snapshots، key='latest').
// منبعِ دوم (فقط اگر Supabase نبود/خالی بود): fetchِ زندهٔ رله (کارِ قدیمی؛ وقتی
// لینک بالا باشد). بدونِ هیچ‌کدام → null و UI آن بخش را نشان نمی‌دهد (هیچ عددِ ساختگی).
//
// عیب‌یابی: هر تلاش در lastDiag ثبت می‌شود (بدونِ سکرت). با /api/market?diag=1 ببین.

export interface IrRow {
  id: string;
  faName: string;
  price: number;           // تومان، مگر unit چیز دیگری بگوید
  unit: "toman" | "usd";
  change?: number | null;  // مقدار تغییر (تومان/دلار)
  changePercent?: number | null; // درصد تغییر
  type?: string;           // دستهٔ فارسیِ صندوق (طلا/سهامی/اهرمی/…) — فقط برای funds
  sourceDate?: string | null;
  sourceTime?: string | null;
  assetB?: number | null;  // خالص دارایی، میلیارد تومان — فقط برای funds
}

/** ردیفِ غنی‌شدهٔ سهام/صندوق — شامل اطلاعات معاملاتی */
export interface IrStockRow extends IrRow {
  closingPrice?: number;
  closingChangePercent?: number | null;
  volume?: number;
  value?: number;
  marketValue?: number | null;
  industry?: string | null;
  industryId?: number | null;
  eps?: number | null;
  pe?: number | null;
  buyI?: number;
  buyN?: number;
  sellI?: number;
  sellN?: number;
  /** فقط صندوق‌ها — NAV ابطال (تومان)؛ رله ساعتی از Tsetmc/Nav می‌گیرد */
  nav?: number | null;
  /** NAV صدور (تومان) */
  navIssue?: number | null;
  navStatus?: string | null;
  navDate?: string | null;
  navTime?: string | null;
  /** حباب ٪ = (قیمت − NAV ابطال) ÷ NAV ابطال × ۱۰۰ — محاسبهٔ قطعیِ رله */
  bubblePercent?: number | null;
  /** سقف قیمت امروز (تومان) — best-effort رله (M7)؛ نبودن داده = null */
  dayHigh?: number | null;
  /** کف قیمت امروز (تومان) */
  dayLow?: number | null;
  /** تعداد خریداران حقیقی — best-effort رله (M7) */
  buyCountI?: number | null;
  /** تعداد فروشندگان حقیقی */
  sellCountI?: number | null;
  /** آستانهٔ مجاز بالای دامنه (تومان) — best-effort رله (داشبورد «امروز بازار») */
  bandHigh?: number | null;
  /** آستانهٔ مجاز پایین دامنه (تومان) */
  bandLow?: number | null;
  /** قیمت بهترین تقاضا — سطر اول دفتر سفارش (تومان) */
  bestBidPrice?: number | null;
  /** حجم بهترین تقاضا — سطر اول (صفر معنادار است) */
  bestBidVolume?: number | null;
  /** قیمت بهترین عرضه — سطر اول (تومان) */
  bestAskPrice?: number | null;
  /** حجم بهترین عرضه — سطر اول (صفر معنادار است) */
  bestAskVolume?: number | null;
}

/** ردیف قرارداد اختیار معامله (M8-ب) — قیمت‌ها تومان */
export interface IrOptionRow {
  id: string;
  sourceDate?: string | null;
  sourceTime?: string | null;
  contractSize?: number | null;
  /** Derived price unit; independent of the provider's transaction-value unit. */
  priceUnit?: "toman" | null;
  valueUnit?: "rial" | "toman" | null;
  valueSourceField?: "tval" | null;
  faName: string;
  /** نماد پایه (مثلاً وبملت) */
  baseId: string;
  type: "call" | "put";
  /** قیمت اعمال (تومان) */
  strike: number | null;
  /** سررسید (جلالی YYYY-MM-DD) */
  dateEnd: string | null;
  /** روز باقیمانده تا سررسید */
  dayRemain: number | null;
  /** موقعیت‌های باز */
  openInterest: number | null;
  /** آخرین قیمت (تومان) */
  price: number | null;
  /** قیمت پایانی (تومان) */
  closingPrice: number | null;
  volume: number | null;
  /** Transaction value in valueUnit; missing unit is unknown, never inferred. */
  value: number | null;
  trades: number | null;
}

/** ردیفِ کریپتو (از BrsApi) */
export interface IrCryptoRow {
  sourceDate?: string | null;
  sourceTime?: string | null;
  id: string;
  faName: string;
  nameEn?: string;
  price: number;
  unit: "usd";
  changePercent?: number | null;
  marketCap?: number | null;
  description?: string | null;
}

/** شاخص بورس */
export interface IrIndices {
  total: number;
  totalChange: number | null;
  equalWeight: number | null;
  equalWeightChange: number | null;
  marketValue: number | null;
  trades: number | null;
  volume: number | null;
  value: number | null;
  state: string | null;
  date: string | null;
  time: string | null;
}

export interface IrMarket {
  gold: IrRow[];
  currency: IrRow[];
  funds: IrStockRow[];
  stocks: IrStockRow[];
  crypto: IrCryptoRow[];
  /** تابلوی اختیار معامله (M8-ب) — خالی اگر رله هنوز نفرستاده */
  options: IrOptionRow[];
  indices: IrIndices | null;
  fetchedAt: number | null;
  ok: boolean;
  /** Input counts before validation; omitted by older callers, never an expected market universe. */
  inputRows?: Partial<Record<"gold" | "currency" | "funds" | "stocks" | "crypto" | "options", number>>;
}

// خلاصهٔ تشخیصیِ آخرین تلاش — امن برای نمایشِ عمومی (هیچ توکن/کلیدی).
export interface IrDiag {
  at: number;
  source: "supabase" | "relay" | null;
  supabaseConfigured: boolean;
  relayUrlConfigured: boolean;
  reached: boolean;
  status: number | null;
  ok: boolean;
  fromCache: boolean;
  ageSec: number | null;
  counts: { gold: number; currency: number; funds: number; stocks: number; crypto: number } | null;
  error: string | null;
  ms: number;
}

const CACHE_MS = 60 * 1000; // کشِ کوتاهِ سایت؛ رله هر ~۵دقیقه به Supabase می‌نویسد.
const READ_TIMEOUT_MS = 5000;
let cache: IrMarket | null = null;
let cacheAt = 0;
let cacheSource: "supabase" | "relay" | null = null;
let lastDiag: IrDiag | null = null;

/** آخرین خلاصهٔ تشخیصی (برای /api/market?diag=1). بدونِ سکرت. */
export function getLastIrDiag(): IrDiag | null {
  return lastDiag;
}

function countsOf(m: IrMarket): NonNullable<IrDiag["counts"]> {
  return {
    gold: m.gold.length,
    currency: m.currency.length,
    funds: m.funds.length,
    stocks: m.stocks.length,
    crypto: m.crypto.length,
  };
}

function asRows(v: unknown): IrRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (r): r is IrRow =>
        !!r &&
        typeof r.id === "string" &&
        typeof r.faName === "string" &&
        typeof r.price === "number" &&
        isFinite(r.price) &&
        (r.unit === "toman" || r.unit === "usd")
    )
    .map((r) => ({
      id: r.id,
      sourceDate: typeof r.sourceDate === "string" ? r.sourceDate : null,
      sourceTime: typeof r.sourceTime === "string" ? r.sourceTime : null,
      faName: r.faName,
      price: r.price,
      unit: r.unit,
      change: typeof r.change === "number" && isFinite(r.change) ? r.change : null,
      changePercent: typeof r.changePercent === "number" && isFinite(r.changePercent) ? r.changePercent : null,
      ...(typeof r.type === "string" ? { type: r.type } : {}),
      ...(typeof r.assetB === "number" && isFinite(r.assetB) ? { assetB: r.assetB } : {}),
    }));
}

export function asStockRows(v: unknown): IrStockRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (r): r is IrStockRow =>
        !!r &&
        typeof r.id === "string" &&
        typeof r.faName === "string" &&
        typeof r.price === "number" &&
        isFinite(r.price) &&
        (r.unit === "toman" || r.unit === "usd")
    )
    .map((r) => ({
      id: r.id,
      sourceDate: typeof r.sourceDate === "string" ? r.sourceDate : null,
      sourceTime: typeof r.sourceTime === "string" ? r.sourceTime : null,
      faName: r.faName,
      price: r.price,
      unit: r.unit,
      change: typeof r.change === "number" && isFinite(r.change) ? r.change : null,
      changePercent: typeof r.changePercent === "number" && isFinite(r.changePercent) ? r.changePercent : null,
      ...(typeof r.type === "string" && r.type ? { type: r.type } : {}),
      closingPrice: typeof r.closingPrice === "number" ? r.closingPrice : undefined,
      closingChangePercent: typeof r.closingChangePercent === "number" ? r.closingChangePercent : null,
      volume: typeof r.volume === "number" && isFinite(r.volume) && r.volume >= 0 ? r.volume : undefined,
      value: typeof r.value === "number" && isFinite(r.value) && r.value >= 0 ? r.value : undefined,
      marketValue: typeof r.marketValue === "number" ? r.marketValue : null,
      industry: typeof r.industry === "string" ? r.industry : null,
      industryId: typeof r.industryId === "number" ? r.industryId : null,
      eps: typeof r.eps === "number" ? r.eps : null,
      pe: typeof r.pe === "number" ? r.pe : null,
      buyI: typeof r.buyI === "number" && isFinite(r.buyI) && r.buyI >= 0 ? r.buyI : undefined,
      buyN: typeof r.buyN === "number" && isFinite(r.buyN) && r.buyN >= 0 ? r.buyN : undefined,
      sellI: typeof r.sellI === "number" && isFinite(r.sellI) && r.sellI >= 0 ? r.sellI : undefined,
      sellN: typeof r.sellN === "number" && isFinite(r.sellN) && r.sellN >= 0 ? r.sellN : undefined,
      nav: typeof r.nav === "number" && isFinite(r.nav) && r.nav > 0 ? r.nav : null,
      navIssue:
        typeof r.navIssue === "number" && isFinite(r.navIssue) && r.navIssue > 0 ? r.navIssue : null,
      navStatus: typeof r.navStatus === "string" ? r.navStatus : null,
      navDate: typeof r.navDate === "string" ? r.navDate : null,
      navTime: typeof r.navTime === "string" ? r.navTime : null,
      bubblePercent:
        typeof r.bubblePercent === "number" && isFinite(r.bubblePercent) ? r.bubblePercent : null,
      dayHigh: typeof r.dayHigh === "number" && isFinite(r.dayHigh) && r.dayHigh > 0 ? r.dayHigh : null,
      dayLow: typeof r.dayLow === "number" && isFinite(r.dayLow) && r.dayLow > 0 ? r.dayLow : null,
      buyCountI:
        typeof r.buyCountI === "number" && isFinite(r.buyCountI) && r.buyCountI > 0 ? r.buyCountI : null,
      sellCountI:
        typeof r.sellCountI === "number" && isFinite(r.sellCountI) && r.sellCountI > 0 ? r.sellCountI : null,
      // فیلدهای تشخیص صف — حجم صفر معنادار است (عرضهٔ صفر = شرط صف خرید)، پس >=0 پذیرفته می‌شود.
      bandHigh: typeof r.bandHigh === "number" && isFinite(r.bandHigh) && r.bandHigh > 0 ? r.bandHigh : null,
      bandLow: typeof r.bandLow === "number" && isFinite(r.bandLow) && r.bandLow > 0 ? r.bandLow : null,
      bestBidPrice:
        typeof r.bestBidPrice === "number" && isFinite(r.bestBidPrice) && r.bestBidPrice > 0 ? r.bestBidPrice : null,
      bestBidVolume:
        typeof r.bestBidVolume === "number" && isFinite(r.bestBidVolume) && r.bestBidVolume >= 0 ? r.bestBidVolume : null,
      bestAskPrice:
        typeof r.bestAskPrice === "number" && isFinite(r.bestAskPrice) && r.bestAskPrice > 0 ? r.bestAskPrice : null,
      bestAskVolume:
        typeof r.bestAskVolume === "number" && isFinite(r.bestAskVolume) && r.bestAskVolume >= 0 ? r.bestAskVolume : null,
    }));
}

function asOptionRows(v: unknown): IrOptionRow[] {
  if (!Array.isArray(v)) return [];
  const numOrNull = (x: unknown): number | null =>
    typeof x === "number" && isFinite(x) ? x : null;
  return v
    .filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof (r as Record<string, unknown>).id === "string" &&
        ((r as Record<string, unknown>).type === "call" || (r as Record<string, unknown>).type === "put")
    )
    .map((r) => ({
      id: String(r.id),
      sourceDate: typeof r.sourceDate === "string" ? r.sourceDate : null,
      sourceTime: typeof r.sourceTime === "string" ? r.sourceTime : null,
      contractSize: typeof r.contractSize === "number" && Number.isSafeInteger(r.contractSize) && r.contractSize > 0 ? r.contractSize : null,
      priceUnit: r.priceUnit === "toman" ? "toman" as const : null,
      valueUnit: r.valueUnit === "rial" || r.valueUnit === "toman" ? r.valueUnit : null,
      valueSourceField: r.valueSourceField === "tval" ? "tval" as const : null,
      faName: typeof r.faName === "string" ? r.faName : String(r.id),
      baseId: typeof r.baseId === "string" ? r.baseId : "",
      type: r.type as "call" | "put",
      strike: numOrNull(r.strike),
      dateEnd: typeof r.dateEnd === "string" ? r.dateEnd : null,
      dayRemain: numOrNull(r.dayRemain),
      openInterest: numOrNull(r.openInterest),
      price: numOrNull(r.price),
      closingPrice: numOrNull(r.closingPrice),
      volume: numOrNull(r.volume),
      value: numOrNull(r.value),
      trades: numOrNull(r.trades),
    }));
}

function asCryptoRows(v: unknown): IrCryptoRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (r): r is IrCryptoRow =>
        !!r &&
        typeof r.id === "string" &&
        typeof r.faName === "string" &&
        typeof r.price === "number" &&
        isFinite(r.price) &&
        r.price > 0 &&
        r.unit === "usd"
    )
    .map((r) => ({
      id: r.id,
      sourceDate: typeof r.sourceDate === "string" ? r.sourceDate : null,
      sourceTime: typeof r.sourceTime === "string" ? r.sourceTime : null,
      faName: r.faName,
      nameEn: typeof r.nameEn === "string" ? r.nameEn : undefined,
      price: r.price,
      unit: "usd" as const,
      changePercent: typeof r.changePercent === "number" && isFinite(r.changePercent) ? r.changePercent : null,
      marketCap: typeof r.marketCap === "number" ? r.marketCap : null,
      description: typeof r.description === "string" ? r.description : null,
    }));
}

function asIndices(v: unknown): IrIndices | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const total = Number(d.total);
  if (!isFinite(total) || total <= 0) return null;
  return {
    total,
    totalChange: typeof d.totalChange === "number" && Number.isFinite(d.totalChange) ? d.totalChange : null,
    equalWeight: typeof d.equalWeight === "number" && Number.isFinite(d.equalWeight) ? d.equalWeight : null,
    equalWeightChange: typeof d.equalWeightChange === "number" && Number.isFinite(d.equalWeightChange) ? d.equalWeightChange : null,
    marketValue: typeof d.marketValue === "number" && Number.isFinite(d.marketValue) ? d.marketValue : null,
    trades: typeof d.trades === "number" && Number.isFinite(d.trades) ? d.trades : null,
    volume: typeof d.volume === "number" && Number.isFinite(d.volume) ? d.volume : null,
    value: typeof d.value === "number" && Number.isFinite(d.value) ? d.value : null,
    state: typeof d.state === "string" ? d.state : null,
    date: typeof d.date === "string" ? d.date : null,
    time: typeof d.time === "string" ? d.time : null,
  };
}

/** payload خام (از Supabase یا رله) → IrMarket با اعتبارسنجیِ سخت‌گیرانه. */
export function toMarket(payload: unknown): IrMarket {
  const p = (payload ?? {}) as Record<string, unknown>;
  const fetchedAt = validTimestamp(p.fetchedAt);
  const data: IrMarket = {
    gold: asRows(p.gold),
    currency: asRows(p.currency),
    funds: asStockRows(p.funds),
    stocks: asStockRows(p.stocks),
    crypto: asCryptoRows(p.crypto),
    options: asOptionRows(p.options),
    indices: asIndices(p.indices),
    fetchedAt,
    ok: false,
    inputRows: Object.fromEntries(["gold", "currency", "funds", "stocks", "crypto", "options"].map(key => [key, Array.isArray(p[key]) ? p[key].length : 0])),
  };
  data.ok = data.gold.length + data.currency.length + data.funds.length + data.stocks.length + data.crypto.length + data.options.length > 0 || data.indices !== null;
  return data;
}

/** منبعِ اول: آخرین اسنپ‌شاتِ بازار از Supabase (از همه‌جای دنیا در دسترس). */
async function readSupabase(diag: IrDiag, signal: AbortSignal): Promise<IrMarket | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  diag.supabaseConfigured = true;
  const res = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/ir_market_snapshots?key=eq.latest&select=payload`,
    {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
      cache: "no-store",
      signal,
    }
  );
  diag.reached = true;
  diag.status = res.status;
  if (!res.ok) { diag.error = `http_${res.status}`; return null; }
  const rows = (await res.json()) as Array<{ payload?: unknown }>;
  const payload = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  if (!payload) { diag.error = "empty_source"; return null; }
  const data = toMarket(payload);
  if (!data.ok) diag.error = "empty_source";
  return data.ok ? data : null;
}

/** منبعِ دوم (فقط وقتی Supabase نبود/خالی بود): fetchِ زندهٔ رله. */
async function readRelay(diag: IrDiag, signal: AbortSignal): Promise<IrMarket | null> {
  const base = process.env.IR_MARKET_RELAY_URL;
  if (!base) return null;
  diag.relayUrlConfigured = true;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.IR_MARKET_RELAY_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base.replace(/\/+$/, "")}/market.json`, {
    headers,
    cache: "no-store",
    signal,
  });
  diag.reached = true;
  diag.status = res.status;
  if (!res.ok) { diag.error = `http_${res.status}`; return null; }
  const data = toMarket(await res.json());
  if (!data.ok) diag.error = "empty_source";
  return data.ok ? data : null;
}

/** دادهٔ بازار ایران؛ Supabase (اول) → رله (دوم) → null. در خطا کشِ کهنه یا null. */
async function loadIrMarket(signal: AbortSignal): Promise<IrMarket | null> {
  const started = Date.now();
  const diag: IrDiag = {
    at: started,
    source: null,
    supabaseConfigured: false,
    relayUrlConfigured: false,
    reached: false,
    status: null,
    ok: false,
    fromCache: false,
    ageSec: null,
    counts: null,
    error: null,
    ms: 0,
  };
  const finish = <T>(value: T): T => {
    if (cache?.fetchedAt != null) diag.ageSec = Math.round((Date.now() - cache.fetchedAt) / 1000);
    diag.ms = Date.now() - started;
    lastDiag = diag;
    return value;
  };
  if (cache && cacheAt && Date.now() - cacheAt < CACHE_MS) {
    diag.source = cacheSource;
    diag.fromCache = true;
    diag.ok = true;
    diag.counts = countsOf(cache);
    return finish(cache);
  }
  // منبعِ اول: Supabase
  try {
    const fromSupabase = await readSupabase(diag, signal);
    if (fromSupabase && !signal.aborted) {
      diag.error = null;
      diag.source = "supabase";
      diag.ok = true;
      diag.counts = countsOf(fromSupabase);
      cache = fromSupabase;
      cacheAt = Date.now();
      cacheSource = "supabase";
      return finish(fromSupabase);
    }
  } catch (e) {
    diag.error = e instanceof Error ? e.name || e.message : String(e);
  }
  // منبعِ دوم: رلهٔ زنده (وقتی لینکِ بین‌الملل بالا باشد)
  try {
    const fromRelay = signal.aborted ? null : await readRelay(diag, signal);
    if (fromRelay && !signal.aborted) {
      diag.error = null;
      diag.source = "relay";
      diag.ok = true;
      diag.counts = countsOf(fromRelay);
      cache = fromRelay;
      cacheAt = Date.now();
      cacheSource = "relay";
      return finish(fromRelay);
    }
  } catch (e) {
    if (!diag.error) diag.error = e instanceof Error ? e.name || e.message : String(e);
  }
  // هیچ منبعی نداد → کشِ کهنه بهتر از هیچ؛ اگر کش هم نبود، null.
  if (cache) {
    diag.source = cacheSource;
    diag.fromCache = true;
    diag.ok = true;
    diag.counts = countsOf(cache);
  }
  return finish(cache);
}

let inflight: Promise<IrMarket | null> | null = null;
let retryAt = 0;
export function getCachedIrMarket(): IrMarket | null { return cache; }
export async function getIrMarket(): Promise<IrMarket | null> {
  if (Date.now() < retryAt) return cache;
  if (inflight) return inflight;
  inflight = withDeadline(loadIrMarket, READ_TIMEOUT_MS).catch(() => {
    lastDiag = { at: Date.now(), source: cacheSource, supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), relayUrlConfigured: Boolean(process.env.IR_MARKET_RELAY_URL), reached: false, status: null, ok: Boolean(cache), fromCache: Boolean(cache), ageSec: cache?.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 1000) : null, counts: cache ? countsOf(cache) : null, error: "DeadlineError", ms: READ_TIMEOUT_MS };
    return cache;
  }).then(result => { retryAt = lastDiag?.error ? Date.now() + 30000 : 0; return result; }).finally(() => { inflight = null; });
  return inflight;
}
