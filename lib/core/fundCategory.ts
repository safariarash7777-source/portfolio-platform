/**
 * دستهٔ کوتاهِ صندوق — برای فیلتر و «تفکیکِ» بالای دیده‌بان.
 *
 * ── مسئله ────────────────────────────────────────────────────────────────
 * منبع نامِ **رسمیِ** بلند می‌دهد: «صندوق سرمایه گذاری در اوراق با درآمدثابت»،
 * «صندوق های سرمایه گذاری اهرمی»، … . سیزده رشتهٔ بلند در یک `select` نه
 * خوانده می‌شود نه اسکن. اینجا هر رشته به یک برچسبِ کوتاه **نگاشت** می‌شود.
 *
 * ── قاعده ────────────────────────────────────────────────────────────────
 * ۱) هیچ دسته‌ای اختراع نمی‌شود: هر برچسب از نوعِ واقعیِ منبع می‌آید.
 * ۲) نامِ رسمیِ کامل حذف نمی‌شود — در ردیفِ خودِ صندوق می‌ماند.
 * ۳) نوعِ ناشناخته بی‌صدا نمی‌افتد؛ به «سایر» می‌رود و شمرده می‌شود.
 *
 * نگاشت از رشته‌های واقعیِ اسنپ‌شاتِ ۱۴۰۵/۰۶/۲۴ ساخته شده (سیزده نوع، ۳۳۰ صندوق).
 *
 * ── چرا «شاخصی» اینجا نیست ───────────────────────────────────────────────
 * تابلوهای مرجع چیپِ «شاخصی» دارند، ولی در سیزده نوعِ واقعیِ فیدِ ما هیچ ردیفی
 * چنین نوعی ندارد (صندوقِ شاخصی زیرِ «صندوق سرمایه گذاری در سهام» می‌آید).
 * افزودنِ یک دستهٔ همیشه‌خالی یعنی ساختنِ فیلتری که هرگز نتیجه ندارد — همان
 * «دستهٔ اختراعی» که قاعدهٔ ۱ منع می‌کند. اگر روزی منبع این نوع را جدا کرد، یک
 * قاعده به `RULES` و یک عضو به `FUND_CATEGORIES`/`FUND_TYPE_VALUES` اضافه شود.
 */

export type FundCategory =
  | "درآمد ثابت"
  | "سهامی"
  | "بخشی"
  | "طلا"
  | "نقره"
  | "مختلط"
  | "اهرمی"
  | "املاک"
  | "فراصندوق"
  | "کالایی"
  | "سایر";

/** ترتیبِ نمایش — پرجمعیت‌ترها اول، «سایر» همیشه آخر. */
export const FUND_CATEGORIES: readonly FundCategory[] = [
  "درآمد ثابت",
  "سهامی",
  "بخشی",
  "طلا",
  "نقره",
  "مختلط",
  "اهرمی",
  "املاک",
  "فراصندوق",
  "کالایی",
  "سایر",
] as const;

/** برچسبِ «همهٔ دسته‌ها» — رشته‌ای جدا تا با یک دستهٔ واقعی اشتباه نشود. */
export const ALL_CATEGORIES = "همه";

/**
 * نوعِ رسمیِ منبع → دستهٔ کوتاه.
 *
 * تطبیق با «شامل‌بودنِ» کلیدواژه انجام می‌شود، نه تساویِ دقیق: نامِ رسمی گاهی
 * با «صندوق های» و گاهی «صندوق» شروع می‌شود و فاصله‌هایش یکدست نیست، و یک
 * تغییرِ کوچک در منبع نباید کلِ فیلتر را به «سایر» بریزد.
 *
 * ترتیبِ بررسی بخشی از قاعده است، نه سلیقه:
 *   · «نقره» پیش از «طلا» — وگرنه قاعدهٔ عامِ طلا صندوقِ نقره را هم می‌بلعد.
 *   · «طلا» و «نقره» پیش از «کالایی» — نامِ رسمیِ هر دو با «صندوق کالایی…»
 *     شروع می‌شود، پس قاعدهٔ کالایی اگر جلو بیفتد ۴۹ صندوق را از دستهٔ
 *     درست‌شان بیرون می‌کشد و «کالایی» را به دسته‌ای دوپهلو تبدیل می‌کند.
 *     «کالایی» اینجا یعنی کالای غیرِ فلزِ گران‌بها (امروز: کشاورزی).
 */
const RULES: ReadonlyArray<{ test: RegExp; category: FundCategory }> = [
  { test: /درآمد\s*ثابت/, category: "درآمد ثابت" },
  { test: /اهرمی/, category: "اهرمی" },
  { test: /نقره/, category: "نقره" },
  // عمداً فقط «طلا» — نه «مبتنی بر طلا». نامِ رسمیِ امروز «صندوق کالایی مبتنی
  // بر طلا» است، ولی قاعده‌ای که به آن عبارتِ دقیق بچسبد با کوچک‌ترین تغییرِ
  // نگارشِ منبع (مثلاً «صندوق طلا») بی‌صدا به «سایر» می‌افتد و ۳۵ صندوق از
  // فیلتر گم می‌شوند.
  { test: /طلا/, category: "طلا" },
  { test: /املاک|مستغلات/, category: "املاک" },
  // نامِ رسمی «صندوق س. صندوق در صندوق» است؛ «فراصندوق» نامِ رایجِ همان.
  { test: /فراصندوق|صندوق\s+در\s+صندوق/, category: "فراصندوق" },
  { test: /مختلط/, category: "مختلط" },
  { test: /بخشی/, category: "بخشی" },
  // جسورانه/خصوصی/پروژه: سه نوعِ واقعیِ منبع که دستهٔ تابلویی ندارند. صریح
  // نوشته می‌شوند تا «سایر»ِ این صفحه یک سبدِ تصادفی نباشد؛ اگر روزی تعدادشان
  // معنادار شد، همین‌جا دسته می‌گیرند.
  { test: /جسورانه|خصوصی|پروژه/, category: "سایر" },
  { test: /سهام/, category: "سهامی" },
  { test: /کالایی|کشاورزی/, category: "کالایی" },
];

export function fundCategory(sourceType: string | null | undefined): FundCategory {
  const t = (sourceType ?? "").trim();
  if (!t) return "سایر";
  for (const r of RULES) if (r.test.test(t)) return r.category;
  return "سایر";
}

/** شمارشِ هر دسته در یک مجموعه — برای نوشتنِ تعداد کنارِ برچسبِ فیلتر. */
export function countByCategory(
  rows: ReadonlyArray<{ type?: string | null; industry?: string | null }>,
): Map<FundCategory, number> {
  const out = new Map<FundCategory, number>();
  for (const c of FUND_CATEGORIES) out.set(c, 0);
  for (const r of rows) {
    const c = fundCategory(r.type ?? r.industry ?? null);
    out.set(c, (out.get(c) ?? 0) + 1);
  }
  return out;
}

/* ── تفکیکِ صندوق‌ها ───────────────────────────────────────────────────────
 * پنلِ «تفکیک» به سه چیز نیاز دارد: وزنِ هر دسته، ارزشِ بازارش و حال‌وهوای
 * امروزش. هر سه جمعِ ساده‌اند، ولی جمعِ ساده روی دادهٔ ناقص دروغ می‌گوید:
 * صندوقی که `marketValue` ندارد اگر صفر حساب شود، سهمِ دسته‌اش کوچک‌تر از
 * واقعیت دیده می‌شود بدون اینکه کسی بفهمد. پس هر جمع، تعدادِ ردیفِ
 * **پوشش‌داده‌شده** را هم با خودش حمل می‌کند و UI آن را می‌نویسد.
 *
 * محاسبه اینجاست و نه در کامپوننت — «یک موتور، دو نما».
 * ------------------------------------------------------------------------- */

export interface FundBreakdownRow {
  type?: string | null;
  industry?: string | null;
  /** ارزشِ بازار به **ریال**، همان‌طور که فید می‌دهد. تبدیل کارِ لایهٔ نمایش است. */
  marketValue?: number | null;
  changePercent?: number | null;
  closingChangePercent?: number | null;
}

export interface CategorySlice {
  category: FundCategory;
  /** تعدادِ صندوقِ این دسته. */
  count: number;
  /** سهمِ تعدادی از کلِ مجموعه — ۰ تا ۱. */
  share: number;
  /**
   * همان سهم، گِرد‌شده به درصدِ صحیح **به روشِ بزرگ‌ترین باقی‌مانده**.
   *
   * گِردکردنِ جداگانهٔ هر سهم جمعِ ۱۰۱٪ (یا ۹۹٪) می‌دهد؛ روی یازده دسته این
   * تقریباً همیشه اتفاق می‌افتد و اولین کسی که ستون را جمع می‌زند فکر می‌کند
   * داده غلط است. اینجا کلِ ۱۰۰ واحد پخش می‌شود، پس جمعِ عددهای نوشته‌شده
   * دقیقاً ۱۰۰ است. دسته‌ای که به صفر گرد می‌شود ولی صندوق دارد، در UI با
   * «کمتر از ٪۱» نوشته می‌شود نه «٪۰».
   */
  sharePercent: number;
  /** جمعِ ارزشِ بازار (ریال) — `null` یعنی هیچ ردیفی این عدد را نداشت. */
  marketValue: number | null;
  /** چند ردیف از `count` واقعاً `marketValue` داشتند. */
  marketValueCovered: number;
  /** میانگینِ بازدهٔ روز — `null` یعنی هیچ ردیفی بازده نداشت. */
  avgChangePercent: number | null;
  /** چند ردیف از `count` بازدهٔ روز داشتند. */
  ratedCount: number;
}

export interface FundBreakdown {
  /** فقط دسته‌های دارای صندوق، پرجمعیت‌ترین اول و «سایر» همیشه آخر. */
  slices: CategorySlice[];
  /** کلِ مجموعه‌ای که سهم‌ها بر آن حساب شده‌اند. */
  total: number;
  /** جمعِ ارزشِ بازارِ کلِ مجموعه (ریال) — `null` اگر هیچ ردیفی نداشت. */
  marketValueTotal: number | null;
  /** چند ردیف از `total` ارزشِ بازار داشتند. */
  marketValueCovered: number;
}

const dayChange = (r: FundBreakdownRow): number | null => {
  const v = r.changePercent ?? r.closingChangePercent;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

const marketValueOf = (r: FundBreakdownRow): number | null =>
  typeof r.marketValue === "number" && Number.isFinite(r.marketValue) ? r.marketValue : null;

/**
 * پخشِ ۱۰۰ واحدِ درصد بینِ دسته‌ها با روشِ بزرگ‌ترین باقی‌مانده.
 *
 * هر دسته اول سهمِ صحیحِ خودش را می‌گیرد؛ واحدهای باقی‌مانده به ترتیبِ بزرگیِ
 * جزءِ اعشاری توزیع می‌شوند. گره‌ها با تعدادِ بزرگ‌تر و سپس با اندیسِ ورودی باز
 * می‌شوند تا خروجی قطعی باشد.
 */
function assignSharePercents(slices: CategorySlice[]): void {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total <= 0) return;
  const exact = slices.map((s) => (s.count / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = slices
    .map((s, i) => ({ i, frac: exact[i] - floors[i], count: s.count }))
    .sort((a, b) => b.frac - a.frac || b.count - a.count || a.i - b.i);
  for (const o of order) {
    if (remaining <= 0) break;
    floors[o.i] += 1;
    remaining -= 1;
  }
  slices.forEach((s, i) => {
    s.sharePercent = floors[i];
  });
}

export function categoryBreakdown(rows: ReadonlyArray<FundBreakdownRow>): FundBreakdown {
  const acc = new Map<
    FundCategory,
    { count: number; mv: number; mvCovered: number; changeSum: number; rated: number }
  >();

  for (const r of rows) {
    const c = fundCategory(r.type ?? r.industry ?? null);
    const a = acc.get(c) ?? { count: 0, mv: 0, mvCovered: 0, changeSum: 0, rated: 0 };
    a.count += 1;
    const mv = marketValueOf(r);
    if (mv != null) {
      a.mv += mv;
      a.mvCovered += 1;
    }
    const ch = dayChange(r);
    if (ch != null) {
      a.changeSum += ch;
      a.rated += 1;
    }
    acc.set(c, a);
  }

  const total = rows.length;
  const slices: CategorySlice[] = [...acc.entries()].map(([category, a]) => ({
    category,
    count: a.count,
    share: total > 0 ? a.count / total : 0,
    sharePercent: 0, // در گامِ بعد، یک‌جا و با بزرگ‌ترین باقی‌مانده پر می‌شود.
    marketValue: a.mvCovered > 0 ? a.mv : null,
    marketValueCovered: a.mvCovered,
    avgChangePercent: a.rated > 0 ? a.changeSum / a.rated : null,
    ratedCount: a.rated,
  }));
  assignSharePercents(slices);

  // پرجمعیت‌ترین اول؛ «سایر» هر چه بزرگ هم باشد آخر می‌ماند چون یک دسته نیست،
  // باقی‌ماندهٔ دسته‌بندی است. گره‌ها با ترتیبِ اعلامیِ `FUND_CATEGORIES` باز
  // می‌شوند تا خروجی بینِ دو رندر جابه‌جا نشود.
  const declared = (c: FundCategory) => FUND_CATEGORIES.indexOf(c);
  slices.sort((x, y) => {
    if (x.category === "سایر") return 1;
    if (y.category === "سایر") return -1;
    return y.count - x.count || declared(x.category) - declared(y.category);
  });

  const mvCovered = slices.reduce((s, x) => s + x.marketValueCovered, 0);
  const mvTotal = slices.reduce((s, x) => s + (x.marketValue ?? 0), 0);

  return {
    slices,
    total,
    marketValueTotal: mvCovered > 0 ? mvTotal : null,
    marketValueCovered: mvCovered,
  };
}
