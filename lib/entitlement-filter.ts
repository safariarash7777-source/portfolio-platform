// فیلترِ «دسترسیِ فعال» — یک تعریف، بدونِ هیچ وابستگی.
//
// ── چرا فایلِ جداست ─────────────────────────────────────────────────────────
//
// این تابع را هم `lib/access.ts` (سمتِ سرور) و هم `middleware.ts` (زمانِ اجرای
// Edge) لازم دارند. `lib/access.ts` به `@/lib/supabase/server` وابسته است که
// `next/headers` را می‌آورد و در Edge جایی ندارد. پس تعریف اینجا زندگی می‌کند:
// بدونِ import، قابلِ استفاده از هر دو طرف.
//
// ── چرا اصلاً وجود دارد ─────────────────────────────────────────────────────
//
// `expires_at` می‌تواند NULL باشد و NULL یعنی **بدونِ انقضا** — تصمیمِ آرش که
// مدتِ دسترسی باید هر عددی بتواند باشد، «و تا هر زمان که بخواهم».
//
// ⚠️ در Postgres مقایسهٔ `expires_at > now()` روی NULL نه true می‌دهد نه false،
// یعنی ردیف کنار گذاشته می‌شود. پس فیلترِ سادهٔ `.gt()` دقیقاً برعکسِ منظور عمل
// می‌کرد: **دسترسیِ همیشگی بی‌صدا به «هیچ دسترسی» تبدیل می‌شد** — و چون کسی
// خطا نمی‌دید، فقط وقتی معلوم می‌شد که مشتری شکایت کند.
//
// دو خواننده = دو جا برای فراموش‌کردن. یکی می‌توانست به‌روز شود و دیگری نه، و
// آن‌وقت کاربر از یک در وارد و از درِ دیگر رد می‌شد.

/** شرطِ `or` برای PostgREST: بدونِ انقضا، یا هنوز منقضی‌نشده. */
export function activeEntitlementFilter(nowIso: string): string {
  return `expires_at.is.null,expires_at.gt.${nowIso}`;
}

/** همان قاعده روی یک ردیفِ در دست — برای تصمیم‌گیری در حافظه. */
export function isEntitlementActive(
  row: { expires_at: string | null; revoked_at?: string | null; starts_at?: string | null },
  now: Date = new Date()
): boolean {
  if (row.revoked_at) return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at === null) return true; // بدونِ انقضا
  return new Date(row.expires_at) > now;
}
