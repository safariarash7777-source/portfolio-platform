/**
 * تبدیلِ ردیف‌های `symbol_history` به قیمتِ قابلِ استفاده در محاسبهٔ سبد.
 *
 * ── سه قاعدهٔ سختِ اسکیلِ بازار که اینجا اعمال می‌شوند ───────────────────────
 *
 * **D3 — واحد.** `symbol_history` قیمت را به **ریال** نگه می‌دارد (نمونهٔ
 * واقعی: «خودرو» با `close = 760`). سبد به **تومان** حساب می‌کند. تبدیل
 * دقیقاً یک‌بار و همین‌جا — مرزِ ورودِ داده — انجام می‌شود، نه پراکنده در UI.
 *
 * **D2 — دادهٔ غایب.** نمادِ بدونِ ردیف قیمت نمی‌گیرد و `null` می‌ماند. هیچ
 * درون‌یابی، هیچ «آخرین قیمتِ معلوم» و هیچ صفرِ جایگزین.
 *
 * **Z1 — زیرنماد.** نمادِ ختم به رقم زیرنمادِ بلوکی است و اصلاً نباید در
 * جدول‌های تحلیلی باشد. اگر چنین چیزی در داراییِ کاربر بود، قیمت‌گذاری
 * نمی‌شود — چون قیمتش نمایندهٔ معاملهٔ عادی نیست.
 *
 * ── تازگیِ قیمت با تازگیِ گزارشِ بنیادی یکی نیست ────────────────────────────
 * `asOf` از **`trade_date`** می‌آید، یعنی روزی که آن قیمت به آن تعلق دارد —
 * نه `captured_at` که فقط می‌گوید ما کِی خواندیمش. و هیچ‌کدامِ این دو دربارهٔ
 * «آخرین صورتِ مالیِ شرکت» چیزی نمی‌گویند. قیمتِ امروز کنارِ گزارشِ شش‌ماه‌پیش
 * کاملاً ممکن است؛ این دو سنجهٔ جدا هستند و نباید جای هم بنشینند.
 */
import type { PricePoint } from "./contracts";

/** زیرنمادِ بلوکی/عمده: نمادِ ختم به رقم (فارسی، عربی یا لاتین). */
const SUB_TICKER_RE = /[0-9۰-۹٠-٩]$/;

export function isSubTicker(symbol: string): boolean {
  return SUB_TICKER_RE.test(symbol.trim());
}

/** ردیفِ خامِ `symbol_history` — فقط ستون‌هایی که لازم داریم. */
export interface SymbolHistoryRow {
  symbol: string;
  trade_date: string;
  close: number | string | null;
  last_price: number | string | null;
  source: string | null;
}

/** ریال → تومان. یک‌جا، با نامِ صریح، تا جای دیگری تکرار نشود. */
export function rialToToman(rial: number): number {
  return rial / 10;
}

function numeric(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * جدیدترین قیمتِ هر نماد را از ردیف‌های خام می‌سازد.
 *
 * ورودی لازم نیست مرتب باشد؛ برندهٔ هر نماد بزرگ‌ترین `trade_date` است.
 * جدول append-only است و یک `trade_date` ممکن است چند بار درج شده باشد
 * (بک‌فیل + رلهٔ روزانه)، پس در تساویِ تاریخ، آخرین ردیفِ دیده‌شده برنده
 * می‌شود — همان قراردادِ `lib/core/history.ts`.
 */
export function buildPriceMap(rows: readonly SymbolHistoryRow[]): Map<string, PricePoint> {
  const best = new Map<string, { row: SymbolHistoryRow; date: string }>();

  for (const row of rows) {
    const symbol = (row.symbol ?? "").trim();
    if (symbol === "" || isSubTicker(symbol)) continue;
    if (!row.trade_date) continue;

    const prev = best.get(symbol);
    if (!prev || row.trade_date >= prev.date) {
      best.set(symbol, { row, date: row.trade_date });
    }
  }

  const out = new Map<string, PricePoint>();
  for (const [symbol, { row, date }] of best) {
    // `close` قیمتِ پایانیِ همان روز است و مبنای ارزش‌گذاری؛ `last_price`
    // فقط وقتی استفاده می‌شود که پایانی ثبت نشده باشد.
    const rial = numeric(row.close) ?? numeric(row.last_price);
    if (rial === null) continue;

    out.set(symbol, {
      toman: rialToToman(rial),
      // منبع صریح است تا کاربر بداند این عدد از کجا آمده — نه «قیمت روز».
      source: `symbol_history · ${row.source?.trim() || "نامشخص"}`,
      asOf: date,
    });
  }
  return out;
}

/**
 * نمادهایی که باید قیمت بگیرند.
 *
 * قلمِ دستی (`manual_label`) عمداً بیرون می‌ماند: «نفت» بدونِ ابزارِ
 * سرمایه‌پذیرِ مشخص قیمتِ قابلِ اجرا ندارد و ساختنِ قیمت برایش یعنی ساختنِ
 * عدد. نتیجه‌اش پوششِ ناقص است، که همان حقیقت است.
 */
export function priceableSymbols(
  positions: readonly { symbol: string | null }[]
): string[] {
  const set = new Set<string>();
  for (const p of positions) {
    const s = (p.symbol ?? "").trim();
    if (s !== "" && !isSubTicker(s)) set.add(s);
  }
  return [...set];
}
