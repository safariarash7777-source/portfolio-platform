export const MARKET_MODULES = ["market-overview", "funds", "gold-fx", "symbol"] as const;
export type MarketModuleKey = typeof MARKET_MODULES[number];
export const MARKET_MODULE_DESTINATIONS: Record<MarketModuleKey, { title: string; href: string; question: string }> = {
  "market-overview": { title: "نمای کلان بازار", href: "/market", question: "گسترهٔ مشارکت نمادها و جریان پول چگونه بوده؟" },
  funds: { title: "دیده‌بان صندوق‌ها", href: "/market/funds", question: "NAV، نوع صندوق و بازده ثبت‌شده چه می‌گویند؟" },
  "gold-fx": { title: "طلا و ارز", href: "/market#gold-currency", question: "قیمت ثبت‌شده و روند طلا و دلار چگونه تغییر کرده؟" },
  symbol: { title: "پروندهٔ نماد", href: "/market/stocks", question: "کدام نماد را می‌خواهید همراه تاریخچه و گزارش‌هایش بررسی کنید؟" },
};
export function isMarketModule(value: string): value is MarketModuleKey { return (MARKET_MODULES as readonly string[]).includes(value); }
export interface MarketModuleGrant { allowed: boolean; reason: string; authorizedByCohortIds: string[]; until: string | null; policyVersion: string }
export function decodeMarketGrant(value: unknown): MarketModuleGrant {
  const v = Array.isArray(value) ? value[0] : value;
  const row = v && typeof v === "object" ? v as Record<string, unknown> : {};
  return { allowed: row.allowed === true, reason: typeof row.reason === "string" ? row.reason : "unavailable", authorizedByCohortIds: Array.isArray(row.authorizedByCohortIds) ? row.authorizedByCohortIds.filter((x): x is string => typeof x === "string") : [], until: typeof row.until === "string" ? row.until : null, policyVersion: typeof row.policyVersion === "string" ? row.policyVersion : "seasonal.v0.1" };
}
