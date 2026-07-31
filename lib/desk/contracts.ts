/**
 * میزِ آرش — قراردادِ داده و تجمیع (`G3-002`).
 *
 * ── اصلِ حاکم ────────────────────────────────────────────────────────────
 * **میز لایهٔ تجمیع است، نه موتورِ تازه.** هیچ محاسبهٔ مالی اینجا انجام
 * نمی‌شود. هر بخش می‌گوید از کدام دارایی موجود می‌خوانَد، و اگر آن دارایی
 * نباشد، همین را صریح می‌گوید. اگر روزی محاسبه‌ای لازم شد، جایش
 * `lib/core/` است، نه اینجا.
 *
 * ── چرا حالت‌ها چهارتاست، نه دوتا ───────────────────────────────────────
 * درسِ تکرارشوندهٔ این پروژه: **شاخصی که «مشکلی نیست» را از «نمی‌بینم» جدا
 * نمی‌کند، دیر یا زود به دلیلِ غلط مورد اعتماد قرار می‌گیرد.** سه بار همین
 * اتفاق افتاد — گرنت‌های لید، تازگیِ رله، و آخرین اجرای cron. پس اینجا از
 * ابتدا چهار حالت داریم:
 *
 *   • `ready`       — داده هست و تازه است.
 *   • `stale`       — داده هست ولی کهنه. دیده می‌شود، ولی به‌عنوانِ کهنه.
 *   • `empty`       — منبع هست و **واقعاً خالی است**. این یک واقعیتِ معتبر
 *                     است، نه خطا.
 *   • `unavailable` — منبع **در دسترس نیست** (جدول اجرا نشده، پرس‌وجو مردود).
 *                     این با `empty` یکی نیست و هرگز نباید با آن ادغام شود.
 *
 * ── آنچه اینجا هرگز نمی‌آید ─────────────────────────────────────────────
 * هیچ Agent، هیچ اتصالِ LLM، هیچ وابستگیِ OpenAI (Gate 4 است، و `D-022`/
 * `D-023` باز‌اند). هیچ دادهٔ ساختگی — منبعِ ناموجود `unavailable` است، نه
 * عددِ جایگزین. و هیچ واژهٔ «سیگنال/توصیه/خرید/فروش» در متنِ کاربرپسند.
 */

export const DESK_SECTIONS = [
  "today",
  "intelligence",
  "decisions",
  "reference",
  "operations",
] as const;

export type DeskSectionKey = (typeof DESK_SECTIONS)[number];

export const DESK_SECTION_LABEL: Record<DeskSectionKey, string> = {
  today: "امروز",
  intelligence: "هوشمندیِ بازار",
  decisions: "تصمیم‌ها و سناریوها",
  reference: "سبدِ مرجع",
  operations: "عملیات و سلامت",
};

/** ترتیبِ نمایش عمداً همان ترتیبِ کارِ روزانه است، نه ترتیبِ الفبا. */
export type DataState = "ready" | "stale" | "empty" | "unavailable";

export const DATA_STATE_LABEL: Record<DataState, string> = {
  ready: "به‌روز",
  stale: "کهنه",
  empty: "خالی",
  unavailable: "در دسترس نیست",
};

/**
 * یک قلمِ قابلِ نمایش در میز. `value` عمداً `string | null` است: عددِ خام
 * قالب‌بندی‌شده از سمتِ سرور می‌آید تا نما و ترمینال یک‌جور ببینند، و `null`
 * یعنی «نداریم» — هرگز صفر یا خط تیره‌ای که شبیهِ داده باشد.
 */
export interface DeskMetric {
  key: string;
  label: string;
  value: string | null;
  hint?: string;
}

export interface DeskPanel {
  key: DeskSectionKey;
  label: string;
  state: DataState;
  /** چرا این حالت — همیشه پر است، حتی وقتی `ready` است. */
  detail: string;
  /** از کدام دارایی موجود خوانده شد. برای پاسخ به «این عدد از کجا آمد؟». */
  sources: string[];
  metrics: DeskMetric[];
  /** سنِ دادهٔ اصلیِ این بخش به دقیقه — `null` یعنی زمانی در کار نیست. */
  ageMinutes: number | null;
}

export interface DeskView {
  generatedAt: string;
  panels: DeskPanel[];
  /** بدترین حالتِ موجود — همان قاعدهٔ `rollup` در نمای سلامت. */
  overall: DataState;
}

/* ── طبقه‌بندیِ حالت ───────────────────────────────────────────────────── */

const RANK: Record<DataState, number> = {
  ready: 0,
  stale: 1,
  empty: 2,
  unavailable: 3,
};

/**
 * بدترین حالت برنده است.
 *
 * ترتیب عمدی است و با شهودِ اول فرق دارد: `empty` از `stale` بدتر حساب
 * می‌شود، چون دادهٔ کهنه دستِ‌کم یک‌بار وجود داشته؛ و `unavailable` از هر دو
 * بدتر است، چون دربارهٔ واقعیت **هیچ** نمی‌گوید.
 */
export function rollupDeskState(panels: readonly DeskPanel[]): DataState {
  if (panels.length === 0) return "unavailable";
  return panels.reduce<DataState>(
    (worst, p) => (RANK[p.state] > RANK[worst] ? p.state : worst),
    "ready"
  );
}

export function deskAgeMinutes(
  lastAt: string | Date | null | undefined,
  now: Date
): number | null {
  if (!lastAt) return null;
  const t = lastAt instanceof Date ? lastAt : new Date(lastAt);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  // زمانِ آینده = ساعتِ ناهماهنگ. سنِ منفی بی‌معناست.
  return Math.max(0, Math.floor((now.getTime() - ms) / 60000));
}

export interface FreshnessRule {
  okWithinMinutes: number;
  staleWithinMinutes: number;
}

/**
 * ورودیِ خامِ یک بخش. تفکیکِ `available` از `count` عمدی است و کلِ نکتهٔ این
 * ماژول است: `available=false` یعنی نتوانستیم بپرسیم؛ `count=0` یعنی پرسیدیم
 * و جواب صفر بود.
 */
export interface PanelInput {
  available: boolean;
  count: number;
  lastAt?: string | Date | null;
  /** وقتی `available=false` — چرا. */
  unavailableReason?: string;
}

export function classifyPanel(
  input: PanelInput,
  rule: FreshnessRule | null,
  now: Date
): { state: DataState; detail: string; ageMinutes: number | null } {
  if (!input.available) {
    return {
      state: "unavailable",
      detail:
        input.unavailableReason ??
        "منبعِ این بخش در دسترس نیست — این با «خالی» یکی نیست و نباید سالم دیده شود",
      ageMinutes: null,
    };
  }

  if (input.count === 0) {
    return {
      state: "empty",
      detail: "منبع در دسترس است و هیچ رکوردی ندارد — یک واقعیتِ معتبر، نه خطا",
      ageMinutes: null,
    };
  }

  const age = deskAgeMinutes(input.lastAt, now);
  if (!rule || age === null) {
    return {
      state: "ready",
      detail: `${input.count} رکورد موجود است؛ این بخش معیارِ تازگیِ زمانی ندارد`,
      ageMinutes: age,
    };
  }
  if (age <= rule.okWithinMinutes) {
    return { state: "ready", detail: `${input.count} رکورد · آخرین به‌روزرسانی ${age} دقیقه پیش`, ageMinutes: age };
  }
  return {
    state: "stale",
    detail: `${input.count} رکورد، ولی آخرین به‌روزرسانی ${age} دقیقه پیش بوده — کهنه است`,
    ageMinutes: age,
  };
}

/* ── سازندهٔ بخش ───────────────────────────────────────────────────────── */

export interface PanelSpec {
  key: DeskSectionKey;
  sources: string[];
  rule: FreshnessRule | null;
  metrics: DeskMetric[];
}

export function buildPanel(spec: PanelSpec, input: PanelInput, now: Date): DeskPanel {
  const { state, detail, ageMinutes } = classifyPanel(input, spec.rule, now);
  return {
    key: spec.key,
    label: DESK_SECTION_LABEL[spec.key],
    state,
    detail,
    sources: spec.sources,
    // وقتی منبع در دسترس نیست، عددی برای نشان‌دادن نداریم. نمایشِ متریکِ
    // خالی بهتر از نمایشِ متریکی است که شبیهِ داده به‌نظر برسد.
    metrics: state === "unavailable" ? [] : spec.metrics,
    ageMinutes,
  };
}

export function buildDeskView(panels: DeskPanel[], now: Date): DeskView {
  return {
    generatedAt: now.toISOString(),
    panels,
    overall: rollupDeskState(panels),
  };
}

/* ── قاعدهٔ انتشار ─────────────────────────────────────────────────────── */

/**
 * `DD-023`: هیچ چیزی از میز به‌صورتِ خودکار عمومی نمی‌شود.
 *
 * این تابع عمداً اینجاست و نه در UI: قاعده باید یک‌جا و تست‌پذیر باشد، وگرنه
 * هر صفحهٔ تازه‌ای می‌تواند سهواً دورش بزند.
 */
export type BriefStatus = "internal_draft" | "pending_approval" | "published";

export function canPublishBrief(status: BriefStatus, isAdmin: boolean): boolean {
  // پیش‌نویسِ داخلی هرگز مستقیم منتشر نمی‌شود؛ باید اول به تأییدِ انسانی برود.
  return isAdmin && status === "pending_approval";
}

export function briefPublishBlockReason(status: BriefStatus, isAdmin: boolean): string | null {
  if (!isAdmin) return "فقط ادمین می‌تواند منتشر کند";
  if (status === "internal_draft") return "پیش‌نویسِ داخلی است — اول باید برای تأیید ارسال شود";
  if (status === "published") return "قبلاً منتشر شده";
  return null;
}
