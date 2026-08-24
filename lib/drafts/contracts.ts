/**
 * پیش‌نویس‌های موتور — قراردادِ بازبینی (`P2-INTELLIGENCE-DESK-FOLLOWUP-001`).
 *
 * ── این ماژول چه چیزی هست و چه چیزی نیست ────────────────────────────────
 * جدولِ `signal_drafts` از `terminal_t0` باقی مانده و **روی Production اجرا
 * شده** است. محتوایش نامزدهایی است که موتور تولید کرده: یک نماد، یک جهت، و
 * دلایل. تا امروز هیچ صفحه‌ای در این مخزن آن را نمی‌خواند، پس صفِ میز عددی
 * نشان می‌داد که هیچ‌جا نمی‌شد سراغش رفت.
 *
 * این ماژول آن شکاف را می‌بندد و **فقط** آن را:
 *
 *   ✓ نمایشِ نامزدهای بازنشده (`status = 'pending'`)
 *   ✓ کنارگذاشتنِ یک نامزد با یادداشتِ اجباری (`status → 'rejected'`)
 *   ✗ **هیچ مسیرِ انتشاری** — نه اینجا، نه از اینجا
 *
 * ── چرا انتشار اینجا نیست ────────────────────────────────────────────────
 * دو دلیلِ مستقل، و هر کدام به‌تنهایی کافی است:
 *
 * ۱. **قاعدهٔ محصول.** این پلتفرم «سامانهٔ پشتیبان تصمیم است، نه ربات
 *    معامله‌گر؛ لایهٔ اجرا ندارد». وصل‌کردنِ خروجیِ یک موتور به انتشارِ
 *    عمومی دقیقاً همان لایه را می‌سازد.
 * ۲. **گیتِ انسانیِ موجود.** انتشار امروز از `/api/admin/analyses` با
 *    `action: "publish"` انجام می‌شود و **متنِ تحلیلِ نوشتهٔ انسان را اجباری
 *    می‌کند** («انسان در حلقه»). پرکردنِ آن متن از روی خروجیِ موتور همان گیت
 *    را تضعیف می‌کند. ستونِ `signals.draft_id` وجود دارد و امروز هرگز پر
 *    نمی‌شود؛ پرکردنش یک **تصمیمِ مالک** است، نه یک تصمیمِ مهندسی.
 *
 * پس این صفحه صریحاً می‌گوید انتشار اینجا نیست و کجاست.
 *
 * ── واژگان ──────────────────────────────────────────────────────────────
 * ستونِ `direction` در دیتابیس `buy`/`sell` است، ولی UI همان نگاشتی را
 * به‌کار می‌برد که «کارنامه» از قبل دارد: صعودی / نزولی. آن یک **جهتِ
 * دیدگاه** است، نه دستورِ معامله.
 */

import type { DataState } from "@/lib/desk/contracts";

/** جهتِ دیدگاه. همان نگاشتِ `AnalysesManager` — یک محصول، یک واژگان. */
export type DraftDirection = "buy" | "sell";

export const DIRECTION_LABEL: Record<DraftDirection, string> = {
  buy: "صعودی",
  sell: "نزولی",
};

/** تنها وضعیتی که این صفحه نشان می‌دهد. */
export const PENDING = "pending" as const;
/** تنها وضعیتی که این صفحه می‌نویسد. */
export const DISMISSED = "rejected" as const;

/** یک ردیفِ خام از `signal_drafts`، فقط ستون‌هایی که واقعاً لازم است. */
export interface DraftRow {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  source: string;
  reasons: unknown;
  created_at: string;
}

/** همان ردیف، آمادهٔ نمایش — بدونِ قیمت و بدونِ امتیازِ خام. */
export interface DraftCard {
  id: string;
  symbol: string;
  direction: DraftDirection | null;
  directionLabel: string;
  /** دلایلِ متنیِ موتور. آرایهٔ خالی یعنی موتور دلیلی ننوشته. */
  reasons: readonly string[];
  source: string;
  createdAt: string;
}

export interface DraftQueue {
  cards: readonly DraftCard[];
  /**
   * `null` یعنی **نتوانستیم بشماریم**. هرگز صفر نمی‌شود.
   *
   * این همان قاعده‌ای است که کلِ صفِ میز رویش ساخته شد: یک پرس‌وجوی مردود و
   * یک صفِ واقعاً خالی روی صفحه هر دو «۰» می‌شوند مگر چیزی جلویشان را بگیرد.
   */
  count: number | null;
  state: DataState;
  detail: string;
}

/** `reasons` در دیتابیس `jsonb` است و هر شکلی می‌تواند داشته باشد. */
function toReasons(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  }
  if (value && typeof value === "object") {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string" && text.trim() !== "") return [text];
  }
  return [];
}

function toDirection(value: string): DraftDirection | null {
  return value === "buy" || value === "sell" ? value : null;
}

export function toCard(row: DraftRow): DraftCard {
  const direction = toDirection(row.direction);
  return {
    id: row.id,
    symbol: row.symbol,
    direction,
    // جهتِ ناشناخته «نامعلوم» است، نه یکی از دو گزینه به‌صورتِ پیش‌فرض.
    directionLabel: direction ? DIRECTION_LABEL[direction] : "نامعلوم",
    reasons: toReasons(row.reasons),
    source: row.source,
    createdAt: row.created_at,
  };
}

/**
 * صف را از ردیف‌های خوانده‌شده می‌سازد.
 *
 * `rows === null` یعنی پرس‌وجو مردود شد. آن حالت **باید** از صفِ خالی جدا
 * بماند: «چیزی نمانده» و «نتوانستم ببینم» دو خبرِ کاملاً متفاوت‌اند.
 */
export function buildDraftQueue(rows: readonly DraftRow[] | null, failureReason?: string): DraftQueue {
  if (rows === null) {
    return {
      cards: [],
      count: null,
      state: "unavailable",
      detail: failureReason ?? "خواندنِ پیش‌نویس‌ها مردود شد — این با «صفِ خالی» یکی نیست",
    };
  }

  // دفاعِ لایه‌دوم: حتی اگر روزی پرس‌وجو فیلترِ وضعیت را از دست بدهد، یک
  // نامزدِ بسته‌شده نباید در صفِ «بازنشده» ظاهر شود.
  const pending = rows.filter((r) => r.status === PENDING);

  if (pending.length === 0) {
    return {
      cards: [],
      count: 0,
      state: "empty",
      // «خالی» ادعای «همه بررسی شد» نمی‌کند.
      detail: "هیچ نامزدِ بازنشده‌ای در صف نیست — یعنی چیزی ثبت نشده، نه اینکه همه‌چیز بررسی شده",
    };
  }

  return {
    cards: pending.map(toCard),
    count: pending.length,
    state: "awaiting_review",
    detail: "این نامزدها منتظرِ قضاوتِ شمایند",
  };
}

/** یادداشتِ بازبینی اجباری است — کنارگذاشتنِ بی‌دلیل ردی از خود باقی نمی‌گذارد. */
export const MIN_NOTE_LENGTH = 3;

export function validateDismissal(note: string): string | null {
  if (note.trim().length < MIN_NOTE_LENGTH) {
    return "برای کنارگذاشتن باید دلیلِ کوتاهی بنویسید — تصمیمِ بی‌رد قابلِ بازبینی نیست";
  }
  return null;
}
