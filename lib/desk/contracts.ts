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
  "clients",
  "operations",
] as const;

export type DeskSectionKey = (typeof DESK_SECTIONS)[number];

export const DESK_SECTION_LABEL: Record<DeskSectionKey, string> = {
  today: "امروز",
  intelligence: "هوشمندیِ بازار",
  decisions: "تصمیم‌ها و سناریوها",
  reference: "سبدِ مرجع",
  clients: "مشتری و محصول",
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
  clients: "چه کسی یا چه محصولی منتظرِ اقدامِ من است؟",
  operations: "خطِ لولهٔ داده و cronها سالم‌اند؟",
};

/**
 * هفت حالتِ متعارف — تنها واژگانِ مجازِ وضعیت در کلِ میز.
 *
 * پیش از این دو واژگانِ رقیب وجود داشت: اینجا چهار حالت و در
 * `lib/intelligence/command-desk.ts` پنج حالت با یک نگاشتِ دستی وسطشان. دو
 * واژگان یعنی دو حقیقتِ ممکن برای یک چیز.
 *
 * دو حالتِ تازه، دو چیزِ متفاوت را از هم جدا می‌کنند که قبلاً هر دو
 * «مشکلِ داده» به نظر می‌رسیدند:
 *
 *   `unconfigured`    مالک هنوز تصمیم نگرفته. دادهٔ خراب نیست — تصمیم نیامده.
 *                     نبودِ نسخهٔ رسمیِ سبد قبلاً شبیهِ خرابیِ فید دیده می‌شد.
 *   `awaiting_review` دادهٔ سالم، منتظرِ قضاوتِ انسان. «آماده» نیست، چون هنوز
 *                     کسی تأییدش نکرده؛ «خراب» هم نیست.
 *
 * ── و چرا هشتمی (`present`) ─────────────────────────────────────────────
 * `ready` برچسبِ «به‌روز» دارد، یعنی یک **ادعای تازگی**. ولی نسخهٔ قبلی آن را
 * به هر منبعی می‌داد که `rule: null` داشت و دستِ‌کم یک ردیف — یعنی صرفِ
 * «جدول خالی نیست» به «داده تازه است» ترجمه می‌شد. برای صفِ پیش‌نویس‌ها،
 * جدول‌های سبدِ مرجع و رکوردهای مشتری هیچ آستانه‌ای وجود ندارد، پس آن سبز
 * هیچ‌وقت **کسب** نشده بود: ده منبعِ میز بی‌آنکه چیزی اثبات شود سبز بودند.
 *
 *   `present` — رکورد هست، و **تازگی سنجیده نمی‌شود**.
 *
 * خرابی نیست (`isDataFault` رد می‌کند) چون برای یک صف، کهنگی خطا نیست؛ ولی
 * `ready` هم نیست، چون چیزی را که اندازه نگرفته‌ایم ادعا نمی‌کنیم. تنها
 * منبعی «به‌روز» است که آستانه‌ای داشته باشد و از آن آستانه رد شده باشد.
 */
export type DataState =
  | "loading"
  | "ready"
  | "present"
  | "awaiting_review"
  | "unconfigured"
  | "stale"
  | "empty"
  | "unavailable";

export const DATA_STATE_LABEL: Record<DataState, string> = {
  loading: "در حال دریافت",
  ready: "به‌روز",
  present: "رکورد دارد",
  awaiting_review: "منتظرِ بازبینی",
  unconfigured: "پیکربندی نشده",
  stale: "کهنه",
  empty: "خالی",
  unavailable: "در دسترس نیست",
};

/**
 * آیا این حالت یک **خرابیِ داده** است؟
 *
 * `unconfigured` و `awaiting_review` نیستند: در هر دو، خطِ داده سالم است و
 * توپ در زمینِ انسان است. اگر این تفکیک نباشد، یک تصمیمِ نگرفته در نوارِ
 * سلامت قرمز می‌شود و خرابیِ واقعیِ فید را بی‌ارزش می‌کند.
 *
 * `present` هم نیست: نبودِ **سنجه** با خرابیِ **داده** یکی نیست. اگر
 * «تازگی‌اش را نمی‌سنجیم» قرمز شود، هر روز یازده هشدارِ کاذب می‌بینیم و
 * فیدِ واقعاً مرده لای آن‌ها گم می‌شود — همان گرگ‌گرگ‌کردنی که این پرونده
 * علیه‌اش نوشته شده.
 */
export function isDataFault(state: DataState): boolean {
  return state === "stale" || state === "empty" || state === "unavailable";
}

/**
 * یک منبعِ واقعی در میز — یک جدولِ مشخص، با حالت و شمارشِ خودش.
 *
 * `count` عمداً `number | null` است: `null` یعنی **نتوانستیم بشماریم**، و
 * هرگز نباید به صفر تبدیل شود. صفرِ واقعی (`count = 0` با `state = "empty"`)
 * یک واقعیتِ معتبر است؛ صفرِ ساختگی یک دروغ است.
 */
export interface DeskSource {
  /**
   * شناسهٔ یکتای ردیف. معمولاً همان نامِ جدول است، ولی یک جدول می‌تواند بیش
   * از یک منبع بسازد — `cron_runs` هم «همهٔ نوبت‌ها» را می‌دهد هم «آخرین
   * اجرای موفق»، و آن دو ردیفِ متفاوت با حالتِ متفاوت‌اند.
   */
  key: string;
  /** نامِ جدول در دیتابیس — پاسخِ «این عدد از کجا آمد؟». */
  table: string;
  label: string;
  state: DataState;
  detail: string;
  count: number | null;
  ageMinutes: number | null;
  /**
   * دو زمانِ **متفاوت** که قبلاً به یک `ageMinutes` تقلیل می‌شدند:
   *
   *   `observedAt` جدیدترین لحظه‌ای که خودِ داده دربارهٔ جهان ادعا می‌کند
   *                (بیشینهٔ ستونِ زمانیِ همان جدول)
   *   `fetchedAt`  لحظه‌ای که ما پرسیدیم
   *
   * جدا نگه‌داشتنشان قاعدهٔ «مهرِ زمانیِ سراسری برچسبِ فیدِ دیگر نمی‌شود» را
   * در سطحِ تایپ اجرا می‌کند: هر منبع ساعتِ خودش را حمل می‌کند و هیچ منبعی
   * نمی‌تواند تازگیِ منبعِ دیگر را قرض بگیرد.
   *
   * هر دو `string | null`‌اند. `null` یعنی **نمی‌دانیم** — نه «اکنون».
   */
  observedAt: string | null;
  fetchedAt: string;
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
  present: 1,
  awaiting_review: 2,
  unconfigured: 3,
  loading: 4,
  stale: 5,
  empty: 6,
  unavailable: 7,
};

/**
 * بدترین حالت برنده است.
 *
 * ترتیب عمدی است و با شهودِ اول فرق دارد: `empty` از `stale` بدتر حساب
 * می‌شود، چون دادهٔ کهنه دستِ‌کم یک‌بار وجود داشته؛ و `unavailable` از هر دو
 * بدتر است، چون دربارهٔ واقعیت **هیچ** نمی‌گوید.
 *
 * `present` درست زیرِ `ready` می‌نشیند: یک بخش که حتی یک منبعِ نسنجیده دارد
 * نباید کلاً «به‌روز» خوانده شود، ولی این هم آن‌قدر جدی نیست که جای یک
 * بازبینیِ معوق یا یک فیدِ مرده را بگیرد.
 *
 * دو حالتِ انسانی زیرِ همهٔ خرابی‌ها می‌نشینند: یک تصمیمِ نگرفته
 * (`unconfigured`) یا یک بازبینیِ انجام‌نشده (`awaiting_review`) نباید یک فیدِ
 * واقعاً خراب را بپوشاند. `loading` هم زیرِ خرابی‌هاست چون گذراست و خودش
 * حل می‌شود — ولی بالای حالت‌های انسانی است، چون هنوز **نمی‌دانیم**.
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
  /** وقتی یک جدول بیش از یک منبع می‌سازد. پیش‌فرض: نامِ جدول. */
  key?: string;
  table: string;
  label: string;
  /** `null` یعنی این منبع اصلاً معیارِ تازگیِ زمانی ندارد. */
  rule: FreshnessRule | null;
  /**
   * وقتی منبع فقط **زیرمجموعه‌ای** از جدول است — عبارتی مثل «اجرای موفق».
   *
   * بدونِ این، `cron_runs` دقیقاً همان دروغی را می‌گفت که برای ساختنش
   * ساخته شده بود: میز آخرین `started_at` را می‌خواند و به `status` کاری
   * نداشت، پس یک jobی که **هر شب شروع می‌شود و هر شب شکست می‌خورد** روی
   * میز «به‌روز» بود. دفترِ اجرا برای همین وجود دارد که «اجرا شد» را از
   * «اجرا موفق بود» جدا کند؛ نخواندنِ `status` یعنی دور زدنِ کلِ فایدهٔ آن.
   *
   * وقتی پر باشد، متنِ حالت هم همین دامنه را می‌گوید — وگرنه یک شمارشِ
   * فیلترشده شبیهِ شمارشِ کلِ جدول دیده می‌شود، که خودش عددِ گمراه‌کننده است.
   */
  scope?: string | null;
}

/** زمانِ منبع به ISO — ورودیِ نامعتبر `null` می‌شود، نه «اکنون». */
function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function classifySource(
  spec: SourceSpec,
  input: SourceInput,
  now: Date
): DeskSource {
  // `fetchedAt` همیشه واقعی است: همین لحظه پرسیدیم. `observedAt` فقط وقتی پر
  // می‌شود که خودِ منبع زمانی داده باشد.
  const base = {
    key: spec.key ?? spec.table,
    table: spec.table,
    label: spec.label,
    fetchedAt: now.toISOString(),
    observedAt: toIso(input.lastAt),
  };
  // وقتی منبع زیرمجموعه است، هر جملهٔ حالت باید همان زیرمجموعه را نام ببرد.
  const scope = spec.scope ?? null;
  const subject = scope ? `آخرین «${scope}»` : "آخرین به‌روزرسانی";

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
      // ستونِ زمانی خوانده نشد، پس زمانِ مشاهده **قابلِ دانستن نیست**.
      observedAt: null,
    };
  }

  if (input.count === 0) {
    return {
      ...base,
      state: "empty",
      detail: scope
        ? `جدول در دسترس است ولی هیچ رکوردی با معیارِ «${scope}» ندارد — این با «جدولِ خالی» یکی نیست`
        : "منبع در دسترس است و هیچ رکوردی ندارد — یک واقعیتِ معتبر، نه خطا",
      count: 0,
      ageMinutes: null,
    };
  }

  const age = deskAgeMinutes(input.lastAt, now);

  if (!spec.rule) {
    // اینجا `ready` **کسب نشده**: هیچ آستانه‌ای نداریم که از آن رد شده باشیم،
    // پس تنها چیزی که می‌دانیم این است که رکورد وجود دارد. `age` را همچنان
    // حمل می‌کنیم — دانستنش مفید است — ولی حالت را با آن تزیین نمی‌کنیم.
    return {
      ...base,
      state: "present",
      detail:
        age === null
          ? "رکورد دارد؛ برای این منبع آستانهٔ تازگی تعریف نشده، پس «به‌روز» دربارهٔ آن ادعا نمی‌شود"
          : `${subject} ${age} دقیقه پیش — آستانهٔ تازگی‌ای تعریف نشده، پس این عدد سنجیده نمی‌شود`,
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
    return { ...base, state: "ready", detail: `${subject} ${age} دقیقه پیش`, count: input.count, ageMinutes: age };
  }

  return {
    ...base,
    state: "stale",
    detail: `${subject} ${age} دقیقه پیش بوده — از آستانهٔ ${spec.rule.freshWithinMinutes} دقیقه گذشته`,
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
  const present = sources.filter((s) => s.state === "present");
  const ready = sources.filter((s) => s.state === "ready");

  const parts: string[] = [];
  if (broken.length > 0) parts.push(`${broken.length} منبع در دسترس نیست`);
  if (stale.length > 0) parts.push(`${stale.length} منبع کهنه`);
  if (empty.length > 0) parts.push(`${empty.length} منبع خالی`);
  // «بدونِ سنجهٔ تازگی» عمداً از «به‌روز» جدا شمرده می‌شود: جمع‌کردنشان
  // دقیقاً همان عددِ متورمِ سبزی است که این ماژول علیه‌اش نوشته شده.
  if (present.length > 0) parts.push(`${present.length} منبع بدونِ سنجهٔ تازگی`);
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
