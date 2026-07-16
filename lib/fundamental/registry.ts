// رجیستری دادهٔ بنیادی نمادها — منبع اول: Supabase (جدول codal_reports که
// رلهٔ لیارا به‌صورت خودکار از اکسل‌های رسمی کدال پر می‌کند).
// اگر برای نماد داده‌ای در Supabase نبود (یا env تنظیم نبود)، به ماژول‌های
// typed اعتبارسنجی‌شدهٔ محلی برمی‌گردد — همان قرارداد SymbolFundamentals.

import type { SymbolFundamentals } from "./types";
import { FAMELI_FUNDAMENTALS } from "./data/fameli-1404";
import { getFundamentalsFromSupabase } from "./supabase";

const STATIC_REGISTRY: Record<string, SymbolFundamentals> = {
  ["فملی"]: FAMELI_FUNDAMENTALS,
};

/** دادهٔ بنیادی نماد؛ اگر گزارشی پردازش نشده باشد null (بدون عدد ساختگی). */
export async function getFundamentals(symbol: string): Promise<SymbolFundamentals | null> {
  const live = await getFundamentalsFromSupabase(symbol);
  if (live) return live;
  return STATIC_REGISTRY[symbol] ?? null;
}

/** فهرست نمادهایی که دادهٔ بنیادی ایستا (fallback) دارند. */
export function fundamentalSymbols(): string[] {
  return Object.keys(STATIC_REGISTRY);
}
