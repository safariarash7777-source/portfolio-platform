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
}

/** ردیف قرارداد اختیار معامله (M8-ب) — قیمت‌ها تومان */
export interface IrOptionRow {
  id: string;
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
  /** ارزش معاملات (تومان) */
  value: number | null;
  trades: number | null;
}

/** ردیفِ کریپتو (از BrsApi) */
export interface IrCryptoRow {
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
  totalChange: number;
  equalWeight: number;
  equalWeightChange: number;
  marketValue: number;
  trades: number;
  volume: number;
  value: number;
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
  fetchedAt: number;
  ok: boolean;
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
const READ_TIMEOUT_MS = 8000;
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
      faName: r.faName,
      price: r.price,
      unit: r.unit,
      change: typeof r.change === "number" && isFinite(r.change) ? r.change : null,
      changePercent: typeof r.changePercent === "number" && isFinite(r.changePercent) ? r.changePercent : null,
      ...(typeof r.type === "string" ? { type: r.type } : {}),
      ...(typeof r.assetB === "number" && isFinite(r.assetB) ? { assetB: r.assetB } : {}),
    }));
}

function asStockRows(v: unknown): IrStockRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (r): r is IrStockRow =>
        !!r &&
        typeof r.id === "string" &&
        typeof r.faName === "string" &&
        typeof r.price === "number" &&
        isFinite(r.price)
    )
    .map((r) => ({
      id: r.id,
      faName: r.faName,
      price: r.price,
      unit: (r.unit === "usd" ? "usd" : "toman") as "toman" | "usd",
      change: typeof r.change === "number" && isFinite(r.change) ? r.change : null,
      changePercent: typeof r.changePercent === "number" && isFinite(r.changePercent) ? r.changePercent : null,
      ...(typeof r.type === "string" && r.type ? { type: r.type } : {}),
      closingPrice: typeof r.closingPrice === "number" ? r.closingPrice : undefined,
      closingChangePercent: typeof r.closingChangePercent === "number" ? r.closingChangePercent : null,
      volume: typeof r.volume === "number" ? r.volume : 0,
      value: typeof r.value === "number" ? r.value : 0,
      marketValue: typeof r.marketValue === "number" ? r.marketValue : null,
      industry: typeof r.industry === "string" ? r.industry : null,
      industryId: typeof r.industryId === "number" ? r.industryId : null,
      eps: typeof r.eps === "number" ? r.eps : null,
      pe: typeof r.pe === "number" ? r.pe : null,
      buyI: typeof r.buyI === "number" ? r.buyI : 0,
      buyN: typeof r.buyN === "number" ? r.buyN : 0,
      sellI: typeof r.sellI === "number" ? r.sellI : 0,
      sellN: typeof r.sellN === "number" ? r.sellN : 0,
      nav: typeof r.nav === "number" && isFinite(r.nav) && r.nav > 0 ? r.nav : null,
      navIssue:
        typeof r.navIssue === "number" && isFinite(r.navIssue) && r.navIssue > 0 ? r.navIssue : null,
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
        r.price > 0
    )
    .map((r) => ({
      id: r.id,
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
    totalChange: Number(d.totalChange) || 0,
    equalWeight: Number(d.equalWeight) || 0,
    equalWeightChange: Number(d.equalWeightChange) || 0,
    marketValue: Number(d.marketValue) || 0,
    trades: Number(d.trades) || 0,
    volume: Number(d.volume) || 0,
    value: Number(d.value) || 0,
    state: typeof d.state === "string" ? d.state : null,
    date: typeof d.date === "string" ? d.date : null,
    time: typeof d.time === "string" ? d.time : null,
  };
}

/** payload خام (از Supabase یا رله) → IrMarket با اعتبارسنجیِ سخت‌گیرانه. */
function toMarket(payload: unknown): IrMarket {
  const p = (payload ?? {}) as Record<string, unknown>;
  const fetchedAt = Number(p.fetchedAt);
  const data: IrMarket = {
    gold: asRows(p.gold),
    currency: asRows(p.currency),
    funds: asStockRows(p.funds),
    stocks: asStockRows(p.stocks),
    crypto: asCryptoRows(p.crypto),
    options: asOptionRows(p.options),
    indices: asIndices(p.indices),
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
    ok: false,
  };
  data.ok = data.gold.length + data.currency.length + data.funds.length + data.stocks.length > 0;
  return data;
}

/** منبعِ اول: آخرین اسنپ‌شاتِ بازار از Supabase (از همه‌جای دنیا در دسترس). */
async function readSupabase(diag: IrDiag): Promise<IrMarket | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  diag.supabaseConfigured = true;
  const res = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/ir_market_snapshots?key=eq.latest&select=payload`,
    {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    }
  );
  diag.reached = true;
  diag.status = res.status;
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ payload?: unknown }>;
  const payload = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  if (!payload) return null;
  const data = toMarket(payload);
  return data.ok ? data : null;
}

/** منبعِ دوم (فقط وقتی Supabase نبود/خالی بود): fetchِ زندهٔ رله. */
async function readRelay(diag: IrDiag): Promise<IrMarket | null> {
  const base = process.env.IR_MARKET_RELAY_URL;
  if (!base) return null;
  diag.relayUrlConfigured = true;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.IR_MARKET_RELAY_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base.replace(/\/+$/, "")}/market.json`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  diag.reached = true;
  diag.status = res.status;
  if (!res.ok) return null;
  const data = toMarket(await res.json());
  return data.ok ? data : null;
}

/** دادهٔ بازار ایران؛ Supabase (اول) → رله (دوم) → null. در خطا کشِ کهنه یا null. */
export async function getIrMarket(): Promise<IrMarket | null> {
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
    if (cache) diag.ageSec = Math.round((Date.now() - cache.fetchedAt) / 1000);
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
    const fromSupabase = await readSupabase(diag);
    if (fromSupabase) {
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
    const fromRelay = await readRelay(diag);
    if (fromRelay) {
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
