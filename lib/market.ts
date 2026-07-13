import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/telegram";
import { toPersianDigits } from "@/lib/format";

// رصد بازار — منبعِ دادهٔ کریپتو: CoinGecko (کیلید نمی‌خواهد، قیمتِ واقعی دلاری).
// کشِ ۵دقیقه در سطح ماژول (per warm instance، مثل الگوی rate-limitِ waitlist).
// بورس تهران و طلا/ارز فعلاً منبعِ داده ندارند → حالتِ خالیِ صادقانه در UI،
// هیچ عددِ ساختگی. فقط سمت سرور اجرا می‌شود.

export interface CryptoRow {
  id: string;
  faName: string;
  symbol: string;
  price: number;
  change24h: number | null;
  image: string | null;
}

export interface MarketData {
  crypto: CryptoRow[];
  goldGlobal: CryptoRow[]; // انس طلا از توکنِ طلا-پشتوانه (دلاری)
  fetchedAt: number;
  ok: boolean; // false → منبع پاسخ نداد؛ UI حالتِ خالی نشان می‌دهد
}

// نمادهای کریپتوی رصدشده (id از CoinGecko) — فقط ۳ نماد اصلی.
// بقیه از BrsApi (relay) می‌آید و در ir.crypto قرار می‌گیرد.
const CRYPTO: { id: string; faName: string }[] = [
  { id: "bitcoin", faName: "بیت‌کوین" },
  { id: "ethereum", faName: "اتریوم" },
  { id: "solana", faName: "سولانا" },
];
// طلای جهانی از توکنِ طلا-پشتوانهٔ PAXG (هر توکن = یک انسِ طلای واقعی؛ قیمتِ
// واقعیِ بازار، منبعِ جهانیِ در دسترس از سرورهای خارج). برچسبِ UI صریح است.
const GOLD_TOKENS: { id: string; faName: string }[] = [
  { id: "pax-gold", faName: "انس طلا (PAXG)" },
];
const FA_BY_ID = new Map([...CRYPTO, ...GOLD_TOKENS].map((c) => [c.id, c.faName]));
const GOLD_IDS = new Set(GOLD_TOKENS.map((g) => g.id));

const CACHE_MS = 5 * 60 * 1000;
const COINGECKO = "https://api.coingecko.com/api/v3";

let cache: MarketData | null = null;
let inflight: Promise<MarketData> | null = null;

/** دادهٔ بازار با کشِ ۵دقیقه. روی هر refresh، هشدارهای فعال ارزیابی می‌شوند. */
export async function getMarketData(): Promise<MarketData> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const fresh = await fetchCrypto();
    cache = fresh;
    // ارزیابیِ هشدارها فقط روی داده‌ی معتبر و در همان چرخهٔ کش.
    if (fresh.ok) {
      try {
        await evaluateAlerts(fresh.crypto);
      } catch (e) {
        console.error("alert evaluation error:", e instanceof Error ? e.message : "unknown");
      }
    }
    return fresh;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function fetchCrypto(): Promise<MarketData> {
  const ids = [...CRYPTO, ...GOLD_TOKENS].map((c) => c.id).join(",");
  const url = `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { crypto: [], goldGlobal: [], fetchedAt: Date.now(), ok: false };
    const json = (await res.json()) as Array<{
      id: string;
      symbol: string;
      current_price: number;
      price_change_percentage_24h: number | null;
      image: string | null;
    }>;
    const rows: CryptoRow[] = json.map((c) => ({
      id: c.id,
      faName: FA_BY_ID.get(c.id) ?? c.id,
      symbol: (c.symbol ?? "").toUpperCase(),
      price: c.current_price,
      change24h: c.price_change_percentage_24h ?? null,
      image: c.image ?? null,
    }));
    const crypto = rows.filter((r) => !GOLD_IDS.has(r.id));
    const goldGlobal = rows.filter((r) => GOLD_IDS.has(r.id));
    return { crypto, goldGlobal, fetchedAt: Date.now(), ok: crypto.length > 0 };
  } catch {
    return { crypto: [], goldGlobal: [], fetchedAt: Date.now(), ok: false };
  }
}

export interface Candle {
  time: number; // ثانیه (UNIX) برای lightweight-charts
  open: number;
  high: number;
  low: number;
  close: number;
}

const ohlcCache = new Map<string, { data: Candle[]; at: number }>();

/** کندلِ روزانهٔ کریپتو (CoinGecko OHLC، ۳۰ روز). کشِ ۵دقیقه per-id. */
export async function getOhlc(id: string): Promise<Candle[]> {
  if (!FA_BY_ID.has(id)) return [];
  const hit = ohlcCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  try {
    const res = await fetch(`${COINGECKO}/coins/${id}/ohlc?vs_currency=usd&days=30`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as number[][];
    const data: Candle[] = raw.map(([ts, o, h, l, c]) => ({
      time: Math.floor(ts / 1000),
      open: o,
      high: h,
      low: l,
      close: c,
    }));
    ohlcCache.set(id, { data, at: Date.now() });
    return data;
  } catch {
    return [];
  }
}

// ── ارزیابیِ هشدارها ─────────────────────────────────────────────────────
// export شده تا cron هم بتواند صریحاً و تضمینی همان منطق را اجرا کند (بدون
// duplicate). idempotent است: غیرفعال‌سازیِ اتمیک (claim_alert) قبل از DM،
// پس اجرای هم‌زمانِ cron و ترافیک هرگز DMِ تکراری نمی‌فرستد.
export async function evaluateAlerts(crypto: CryptoRow[]) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return; // بدون service role نمی‌شود
  const priceMap = new Map(crypto.map((c) => [c.id, c.price]));
  const admin = createAdminClient();

  const { data: alerts } = await admin
    .from("price_alerts")
    .select("id, user_id, symbol, condition, target_price")
    .eq("active", true)
    .eq("market", "crypto");
  if (!alerts || alerts.length === 0) return;

  const userIds = [...new Set(alerts.map((a) => a.user_id))];
  const { data: links } = await admin
    .from("telegram_links")
    .select("user_id, telegram_user_id")
    .in("user_id", userIds);
  const tgMap = new Map((links ?? []).map((l) => [l.user_id, l.telegram_user_id]));

  for (const a of alerts) {
    const price = priceMap.get(a.symbol);
    if (price == null) continue;
    const met =
      (a.condition === "above" && price >= Number(a.target_price)) ||
      (a.condition === "below" && price <= Number(a.target_price));
    if (!met) continue;

    const tgId = tgMap.get(a.user_id);
    const channel = tgId ? "telegram" : "in_app";
    try {
      // شلیکِ اتمیک: غیرفعال‌سازی + ثبت رویداد. اگر باخت (رقابت) → NULL.
      const { data: claimed } = await admin.rpc("claim_alert", {
        p_alert_id: a.id,
        p_price: price,
        p_channel: channel,
      });
      if (claimed && tgId) {
        await sendMessage(tgId, alertMessage(a.symbol, a.condition, Number(a.target_price), price));
      }
    } catch (e) {
      console.error("claim_alert error:", e instanceof Error ? e.message : "unknown");
    }
  }
}

function fmtUsd(n: number): string {
  const s = n >= 1 ? Math.round(n).toLocaleString("en-US") : String(n);
  return toPersianDigits(s).replace(/,/g, "٬");
}

function alertMessage(id: string, condition: string, target: number, price: number): string {
  const fa = FA_BY_ID.get(id) ?? id;
  const dir = condition === "above" ? "بالاتر" : "پایین‌تر";
  return (
    `🔔 <b>هشدار قیمت</b>\n\n` +
    `${fa} به ${fmtUsd(price)} دلار رسید ` +
    `(شرط شما: ${dir} از ${fmtUsd(target)} دلار).\n\n` +
    `این پیام صرفاً اطلاع‌رسانیِ قیمت است و توصیهٔ خرید یا فروش نیست.`
  );
}
