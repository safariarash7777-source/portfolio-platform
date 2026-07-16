// رژیم بازار «قطب‌نمای بازار» — چشم‌انداز هفتگی مبتنی بر پهنای بازار (breadth).
//
// روش (شفاف و قابل‌بک‌تست):
//  - جهان: نمادهای دارای تاریخچه در symbol_history (~۳۵ نماد شاخص‌ساز و پرمعامله)
//  - سه سنجه:
//     ۱) پهنای روند: درصد نمادهای بالای SMA50   (وزن ۴۰٪)
//     ۲) شتاب کوتاه: درصد نمادهای با بازده مثبت ۲۰ روزه (وزن ۳۰٪)
//     ۳) جریان پول: درصد نمادهای با خالص ورود حقیقی مثبت در ۱۰ روز اخیر (وزن ۳۰٪)
//  - خروجی: امتیاز ۰–۱۰۰ + برچسب صادقانه (سازنده/خنثی/فرسایشی) + درایورها + فروض
//  - قانون سخت: هیچ واژهٔ سیگنالی (بخر/بفروش)؛ «چشم‌انداز» است نه توصیه.
//
// دادهٔ ناموجود = از محاسبه حذف؛ اگر پوشش < ۶۰٪ جهان باشد data_ok=false.

import type { HistoryDay } from "./engine";
import type { Driver } from "./engine";
import { sma } from "./backtest";

export interface RegimeInput {
  symbol: string;
  days: HistoryDay[]; // مرتب صعودی بر اساس تاریخ، حداقل ~60 روز
}

export interface RegimeResult {
  score: number | null; // 0..100
  label: "سازنده" | "خنثی" | "فرسایشی" | "نامشخص";
  breadthAboveSma50Pct: number | null;
  positive20dPct: number | null;
  positiveFlow10dPct: number | null;
  universeSize: number;
  coveredCount: number;
  drivers: Driver[];
  assumptions: string[];
  data_ok: boolean;
  as_of: string | null;
}

function last<T>(xs: T[]): T | undefined {
  return xs[xs.length - 1];
}

export function computeRegime(inputs: RegimeInput[]): RegimeResult {
  const assumptions = [
    "جهان بررسی: نمادهای دارای تاریخچهٔ ۲۰ ساله در پایگاه (نمادهای شاخص‌ساز/پرمعامله)",
    "پهنای روند = درصد نمادهای بالای میانگین ۵۰ روزه (وزن ۴۰٪)",
    "شتاب = درصد نمادهای با بازده مثبت ۲۰ روزه (وزن ۳۰٪)",
    "جریان پول = درصد نمادهای با خالص ورود حقیقی مثبت ۱۰ روزه (وزن ۳۰٪)",
    "چشم‌انداز آماری است، نه توصیهٔ خرید/فروش؛ دادهٔ ناقص از محاسبه حذف می‌شود",
  ];

  let aboveSma = 0, aboveSmaN = 0;
  let pos20 = 0, pos20N = 0;
  let posFlow = 0, posFlowN = 0;
  let asOf: string | null = null;

  for (const { days } of inputs) {
    const valid = days.filter((d) => d.close != null && d.close > 0);
    if (valid.length < 60) continue;
    const i = valid.length - 1;
    const lastDay = last(valid)!;
    if (!asOf || lastDay.trade_date > asOf) asOf = lastDay.trade_date;

    const m50 = sma(valid, i, 50);
    if (m50 != null && lastDay.close != null) {
      aboveSmaN++;
      if (lastDay.close > m50) aboveSma++;
    }

    if (valid.length >= 21) {
      const c20 = valid[valid.length - 21].close;
      if (c20 != null && c20 > 0 && lastDay.close != null) {
        pos20N++;
        if (lastDay.close > c20) pos20++;
      }
    }

    const recent = valid.slice(-10);
    let flowSum = 0, flowCnt = 0;
    for (const d of recent) {
      const b = d.individual_buy_value;
      const s = d.individual_sell_value;
      if (b != null && s != null) {
        flowSum += b - s;
        flowCnt++;
      }
    }
    if (flowCnt >= 5) {
      posFlowN++;
      if (flowSum > 0) posFlow++;
    }
  }

  const universeSize = inputs.length;
  const coveredCount = aboveSmaN;
  const data_ok = universeSize > 0 && aboveSmaN >= Math.ceil(universeSize * 0.6);

  const pct = (n: number, d: number): number | null =>
    d > 0 ? Math.round((n / d) * 1000) / 10 : null;

  const breadthAboveSma50Pct = pct(aboveSma, aboveSmaN);
  const positive20dPct = pct(pos20, pos20N);
  const positiveFlow10dPct = pct(posFlow, posFlowN);

  const parts: Array<[number | null, number]> = [
    [breadthAboveSma50Pct, 0.4],
    [positive20dPct, 0.3],
    [positiveFlow10dPct, 0.3],
  ];
  const avail = parts.filter(([v]) => v != null) as Array<[number, number]>;
  const wsum = avail.reduce((a, [, w]) => a + w, 0);
  const score =
    data_ok && wsum > 0
      ? Math.round(avail.reduce((a, [v, w]) => a + v * w, 0) / wsum)
      : null;

  let label: RegimeResult["label"] = "نامشخص";
  if (score != null) {
    label = score >= 60 ? "سازنده" : score >= 40 ? "خنثی" : "فرسایشی";
  }

  const eff = (v: number): Driver["effect"] =>
    v >= 55 ? "positive" : v <= 45 ? "negative" : "neutral";
  const drivers: Driver[] = [];
  if (breadthAboveSma50Pct != null)
    drivers.push({
      label: "پهنای روند",
      value: `${breadthAboveSma50Pct}٪ نمادها بالای میانگین ۵۰ روزه`,
      effect: eff(breadthAboveSma50Pct),
    });
  if (positive20dPct != null)
    drivers.push({
      label: "شتاب یک‌ماهه",
      value: `${positive20dPct}٪ نمادها بازده مثبت ۲۰ روزه دارند`,
      effect: eff(positive20dPct),
    });
  if (positiveFlow10dPct != null)
    drivers.push({
      label: "جریان پول حقیقی",
      value: `${positiveFlow10dPct}٪ نمادها ورود خالص حقیقی ۱۰ روزه دارند`,
      effect: eff(positiveFlow10dPct),
    });

  return {
    score,
    label,
    breadthAboveSma50Pct,
    positive20dPct,
    positiveFlow10dPct,
    universeSize,
    coveredCount,
    drivers,
    assumptions,
    data_ok,
    as_of: asOf,
  };
}
