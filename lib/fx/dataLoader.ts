// لایهٔ دادهٔ «ابر داشبورد ارز» ادمین — /admin/fx
//
// منابع (فقط خواندن):
// 1) seed های JSON در lib/fx/data (استخراج از اکسل کلان آرش — استقلال از Manus)
// 2) نرخ زندهٔ دلار: جدول fx_rates (رله روزی یک ردیف درج می‌کند) — از lib/core/fx
// 3) طلا/سکه: اسنپشات زندهٔ ir_market_snapshots (بخش gold) — از lib/market-ir
//
// قانون سخت (D-هم‌راستا با C1/T5): داده غایب → null صادق؛ هیچ عدد جعلی.

import { getFxRates, latestRate, type FxRate } from "@/lib/core/fx";
import { getIrMarket, type IrRow } from "@/lib/market-ir";
import type { MacroRow } from "./engine";
import macroJson from "./data/macro_annual.json";
import baseRatesJson from "./data/base_rates.json";
import cpiMonthlyJson from "./data/cpi_monthly.json";
import ytmMonthlyJson from "./data/ytm_monthly.json";

export interface CpiMonthlyRow {
  ym: string; // «1404/03»
  /** تورم نقطه‌به‌نقطه (٪) */
  infl_pp: number | null;
  /** تورم ماهانه (٪) */
  infl_monthly: number | null;
  /** تورم سالانه (٪) */
  infl_annual: number | null;
  /** شاخص CPI (پایه 1399/01 = 100) */
  cpi_index: number | null;
}

export interface YtmMonthlyRow {
  ym: string;
  ytm: number | null;
}

export interface GoldQuote {
  id: string;
  faName: string;
  priceToman: number;
  changePercent: number | null;
}

export interface FxDashboardData {
  /** دادهٔ کلان سالانه (۱۳۳۸..۱۴۰۶) */
  macro: MacroRow[];
  /** نرخ‌های پایهٔ تاریخی دلار (تومان) به تفکیک سال شمسی */
  baseRates: Record<string, number>;
  /** تورم ماهانه (CPI) */
  cpiMonthly: CpiMonthlyRow[];
  /** بازده تا سررسید اخزا (ماهانه) */
  ytmMonthly: YtmMonthlyRow[];
  /** سری روزانهٔ نرخ دلار (نزولی) از fx_rates؛ خالی اگر در دسترس نباشد */
  fxRates: FxRate[];
  /** آخرین نرخ زندهٔ دلار (تومان) یا null */
  liveUsdToman: number | null;
  /** تاریخ آخرین نرخ (میلادی YYYY-MM-DD) یا null */
  liveRateDate: string | null;
  /** تاریخ شمسی آخرین نرخ («yyyy/mm/dd») یا null — مبنای پیش‌بینی رو به جلو */
  liveRateShamsi: string | null;
  /** میانگین نرخ بازار به تفکیک سال شمسی (از fx_rates — پنجرهٔ موجود) */
  marketAnnual: Record<number, number>;
  /** نرخ‌های زندهٔ طلا/سکه از اسنپشات (خالی اگر رله نفرستاده باشد) */
  gold: GoldQuote[];
}

// ── میلادی ← شمسی — معکوس دقیق الگوریتم کانونی lib/core/jalali.ts ──
// محافظ: تست تطبیق رفت‌وبرگشتی در lib/fx/engine.test.ts روزبه‌روز کل بازهٔ ۱۴۰۰..۱۴۱۰ را
// با jalaliYmdToGregorian کانونی چک می‌کند تا دو نسخه هرگز واگرا نشوند (مرز سال/کبیسه).
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** «2026-07-22» → «1405/04/31»؛ ورودی نامعتبر → null. */
export function gregorianYmdToJalali(ymd: string | null | undefined): string | null {
  const m = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [jy, jm, jd] = gregorianToJalali(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

/** میانگین نرخ بازار هر سال شمسی از سری روزانهٔ fx_rates. */
export function marketAnnualShamsi(rates: FxRate[]): Record<number, number> {
  const acc = new Map<number, { sum: number; n: number }>();
  for (const r of rates) {
    const j = gregorianYmdToJalali(r.rate_date);
    if (!j || !(r.usd_toman > 0)) continue;
    const jy = Number(j.slice(0, 4));
    const cur = acc.get(jy) ?? { sum: 0, n: 0 };
    cur.sum += r.usd_toman;
    cur.n += 1;
    acc.set(jy, cur);
  }
  const out: Record<number, number> = {};
  for (const [y, { sum, n }] of acc) out[y] = sum / n;
  return out;
}

const GOLD_IDS = new Set([
  "IR_GOLD_18K",
  "IR_GOLD_24K",
  "IR_GOLD_MELTED",
  "IR_COIN_EMAMI",
  "IR_COIN_BAHAR",
  "IR_COIN_HALF",
  "IR_COIN_QUARTER",
  "IR_COIN_1G",
]);

function toGoldQuotes(rows: IrRow[]): GoldQuote[] {
  const out: GoldQuote[] = [];
  for (const r of rows) {
    if (!r?.id || !(r.price > 0) || r.unit !== "toman") continue;
    if (GOLD_IDS.size > 0 && !GOLD_IDS.has(r.id) && out.length >= 8) continue;
    out.push({
      id: r.id,
      faName: r.faName ?? r.id,
      priceToman: r.price,
      changePercent: typeof r.changePercent === "number" ? r.changePercent : null,
    });
  }
  // ترتیب: اقلام شناخته‌شده اول
  return out
    .sort((a, b) => Number(GOLD_IDS.has(b.id)) - Number(GOLD_IDS.has(a.id)))
    .slice(0, 10);
}

/** دادهٔ کامل داشبورد — server-side (page.tsx). خطاهای شبکه → بخش‌های خالی صادق. */
export async function getFxDashboardData(): Promise<FxDashboardData> {
  const [fxRates, ir] = await Promise.all([
    getFxRates(800).catch(() => [] as FxRate[]),
    getIrMarket().catch(() => null),
  ]);
  const last = latestRate(fxRates);
  return {
    macro: macroJson as unknown as MacroRow[],
    baseRates: baseRatesJson as unknown as Record<string, number>,
    cpiMonthly: cpiMonthlyJson as unknown as CpiMonthlyRow[],
    ytmMonthly: ytmMonthlyJson as unknown as YtmMonthlyRow[],
    fxRates,
    liveUsdToman: last?.usd_toman ?? null,
    liveRateDate: last?.rate_date ?? null,
    liveRateShamsi: gregorianYmdToJalali(last?.rate_date),
    marketAnnual: marketAnnualShamsi(fxRates),
    gold: toGoldQuotes(ir?.gold ?? []),
  };
}
