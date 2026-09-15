/**
 * تشخیصِ «اجازه نداری» از «خراب شد».
 *
 * ── چرا یک فایل جدا ─────────────────────────────────────────────────────────
 * وقتی یک امتیاز عمداً پس گرفته می‌شود، برنامه باید بتواند آن حالت را از یک
 * خرابیِ واقعی جدا کند — وگرنه یک تغییرِ **عمدیِ** امنیتی به شکلِ یک باگ
 * دیده می‌شود و کسی برش می‌گرداند. همان تفکیکی که `B-032` یادمان داد:
 * «جدول نیست» و «ستون نیست» دو چیزند و پیامِ یکسان دادنشان اپراتور را
 * دنبالِ چیزِ اشتباه می‌فرستد.
 *
 * PostgREST خطای امتیازِ Postgres را با کدِ `42501` برمی‌گرداند. متن را هم
 * می‌بینیم چون در مسیرهای مختلف (RPC، REST) همیشه `code` پر نمی‌شود.
 */

/** شکلِ حداقلیِ خطای Supabase — عمداً به تایپِ کتابخانه گره نخورده. */
export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/** کدِ استانداردِ Postgres برای «insufficient_privilege». */
export const INSUFFICIENT_PRIVILEGE = "42501";

export function isPermissionDenied(err: PostgrestLikeError | null | undefined): boolean {
  if (!err) return false;
  if (err.code === INSUFFICIENT_PRIVILEGE) return true;
  const m = (err.message ?? "").toLowerCase();
  // «permission denied for function …» — متنِ خودِ Postgres.
  return m.includes("permission denied");
}
