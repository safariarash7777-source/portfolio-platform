import "server-only";

// دادهٔ بازارِ ایران (طلا/سکه، ارزِ تومانی، صندوق‌ها، سهام) از «رلهٔ داخل ایران».
// چرا رله؟ همهٔ منابعِ ایرانی (tgju، brsapi، navasan، …) درخواستِ IPِ خارجی را
// ۴۰۳ می‌دهند؛ سرورهای Vercel خارج از ایران‌اند، پس یک سرویسِ کوچک داخل ایران
// (پوشهٔ relay/ همین ریپو) داده را می‌کشد و اینجا فقط از آن می‌خوانیم.
// بدون IR_MARKET_RELAY_URL این ماژول ساکت null برمی‌گرداند — هیچ عدد ساختگی.
//
// عیب‌یابی: هر تلاشِ اتصال در lastDiag ثبت می‌شود (بدونِ هیچ سکرت). با
// GET /api/market?diag=1 آن را ببین تا بفهمی کدام حلقه شکسته (env؟ توکن؟ رلهٔ
// خاموش؟ منبعِ خالی؟ تایم‌اوت؟). getLastIrDiag() همان را برمی‌گرداند.

export interface IrRow {
  id: string;
  faName: string;
  price: number;           // تومان، مگر unit چیز دیگری بگوید
  unit: "toman" | "usd";
  change?: number | null;  // درصد (روزانه/۲۴ساعته)
  type?: string;           // دستهٔ فارسیِ صندوق (طلا/سهامی/اهرمی/…) — فقط برای funds
  assetB?: number | null;  // خالص دارایی، میلیارد تومان — فقط برای funds (نقشهٔ بازار)
}

export interface IrMarket {
  gold: IrRow[];
  currency: IrRow[];
  funds: IrRow[];
  stocks: IrRow[];
  fetchedAt: number;
  ok: boolean;
}

// خلاصهٔ تشخیصیِ آخرین تلاشِ اتصال به رله — امن برای نمایشِ عمومی (هیچ توکن/سکرتی).
export interface IrDiag {
  at: number;                 // زمانِ تلاش
  urlConfigured: boolean;     // IR_MARKET_RELAY_URL ست شده؟
  tokenConfigured: boolean;   // IR_MARKET_RELAY_TOKEN ست شده؟
  reachedRelay: boolean;      // پاسخِ HTTP از رله گرفتیم؟
  status: number | null;      // کدِ HTTPِ رله (401=توکن، 404=مسیر، …)؛ null اگر اصلاً نرسید
  ok: boolean;                // دادهٔ قابل‌استفاده گرفتیم؟
  fromCache: boolean;         // کشِ کهنه سرو شد
  counts: { gold: number; currency: number; funds: number; stocks: number } | null;
  error: string | null;      // نوعِ خطا اگر fetch ترکید (TimeoutError/…)، بدونِ سکرت
  ms: number;                 // مدتِ تلاش
}

const CACHE_MS = 5 * 60 * 1000;
const RELAY_TIMEOUT_MS = 9000; // کمی بیشتر از ۸ثانیه برای تحملِ تأخیرِ مرزیِ ایران→خارج
let cache: IrMarket | null = null;
let lastDiag: IrDiag | null = null;

/** آخرین خلاصهٔ تشخیصیِ اتصال به رله (برای /api/market?diag=1). بدونِ سکرت. */
export function getLastIrDiag(): IrDiag | null {
  return lastDiag;
}

function countsOf(m: IrMarket): IrDiag["counts"] {
  return { gold: m.gold.length, currency: m.currency.length, funds: m.funds.length, stocks: m.stocks.length };
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
      ...(typeof r.type === "string" ? { type: r.type } : {}),
      ...(typeof r.assetB === "number" && isFinite(r.assetB) ? { assetB: r.assetB } : {}),
    }));
}

/** دادهٔ بازار ایران از رله؛ بدون env یا در خطا → null (UI آن بخش را نشان نمی‌دهد). */
export async function getIrMarket(): Promise<IrMarket | null> {
  const started = Date.now();
  const base = process.env.IR_MARKET_RELAY_URL;
  const token = process.env.IR_MARKET_RELAY_TOKEN;

  // پایهٔ رکوردِ تشخیصی؛ در هر مسیرِ خروج کامل و ثبت می‌شود.
  const diag: IrDiag = {
    at: started,
    urlConfigured: Boolean(base),
    tokenConfigured: Boolean(token),
    reachedRelay: false,
    status: null,
    ok: false,
    fromCache: false,
    counts: null,
    error: null,
    ms: 0,
  };
  const finish = <T>(value: T): T => {
    diag.ms = Date.now() - started;
    lastDiag = diag;
    return value;
  };

  if (!base) return finish(null); // urlConfigured=false → env روی Vercel ست/Redeploy نشده
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    diag.ok = true;
    diag.fromCache = true;
    diag.counts = countsOf(cache);
    return finish(cache);
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base.replace(/\/+$/, "")}/market.json`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    diag.reachedRelay = true;
    diag.status = res.status;
    if (!res.ok) {
      // 401=توکنِ ناهماهنگ · 404=URLِ اشتباه · 5xx=رله مشکل دارد. کشِ کهنه بهتر از هیچ.
      diag.fromCache = Boolean(cache);
      diag.counts = cache ? countsOf(cache) : null;
      diag.ok = Boolean(cache);
      return finish(cache);
    }
    const json = await res.json();
    const data: IrMarket = {
      gold: asRows(json.gold),
      currency: asRows(json.currency),
      funds: asRows(json.funds),
      stocks: asRows(json.stocks),
      fetchedAt: Date.now(),
      ok: true,
    };
    data.ok = data.gold.length + data.currency.length + data.funds.length + data.stocks.length > 0;
    diag.counts = countsOf(data);
    if (data.ok) {
      cache = data;
      diag.ok = true;
      return finish(data);
    }
    // پاسخِ ۲۰۰ ولی همه‌چیز خالی → منابعِ رله جواب نداده‌اند (رلهٔ /debug را ببین).
    diag.fromCache = Boolean(cache);
    diag.ok = Boolean(cache);
    return finish(cache);
  } catch (e) {
    // معمولاً TimeoutError (رله دیر جواب داد/در دسترس نیست) یا خطای شبکه.
    diag.error = e instanceof Error ? e.name || e.message : String(e);
    diag.fromCache = Boolean(cache);
    diag.ok = Boolean(cache);
    diag.counts = cache ? countsOf(cache) : null;
    return finish(cache);
  }
}
