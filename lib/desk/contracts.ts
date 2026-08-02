/**
 * میزِ آرش — قراردادِ داده و تجمیع (`G3-002`).
 *
 * ── اصلِ حاکم ────────────────────────────────────────────────────────────
 * **میز لایهٔ تجمیع است، نه موتورِ تازه.** هیچ محاسبهٔ مالی اینجا انجام
 * نمی‌شود. هر منبع می‌گوید از کدام دارایی موجود می‌خوانَد، و اگر آن دارایی
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
 *   • `unavailable` — منبع **در دسترس نیست** (جدول اجرا نشده، پرس‌وجو مردود،
 *                     یا ستونِ زمانیِ این شاخص اشتباه پیکربندی شده).
 *                     این با `empty` یکی نیست و هرگز نباید با آن ادغام شود.
 *
 * ── چرا هر منبع حالتِ خودش را دارد (`P2-G3-MEGA-004`) ────────────────────
 * نسخهٔ اول چند منبع را در یک عدد جمع می‌کرد و **تازه‌ترین** زمان را برای کلِ
 * بخش می‌گرفت. این دقیقاً همان ادغامی است که بالا ممنوع شده، فقط یک لایه
 * بالاتر: اگر رلهٔ بازار دو روز ساکت باشد ولی نرخِ ارزِ امروز درج شده باشد،
 * بخشِ «امروز» **به‌روز** دیده می‌شد و مرگِ رله پنهان می‌ماند. پس حالا هر
 * منبع ردیفِ خودش، آستانهٔ خودش و حالتِ خودش را دارد؛ حالتِ بخش فقط
 * **بدترینِ** ردیف‌هایش است و هیچ ردیفی پشتِ ردیفِ دیگر پنهان نمی‌شود.
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

/**
 * پرسشی که هر بخش واقعاً به آن جواب می‌دهد. بدونِ این، میز فهرستی از شمارشِ
 * جدول‌هاست؛ با این، ابزارِ کارِ روزانه است.
 */
export const DESK_SECTION_QUESTION: Record<DeskSectionKey, string> = {
  today: "امروز در بازار چه گذشت و آیا دادهٔ امروز اصلاً رسیده است؟",
  intelligence: "چه رخداد و گزارشی ثبت شده که باید ببینم؟",
  decisions: "چه چیزی در صفِ تصمیم یا تأییدِ من است؟",
  reference: "سبدِ مرجع در چه وضعیتی است؟",
  operations: "خطِ لولهٔ داده و cronها سالم‌اند؟",
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
 * یک منبعِ واقعی در میز — یک جدولِ مشخص، با حالت و شمارشِ خودش.
 *
 * `count` عمداً `number | null` است: `null` یعنی **نتوانستیم بشماریم**، و
 * هرگز نباید به صفر تبدیل شود. صفرِ واقعی (`count = 0` با `state = "empty"`)
 * یک واقعیتِ معتبر است؛ صفرِ ساختگی یک دروغ است.
 */
export interface DeskSource {
  /** نامِ جدول در دیتابیس — پاسخِ «این عدد از کجا آمد؟». */
  table: string;
  label: string;
  state: DataState;
  detail: string;
  count: number | null;
  ageMinutes: number | null;
}

/** مقصدِ موجود برای ادامهٔ کار. میز جای آن‌ها را نمی‌گیرد، به آن‌ها راه می‌دهد. */
export interface DeskLink {
  label: string;
  href: string;
}

export interface DeskPanel {
  key: DeskSectionKey;
  label: string;
  question: string;
  state: DataState;
  /** چرا این حالت — همیشه پر است، حتی وقتی `ready` است. */
  detail: string;
  sources: DeskSource[];
  links: DeskLink[];
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
export function worstState(states: readonly DataState[]): DataState {
  if (states.length === 0) return "unavailable";
  return states.reduce<DataState>(
    (worst, s) => (RANK[s] > RANK[worst] ? s : worst),
    "ready"
  );
}

export function rollupDeskState(panels: readonly DeskPanel[]): DataState {
  if (panels.length === 0) return "unavailable";
  return worstState(panels.map((p) => p.state));
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

/**
 * آستانهٔ تازگی — **دقیقاً یک عدد**.
 *
 * نسخهٔ قبلی `okWithinMinutes` و `staleWithinMinutes` داشت، ولی
 * `classifySource` فقط اولی را می‌خواند. مدلِ میز چهار حالت دارد و بینِ
 * `stale` و بدتر از آن هیچ مرزی نیست، پس عددِ دوم **هیچ اثرِ اجرایی
 * نداشت** — یک ۳۰ روزِ تزیینی که در گزارش‌ها هم تکرار می‌شد.
 *
 * این دقیقاً همان چیزی است که کلِ این ماژول علیه‌اش ساخته شده: عددی که
 * شبیهِ پیکربندی است ولی هیچ کاری نمی‌کند. یک آستانه، یک مرز:
 *
 *   • `age <= freshWithinMinutes` → `ready`
 *   • `age >  freshWithinMinutes` → `stale`
 *
 * (نمای سلامت در `lib/health/status.ts` نوعِ جداگانهٔ خودش را دارد و آنجا
 * آستانهٔ دوم **واقعاً** استفاده می‌شود، چون آن مدل حالتِ `failed` هم دارد.)
 */
export interface FreshnessRule {
  freshWithinMinutes: number;
}

/**
 * ورودیِ خامِ یک منبع. تفکیکِ `available` از `count` عمدی است و کلِ نکتهٔ این
 * ماژول است: `available=false` یعنی نتوانستیم بپرسیم؛ `count=0` یعنی پرسیدیم
 * و جواب صفر بود.
 *
 * `timestampBroken` حالتِ سومی است که نسخهٔ اول **بی‌صدا می‌بلعید**: جدول هست،
 * شمارش درست است، ولی ستونِ زمانی‌ای که کدِ ما خواسته وجود ندارد. این باگِ
 * خودِ ماست نه واقعیتِ محیط، و باید سر و صدا کند — وگرنه یک شاخصِ مرده
 * تا ابد «به‌روز» گزارش می‌شود. همان قاعده‌ای که `/api/admin/health` از
 * `P2-G2-011` به بعد دارد (`badColumn → failed`).
 */
export interface SourceInput {
  available: boolean;
  count: number;
  lastAt?: string | Date | null;
  /** وقتی `available=false` — چرا. */
  unavailableReason?: string;
  /** جدول هست ولی ستونِ زمانیِ درخواستی نیست — پیکربندیِ غلطِ خودِ ما. */
  timestampBroken?: boolean;
}

export interface SourceSpec {
  table: string;
  label: string;
  /** `null` یعنی این منبع اصلاً معیارِ تازگیِ زمانی ندارد. */
  rule: FreshnessRule | null;
}

export function classifySource(
  spec: SourceSpec,
  input: SourceInput,
  now: Date
): DeskSource {
  const base = { table: spec.table, label: spec.label };

  if (!input.available) {
    return {
      ...base,
      state: "unavailable",
      detail:
        input.unavailableReason ??
        "این منبع در دسترس نیست — با «خالی» یکی نیست و نباید سالم دیده شود",
      count: null,
      ageMinutes: null,
    };
  }

  if (input.timestampBroken) {
    // شمارش معتبر است، پس آن را نگه می‌داریم؛ ولی تازگی **قابلِ دانستن نیست**
    // و وانمود نمی‌کنیم که هست.
    return {
      ...base,
      state: "unavailable",
      detail: `شمارش خوانده شد ولی ستونِ زمانیِ این شاخص در جدول \`${spec.table}\` وجود ندارد — شاخص اشتباه پیکربندی شده`,
      count: input.count,
      ageMinutes: null,
    };
  }

  if (input.count === 0) {
    return {
      ...base,
      state: "empty",
      detail: "منبع در دسترس است و هیچ رکوردی ندارد — یک واقعیتِ معتبر، نه خطا",
      count: 0,
      ageMinutes: null,
    };
  }

  const age = deskAgeMinutes(input.lastAt, now);

  if (!spec.rule) {
    return {
      ...base,
      state: "ready",
      detail: "این منبع معیارِ تازگیِ زمانی ندارد؛ فقط وجود یا نبودِ رکورد معنا دارد",
      count: input.count,
      ageMinutes: age,
    };
  }

  if (age === null) {
    // آستانه‌ای تعریف شده ولی زمانی در کار نیست → **نمی‌دانیم**، نه «به‌روز».
    // نسخهٔ اول اینجا `ready` برمی‌گرداند؛ همان دروغِ بی‌صدا.
    return {
      ...base,
      state: "unavailable",
      detail: "برای این منبع آستانهٔ تازگی تعریف شده ولی هیچ زمانی خوانده نشد — تازگی نامعلوم است",
      count: input.count,
      ageMinutes: null,
    };
  }

  if (age <= spec.rule.freshWithinMinutes) {
    return { ...base, state: "ready", detail: `آخرین به‌روزرسانی ${age} دقیقه پیش`, count: input.count, ageMinutes: age };
  }

  return {
    ...base,
    state: "stale",
    detail: `آخرین به‌روزرسانی ${age} دقیقه پیش بوده — از آستانهٔ ${spec.rule.freshWithinMinutes} دقیقه گذشته`,
    count: input.count,
    ageMinutes: age,
  };
}

/* ── سازندهٔ بخش ───────────────────────────────────────────────────────── */

export interface PanelSpec {
  key: DeskSectionKey;
  links: DeskLink[];
}

/** خلاصهٔ یک بخش به زبانِ آدم — نه فقط برچسبِ حالت. */
export function summarise(sources: readonly DeskSource[]): string {
  const broken = sources.filter((s) => s.state === "unavailable");
  const stale = sources.filter((s) => s.state === "stale");
  const empty = sources.filter((s) => s.state === "empty");
  const ready = sources.filter((s) => s.state === "ready");

  const parts: string[] = [];
  if (broken.length > 0) parts.push(`${broken.length} منبع در دسترس نیست`);
  if (stale.length > 0) parts.push(`${stale.length} منبع کهنه`);
  if (empty.length > 0) parts.push(`${empty.length} منبع خالی`);
  if (ready.length > 0) parts.push(`${ready.length} منبع به‌روز`);
  // جداکنندهٔ «،» و نه «·»: نقطهٔ وسط یک نویسهٔ خنثای دوطرفه است و در متنِ
  // راست‌به‌چپ کنارِ رقم می‌نشیند — «۲ … · ۳ منبع» روی صفحه شبیهِ «۳۰» دیده
  // می‌شد. در رابطی که کلِ ادعایش نشان‌ندادنِ عددِ گمراه‌کننده است، این
  // خودش یک عددِ گمراه‌کننده بود.
  return parts.length > 0 ? parts.join("، ") : "هیچ منبعی برای این بخش تعریف نشده";
}

export function buildPanel(spec: PanelSpec, sources: DeskSource[]): DeskPanel {
  return {
    key: spec.key,
    label: DESK_SECTION_LABEL[spec.key],
    question: DESK_SECTION_QUESTION[spec.key],
    state: worstState(sources.map((s) => s.state)),
    detail: summarise(sources),
    sources,
    links: spec.links,
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
