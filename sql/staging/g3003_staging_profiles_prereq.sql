-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STAGING ONLY — `oqjcvkzyvhqnphopedpn` (portfolio-staging-g2006)      ║
-- ║  NEVER run this on Production (`uooeygybrniptzdxuzhj`).               ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- مأموریت: `P2-G3-003` · اجرا شد روی staging در ۱۴۰۵/۰۵/۱۱
--
-- ── چرا این فایل وجود دارد ──────────────────────────────────────────────
-- این **اصلاحِ محصول نیست**؛ ترمیمِ یک fixtureِ ناقصِ staging است. جدولِ
-- `profiles` روی staging به‌عنوانِ پیش‌نیازِ برهنه ساخته شده بود (`B-036`)،
-- پس دو چیز را با خودش نیاورد و هر دو با اندازه‌گیری روی همان پروژه دیده شد:
--
-- ۱) **RLS روشن بود و صفر سیاست داشت.** یعنی `authenticated` هیچ سطری از
--    `profiles` نمی‌دید. و چون سیاستِ همهٔ جدول‌های `intel_*` این است:
--        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role='admin')
--    آن زیرپرس‌وجو **همیشه false** می‌شد و ادمین بی‌صدا از هر نوشتنی روی
--    مدلِ هوشمندی قفل بود. `sql/test/supabase_bootstrap.sql:84` دقیقاً همین
--    تله را پیش‌بینی کرده بود — ولی آن فایل به پروژهٔ واقعیِ staging اعمال
--    نشده بود.
--
-- ۲) **`anon` و `authenticated` روی `profiles` گرنتِ کامل داشتند** — شاملِ
--    `DELETE` و `TRUNCATE`. این با اندازه‌گیری تأیید شد: `anon DELETE
--    profiles` **پذیرفته شد**. پوششِ فعلی دو چیزِ تصادفی بود، نه کنترلِ
--    امنیتی: RLSای که هیچ سیاستی نداشت (پس همه‌چیز را می‌بست) و یک
--    کلیدِ خارجی که TRUNCATE را پس می‌زد.
--
-- ── چرا ترتیب مهم است ───────────────────────────────────────────────────
-- اگر فقط سیاستِ خواندن اضافه می‌شد (کاری که «کپی از Production» به‌نظر
-- می‌رسید)، همان لحظه گرنتِ `DELETE` برای `anon` از حالتِ پوشیده به حالتِ
-- **زنده** می‌رفت. پس اول REVOKE، بعد حداقلِ GRANT، بعد سیاست.

BEGIN;

-- ── ۱) بستنِ گرنت‌های پیش‌فرضِ بیش‌ازحد ────────────────────────────────
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM authenticated;
REVOKE ALL ON TABLE public.profiles FROM service_role;

-- ── ۲) حداقلِ لازم ────────────────────────────────────────────────────
-- `authenticated` فقط SELECT می‌گیرد تا بتواند سطرِ **خودش** را بخواند؛
-- محدودکردن به «سطرِ خودش» کارِ سیاستِ پایین است، نه کارِ گرنت.
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- سرور (service-role) پروفایل می‌خواند و نگهداری می‌کند، ولی هرگز نباید
-- بتواند حذف یا TRUNCATE کند — همان قاعدهٔ `B-034` روی جدول‌های `intel_*`.
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;

-- ── ۳) خواندنِ فقط سطرِ خود ─────────────────────────────────────────────
-- عمداً داخلِ سیاستِ `profiles` دوباره از `profiles` پرس‌وجو نمی‌شود؛ آن
-- بازگشتی می‌شد. Production برای حالتِ «ادمین پروفایلِ دیگران را ببیند» از
-- `is_admin()`ِ SECURITY DEFINER استفاده می‌کند؛ staging به آن نیاز ندارد،
-- چون سیاست‌های `intel_*` فقط سطرِ **خودِ فراخوان** را نگاه می‌کنند.
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

COMMIT;

-- ── اندازه‌گیریِ پس از اجرا (روی همان پروژه، همه داخلِ تراکنشِ rollback) ──
--   anon DELETE profiles                → permission denied      ✅ (قبلاً: ACCEPTED)
--   admin سطرِ پروفایلِ خودش را می‌خواند → ۱ سطر                  ✅ (قبلاً: ۰)
--   admin INSERT در intel_events        → پذیرفته شد             ✅ (قبلاً: RLS رد می‌کرد)
--   admin DELETE در intel_events        → permission denied      ✅ (append-only دست‌نخورده)
--   کاربر عادی INSERT در intel_events   → RLS رد کرد             ✅
--   کاربر عادی پروفایلِ ادمین را می‌خواند → ۰ سطر                 ✅
--
-- پس از همهٔ کنترل‌ها: `auth.users`=۰ · `profiles`=۰ · مجموعِ ۱۵ جدولِ
-- `intel_*`=۰ سطر. هیچ دادهٔ ساختگی باقی نماند.
