// موتور «پنل رصد ادمین» (اسکرینر گلوگاه) — SPEC-admin-market-radar.md
//
// «یک موتور، سه نما»: همهٔ محاسبات این‌جا خالص و تست‌پذیرند؛ UI فقط نمایش می‌دهد.
// اصول: فقط خواندن (symbol_history / codal_reports append-only دست‌نخورده)،
// null صادق برای دادهٔ غایب (هیچ درون‌یابی/عدد ساختگی)، فیلتر Z در مبدأ
// (زیرنماد رقم‌دار وارد جدول نمی‌شود)، عدد خام کامل فقط در نمای ادمین.
//
// واحدها (تثبیت در مرز محاسبه — قاعدهٔ D3):
// - ارزش‌های symbol_history (individual_buy_value و…) به «ریال» هستند (منبع TSETMC).
// - «سرانهٔ خرید حقیقی» طبق SPEC به میلیون تومان گزارش می‌شود:
//   ریال ÷ ۱۰ = تومان؛ ÷ ۱٬۰۰۰٬۰۰۰ = میلیون تومان ⇒ تقسیم بر 1e7.
// - نسبت‌ها (قدرت خریدار، سهم حقوقی، واگرایی، نسبت حجم) بی‌واحدند.
// - YoY ن-۳۰ برحسب درصد؛ مبالغ ن-۳۰ میلیون ریال (فقط در شکاف/سهم نسبی استفاده می‌شود).

import type { HistoryDay } from "./engine";

/* ── فیلتر Z: زیرنماد رقم‌دار (قاعدهٔ پروژه — هم‌ارز relay/symbols-util.mjs) ── */

/** نماد ختم به رقم (لاتین/فارسی/عربی) = زیرنماد بلوکی/عمده — از رادار حذف. */
export const SUB_TICKER_RE = /[0-9۰-۹٠-٩]$/;

export function isSubTicker(symbol: string | null | undefined): boolean {
  return SUB_TICKER_RE.test((symbol ?? "").trim());
}

/** حق‌تقدم: ختم به «ح» (طبق قاعدهٔ رله). در رادار نمایش داده نمی‌شود. */
export function isRightsIssue(symbol: string | null | undefined): boolean {
  return /ح$/.test((symbol ?? "").trim());
}

/* ── محاسبه‌های خالص ستون‌ها (ورودی: یک روز تاریخچه) ───────────────────────── */

const RIAL_TO_MILLION_TOMAN = 1e7;

function finiteOrNull(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/** سرانهٔ خرید حقیقی (میلیون تومان) = ارزش خرید حقیقی ÷ تعداد خریدار حقیقی. */
export function perCapitaBuy(d: Pick<HistoryDay, "individual_buy_value" | "individual_buy_count">): number | null {
  const v = finiteOrNull(d.individual_buy_value);
  const c = finiteOrNull(d.individual_buy_count);
  if (v == null || c == null || c <= 0) return null;
  return v / c / RIAL_TO_MILLION_TOMAN;
}

/** سرانهٔ فروش حقیقی (میلیون تومان) — برای قدرت خریدار محاسبه‌ای. */
export function perCapitaSell(d: Pick<HistoryDay, "individual_sell_value" | "individual_sell_count">): number | null {
  const v = finiteOrNull(d.individual_sell_value);
  const c = finiteOrNull(d.individual_sell_count);
  if (v == null || c == null || c <= 0) return null;
  return v / c / RIAL_TO_MILLION_TOMAN;
}

/**
 * قدرت خریدار: ستون buyer_power اگر موجود بود؛ وگرنه fallback محاسبه‌ای
 * سرانهٔ خرید ÷ سرانهٔ فروش حقیقی (SPEC §1). > ۱ = قدرت خریدار بالاتر.
 */
export function buyerPower(d: HistoryDay): number | null {
  const bp = finiteOrNull(d.buyer_power);
  if (bp != null && bp > 0) return bp;
  const buy = perCapitaBuy(d);
  const sell = perCapitaSell(d);
  if (buy == null || sell == null || sell <= 0) return null;
  return buy / sell;
}

/** ورود پول حقیقی (میلیون تومان) = خرید حقیقی − فروش حقیقی. مثبت = ورود. */
export function realMoneyFlow(d: Pick<HistoryDay, "individual_buy_value" | "individual_sell_value">): number | null {
  const b = finiteOrNull(d.individual_buy_value);
  const s = finiteOrNull(d.individual_sell_value);
  if (b == null || s == null) return null;
  return (b - s) / RIAL_TO_MILLION_TOMAN;
}

/** سهم حقوقی از فروش = ارزش فروش حقوقی ÷ ارزش کل معاملات (نسبت ۰..۱). */
export function legalSellShare(d: Pick<HistoryDay, "legal_sell_value" | "value_traded">): number | null {
  const l = finiteOrNull(d.legal_sell_value);
  const t = finiteOrNull(d.value_traded);
  if (l == null || t == null || t <= 0) return null;
  return l / t;
}

/** واگرایی پایانی/آخرین = (آخرین − پایانی) ÷ پایانی (نسبت). مثبت = آخرین بالاتر. */
export function closeLastDivergence(d: Pick<HistoryDay, "last_price" | "close">): number | null {
  const lp = finiteOrNull(d.last_price);
  const c = finiteOrNull(d.close);
  if (lp == null || c == null || c <= 0) return null;
  return (lp - c) / c;
}

/**
 * نسبت حجم = حجم امروز ÷ میانگین حجم ۱۰ روز معاملاتی قبل (خودِ امروز خارج از میانگین).
 * > ۲ ≈ حجم مشکوک (SPEC §1).
 */
export function volumeRatio(volume: number | null, avg10: number | null | undefined): number | null {
  const v = finiteOrNull(volume);
  const a = finiteOrNull(avg10 ?? null);
  if (v == null || a == null || a <= 0) return null;
  return v / a;
}

/* ── ردیف رادار ─────────────────────────────────────────────────────────────── */

export interface RadarRow {
  symbol: string;
  tradeDate: string;
  /** سرانهٔ خرید حقیقی — میلیون تومان. */
  perCapitaBuy: number | null;
  /** قدرت خریدار — نسبت. */
  buyerPower: number | null;
  /** ورود پول حقیقی — میلیون تومان. */
  realMoneyFlow: number | null;
  /** سهم حقوقی از فروش — نسبت ۰..۱. */
  legalSellShare: number | null;
  /** واگرایی پایانی/آخرین — نسبت. */
  divergence: number | null;
  /** نسبت حجم به میانگین ۱۰ روزه — نسبت. */
  volumeRatio: number | null;
  /** رشد YoY فروش ماهانه (ن-۳۰) — درصد. */
  yoyMonthly: number | null;
  /** شکاف تولید−فروش آخرین ماه ن-۳۰ (واحد مقداری خود شرکت). منفی = تخلیهٔ انبار. */
  prodSalesGap: number | null;
  /** سهم صادرات از فروش بازهٔ ن-۳۰ — درصد. */
  exportSharePct: number | null;
}

export interface FundamentalExtras {
  yoyMonthly?: number | null;
  prodSalesGap?: number | null;
  exportSharePct?: number | null;
}

/** ساخت یک ردیف رادار از آخرین روز تاریخچه + میانگین حجم ۱۰روزه + مشتق‌های ن-۳۰. */
export function computeRadarRow(
  symbol: string,
  latest: HistoryDay,
  avg10: number | null | undefined,
  extras?: FundamentalExtras
): RadarRow {
  return {
    symbol,
    tradeDate: latest.trade_date,
    perCapitaBuy: perCapitaBuy(latest),
    buyerPower: buyerPower(latest),
    realMoneyFlow: realMoneyFlow(latest),
    legalSellShare: legalSellShare(latest),
    divergence: closeLastDivergence(latest),
    volumeRatio: volumeRatio(latest.volume, avg10),
    yoyMonthly: extras?.yoyMonthly ?? null,
    prodSalesGap: extras?.prodSalesGap ?? null,
    exportSharePct: extras?.exportSharePct ?? null,
  };
}

/* ── پریست‌های گلوگاه ترکیبی (SPEC §3) — null صادق: شرطِ روی دادهٔ غایب رد می‌شود ── */

export type PresetKey = "smart_money" | "fundamental_alarm" | "board_divergence";

export const PRESETS: Record<PresetKey, { label: string; description: string }> = {
  smart_money: {
    label: "ورود پول هوشمند",
    description: "قدرت خریدار > ۱٫۵ + ورود پول حقیقی مثبت + نسبت حجم > ۲",
  },
  fundamental_alarm: {
    label: "بیدارباش بنیادی",
    description: "جهش YoY فروش ماهانه > ۵۰٪ + شکاف تولید−فروش منفی",
  },
  board_divergence: {
    label: "واگرایی تابلو",
    description: "واگرایی پایانی/آخرین > ۲٪ + نسبت حجم > ۲ (حجم مشکوک)",
  },
};

export function matchesPreset(row: RadarRow, preset: PresetKey): boolean {
  switch (preset) {
    case "smart_money":
      return (
        row.buyerPower != null && row.buyerPower > 1.5 &&
        row.realMoneyFlow != null && row.realMoneyFlow > 0 &&
        row.volumeRatio != null && row.volumeRatio > 2
      );
    case "fundamental_alarm":
      return (
        row.yoyMonthly != null && row.yoyMonthly > 50 &&
        row.prodSalesGap != null && row.prodSalesGap < 0
      );
    case "board_divergence":
      return (
        row.divergence != null && Math.abs(row.divergence) > 0.02 &&
        row.volumeRatio != null && row.volumeRatio > 2
      );
  }
}

/* ── سورت چندبعدی ──────────────────────────────────────────────────────────── */

export interface SortSpec {
  key: keyof RadarRow;
  dir: "asc" | "desc";
}

/** سورت پایدار چندستونه؛ null همیشه انتهای فهرست (فارغ از جهت). */
export function multiSort(rows: RadarRow[], specs: SortSpec[]): RadarRow[] {
  if (specs.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { key, dir } of specs) {
      const av = a[key];
      const bv = b[key];
      const an = typeof av === "number" ? av : null;
      const bn = typeof bv === "number" ? bv : null;
      if (an == null && bn == null) continue;
      if (an == null) return 1;
      if (bn == null) return -1;
      if (an !== bn) return dir === "asc" ? an - bn : bn - an;
    }
    return a.symbol.localeCompare(b.symbol, "fa");
  });
}
