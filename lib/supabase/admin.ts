import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. SERVER-ONLY — the `server-only` import above
// turns any accidental import from a client component into a BUILD error, so
// this key can never leak into the client bundle. Never expose the key. Bypasses RLS, so it is used exclusively by
// trusted server route handlers (payment verify + telegram webhook) that call
// the SECURITY DEFINER functions restricted to service_role.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY تنظیم نشده است.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * آیا کلیدِ service-role در این محیط هست؟ **بدونِ پرتاب.**
 *
 * ── چرا لازم شد ────────────────────────────────────────────────────────
 * روی Production این کلید ست نشده بود و `createAdminClient()` پرتاب می‌کرد.
 * چون هیچ مسیری آن پرتاب را نمی‌گرفت، Next آن را به **۵۰۰ با بدنهٔ خالی**
 * تبدیل می‌کرد: نه کاربر می‌فهمید چه شده، نه اپراتور. یک متغیرِ غایب شبیهِ
 * «سایت خراب است» به‌نظر می‌رسید.
 *
 * تشخیصِ «تنظیم نشده» از «تنظیم شده ولی پرس‌وجو شکست خورد» تصمیمِ متفاوتی
 * می‌سازد (یکی env است، دیگری دیتابیس)، پس باید در خروجی هم متفاوت باشد.
 */
export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * مثلِ `createAdminClient` ولی به‌جای پرتاب `null` می‌دهد.
 *
 * برای جایی که دسترسیِ service-role یک **افزونهٔ اختیاری** است و نه شرطِ
 * کارکرد — مثلِ شمارشِ ثبت‌نام‌ها در فهرستِ عمومیِ وبینارها. نبودش باید
 * همان داده را `null` کند، نه کلِ مسیر را بخواباند. `null` یعنی «نمی‌دانیم»؛
 * صفر یعنی «شمردیم و صفر بود» — این دو هرگز نباید یکی شوند.
 */
export function tryCreateAdminClient(): ReturnType<typeof createAdminClient> | null {
  return hasServiceRole() ? createAdminClient() : null;
}
