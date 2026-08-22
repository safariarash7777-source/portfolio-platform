/**
 * انتخابِ دارایی‌های نوارِ قیمتِ صفحهٔ اصلی.
 *
 * ── مسئله ───────────────────────────────────────────────────────────────────
 *
 * `/api/market` هرچه منبع بدهد را برمی‌گرداند: فهرستِ ارزِ BrsApi ده‌ها ردیف
 * دارد (دلار، یورو، درهم، لیر، ین، یوان، …) و طلا هم همین‌طور. نوارِ صفحهٔ
 * اصلی همهٔ آن‌ها را پشتِ سرِ هم می‌چسباند. برای بازدیدکننده‌ای که تازه رسیده،
 * «ین ژاپن» سیگنالِ مفیدی نیست — نویز است، و نویز باعث می‌شود دلار و سکه هم
 * دیده نشوند.
 *
 * ── تصمیم ───────────────────────────────────────────────────────────────────
 *
 * صفحهٔ اصلی یک **فهرستِ ثابتِ اولویت‌دار** دارد. `/market` دستِ‌نخورده کاملِ
 * داده را نشان می‌دهد؛ اینجا فقط انتخاب می‌شود، هیچ‌چیز از منبع حذف نمی‌شود.
 *
 * چرا فهرستِ ثابت و نه «۱۲ تای اول» یا مرتب‌سازی پویا:
 *  - قطعی است: خروجی فقط تابعِ ورودی است، نه ترتیبِ تصادفیِ منبع.
 *  - قابلِ تست است.
 *  - منبع اگر روزی ترتیبش را عوض کند، نوارِ صفحهٔ اصلی عوض نمی‌شود.
 *
 * ── قاعدهٔ سختِ «نبودِ نماد» ─────────────────────────────────────────────────
 *
 * اگر نمادی در پاسخ نباشد، **رد می‌شود**. نه با صفر پر می‌شود، نه با دارایی
 * دیگری جایگزین می‌شود، نه جایش خالی می‌ماند. فهرست کوتاه‌تر می‌شود و همین.
 * (`D2` در اسکیلِ iran-market-data: دادهٔ غایب = null و حالتِ خالیِ صادق.)
 */
import { hasRealPrice } from "./market-price";

/** حداکثر ردیفِ نوارِ صفحهٔ اصلی. */
export const MAX_TICKER_ITEMS = 12;

/**
 * فهرستِ اولویت — به همین ترتیب رندر می‌شود.
 *
 * شناسه‌ها واقعی‌اند و از همین مخزن آمده‌اند:
 *  - طلا/سکه: `lib/fx/dataLoader.ts` (`GOLD_IDS`)
 *  - `USD`: `relay/server.mjs` و `lib/core/trend.ts` (`TARGETS`)
 *  - جهانی: `lib/market.ts` (`CRYPTO` و `GOLD_TOKENS`)
 *
 * `EUR` تنها شناسه‌ای است که در مخزن تأیید نشده — عمداً نگه داشته شده چون
 * قاعدهٔ «نبودِ نماد» دقیقاً همین حالت را پوشش می‌دهد: اگر منبع نداشته باشد،
 * بی‌سروصدا رد می‌شود.
 */
export const HOMEPAGE_TICKER_IDS: readonly string[] = [
  "USD",              // لنگرِ بازار ایران
  "IR_GOLD_18K",      // طلای ۱۸ عیار
  "IR_COIN_EMAMI",    // سکهٔ امامی
  "IR_COIN_BAHAR",    // سکهٔ بهار آزادی
  "IR_COIN_HALF",     // نیم‌سکه
  "IR_COIN_QUARTER",  // ربع‌سکه
  "IR_GOLD_MELTED",   // طلای آب‌شده
  "IR_GOLD_24K",      // طلای ۲۴ عیار
  "EUR",              // یورو
  "pax-gold",         // انسِ جهانیِ طلا
  "bitcoin",
  "ethereum",
];

export interface SourceRow {
  id?: unknown;
  faName?: unknown;
  price?: unknown;
  unit?: unknown;
  change24h?: unknown;
  changePercent?: unknown;
}

export interface TickerPayload {
  ir?: { gold?: SourceRow[]; currency?: SourceRow[] } | null;
  goldGlobal?: SourceRow[];
  crypto?: SourceRow[];
}

/** از کدام منبع آمده — تعیین می‌کند مهرِ زمانیِ کدام فید روی این ردیف صادق است. */
export type Origin = "ir" | "global";

export interface TickerAsset {
  id: string;
  label: string;
  price: number;
  unit: "toman" | "usd";
  changePercent: number | null;
  origin: Origin;
}

/**
 * درصدِ تغییر فقط وقتی نمایش داده می‌شود که عددِ متناهی باشد.
 *
 * `hasRealPrice` قیمت را می‌گیرد ولی درصد را نه، و هلپرهای `lib/format.ts`
 * گاردی ندارند: `formatSignedPercent(NaN)` رشتهٔ «• ٪NaN» و
 * `formatSignedPercent(Infinity)` رشتهٔ «▲ ٪Infinity» می‌سازد — هر دو شبیهِ
 * داده‌اند. صفر اینجا **معتبر** است: «بدون تغییر» یک واقعیتِ بازار است،
 * برخلافِ قیمتِ صفر که یعنی دادهٔ نبود.
 */
export function hasRealChange(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalize(row: SourceRow, origin: Origin): TickerAsset | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;
  if (!hasRealPrice(row.price as number)) return null;

  const raw = row.changePercent ?? row.change24h;
  return {
    id,
    label: typeof row.faName === "string" && row.faName.trim() ? row.faName : id,
    price: row.price as number,
    unit: row.unit === "usd" ? "usd" : origin === "global" ? "usd" : "toman",
    changePercent: hasRealChange(raw) ? raw : null,
    origin,
  };
}

/**
 * ردیف‌های نوارِ صفحهٔ اصلی، به ترتیبِ `HOMEPAGE_TICKER_IDS`.
 *
 * تابعِ خالص: خروجی فقط به ورودی وابسته است. اگر یک شناسه هم در فیدِ ایران و
 * هم در فیدِ جهانی باشد، ایران برنده است (بازارِ داخلی موضوعِ محصول است).
 */
export function selectTickerAssets(payload: TickerPayload | null | undefined): TickerAsset[] {
  if (!payload) return [];

  const index = new Map<string, TickerAsset>();
  // ترتیبِ درج مهم است: جهانی اول، بعد ایران — تا ایران رویش بنویسد.
  const pools: Array<{ rows: SourceRow[] | undefined; origin: Origin }> = [
    { rows: payload.crypto, origin: "global" },
    { rows: payload.goldGlobal, origin: "global" },
    { rows: payload.ir?.currency, origin: "ir" },
    { rows: payload.ir?.gold, origin: "ir" },
  ];

  for (const { rows, origin } of pools) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const asset = normalize(row, origin);
      if (asset) index.set(asset.id, asset);
    }
  }

  const out: TickerAsset[] = [];
  for (const id of HOMEPAGE_TICKER_IDS) {
    if (out.length >= MAX_TICKER_ITEMS) break;
    const hit = index.get(id);
    if (hit) out.push(hit); // نبود ⇒ رد می‌شود. بدونِ جایگزین، بدونِ صفر.
  }
  return out;
}
