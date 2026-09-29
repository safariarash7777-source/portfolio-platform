/**
 * مقصدهای مجازِ fetch مرورگر به Supabase.
 *
 * `*.supabase.co` برای پروژهٔ ابری می‌ماند. اگر `NEXT_PUBLIC_SUPABASE_URL` به
 * Supabaseِ خودمیزبان (مثلاً روی سرورِ ایرانی) اشاره کند، همان origin هم اضافه
 * می‌شود — وگرنه ورود در مرورگر با CSP شکست می‌خورد، در حالی که سمتِ سرور کار
 * می‌کند و خطا فقط در کنسولِ مرورگر دیده می‌شود. فقط https پذیرفته است.
 */
function supabaseConnectSrc(url = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const sources = ["https://*.supabase.co", "wss://*.supabase.co"];
  try {
    const u = new URL(url || "");
    if (u.protocol === "https:" && !u.hostname.endsWith(".supabase.co")) sources.push(u.origin);
  } catch {
    // آدرسِ خالی یا نامعتبر: فقط پیش‌فرضِ ابری.
  }
  return sources.join(" ");
}

module.exports = { supabaseConnectSrc };
