// پل بین لایهٔ داده و موتور هسته — ساخت view-model کامل ترمینال تحلیلگر.
// اصل «یک موتور، دو نما»: این ماژول فقط داده جمع می‌کند و به engine.ts می‌دهد؛
// هیچ منطق امتیازدهی/ارزش‌گذاری اینجا نیست.

import { getFundamentals } from "@/lib/fundamental/registry";
import type { SymbolFundamentals, CodalN10Data } from "@/lib/fundamental/types";
import { getSymbolHistory } from "./history";
import {
  computeRatios,
  valuationBand,
  buildScorecard,
  qualitativeMask,
  type FundamentalInput,
  type HistoryDay,
  type Ratios,
  type Scorecard,
  type ValuationBand,
  type QualBand,
} from "./engine";

export interface TerminalViewModel {
  symbol: string;
  history: HistoryDay[]; // صعودی، تا ۴۰۰ روز
  fundamentals: SymbolFundamentals | null;
  fundamentalInput: FundamentalInput | null;
  ratios: Ratios | null;
  scorecard: Scorecard;
  valuation: ValuationBand | null;
  mask: Record<string, QualBand> | null;
  lastClose: number | null; // ریال
}

/** نگاشت ن-۱۰ کدال به ورودی استاندارد موتور. دادهٔ ناموجود = null. */
export function toFundamentalInput(n10: CodalN10Data | null): FundamentalInput | null {
  if (!n10) return null;
  const s = n10.standalone;
  if (s == null || typeof s.revenue !== "number") return null;
  return {
    revenue: s.revenue,
    gross_profit: s.gross_profit,
    operating_profit: s.operating_profit,
    net_profit: s.net_profit,
    eps_rial: typeof s.eps_rial === "number" ? s.eps_rial : null,
    capital: typeof n10.capital === "number" ? n10.capital : null,
    period_months: n10.period_months,
    audited: n10.audited === true,
    prior:
      s.prior && typeof s.prior.revenue === "number" && typeof s.prior.net_profit === "number"
        ? { revenue: s.prior.revenue, net_profit: s.prior.net_profit }
        : null,
  };
}

/** ساخت view-model کامل یک نماد برای ترمینال. همهٔ خطاها به null/آرایهٔ خالی فرو می‌ریزند. */
export async function buildTerminalView(symbol: string): Promise<TerminalViewModel> {
  const [history, fundamentals] = await Promise.all([
    getSymbolHistory(symbol, 400),
    getFundamentals(symbol).catch(() => null),
  ]);

  const fi = toFundamentalInput(fundamentals?.n10?.data ?? null);
  const lastClose =
    [...history].reverse().find((d) => d.close != null && d.close > 0)?.close ?? null;

  const ratios = fi ? computeRatios(fi, lastClose) : null;
  const scorecard = buildScorecard(ratios, history, new Date().toISOString().slice(0, 10));
  const valuation = fi ? valuationBand(fi) : null;
  const mask = ratios ? qualitativeMask(ratios) : null;

  return {
    symbol,
    history,
    fundamentals: fundamentals ?? null,
    fundamentalInput: fi,
    ratios,
    scorecard,
    valuation,
    mask,
    lastClose,
  };
}
