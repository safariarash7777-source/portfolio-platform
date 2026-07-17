// رجیستری دادهٔ بنیادی نمادها — منبع یگانه: Supabase (جدول codal_reports که
// موتور کدال v3 روی رلهٔ لیارا به‌صورت خودکار از اکسل‌های رسمی کدال پر می‌کند).
// fallback ایستای فملی در پاک‌سازی C3 حذف شد: دادهٔ زندهٔ فملی در codal_reports
// موجود است و مسیر ایستا دیگر هرگز فعال نمی‌شد. اعداد مرجع آن به‌عنوان
// fixture تستی در lib/fundamental/fixtures/ نگه داشته شده‌اند.

import type { SymbolFundamentals } from "./types";
import { getFundamentalsFromSupabase } from "./supabase";

/** دادهٔ بنیادی نماد؛ اگر گزارشی پردازش نشده باشد null (بدون عدد ساختگی).*/
export async function getFundamentals(symbol: string): Promise<SymbolFundamentals | null> {
  return await getFundamentalsFromSupabase(symbol);
}
