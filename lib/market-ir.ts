import "server-only";

// دادهٔ بازارِ ایران (طلا/سکه، ارزِ تومانی، صندوق‌ها، سهام) از «رلهٔ داخل ایران».
// چرا رله؟ همهٔ منابعِ ایرانی (tgju، brsapi، navasan، …) درخواستِ IPِ خارجی را
// ۴۰۳ می‌دهند؛ سرورهای Vercel خارج از ایران‌اند، پس یک سرویسِ کوچک داخل ایران
// (پوشهٔ relay/ همین ریپو) داده را می‌کشد و اینجا فقط از آن می‌خوانیم.
// بدون IR_MARKET_RELAY_URL این ماژول ساکت null برمی‌گرداند — هیچ عدد ساختگی.

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

const CACHE_MS = 5 * 60 * 1000;
let cache: IrMarket | null = null;

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
  const base = process.env.IR_MARKET_RELAY_URL;
  if (!base) return null;
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache;

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = process.env.IR_MARKET_RELAY_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base.replace(/\/+$/, "")}/market.json`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return cache; // کشِ کهنه بهتر از هیچ؛ اگر نبود، null
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
    if (data.ok) cache = data;
    return data.ok ? data : cache;
  } catch {
    return cache;
  }
}
