// رجیستری دادهٔ بنیادی نمادها — منبع فعلی: ماژول‌های typed اعتبارسنجی‌شده.
// وقتی جدول codal_reports (پس از دریافت source_url اطلاعیه) پر شود، این تابع
// به خواندن از Supabase سوییچ می‌کند بدون این‌که UI تغییری کند — همان قرارداد
// SymbolFundamentals برمی‌گردد. (الگوی مشابه getIrMarket در lib/market-ir.ts)

import type { SymbolFundamentals } from "./types";
import { FAMELI_FUNDAMENTALS } from "./data/fameli-1404";

const REGISTRY: Record<string, SymbolFundamentals> = {
  ["فملی"]: FAMELI_FUNDAMENTALS,
};

/** دادهٔ بنیادی نماد؛ اگر گزارشی پردازش نشده باشد null. */
export function getFundamentals(symbol: string): SymbolFundamentals | null {
  return REGISTRY[symbol] ?? null;
}

/** فهرست نمادهایی که گزارش بنیادی پردازش‌شده دارند. */
export function fundamentalSymbols(): string[] {
  return Object.keys(REGISTRY);
}
