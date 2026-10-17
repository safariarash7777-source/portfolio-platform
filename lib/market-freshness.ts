/**
 * تازگیِ دادهٔ بازار — بر اساسِ زمانِ خودِ داده، نه زمانِ درخواستِ مرورگر.
 *
 * ── باگی که این فایل می‌بندد ────────────────────────────────────────────────
 *
 * پاسخِ `/api/market` دو مهرِ زمانیِ **متفاوت** دارد:
 *
 *   `fetchedAt`      → زمانی که سرور از CoinGecko گرفت (کریپتو و انسِ جهانی)
 *   `ir.fetchedAt`   → زمانی که **رله** دادهٔ ایران را گرفت (طلا، ارز، صندوق، سهام)
 *
 * سطحِ عمومی فقط `fetchedAt` را می‌خواند و همان را کنارِ قیمتِ دلار و سکه
 * می‌نوشت — یعنی سنِ دادهٔ CoinGecko را به‌جای سنِ دادهٔ ایران گزارش می‌کرد.
 * اگر رله می‌خوابید ولی CoinGecko جواب می‌داد، برچسب «هم‌اکنون» می‌ماند در
 * حالی که قیمتِ دلار ساعت‌ها کهنه بود. این دقیقاً همان ادعای اثبات‌نشده‌ای است
 * که نباید باقی بماند.
 *
 * راه‌حل: فقط مهرِ زمانیِ منابعی که **واقعاً رندر شده‌اند** حساب می‌شود، و
 * **قدیمی‌ترین**شان گزارش می‌شود. محافظه‌کارانه‌ترین گزارهٔ صادق.
 */
import { toPersianDigits } from "./format";
import { sourceTime, parseSnapshotQuality } from "./market-quality";
import { selectTickerAssets, type TickerPayload } from "./market-ticker-select";
import { hasRealPrice } from "./market-price";

/** بعد از این مدت، داده «کهنه» علامت می‌خورد. */
export const STALE_AFTER_MIN = 30;

/** بیش از این اختلاف به آینده = ساعتِ نامعتبر (ساعتِ مرورگر عقب/جلو). */
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

export type FreshnessState = "fresh" | "stale" | "unknown";

export interface Freshness {
  state: FreshnessState;
  /** سنِ قدیمی‌ترین منبعِ رندرشده، به دقیقه. `null` وقتی مهرِ زمانیِ معتبری نیست. */
  ageMin: number | null;
  /** متنِ آمادهٔ نمایش (ارقامِ فارسی). */
  label: string;
  /** فقط روی دادهٔ تازه true — نقطهٔ «زنده» نباید روی دادهٔ کهنه بتپد. */
  showLiveDot: boolean;
}

export interface FreshnessInput {
  /** مهرِ زمانیِ فیدِ ایران؛ فقط وقتی حساب می‌شود که ردیفی از ایران رندر شده باشد. */
  irFetchedAt?: number | null;
  /** مهرِ زمانیِ فیدِ جهانی؛ فقط وقتی ردیفی از جهانی رندر شده باشد. */
  globalFetchedAt?: number | null;
  usesIr: boolean;
  usesGlobal: boolean;
  now: number;
}

function validAge(at: number | null | undefined, now: number): number | null {
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
  const diff = now - at;
  if (diff < -MAX_FUTURE_SKEW_MS) return null; // مهرِ زمانیِ آینده ⇒ بی‌اعتماد
  return Math.max(0, diff);
}

/**
 * تابعِ خالص. `now` تزریق می‌شود تا تست به ساعتِ سیستم وابسته نباشد.
 *
 * اگر هیچ مهرِ زمانیِ معتبری نباشد، حالت `unknown` است — نه «تازه». نبودِ
 * شواهد، شاهدِ تازگی نیست.
 */
export function computeFreshness(input: FreshnessInput): Freshness {
  const ages: number[] = [];
  let missing = !Number.isFinite(input.now);
  if (input.usesIr) {
    const a = validAge(input.irFetchedAt, input.now);
    if (a != null) ages.push(a);
    else missing = true;
  }
  if (input.usesGlobal) {
    const a = validAge(input.globalFetchedAt, input.now);
    if (a != null) ages.push(a);
    else missing = true;
  }

  if (missing || ages.length === 0) {
    return { state: "unknown", ageMin: null, label: "زمانِ داده نامشخص", showLiveDot: false };
  }

  // قدیمی‌ترین منبع تعیین‌کننده است: نوار به‌اندازهٔ کهنه‌ترین چیزی که نشان می‌دهد کهنه است.
  const ageMin = Math.max(0, Math.round(Math.max(...ages) / 60000));
  const stale = ageMin >= STALE_AFTER_MIN;

  if (stale) {
    return {
      state: "stale",
      ageMin,
      label: `دادهٔ کهنه · ${toPersianDigits(ageMin)} دقیقه پیش`,
      showLiveDot: false,
    };
  }
  return {
    state: "fresh",
    ageMin,
    label: ageMin === 0 ? "به‌روزرسانی: هم‌اکنون" : `به‌روزرسانی: ${toPersianDigits(ageMin)} دقیقه پیش`,
    showLiveDot: true,
  };
}

export interface TickerFreshnessPayload extends TickerPayload {
  fetchedAt?: number | null;
  ir?: (NonNullable<TickerPayload['ir']> & { fetchedAt?: number | null; snapshotQuality?: unknown }) | null;
}

/** Only selected quotes contribute; an unrelated stale quote cannot age this ticker. */
export function computeTickerFreshness(payload: TickerFreshnessPayload, now: number): Freshness {
  const assets = selectTickerAssets(payload);
  const selected = new Set(assets.filter(a => a.origin === 'ir').map(a => a.id));
  const metadata = parseSnapshotQuality(payload.ir?.snapshotQuality);
  const stamps: number[] = [];
  let missing = false, retained = false;
  const winners = new Map<string, { family: 'currency' | 'gold'; row: NonNullable<NonNullable<TickerPayload['ir']>['gold']>[number] }>();
  for (const family of ['currency', 'gold'] as const) {
    for (const row of payload.ir?.[family] ?? []) {
      if (typeof row.id === 'string' && selected.has(row.id) && hasRealPrice(row.price as number)) winners.set(row.id, { family, row });
    }
  }
  for (const { family, row } of winners.values()) {
      const at = sourceTime(typeof row.sourceDate === 'string' ? row.sourceDate : null, typeof row.sourceTime === 'string' ? row.sourceTime : null);
      const receipt = metadata === undefined ? payload.ir?.fetchedAt : metadata?.families[family]?.receivedAt;
      if (at === null || validAge(at, now) === null || validAge(receipt, now) === null) missing = true;
      else stamps.push(Math.min(at, receipt!));
      if (metadata !== undefined) {
        const state = metadata?.families[family];
        if (!state || state.state === 'unavailable' || state.state === 'empty') missing = true;
        if (state?.retained || state?.state === 'stale' || metadata?.state === 'error') retained = true;
      }
  }
  const result = computeFreshness({ usesIr: selected.size > 0, usesGlobal: assets.some(a => a.origin === 'global'), irFetchedAt: missing || !stamps.length ? null : Math.min(...stamps), globalFetchedAt: payload.fetchedAt, now });
  return retained && result.state !== 'unknown' ? { ...result, state: 'stale', showLiveDot: false, label: 'دادهٔ کهنه · نسخهٔ قبلی حفظ شده است' } : result;
}
