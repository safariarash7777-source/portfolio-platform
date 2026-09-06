// حبابِ صندوق (اختلافِ قیمتِ بازار با NAV ابطال) — جاری و سریِ تاریخی.
//
// ── چرا این فایل وجود دارد ───────────────────────────────────────────────
// تا امروز حباب فقط در رله محاسبه می‌شد (`bubblePercent` در payload) و
// `FundsFullBoard` همان عدد را نمایش می‌داد. یعنی یک محاسبهٔ مالی بیرون از
// `lib/core/` زندگی می‌کرد — نقضِ اصلِ «یک موتور، دو نما» — و هیچ نسخهٔ
// تاریخی‌ای نداشت. اینجا همان تعریف، آزمون‌پذیر و با سریِ زمانی، بازسازی شده.
// عددِ رله دور انداخته نمی‌شود؛ این ماژول امکانِ **تطبیق** با آن را می‌دهد.
//
// ── تعریف ────────────────────────────────────────────────────────────────
//   حباب٪ = (قیمتِ بازار − NAV ابطال) ÷ NAV ابطال × ۱۰۰
// مثبت = بازار گران‌تر از ارزشِ ذاتیِ واحد · منفی = زیرِ NAV.
//
// ── واحد (قاعدهٔ D3) ─────────────────────────────────────────────────────
// هر دو ورودی باید **تومان** باشند. `lib/core/navHistory.ts` این تبدیل را در
// مرزِ خواندن انجام می‌دهد (`close` ریال ÷ ۱۰). این ماژول تبدیلِ واحد نمی‌کند
// و نباید بکند — اگر ورودی ریال باشد، گاردِ نسبتِ نامعقول آن را می‌گیرد.
//
// ── دادهٔ غایب (قاعدهٔ D2) ────────────────────────────────────────────────
// روزِ بدونِ NAV یا بدونِ قیمت **در سری نمی‌آید**؛ هیچ درون‌یابی، هیچ حملِ
// مقدارِ روزِ قبل. تعدادِ روزهای کنارگذاشته‌شده برگردانده می‌شود تا نما بتواند
// «چقدر ندیدیم» را صادقانه بگوید.

/** یک روزِ جفت‌شدهٔ قیمت و NAV — هر دو تومان. */
export interface NavPricePoint {
  trade_date: string;
  /** NAV ابطال (تومان) */
  nav: number;
  /** قیمتِ پایانی (تومان) — null یعنی آن روز ثبت نشده */
  close: number | null;
}

export interface BubblePoint {
  trade_date: string;
  priceToman: number;
  navToman: number;
  /** درصد؛ مثبت = گران‌تر از NAV */
  bubblePercent: number;
}

/** چرا یک روز از سری بیرون ماند — برای نمایشِ صادقانهٔ پوشش. */
export interface BubbleSkipped {
  missingPrice: number;
  missingNav: number;
  implausibleRatio: number;
}

export interface BubbleCoverage {
  firstDate: string;
  lastDate: string;
  /** تعدادِ روزهای دارای نقطهٔ معتبر — نه فاصلهٔ تقویمی */
  observedDays: number;
  /** فاصلهٔ تقویمیِ دو سر بازه (روز) — همیشه ≥ observedDays */
  calendarSpanDays: number;
}

export interface BubbleSeries {
  points: BubblePoint[];
  /** null یعنی هیچ نقطهٔ معتبری نبود */
  coverage: BubbleCoverage | null;
  skipped: BubbleSkipped;
}

/* ── گاردِ نسبتِ نامعقول ───────────────────────────────────────────────────
 * قاعدهٔ N3 اسکیل می‌گوید «نسبتِ قیمت/NAV نامعقول منتشر نشود». ولی «نامعقول»
 * را نباید با «غیرمنتظره» یکی گرفت: صندوقِ اهرمی واقعاً با حبابِ ۴۰٪+ معامله
 * می‌شود و حذفش یعنی پنهان‌کردنِ واقعیتِ بازار.
 *
 * پس این کران برای **قضاوتِ بازار** نیست، برای **خطای داده** است. شایع‌ترین
 * خطای این پروژه اشتباهِ ریال و تومان است که نسبت را دقیقاً ۱۰ برابر یا یک‌دهم
 * می‌کند. بازهٔ [۰.۲ ، ۵] هر دو حالت را می‌گیرد و هیچ رفتارِ واقعیِ بازار را
 * حذف نمی‌کند (حبابِ −۸۰٪ تا +۴۰۰٪ همچنان عبور می‌کند). */
export const MIN_PRICE_NAV_RATIO = 0.2;
export const MAX_PRICE_NAV_RATIO = 5;

/** حبابِ یک نقطه (٪). ورودیِ نامعتبر یا نسبتِ خارج از بازهٔ سلامت → null. */
export function bubblePercent(priceToman: number | null | undefined, navToman: number | null | undefined): number | null {
  if (typeof priceToman !== "number" || !isFinite(priceToman) || priceToman <= 0) return null;
  if (typeof navToman !== "number" || !isFinite(navToman) || navToman <= 0) return null;
  const ratio = priceToman / navToman;
  if (ratio < MIN_PRICE_NAV_RATIO || ratio > MAX_PRICE_NAV_RATIO) return null;
  return ((priceToman - navToman) / navToman) * 100;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * سریِ حباب از سریِ جفت‌شدهٔ NAV و قیمت.
 * ورودی لازم نیست مرتب باشد؛ خروجی همیشه صعودی است.
 */
export function bubbleSeries(days: readonly NavPricePoint[]): BubbleSeries {
  const skipped: BubbleSkipped = { missingPrice: 0, missingNav: 0, implausibleRatio: 0 };
  const points: BubblePoint[] = [];

  for (const d of days) {
    const navOk = typeof d.nav === "number" && isFinite(d.nav) && d.nav > 0;
    const priceOk = typeof d.close === "number" && isFinite(d.close) && d.close > 0;
    if (!navOk) { skipped.missingNav += 1; continue; }
    if (!priceOk) { skipped.missingPrice += 1; continue; }
    const b = bubblePercent(d.close, d.nav);
    if (b == null) { skipped.implausibleRatio += 1; continue; }
    points.push({
      trade_date: d.trade_date,
      priceToman: d.close as number,
      navToman: d.nav,
      bubblePercent: b,
    });
  }

  points.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  const coverage: BubbleCoverage | null =
    points.length === 0
      ? null
      : {
          firstDate: points[0].trade_date,
          lastDate: points[points.length - 1].trade_date,
          observedDays: points.length,
          calendarSpanDays: dayDiff(points[points.length - 1].trade_date, points[0].trade_date) + 1,
        };

  return { points, coverage, skipped };
}

export interface BubbleSummary {
  current: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** حبابِ جاری منهای میانهٔ همین بازه (واحد: درصدِ حباب) */
  vsMedian: number;
  observedDays: number;
}

/** خلاصهٔ سری. کمتر از یک نقطه → null. هیچ عددِ خلاصه‌ای از سریِ خالی ساخته نمی‌شود. */
export function summarizeBubble(series: BubbleSeries): BubbleSummary | null {
  const v = series.points.map((p) => p.bubblePercent);
  if (v.length === 0) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const current = v[v.length - 1];
  return {
    current,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    median,
    vsMedian: current - median,
    observedDays: v.length,
  };
}

/** نسبتِ روزِ معاملاتی به روزِ تقویمی — اندازه‌گیری‌شده، نه حدس:
 *  در بازهٔ `2026-07-18`..`2026-09-06` (۵۰ روزِ تقویمی) `symbol_history`
 *  دقیقاً **۳۷ روزِ معاملاتیِ متمایز** دارد. */
export const TRADING_DAY_RATIO = 37 / 50;

/** کفِ مطلقِ تعدادِ مشاهده در یک پنجره — زیرِ این، «میانه» معنا ندارد. */
export const MIN_WINDOW_OBSERVATIONS = 5;

/**
 * خلاصهٔ یک پنجرهٔ زمانی (مثلاً «۹۰ روزِ اخیر»).
 *
 * ⚠️ **این تابع پنجره‌ای را که داده ندارد نمی‌سازد.** اگر بازهٔ خواسته‌شده از
 * پوششِ واقعی بیرون بزند `null` برمی‌گردد، نه خلاصه‌ای از دادهٔ کمترِ موجود.
 * دلیل: «میانگینِ سه‌ماههٔ حباب» که در واقع از ۳۷ روز درآمده، عددِ غلط نیست —
 * عددِ **درستِ چیزِ دیگری** است، و همین آن را خطرناک‌تر می‌کند.
 */
export function bubbleWindow(series: BubbleSeries, windowDays: number, tolerancePercent = 20): BubbleSummary | null {
  if (!(windowDays > 0)) return null;
  const cov = series.coverage;
  if (!cov) return null;
  const required = windowDays * (1 - tolerancePercent / 100);
  if (cov.calendarSpanDays < required) return null;

  const last = series.points[series.points.length - 1].trade_date;
  const cutoff = Date.parse(last) - windowDays * 86_400_000;
  const inWindow = series.points.filter((p) => Date.parse(p.trade_date) >= cutoff);

  // گاردِ دوم: کشیدگیِ بازه با **پر بودنِ** بازه یکی نیست.
  //
  // نسخهٔ اول فقط `calendarSpanDays` را می‌سنجید. صندوقی که پنج روزِ اولِ
  // بازه و بعد یک روزِ آخر داده دارد، کشیدگیِ ۵۰ روزه می‌سازد و از گاردِ اول
  // رد می‌شود — و آن‌وقت «میانهٔ ۳۰ روزه» از **یک مشاهده** درمی‌آمد. همان
  // خطای «عددِ درستِ چیزِ دیگر» بود، یک لایه پایین‌تر.
  //
  // آستانه: دستِ‌کم نیمی از روزهای معاملاتیِ موردِ انتظار در آن پنجره.
  // نسبتِ روزِ معاملاتی به روزِ تقویمی در بازارِ ایران ≈ ۳۷ به ۵۰ (اندازه‌گیریِ
  // ۲۰۲۶-۰۹-۰۶ روی `symbol_history`)، پس ~۰٫۷۴ — و نصفِ آن کفِ محافظه‌کارانه‌ای است.
  const expectedTradingDays = windowDays * TRADING_DAY_RATIO;
  if (inWindow.length < Math.max(MIN_WINDOW_OBSERVATIONS, expectedTradingDays * 0.5)) return null;

  return summarizeBubble({ points: inWindow, coverage: cov, skipped: series.skipped });
}

/* ── حبابِ جاری و گاردِ کهنگی ─────────────────────────────────────────────── */

export type LiveBubbleState = "ready" | "stale" | "unavailable";

export interface LiveBubble {
  state: LiveBubbleState;
  /** فقط وقتی state === "ready" عدد دارد؛ در «stale» عدد هست ولی باید کهنه برچسب بخورد */
  bubblePercent: number | null;
  /** سنِ NAV بر حسب ساعت — null یعنی زمانِ NAV اصلاً نداریم */
  navAgeHours: number | null;
  reason: string | null;
}

/** قاعدهٔ N3: NAV کهنه‌تر از این، «تازه» نیست. */
export const NAV_STALE_HOURS = 24;

/**
 * تحملِ اختلافِ ساعت با منبع.
 *
 * چرا لازم شد: نسخهٔ اول هر زمانِ آیندهٔ NAV را `unavailable` می‌کرد. در
 * رندرِ آزمایشی معلوم شد این یعنی **چند دقیقه اختلافِ ساعتِ سرور با رله،
 * حبابِ کاملاً سالم را از صفحه حذف می‌کند** — و کاربر فقط «در دسترس نیست»
 * می‌بیند بدونِ اینکه چیزی خراب باشد. مهرِ زمانیِ رله ساعتِ تهران است و از
 * یک ماشینِ دیگر می‌آید؛ انتظارِ همگامیِ ثانیه‌ای از آن غیرواقعی است.
 *
 * پس اختلافِ کوچکِ رو به آینده «سنِ صفر» شمرده می‌شود، و فقط اختلافِ بزرگ —
 * که دیگر skew نیست، خرابیِ ساعتِ منبع است — رد می‌شود.
 */
export const FUTURE_SKEW_TOLERANCE_HOURS = 2;

/**
 * حبابِ لحظه‌ای با گاردِ زمان.
 *
 * چرا زمان مهم است: قیمت لحظه‌ای است و NAV روزی چند بار به‌روز می‌شود. اگر
 * NAV دیروز را با قیمتِ امروز جفت کنیم، حباب را با تغییرِ یک‌روزهٔ NAV آلوده
 * کرده‌ایم و کاربر تفاوتش را نمی‌بیند. پس یا «تازه» است، یا صریحاً «کهنه».
 */
export function liveBubble(args: {
  priceToman: number | null | undefined;
  navToman: number | null | undefined;
  /** زمانِ ثبتِ NAV (ISO) — نبودنش خودش یک حالت است، نه صفر */
  navAt: string | null | undefined;
  now: Date;
}): LiveBubble {
  const b = bubblePercent(args.priceToman, args.navToman);
  if (b == null) {
    return { state: "unavailable", bubblePercent: null, navAgeHours: null, reason: "قیمت یا NAV معتبر نیست" };
  }
  if (!args.navAt) {
    return { state: "unavailable", bubblePercent: null, navAgeHours: null, reason: "زمانِ NAV ثبت نشده" };
  }
  const t = Date.parse(args.navAt);
  if (!isFinite(t)) {
    return { state: "unavailable", bubblePercent: null, navAgeHours: null, reason: "زمانِ NAV نامعتبر است" };
  }
  const ageHours = (args.now.getTime() - t) / 3_600_000;
  if (ageHours < -FUTURE_SKEW_TOLERANCE_HOURS) {
    return { state: "unavailable", bubblePercent: null, navAgeHours: ageHours, reason: "زمانِ NAV در آینده است" };
  }
  if (ageHours > NAV_STALE_HOURS) {
    return { state: "stale", bubblePercent: b, navAgeHours: ageHours, reason: `NAV ${Math.floor(ageHours)} ساعت پیش` };
  }
  // سنِ منفیِ داخلِ تحمل → صفر، نه عددِ منفی که در UI بی‌معنا دیده می‌شود.
  return { state: "ready", bubblePercent: b, navAgeHours: Math.max(0, ageHours), reason: null };
}

/* ── ساختِ زمانِ NAV از فیدِ رله ────────────────────────────────────────── */

/**
 * `navDate` رله **جلالی** است (`"1405-06-15"`) و `navTime` ساعتِ تهران
 * (`"16:40:00"`). این تابع آن دو را به ISO تبدیل می‌کند تا `liveBubble`
 * بتواند سن را حساب کند.
 *
 * چرا تبدیل اینجاست و نه در نما: اگر نما این کار را بکند، هر نما یک بار
 * دوباره‌اش می‌نویسد و اولین اختلافِ ساعت بی‌صدا از قلم می‌افتد.
 *
 * تهران `+03:30` است. کشور از ۱۴۰۱ ساعتِ تابستانی ندارد، پس این افست ثابت
 * است؛ اگر روزی برگردد این تابع باید عوض شود و همین کامنت نشانه‌اش است.
 */
export const TEHRAN_UTC_OFFSET = "+03:30";

export function navAtIso(
  navDate: string | null | undefined,
  navTime: string | null | undefined,
  jalaliToGregorian: (jymd: string) => string | null,
): string | null {
  if (!navDate) return null;
  const g = jalaliToGregorian(navDate.trim());
  if (!g) return null;
  const t = (navTime ?? "").trim();
  const clock = /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)
    ? (t.length === 5 ? `${t}:00` : t).padStart(8, "0")
    : "00:00:00";
  const iso = `${g}T${clock}${TEHRAN_UTC_OFFSET}`;
  return isFinite(Date.parse(iso)) ? iso : null;
}
