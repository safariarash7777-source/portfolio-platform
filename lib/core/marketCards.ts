import type { HeadlineMetric } from "./marketHeadline";
import type { MarketProvenance } from "../market-quality";

export interface MarketCardContract {
  key: string;
  question: string;
  fields: readonly string[];
  calculation: string;
  unit: HeadlineMetric["unit"];
  validAt: number | null;
  receivedAt: number | null;
  quality: MarketProvenance["quality"];
  role: "public";
  detailHref: string;
}
/** Inventory for handing off the existing views; these are display contracts, not a second calculator. */
export const MARKET_VIEW_CONTRACTS = {
  breadth: { question: "چه سهمی از نمادهای دارای معامله مثبت بوده‌اند؟", fields: ["stocks.value", "stocks.changePercent"], calculation: "computeMarketPulse / computeDailyBreadth", unit: "percent", date: "indices.date + time (session only)", role: "public", href: "/market#market-detail" },
  funds: { question: "قیمت صندوق نسبت به NAV هم‌زمان چه فاصله‌ای دارد؟", fields: ["funds.price", "funds.nav", "navDate", "navTime", "sourceDate", "sourceTime"], calculation: "liveBubble + withValidNav", unit: "percent", date: "NAV source time + price source time", role: "public", href: "/market/funds" },
  goldFx: { question: "قیمت طلا و دلار در روزهای ثبت‌شده چگونه تغییر کرده؟", fields: ["ir_market_history.captured_at", "payload.price", "payload.unit"], calculation: "extractDailySeries (last sample / Tehran day)", unit: "toman", date: "sample captured_at; source clock separate", role: "public", href: "/market#gold-currency" },
  symbol: { question: "قیمت، گردش معاملات و گزارش‌های این نماد چه می‌گویند؟", fields: ["stocks.value (rial)", "marketValue (rial)", "symbol_history.trade_date", "codal_reports.raw"], calculation: "formatRialAsToman / existing core fundamental engine", unit: "rial→toman", date: "price source time / trade_date / report period", role: "public", href: "/market/stocks" },
  course: { question: "کدام نمای بازار برای دورهٔ من فعال شده است؟", fields: ["entitlements.cohort_id", "module_keys", "starts_at", "expires_at", "revoked_at"], calculation: "seasonal_module_access RPC / no parallel role", unit: "none", date: "[starts_at, expires_at)", role: "session + explicit module grant", href: "/dashboard/market/market-overview" },
} as const;
const definitions: Record<string, Pick<MarketCardContract, "question" | "fields" | "calculation" | "detailHref">> = {
  "index-total": { question: "شاخص کل نسبت به جلسهٔ قبل چه تغییری کرده؟", fields: ["indices.total", "indices.totalChange"], calculation: "indexChangePercent(total, totalChange)", detailHref: "/market#market-detail" },
  "index-equal": { question: "نمادها با وزن برابر چه وضعی دارند؟", fields: ["indices.equalWeight", "indices.equalWeightChange"], calculation: "indexChangePercent(equalWeight, equalWeightChange)", detailHref: "/market#market-detail" },
  "trade-value": { question: "ارزش معاملات سهامِ دارای داده چقدر بوده؟", fields: ["stocks.value (rial)"], calculation: "computeDailyBreadth.totalValueToman (rial / 10, coverage guard)", detailHref: "/market/stocks" },
  "real-flow": { question: "خالص جریان پول حقیقی به کدام سمت بوده؟", fields: ["stocks.buyI", "stocks.sellI", "stocks.closingPrice (toman)"], calculation: "computeDailyBreadth.netFlowToman", detailHref: "/market#market-detail" },
  "usd": { question: "آخرین قیمت ثبت‌شدهٔ دلار چه بوده؟", fields: ["currency.USD.price"], calculation: "قیمت منبع؛ بدون تبدیل ارز فرضی", detailHref: "/market#gold-currency" },
  "gold18": { question: "آخرین قیمت ثبت‌شدهٔ طلای ۱۸ عیار چه بوده؟", fields: ["gold.IR_GOLD_18K.price"], calculation: "قیمت منبع؛ تومان", detailHref: "/market#gold-currency" },
};
export function marketCardContract(metric: HeadlineMetric, provenance: MarketProvenance): MarketCardContract {
  const d = definitions[metric.key];
  if (!d) throw new Error(`Unknown market metric: ${metric.key}`);
  const isIndex = metric.key.startsWith("index-");
  return { key: metric.key, ...d, unit: metric.unit, validAt: isIndex ? provenance.validAt : null, receivedAt: provenance.receivedAt, quality: metric.value == null ? "unavailable" : isIndex ? provenance.quality : "unknown-time", role: "public" };
}
