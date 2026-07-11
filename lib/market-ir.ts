import "server-only";

/**
 * کلاینت رلهٔ بازار ایران
 *
 * اگر env های IR_MARKET_RELAY_URL و IR_MARKET_RELAY_TOKEN ست شده باشند،
 * داده بازار ایران (طلا، ارز، صندوق‌ها) را از رله می‌گیرد.
 * در غیر این صورت، null برمی‌گرداند و سایت فقط داده کریپتو نشان می‌دهد.
 */

export interface IrMarketItem {
  id: string;
  faName: string;
  price: number;
  unit: "toman";
  change: number;
}

export interface IrMarketData {
  gold: IrMarketItem[];
  currency: IrMarketItem[];
  funds: IrMarketItem[];
  stocks: IrMarketItem[];
  fetchedAt: number;
}

const RELAY_URL = process.env.IR_MARKET_RELAY_URL || "";
const RELAY_TOKEN = process.env.IR_MARKET_RELAY_TOKEN || "";
const CACHE_MS = 5 * 60 * 1000;

let cache: { data: IrMarketData; at: number } | null = null;

/** آیا رله پیکربندی شده؟ */
export function isRelayConfigured(): boolean {
  return Boolean(RELAY_URL && RELAY_TOKEN);
}

/**
 * دریافت داده بازار ایران از رله.
 * اگر رله پیکربندی نشده باشد → null
 * اگر خطا بخورد → null (سایت graceful degrade می‌کند)
 */
export async function getIrMarketData(): Promise<IrMarketData | null> {
  if (!RELAY_URL || !RELAY_TOKEN) return null;

  // Cache check
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  try {
    const res = await fetch(`${RELAY_URL}/market.json`, {
      headers: { Authorization: `Bearer ${RELAY_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[market-ir] relay responded ${res.status}`);
      return cache?.data ?? null;
    }

    const data = (await res.json()) as IrMarketData;
    cache = { data, at: Date.now() };
    return data;
  } catch (e) {
    console.error("[market-ir] relay fetch error:", e instanceof Error ? e.message : "unknown");
    // Return stale cache if available
    return cache?.data ?? null;
  }
}
