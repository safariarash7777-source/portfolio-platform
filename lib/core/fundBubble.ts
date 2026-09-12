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
  /**
   * آخرین حبابِ **ثبت‌شده در تاریخچه** — نه حبابِ امروز.
   *
   * ── چرا اسمش عوض شد (یافتهٔ بازبینی) ──────────────────────────────────
   * نامِ قبلی `current` بود و نما آن را کنارِ «حبابِ جاری» می‌گذاشت. ولی این
   * دو **دو عددِ متفاوت‌اند**: این یکی از `symbol_history` می‌آید که پایانِ‌روزی
   * است و ممکن است مالِ چند روز پیش باشد؛ آن یکی از اسنپ‌شاتِ لحظه‌ایِ رله.
   * گذاشتنشان کنارِ هم بدونِ برچسب یعنی «فاصله از میانه» ممکن بود از عددی
   * حساب شود که کاربر فکر می‌کند امروز است.
   */
  lastObserved: number;
  /** تاریخِ همان آخرین مشاهده — تا نما بتواند بگوید مالِ کِی است */
  lastObservedDate: string;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** آخرین حبابِ **تاریخی** منهای میانهٔ همین بازه (واحد: درصدِ حباب) */
  lastVsMedian: number;
  observedDays: number;
}

/** خلاصهٔ سری. کمتر از یک نقطه → null. هیچ عددِ خلاصه‌ای از سریِ خالی ساخته نمی‌شود. */
export function summarizeBubble(series: BubbleSeries): BubbleSummary | null {
  const v = series.points.map((p) => p.bubblePercent);
  if (v.length === 0) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const last = v[v.length - 1];
  return {
    lastObserved: last,
    lastObservedDate: series.points[series.points.length - 1].trade_date,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    median,
    lastVsMedian: last - median,
    observedDays: v.length,
  };
}

/** کفِ مطلقِ تعدادِ مشاهده در یک پنجره — زیرِ این، «میانه» معنا ندارد. */
export const MIN_WINDOW_OBSERVATIONS = 5;

/**
 * حداقلِ نسبتِ چگالیِ پنجره به چگالیِ **خودِ همان سری**.
 *
 * ── چرا نسبتِ ثابتِ تقویمی حذف شد (یافتهٔ بازبینی) ─────────────────────────
 * نسخهٔ قبل یک ثابتِ `TRADING_DAY_RATIO = 37/50` داشت و آن را مثلِ یک
 * **قراردادِ عمومیِ تقویم** به کار می‌برد. آن عدد از **یک بازهٔ ۵۰ روزهٔ خاص**
 * درآمده بود و هیچ اعتبارِ عمومی ندارد: تعطیلاتِ نوروز، ماهِ رمضان، تعطیلیِ
 * ناگهانی و روزهای بسته‌شدنِ نماد همه نسبت را جابه‌جا می‌کنند، و برای یک
 * نمادِ متوقف نسبت اصلاً صفر است.
 *
 * حالا مبنا **خودِ سری** است: هر صندوق با چگالیِ تاریخیِ خودش سنجیده می‌شود.
 * این هیچ ادعایی دربارهٔ تقویمِ بازار نمی‌کند و برای نمادِ کم‌معامله هم درست
 * کار می‌کند.
 */
export const MIN_WINDOW_DENSITY_RATIO = 0.5;

/**
 * خلاصهٔ یک پنجرهٔ زمانی (مثلاً «۹۰ روزِ اخیر»).
 *
 * ⚠️ **این تابع پنجره‌ای را که داده ندارد نمی‌سازد.** اگر بازهٔ خواسته‌شده از
 * پوششِ واقعی بیرون بزند `null` برمی‌گردد، نه خلاصه‌ای از دادهٔ کمترِ موجود.
 * دلیل: «میانگینِ سه‌ماههٔ حباب» که در واقع از ۳۷ روز درآمده، عددِ غلط نیست —
 * عددِ **درستِ چیزِ دیگری** است، و همین آن را خطرناک‌تر می‌کند.
 */
export function bubbleWindow(
  series: BubbleSeries,
  /** طولِ پنجره بر حسبِ **روزِ تقویمی** — نه روزِ معاملاتی. */
  windowDays: number,
  tolerancePercent = 20,
): BubbleSummary | null {
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
  // آستانه از **چگالیِ خودِ همین سری** می‌آید، نه از یک نسبتِ تقویمیِ فرضی:
  // اگر این صندوق در کلِ بازه‌اش به‌طورِ میانگین `r` مشاهده در هر روزِ تقویمی
  // دارد، انتظارِ معقول در یک پنجرهٔ `windowDays` روزه `windowDays × r` است.
  const seriesDensity = cov.observedDays / Math.max(1, cov.calendarSpanDays);
  const expected = windowDays * seriesDensity;
  if (inWindow.length < Math.max(MIN_WINDOW_OBSERVATIONS, expected * MIN_WINDOW_DENSITY_RATIO)) return null;

  return summarizeBubble({ points: inWindow, coverage: cov, skipped: series.skipped });
}

/* ── حبابِ جاری و گاردِ کهنگی ─────────────────────────────────────────────── */

export type LiveBubbleState = "ready" | "stale" | "unavailable";

/** دقتِ زمانی که منبع داده — «روز» یعنی ساعت نداریم و نباید وانمود کنیم داریم. */
export type TimePrecision = "minute" | "day";

export interface LiveBubble {
  state: LiveBubbleState;
  /** فقط وقتی state === "ready" عدد دارد؛ در «stale» عدد هست ولی باید کهنه برچسب بخورد */
  bubblePercent: number | null;
  /** سنِ NAV بر حسب ساعت — null یعنی زمانِ NAV اصلاً نداریم */
  navAgeHours: number | null;
  /** سنِ قیمت بر حسب ساعت — null یعنی زمانِ قیمت را نداریم */
  priceAgeHours: number | null;
  /**
   * فاصلهٔ زمانیِ **بینِ دو ورودی** (ساعت).
   *
   * ── چرا این مهم‌ترین عدد اینجاست ────────────────────────────────────────
   * حباب یک **نسبت بینِ دو لحظه** است. اگر قیمتِ امروز را با NAVِ دیروز جفت
   * کنیم، عددی که درمی‌آید بخشی‌اش تغییرِ حباب است و بخشی‌اش صرفاً تغییرِ
   * یک‌روزهٔ NAV — و کاربر نمی‌تواند این دو را از هم جدا کند. پس تازگیِ هر
   * ورودی به‌تنهایی کافی نیست؛ **هم‌زمانی‌شان** هم باید سنجیده شود.
   */
  pairingGapHours: number | null;
  /** آیا ساعتِ NAV را واقعاً می‌دانیم یا فقط روزش را */
  navTimePrecision: TimePrecision | null;
  reason: string | null;
}

/** قاعدهٔ N3: NAV کهنه‌تر از این، «تازه» نیست. */
export const NAV_STALE_HOURS = 24;

/**
 * بیشینهٔ فاصلهٔ مجازِ بینِ لحظهٔ قیمت و لحظهٔ NAV.
 *
 * رله NAV را ساعتی تازه می‌کند و قیمت را هر ۵ دقیقه، پس در حالتِ سالم این
 * فاصله زیرِ یک ساعت است. ۶ ساعت یک جلسهٔ معاملاتی را می‌پوشاند و در عینِ حال
 * جفت‌شدنِ «قیمتِ امروز با NAVِ دیروز» را رد می‌کند.
 */
export const MAX_PAIRING_GAP_HOURS = 6;

/**
 * تحملِ اختلافِ ساعت با منبع.
 *
 * ── چرا از ۲ ساعت به ۱۵ دقیقه آمد (یافتهٔ بازبینی) ────────────────────────
 * ۲ ساعت بی‌مبنا بود و بدتر: یک منبع با **منطقهٔ زمانیِ اشتباه** معمولاً
 * ساعت‌ها جابه‌جاست، پس تحملِ دوساعته دقیقاً همان خرابی را می‌پوشاند که باید
 * بگیرد. آنچه واقعاً باید تحمل شود اختلافِ ساعتِ دو ماشینِ همگام با NTP و
 * تأخیرِ کشِ رله است — که دقیقه‌ای است، نه ساعتی.
 */
export const FUTURE_SKEW_TOLERANCE_HOURS = 0.25;

function ageHours(at: string | null | undefined, now: Date): number | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!isFinite(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

/**
 * حبابِ لحظه‌ای با گاردِ زمان.
 *
 * سه چیزِ متفاوت سنجیده می‌شود و هیچ‌کدام جای دیگری را نمی‌گیرد:
 *   ۱) NAV تازه است؟            (`navAgeHours` در برابرِ `NAV_STALE_HOURS`)
 *   ۲) قیمت تازه است؟           (`priceAgeHours` — گزارش می‌شود)
 *   ۳) این دو هم‌زمان‌اند؟       (`pairingGapHours` در برابرِ `MAX_PAIRING_GAP_HOURS`)
 */
export function liveBubble(args: {
  priceToman: number | null | undefined;
  navToman: number | null | undefined;
  /** زمانِ ثبتِ NAV (ISO) — نبودنش خودش یک حالت است، نه صفر */
  navAt: string | null | undefined;
  /** دقتِ همان زمان؛ اگر ندانیم ساعت چند بوده، `"day"` */
  navPrecision?: TimePrecision;
  /** زمانِ اسنپ‌شاتِ قیمت (ISO) — از `fetchedAt` رله */
  priceAt?: string | null;
  now: Date;
}): LiveBubble {
  const none = (reason: string, extra: Partial<LiveBubble> = {}): LiveBubble => ({
    state: "unavailable", bubblePercent: null, navAgeHours: null, priceAgeHours: null,
    pairingGapHours: null, navTimePrecision: args.navPrecision ?? null, reason, ...extra,
  });

  const b = bubblePercent(args.priceToman, args.navToman);
  if (b == null) return none("قیمت یا NAV معتبر نیست");
  if (!args.navAt) return none("زمانِ NAV ثبت نشده");

  const navAge = ageHours(args.navAt, args.now);
  if (navAge == null) return none("زمانِ NAV نامعتبر است");
  if (navAge < -FUTURE_SKEW_TOLERANCE_HOURS) {
    return none("زمانِ NAV در آینده است — ساعتِ منبع خراب است", { navAgeHours: navAge });
  }

  const priceAge = ageHours(args.priceAt, args.now);
  if (priceAge != null && priceAge < -FUTURE_SKEW_TOLERANCE_HOURS) {
    return none("زمانِ قیمت در آینده است — ساعتِ منبع خراب است", { priceAgeHours: priceAge });
  }

  const navT = Date.parse(args.navAt);
  const gap = args.priceAt && isFinite(Date.parse(args.priceAt))
    ? Math.abs(Date.parse(args.priceAt) - navT) / 3_600_000
    : null;

  const precision = args.navPrecision ?? "minute";
  const base = {
    bubblePercent: b,
    navAgeHours: Math.max(0, navAge),
    priceAgeHours: priceAge == null ? null : Math.max(0, priceAge),
    pairingGapHours: gap,
    navTimePrecision: precision,
  };

  // دقتِ روزانه: ساعتِ NAV را نمی‌دانیم، پس سن **محافظه‌کارانه** (از ابتدای روز)
  // حساب شده و ممکن است تازه‌تر از این باشد. این را باید گفت، نه پنهان کرد.
  const dayNote = precision === "day" ? " (ساعتِ NAV ثبت نشده؛ سن حداکثری است)" : "";

  if (navAge > NAV_STALE_HOURS) {
    return { ...base, state: "stale", reason: `NAV ${Math.floor(navAge)} ساعت پیش${dayNote}` };
  }
  if (gap != null && gap > MAX_PAIRING_GAP_HOURS) {
    return {
      ...base, state: "stale",
      reason: `قیمت و NAV ${Math.round(gap)} ساعت از هم فاصله دارند${dayNote}`,
    };
  }
  return { ...base, state: "ready", reason: precision === "day" ? "ساعتِ NAV ثبت نشده" : null };
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

export interface NavAt {
  iso: string;
  precision: TimePrecision;
}

/**
 * نسخهٔ قبل وقتی ساعت نبود بی‌صدا `00:00:00` می‌گذاشت. آن یک **دقتِ ساختگی**
 * بود: خروجی از یک زمانِ دقیق قابلِ تشخیص نبود، در حالی که فقط روز را می‌دانستیم.
 * حالا دقت همراهِ خودش برمی‌گردد تا `liveBubble` و نما بتوانند صادق باشند.
 */
export function navAtIso(
  navDate: string | null | undefined,
  navTime: string | null | undefined,
  jalaliToGregorian: (jymd: string) => string | null,
): NavAt | null {
  if (!navDate) return null;
  const g = jalaliToGregorian(navDate.trim());
  if (!g) return null;
  const t = (navTime ?? "").trim();
  const hasClock = /^\d{1,2}:\d{2}(:\d{2})?$/.test(t);
  const clock = hasClock ? (t.length === 5 ? `${t}:00` : t).padStart(8, "0") : "00:00:00";
  const iso = `${g}T${clock}${TEHRAN_UTC_OFFSET}`;
  if (!isFinite(Date.parse(iso))) return null;
  return { iso, precision: hasClock ? "minute" : "day" };
}
