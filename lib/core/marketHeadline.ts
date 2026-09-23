/**
 * سنجه‌های سرصفحهٔ بازار — **یک موتور، چند نما**.
 *
 * ── مسئله‌ای که این فایل می‌بندد ──────────────────────────────────────────
 * «ارزش معاملات» تا امروز در دو جا و به دو شکل حساب می‌شد:
 *
 *   • `TodayDashboard` مستقیماً `stocks.reduce(… r.value …)` می‌گرفت — به **ریال**،
 *     بدونِ هیچ گاردِ پوشش.
 *   • `computeDailyBreadth` همان را به **تومان** و با گاردِ «حداقل ۵۰ نماد پوشش»
 *     حساب می‌کرد.
 *
 * یعنی یک صفحه دو عددِ متفاوت با دو واحدِ متفاوت برای یک چیز نشان می‌داد، و
 * هیچ‌کدام واحدش را در خروجی حمل نمی‌کرد. اینجا هر سنجه **واحدش را با خودش**
 * می‌برد و هر مصرف‌کننده مجبور است واحد را رندر کند.
 *
 * ── قاعدهٔ «ناموجود ≠ صفر» ────────────────────────────────────────────────
 * هیچ سنجه‌ای وقتی داده ندارد `0` نمی‌شود؛ `value === null` می‌شود و
 * `absentReason` می‌گوید **چرا**. نما موظف است «—» و همان دلیل را نشان دهد.
 */

import type { IrIndices, IrRow, IrStockRow } from "../market-ir";
import { computeDailyBreadth } from "./breadth";

export type MetricUnit =
  /** واحدِ شاخص (امتیاز) — پول نیست و نباید «تومان» بخورد */
  | "index"
  | "toman"
  | "percent";

export interface MetricCoverage {
  /** چند ردیف واقعاً داده داشتند */
  covered: number;
  /** جامعهٔ بررسی */
  population: number;
}

export interface HeadlineMetric {
  key: string;
  label: string;
  /** `null` یعنی **نمی‌دانیم** — هرگز صفرِ جایگزین */
  value: number | null;
  unit: MetricUnit;
  /** درصدِ تغییرِ روز؛ `null` یعنی مبنای معتبری برای محاسبه نبود */
  changePercent: number | null;
  /** فقط وقتی `value === null` پر است — نما باید همین را زیرِ «—» بنویسد */
  absentReason: string | null;
  /** برای سنجه‌های تجمیعی: از چند نماد جمع شده */
  coverage: MetricCoverage | null;
  /** توضیحِ کوتاهِ همیشگی (مثلاً مبنای عدد) */
  note: string | null;
}

/**
 * سقفِ تغییرِ روزانهٔ معقول برای شاخص.
 *
 * شاخصِ کل دامنهٔ نوسانِ نمادها را میانگین می‌گیرد، پس جهشِ روزانهٔ بیش از این
 * عملاً یعنی **مبنای دیروز خراب است** (نه اینکه بازار واقعاً چنین حرکتی کرده).
 * در آن حالت عددِ غلط نشان نمی‌دهیم؛ `null` می‌دهیم و دلیلش را می‌گوییم.
 */
export const MAX_INDEX_DAILY_MOVE_PCT = 25;

/**
 * درصدِ تغییرِ شاخص از «مقدار» و «تغییرِ امتیازی».
 *
 * منبع (`tsetmc`) تغییر را به **امتیاز** می‌دهد نه درصد؛ مبنای دیروز =
 * مقدارِ امروز منهای تغییر. اگر مبنا معتبر نباشد → `null`.
 */
export function indexChangePercent(value: number, changePoints: number): number | null {
  if (!isFinite(value) || !(value > 0)) return null;
  if (!isFinite(changePoints)) return null;
  const base = value - changePoints;
  if (!(base > 0)) return null;
  const pct = (changePoints / base) * 100;
  if (Math.abs(pct) > MAX_INDEX_DAILY_MOVE_PCT) return null;
  return Math.round(pct * 100) / 100;
}

function pickRow(rows: readonly IrRow[] | undefined, id: string): IrRow | null {
  const r = (rows ?? []).find((x) => x.id === id);
  return r && isFinite(Number(r.price)) && Number(r.price) > 0 ? r : null;
}

export interface HeadlineInput {
  indices: IrIndices | null;
  stocks: readonly IrStockRow[];
  gold: readonly IrRow[];
  currency: readonly IrRow[];
}

export interface MarketHeadline {
  metrics: HeadlineMetric[];
  /** تعدادِ نمادهایی که امروز معامله شده‌اند — جامعهٔ بسیاری از نسبت‌ها */
  tradedCount: number;
  /** کلِ نمادهای اسنپ‌شات */
  universe: number;
}

/**
 * ساختِ ردیفِ سنجه‌های سرصفحه. تابعِ خالص — هیچ I/O، هیچ `Date.now()`.
 *
 * ترتیب عمدی است: دو شاخص (تصویرِ کل) → دو سنجهٔ فعالیت (پول) → دو لنگرِ
 * غیربورسی (دلار و طلا) که مخاطبِ ایرانی بازار را نسبت به آن‌ها می‌سنجد.
 */
export function buildMarketHeadline(input: HeadlineInput): MarketHeadline {
  const { indices: idx, stocks, gold, currency } = input;
  const breadth = computeDailyBreadth(stocks as IrStockRow[]);
  const traded = stocks.filter((s) => Number(s.value) > 0).length;

  const usd = pickRow(currency, "USD");
  const gold18 = pickRow(gold, "IR_GOLD_18K");

  const metrics: HeadlineMetric[] = [
    {
      key: "index-total",
      label: "شاخص کل",
      value: idx && idx.total > 0 ? idx.total : null,
      unit: "index",
      changePercent: idx ? indexChangePercent(idx.total, idx.totalChange) : null,
      absentReason: idx && idx.total > 0 ? null : "شاخص در آخرین اسنپ‌شات ثبت نشده",
      coverage: null,
      note: null,
    },
    {
      key: "index-equal",
      label: "شاخص هم‌وزن",
      value: idx && idx.equalWeight > 0 ? idx.equalWeight : null,
      unit: "index",
      changePercent: idx ? indexChangePercent(idx.equalWeight, idx.equalWeightChange) : null,
      absentReason: idx && idx.equalWeight > 0 ? null : "شاخص هم‌وزن در آخرین اسنپ‌شات ثبت نشده",
      coverage: null,
      note: "وزنِ برابر برای همهٔ نمادها",
    },
    {
      key: "trade-value",
      label: "ارزش معاملات سهام",
      // تکْ‌منبع: تومانِ گاردشدهٔ `computeDailyBreadth` — نه جمعِ ریالیِ محلی.
      value: breadth.totalValueToman,
      unit: "toman",
      changePercent: null,
      absentReason:
        breadth.totalValueToman == null
          ? traded === 0
            ? "خارج از ساعاتِ معاملات — هنوز نمادی معامله نشده"
            : "پوششِ ارزشِ معاملات برای جمع‌زدن کافی نیست"
          : null,
      coverage: { covered: breadth.flowCovered, population: breadth.universe },
      note: "جمعِ ارزشِ نمادهای دارای داده",
    },
    {
      key: "real-flow",
      label: "خالص پول حقیقی",
      value: breadth.netFlowToman,
      unit: "toman",
      changePercent: null,
      absentReason:
        breadth.netFlowToman == null
          ? traded === 0
            ? "خارج از ساعاتِ معاملات"
            : "پوششِ جریانِ حقیقی برای جمع‌زدن کافی نیست"
          : null,
      coverage: { covered: breadth.flowCovered, population: breadth.universe },
      note: "مثبت = ورودِ پولِ حقیقی",
    },
    {
      key: "usd",
      label: "دلار آزاد",
      value: usd ? Number(usd.price) : null,
      unit: "toman",
      changePercent: typeof usd?.changePercent === "number" ? usd.changePercent : null,
      absentReason: usd ? null : "نرخِ دلار در آخرین اسنپ‌شات نیامده",
      coverage: null,
      note: null,
    },
    {
      key: "gold18",
      label: "طلای ۱۸ عیار",
      value: gold18 ? Number(gold18.price) : null,
      unit: "toman",
      changePercent: typeof gold18?.changePercent === "number" ? gold18.changePercent : null,
      absentReason: gold18 ? null : "نرخِ طلا در آخرین اسنپ‌شات نیامده",
      coverage: null,
      note: "هر گرم",
    },
  ];

  return { metrics, tradedCount: traded, universe: breadth.universe };
}
