/**
 * پوستهٔ مشترکِ صفحاتِ بازار — تعریفِ بخش‌ها و نمایهٔ جست‌وجو.
 *
 * ── چرا این فایل وجود دارد ────────────────────────────────────────────────
 * تا پیش از این، هر صفحهٔ بازار ناوبریِ خودش را داشت (یا اصلاً نداشت) و
 * کاربر بعد از رفتن به `/market/stocks` هیچ نشانه‌ای نمی‌دید که در کدام بخشِ
 * بازار است و بخش‌های دیگر کجایند. این ماژول **یک** تعریفِ مشترک می‌دهد تا
 * پوسته در همهٔ صفحات یکسان بماند.
 *
 * ⚠️ اینجا هیچ مسیرِ تازه‌ای ساخته نمی‌شود. همهٔ hrefها به routeهای **موجودِ**
 * `app/market/…` اشاره می‌کنند؛ «طلا و ارز» عمداً یک **لنگرِ درون‌صفحه‌ای** است
 * چون بخشی از `/market` است، نه یک صفحهٔ مستقل — و برچسبِ `anchor` همین را
 * صریح می‌کند تا نما نتواند لنگر را مثلِ یک تبِ صفحه‌ای نشان دهد.
 */

export type MarketSectionKey = "overview" | "stocks" | "funds" | "gold" | "map" | "options";

export interface MarketSection {
  key: MarketSectionKey;
  /** مسیرِ موجود — هرگز مسیرِ تازه */
  href: string;
  label: string;
  /** یک جملهٔ کوتاه: در این بخش چه چیزی هست */
  hint: string;
  /**
   * `true` یعنی این یک **لنگرِ درونِ همان صفحه** است، نه صفحهٔ جدا.
   * نما باید این دو را متفاوت نشان دهد (قاعدهٔ «تب محلی ≠ لینکِ بین‌صفحه‌ای»).
   */
  anchor?: boolean;
}

export const MARKET_SECTIONS: readonly MarketSection[] = [
  { key: "overview", href: "/market", label: "نمای کلان", hint: "شاخص، نبض بازار و جریان پول" },
  { key: "stocks", href: "/market/stocks", label: "سهام", hint: "تابلوی کامل نمادهای بورس و فرابورس" },
  { key: "funds", href: "/market/funds", label: "صندوق‌ها", hint: "NAV، حباب و بازده صندوق‌ها" },
  { key: "gold", href: "/market#gold-currency", label: "طلا و ارز", hint: "بخشی از نمای کلان", anchor: true },
  { key: "map", href: "/market/map", label: "نقشه و صنایع", hint: "نقشهٔ نمادها و میز صنایع" },
  { key: "options", href: "/market/options", label: "اختیار معامله", hint: "تابلوی قراردادهای اختیار" },
] as const;

/* ── نمایهٔ جست‌وجو ───────────────────────────────────────────────────────── */

export type MarketEntryKind = "stock" | "fund";

/**
 * ردیفِ نمایه — عمداً **باریک**: فقط چیزی که برای یافتن و نمایشِ نتیجه لازم
 * است. کلِ ردیفِ `IrStockRow` (با NAV، دفترِ سفارش، جریانِ حقیقی و …) به
 * مرورگر فرستاده نمی‌شود؛ هم حجمِ بی‌دلیل است، هم دادهٔ مصرف‌نشده.
 */
export interface MarketSearchEntry {
  /** نمادِ کوتاه (l18) — همان چیزی که در URL می‌رود */
  id: string;
  /** نامِ کاملِ فارسی */
  name: string;
  kind: MarketEntryKind;
  /** دستهٔ صندوق (طلا/سهامی/درآمد ثابت/…) — فقط برای صندوق‌ها */
  type?: string;
}

/**
 * یکسان‌سازیِ متنِ فارسی برای مقایسه.
 *
 * چرا لازم است: کاربر «طلای» را با ی فارسی می‌نویسد و منبع «طلاي» را با یِ
 * عربی می‌دهد؛ «نيم‌فاصله» گاهی هست و گاهی نیست. بدونِ این تابع، جست‌وجویی
 * که کاربر درست تایپ کرده بی‌نتیجه برمی‌گردد و او فکر می‌کند نماد وجود ندارد.
 */
export function normalizeFa(input: string): string {
  return (input || "")
    .replace(/[يى]/g, "ی") // ي/ى → ی
    .replace(/[ك]/g, "ک") // ك → ک
    .replace(/[ة]/g, "ه") // ة → ه
    .replace(/[ً-ْٰ]/g, "") // اعراب
    .replace(/[​-‏‪-‮]/g, "") // نیم‌فاصله و کنترل‌های جهت
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** امتیازِ تطابق. `null` یعنی اصلاً تطابق ندارد. کمتر = مرتبط‌تر. */
export function matchScore(entry: MarketSearchEntry, queryNorm: string): number | null {
  if (!queryNorm) return null;
  const id = normalizeFa(entry.id);
  const name = normalizeFa(entry.name);
  if (id === queryNorm) return 0; // نمادِ دقیق
  if (id.startsWith(queryNorm)) return 1; // نماد از ابتدا
  if (name.startsWith(queryNorm)) return 2; // نام از ابتدا
  if (id.includes(queryNorm)) return 3;
  if (name.includes(queryNorm)) return 4;
  return null;
}

/** حداکثر نتیجهٔ نمایش‌داده‌شده — بیشتر از این، فهرست به‌جای کمک، مانع است. */
export const SEARCH_RESULT_LIMIT = 8;

/**
 * جست‌وجو در نمایه. تابعِ خالص تا بشود مستقل از React آزمودش.
 * مرتب‌سازی: اول امتیاز، بعد کوتاهیِ نماد (نمادِ کوتاه‌تر معمولاً اصلی‌تر است).
 */
export function searchMarket(
  entries: readonly MarketSearchEntry[],
  query: string,
  limit = SEARCH_RESULT_LIMIT,
): MarketSearchEntry[] {
  const q = normalizeFa(query);
  if (q.length === 0) return [];
  const scored: Array<{ e: MarketSearchEntry; s: number }> = [];
  for (const e of entries) {
    const s = matchScore(e, q);
    if (s != null) scored.push({ e, s });
  }
  scored.sort((a, b) => a.s - b.s || a.e.id.length - b.e.id.length || a.e.id.localeCompare(b.e.id, "fa"));
  return scored.slice(0, limit).map((x) => x.e);
}

/* ── ساختِ نمایه از اسنپ‌شات ──────────────────────────────────────────────── */

/**
 * قاعدهٔ Z اسکیل `iran-market-data`: زیرنمادِ بلوکی/عمده (نمادِ ختم به رقم) و
 * حقِ تقدم (ختم به «ح») در **مبدأ** فیلتر می‌شوند. اسنپ‌شاتِ رله باید از قبل
 * تمیز باشد، ولی جست‌وجو رابطِ مستقیمِ کاربر است: اگر روزی یک زیرنماد از فیلترِ
 * مبدأ رد شود، نباید در نتیجهٔ جست‌وجوی کاربر ظاهر شود و او را به صفحه‌ای
 * ببرد که تاریخچه و NAV ندارد. این یک **لایهٔ دوم** است، نه جایگزینِ مبدأ.
 */
const SUB_TICKER_RE = /[0-9۰-۹٠-٩]$/;

export function isIndexableSymbol(id: string): boolean {
  const s = (id || "").trim();
  if (s.length === 0) return false;
  if (SUB_TICKER_RE.test(s)) return false;
  if (/ح$/.test(s)) return false; // حقِ تقدم
  return true;
}

interface RowLike {
  id: string;
  faName?: string;
  type?: string;
}

/**
 * نمایهٔ جست‌وجو از ردیف‌های اسنپ‌شات.
 *
 * خروجی روی سیم به مرورگر می‌رود، پس هر میدانِ اضافه هزینه دارد: فقط
 * `id`/`name`/`kind` و برای صندوق `type` (که برچسبِ نوعِ نتیجه را می‌سازد).
 * ردیفِ تکراری (نمادِ یکسان در دو منبع) یک بار می‌آید.
 */
export function buildSearchIndex(
  stocks: readonly RowLike[],
  funds: readonly RowLike[],
): MarketSearchEntry[] {
  const seen = new Set<string>();
  const out: MarketSearchEntry[] = [];
  // صندوق‌ها اول: نمادی که هم در فهرستِ سهام و هم صندوق‌ها هست، صندوق است.
  for (const f of funds) {
    const id = (f.id || "").trim();
    if (!isIndexableSymbol(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: (f.faName || "").trim(), kind: "fund", ...(f.type ? { type: f.type } : {}) });
  }
  for (const s of stocks) {
    const id = (s.id || "").trim();
    if (!isIndexableSymbol(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: (s.faName || "").trim(), kind: "stock" });
  }
  return out;
}

/* ── مسیرِ بازگشت ────────────────────────────────────────────────────────── */

export interface BackTarget {
  href: string;
  label: string;
}

/** اعتبارسنجِ مقدارِ یک پارامتر. `false` یعنی آن پارامتر دور ریخته می‌شود. */
type ParamValidator = (value: string) => boolean;

/* ── اعتبارسنج‌های پایه ──────────────────────────────────────────────────── */

const isEnum = (allowed: readonly string[]): ParamValidator => (v) => allowed.includes(v);

/** کنترل‌کاراکترها و جهت‌گردان‌های یونیکد — هیچ‌کدام در مقدارِ فیلتر جا ندارند. */
const CONTROL_RE = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

/**
 * متنِ آزادِ جست‌وجو. کران‌دار و بدونِ کنترل‌کاراکتر.
 *
 * چرا کران: این مقدار در `href` می‌نشیند و در تاریخچهٔ مرورگر و لاگِ سرور ثبت
 * می‌شود. یک رشتهٔ چندکیلوبایتی که کاربر هرگز تایپش نکرده، فقط از یک لینکِ
 * دست‌ساز می‌آید.
 */
const isFreeText = (max: number): ParamValidator => (v) =>
  v.length > 0 && v.length <= max && !CONTROL_RE.test(v);

/**
 * برچسبِ داده‌محور (نامِ صنعت) — فهرستِ مقادیر از دادهٔ بازار می‌آید، پس
 * enum ممکن نیست. در عوض شکلِ مقدار محدود می‌شود: حرفِ فارسی/لاتین، رقم،
 * فاصله، نیم‌فاصله و چند نشانهٔ متعارفِ نامِ صنعت.
 */
const INDUSTRY_RE = /^[\u0600-\u06FF\u200CA-Za-z0-9 ()\u002D\u060C.\u066B\u066C\/]{1,60}$/;
const isIndustry: ParamValidator = (v) => INDUSTRY_RE.test(v);

/* ── قراردادِ URLِ تابلوها ────────────────────────────────────────────────
 * این ثابت‌ها **هم** اعتبارسنجیِ `?from=` را می‌سازند و **هم** نوعِ کلیدِ
 * مرتب‌سازی را در خودِ کامپوننت. یک فهرست، دو مصرف‌کننده — تا مقداری که در
 * URL مجاز است با مقداری که جدول می‌فهمد نتواند از هم جدا بیفتد. */

export const STOCK_VIEWS = ["table", "map", "industry"] as const;
export type StockView = (typeof STOCK_VIEWS)[number];

export const STOCK_SORT_KEYS = [
  "faName", "price", "changePercent", "value", "marketValue", "pe",
] as const;
export type StockSortKey = (typeof STOCK_SORT_KEYS)[number];

export const FUND_SORT_KEYS = [
  "faName", "price", "changePercent", "value", "marketValue",
  "bubblePercent", "ret1w", "ret1m", "ret3m",
] as const;
export type FundSortKey = (typeof FUND_SORT_KEYS)[number];

export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRS)[number];

/** دسته‌های صندوق — برای اعتبارسنجیِ `?type=`. با `lib/core/fundCategory.ts` یکی است. */
export const FUND_TYPE_VALUES = [
  "درآمد ثابت", "سهامی", "بخشی", "طلا", "اهرمی", "سایر",
] as const;

/** بیشینهٔ طولِ عبارتِ جست‌وجو — بلندتر از این، تایپِ انسان نیست. */
export const SEARCH_MAX_LEN = 64;

interface BackTargetSpec extends BackTarget {
  /**
   * پارامترهای مجازِ این مسیر و اعتبارسنجِ مقدارشان.
   *
   * ── چرا فهرستِ سفیدِ پارامتر، نه «هرچه آمد» ─────────────────────────────
   * نسخهٔ قبل کلِ query را دور می‌ریخت، پس لینکِ «برگشت» داخلِ صفحهٔ نماد
   * کاربر را به تابلوی **بی‌فیلتر** برمی‌گرداند و او باید از نو فیلتر می‌کرد.
   * ولی نگه‌داشتنِ کورِ همهٔ پارامترها هم درست نیست: مقدارِ کنترل‌نشده از URL
   * به `href` می‌رسد. پس هر مسیر فقط پارامترهای **خودش** را نگه می‌دارد، و
   * هر مقدار باید از اعتبارسنجِ خودش رد شود.
   */
  params: Readonly<Record<string, ParamValidator>>;
}

/** پارامترِ مشترکِ همهٔ صفحاتِ بازار: جست‌وجوی پوسته. */
const SHELL_SEARCH = { find: isFreeText(SEARCH_MAX_LEN) } as const;

const BACK_TARGETS: ReadonlyArray<BackTargetSpec> = [
  { href: "/market", label: "میز بازار", params: { ...SHELL_SEARCH } },
  {
    href: "/market/stocks",
    label: "تابلوی سهام",
    params: {
      ...SHELL_SEARCH,
      q: isFreeText(SEARCH_MAX_LEN),
      industry: isIndustry,
      view: isEnum(STOCK_VIEWS),
      sort: isEnum(STOCK_SORT_KEYS),
      dir: isEnum(SORT_DIRS),
    },
  },
  {
    href: "/market/funds",
    label: "دیده‌بان صندوق‌ها",
    params: {
      ...SHELL_SEARCH,
      q: isFreeText(SEARCH_MAX_LEN),
      type: isEnum(FUND_TYPE_VALUES),
      sort: isEnum(FUND_SORT_KEYS),
      dir: isEnum(SORT_DIRS),
    },
  },
  { href: "/market/map", label: "نقشه و صنایع", params: { ...SHELL_SEARCH } },
  { href: "/market/options", label: "اختیار معامله", params: { ...SHELL_SEARCH } },
  { href: "/data", label: "بانک داده", params: {} },
];

/** سقفِ تعدادِ پارامترِ نگه‌داشته‌شده — گاردِ ساده در برابرِ URLِ متورم. */
const MAX_KEPT_PARAMS = 8;

/**
 * مقصدِ برگشت از روی `?from=`، **با حفظِ وضعیتِ مجاز**.
 *
 * مسیر باید دقیقاً یکی از `BACK_TARGETS` باشد (ضدِ ری‌دایرکتِ باز)، و از
 * query فقط پارامترهایی می‌مانند که هم برای آن مسیر تعریف شده‌اند و هم
 * مقدارشان معتبر است. ورودیِ ناشناخته، غایب یا مخرب بی‌صدا `fallback`
 * می‌دهد — هرگز خطا، هرگز مقصدِ بیرونی.
 */
export function resolveBackTarget(
  from: string | string[] | undefined,
  fallback: BackTarget,
): BackTarget {
  const raw = Array.isArray(from) ? from[0] : from;
  if (typeof raw !== "string") return fallback;

  const noHash = raw.split("#")[0];
  const qIndex = noHash.indexOf("?");
  const path = (qIndex === -1 ? noHash : noHash.slice(0, qIndex)).trim();
  const spec = BACK_TARGETS.find((t) => t.href === path);
  if (!spec) return fallback;

  const incoming = new URLSearchParams(qIndex === -1 ? "" : noHash.slice(qIndex + 1));
  // مرتب‌سازیِ کلیدها: خروجی مستقل از ترتیبِ ورودی و در نتیجه آزمون‌پذیر است.
  const keys = [...new Set(incoming.keys())].sort();
  const kept = new URLSearchParams();
  for (const k of keys) {
    if (kept.size >= MAX_KEPT_PARAMS) break;
    const validate = spec.params[k];
    if (!validate) continue;
    // فقط **اولین** مقدار؛ پارامترِ تکراری نباید دو بار در خروجی بیاید.
    const v = incoming.get(k);
    if (v != null && validate(v)) kept.set(k, v);
  }

  const qs = kept.toString();
  return { href: qs ? `${spec.href}?${qs}` : spec.href, label: spec.label };
}
