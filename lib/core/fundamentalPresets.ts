// پرست‌های بنیادی غربالگر — T2-ب شناسنامهٔ تحلیلی.
//
// اصل صداقت داده: فقط نمادهای دارای داده در نتیجه می‌آیند و برچسب پوشش
// («از X نماد دارای گزارش») کنار هر پرست نمایش داده می‌شود.
// هیچ واژهٔ تجویزی؛ تعریف عمومی شفاف زیر هر پرست.
//
// معماری: توابع خالص این فایل روی Map های ازپیش‌محاسبه کار می‌کنند؛
// خودِ Map ها در سرور (app/data/page.tsx) از codal_reports ساخته می‌شوند.

/** یک قلم نتیجهٔ پرست بنیادی — مقدار برای نمایش ستون کمکی */
export interface FundamentalHit {
  id: string;
  /** مقدار متریک (درصد رشد یا نسبت) */
  value: number;
}

/** ورودی رشد YoY: Map نماد → درصد رشد (فقط نمادهای دارای هر دو دوره) */
export type YoYMap = Map<string, number>;

function isNum(x: unknown): x is number {
  return typeof x === "number" && isFinite(x);
}

/**
 * رشد YoY (٪) = (جاری − پارسال) ÷ |پارسال| × ۱۰۰
 * پارسالِ صفر یا غایب → null (بدون تقسیم بر صفر، بدون عدد ساختگی).
 */
export function yoyGrowthPercent(current: unknown, prior: unknown): number | null {
  if (!isNum(current) || !isNum(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

/** مرتب‌سازی نزولی رشد و برش n مورد نخست — فقط مقادیر معتبر */
export function topByGrowth(map: YoYMap, n: number): FundamentalHit[] {
  const items: FundamentalHit[] = [];
  for (const [id, v] of map) {
    if (isNum(v)) items.push({ id, value: v });
  }
  items.sort((a, b) => b.value - a.value);
  return items.slice(0, Math.max(0, n));
}

/**
 * P/NAV صندوق = قیمت ÷ NAV ابطال — فقط وقتی هر دو مثبت‌اند.
 * (همان دادهٔ snapshot؛ هیچ درخواست جدید.)
 */
export function priceToNav(price: unknown, nav: unknown): number | null {
  if (!isNum(price) || !isNum(nav) || nav <= 0 || price <= 0) return null;
  return price / nav;
}

/** کمترین P/NAV — صعودی، فقط صندوق‌های دارای NAV */
export function lowestPriceToNav(
  funds: Array<{ id: string; price?: number | null; nav?: number | null }>,
  n: number
): FundamentalHit[] {
  const items: FundamentalHit[] = [];
  for (const f of funds) {
    const r = priceToNav(f.price, f.nav);
    if (r != null) items.push({ id: f.id, value: r });
  }
  items.sort((a, b) => a.value - b.value);
  return items.slice(0, Math.max(0, n));
}

/** تعریف‌های عمومی پرست‌های بنیادی (برای نمایش در UI و ممیزی واژگان) */
export const FUNDAMENTAL_PRESETS = [
  {
    key: "monthly_rev_yoy",
    label: "بیشترین رشد درآمد ماهانه (سال‌به‌سال)",
    definition:
      "درآمد آخرین ماهِ گزارش‌شده در ن-۳۰ نسبت به همان ماه سال قبل. فقط نمادهایی که هر دو گزارش را دارند محاسبه می‌شوند؛ برچسب پوشش کنار پرست نمایش داده می‌شود.",
  },
  {
    key: "quarterly_rev_yoy",
    label: "بیشترین رشد درآمد فصلی (سال‌به‌سال)",
    definition:
      "درآمد آخرین فصلِ استخراج‌شده از صورت مالی ن-۱۰ نسبت به همان فصل سال قبل (با تفاضل زنجیره‌ای دوره‌های تجمیعی). فقط نمادهای دارای هر دو فصل.",
  },
  {
    key: "fund_low_pnav",
    label: "کمترین نسبت قیمت به NAV صندوق‌ها",
    definition:
      "نسبت قیمت تابلو به NAV ابطال صندوق (از همان دادهٔ لحظه‌ای). فقط صندوق‌هایی که NAV معتبر دارند؛ عدد کمتر از ۱ یعنی قیمت زیر NAV معامله می‌شود.",
  },
] as const;
