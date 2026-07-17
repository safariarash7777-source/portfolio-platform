-- ═══════════════════════════════════════════════════════════════════
-- Phase 15 — سخت‌سازی امنیتی Supabase (ابرتسک «پاک‌سازی و تثبیت» — C2)
-- تاریخ: ۲۶ تیر ۱۴۰۵ (17 Jul 2026)
--
-- منبع: خروجی advisorهای رسمی Supabase (security lints) + ممیزی گرنت‌ها.
-- اجرا: یک‌بار در SQL Editor پروژهٔ سایت (الگوی phase12–14).
-- این فایل هیچ داده‌ای حذف نمی‌کند و هیچ تابعی را بازتعریف نمی‌کند —
-- فقط GRANT/REVOKE، search_path و اسکیمای افزونه را اصلاح می‌کند.
--
-- چهار بخش:
--   §۱  REVOKE EXECUTE توابع SECURITY DEFINER از anon (و در موارد ادمین/داخلی از authenticated)
--   §۲  ثابت‌کردن search_path شش تابع تریگری بدون search_path
--   §۳  انتقال افزونهٔ pg_net از اسکیمای public به extensions
--   §۴  راستی‌آزمایی (کوئری‌های چک — فقط SELECT)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- §۱ — گرنت‌های توابع SECURITY DEFINER
--
-- قاعده: PostgreSQL به‌طور پیش‌فرض EXECUTE هر تابع جدید را به PUBLIC می‌دهد؛
-- یعنی anon هم می‌تواند از REST (rpc/…) صدا بزند. برای هر تابع، اول همه چیز
-- REVOKE و بعد فقط نقش‌هایی که واقعاً مصرف‌کننده‌اند GRANT می‌شوند.
-- نقشهٔ مصرف واقعی (از grep کامل کد main استخراج شد):
--   • مرورگرِ کاربر لاگین‌شده (نقش authenticated) → توابع ادمین (گیت is_admin داخلی دارند)
--     و توابع کاربری (گیت auth.uid داخلی دارند).
--   • سرور با کلید سرویس (نقش service_role) → توابع پرداخت/تلگرام/آلارم.
--   • هیچ تابعی مصرف‌کنندهٔ anon ندارد → anon از همه REVOKE می‌شود.
-- ─────────────────────────────────────────────────────────────────────

-- ── ۱-الف) توابع «فقط ادمین» ─────────────────────────────────────────
-- گیت داخلی is_admin() دارند ولی نباید حتی قابل فراخوانی توسط anon باشند
-- (کاهش سطح حمله + advisor). مصرف‌کننده: مرورگر ادمینِ لاگین‌شده (authenticated).
REVOKE ALL ON FUNCTION public.admin_dashboard_stats()              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_risk_distribution()            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_growth(int)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_users_list(text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_risk_distribution() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_growth(int)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_users_list(text, text, text, int, int) TO authenticated, service_role;

-- publish/force/hide/add — ادمینی؛ مصرف: API route با سشن کاربر ادمین (authenticated)
REVOKE ALL ON FUNCTION public.publish_announcement(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.force_expire_risk(uuid, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_content_item(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hide_content_item(uuid)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_market_note(text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_announcement(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.force_expire_risk(uuid, text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_content_item(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hide_content_item(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_market_note(text, text, text[]) TO authenticated, service_role;

-- ── ۱-ب) توابع «کاربر لاگین‌شده» ─────────────────────────────────────
-- گیت داخلی auth.uid() دارند؛ مصرف: مرورگر/سرور با سشن کاربر (authenticated).
-- anon هیچ مصرفی ندارد.
REVOKE ALL ON FUNCTION public.save_portfolio(uuid, jsonb, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_telegram_link_code()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_announcement_seen(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_payment(integer, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_for_webinar(uuid)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_portfolio(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_telegram_link_code()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_announcement_seen(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_payment(integer, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_for_webinar(uuid)        TO authenticated, service_role;

-- ── ۱-پ) توابع «فقط سرویس» ──────────────────────────────────────────
-- مصرف: فقط API routeهای سرور با کلید سرویس (callback پرداخت، وب‌هوک تلگرام، آلارم).
-- هیچ نقش کاربری نباید بتواند صدا بزند.
REVOKE ALL ON FUNCTION public.verify_payment(text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_payment(text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_link_code(text, bigint)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_alert(uuid, numeric, text)          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payment(text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment(text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_link_code(text, bigint)            TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_alert(uuid, numeric, text)          TO service_role;

-- ── ۱-ت) توابع کمکی داخل سیاست‌های RLS — استثنای عمدی (با دلیل) ─────
-- این توابع داخل عبارت USING سیاست‌های RLS صدا زده می‌شوند و RLS با
-- حقوق «نقشِ کوئری‌زننده» اجرا می‌شود؛ اگر anon نتواند اجرایشان کند،
-- SELECTهای عمومی (content_items ,market_notes ,announcements و…) خطا می‌دهند.
--   • is_admin()            → در ده‌ها سیاست RLS (از جمله جدول‌های عمومی‌خوان) مصرف می‌شود
--   • can_see_announcement() → در سیاست خواندن announcements مصرف می‌شود
--   • fn_user_access(uuid)   → کمکی سطح دسترسی؛ در سیاست/کد سرور مصرف می‌شود
-- پس EXECUTE برای anon و authenticated «عمداً» حفظ می‌شود. این توابع فقط
-- boolean/فهرست سطح برمی‌گردانند و دادهٔ حساسی افشا نمی‌کنند.
REVOKE ALL ON FUNCTION public.is_admin()                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_see_announcement(text)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_user_access(uuid)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin()                 TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_see_announcement(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_user_access(uuid)       TO anon, authenticated, service_role;

-- ── ۱-ث) توابع تریگری — هیچ‌کس نباید مستقیم صدا بزند ─────────────────
-- تریگرها با حقوق مالک جدول اجرا می‌شوند؛ EXECUTE مستقیم لازم نیست.
REVOKE ALL ON FUNCTION public.deny_mutation()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payments_guard()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.watchlist_cap()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_entitlements_guard()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_forbid_mutation()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_signals_hash_chain()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_signal_outcomes_hash_chain()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_weekly_outlooks_hash_chain()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_weekly_outlook_results_hash_chain() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- §۲ — ثابت‌کردن search_path توابع تریگری (advisor: function_search_path_mutable)
--
-- بدنهٔ این توابع همه‌جا ارجاع schema-qualified دارد (public.…) یا فقط
-- NEW/OLD/now() مصرف می‌کند؛ پس search_path خالی امن است (الگوی رسمی Supabase).
-- ─────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.deny_mutation()         SET search_path = '';
ALTER FUNCTION public.payments_guard()        SET search_path = '';
ALTER FUNCTION public.watchlist_cap()         SET search_path = '';
ALTER FUNCTION public.set_updated_at()        SET search_path = '';
ALTER FUNCTION public.fn_entitlements_guard() SET search_path = '';
ALTER FUNCTION public.fn_forbid_mutation()    SET search_path = '';

-- watchlist_cap داخل بدنه count(*) از public.watchlist_items می‌خواند —
-- ارجاعش schema-qualified است پس '' امن است. اگر خطای «relation does not exist»
-- در INSERT واچ‌لیست دیدید (نباید ببینید)، این یک خط جایگزین را اجرا کنید:
-- ALTER FUNCTION public.watchlist_cap() SET search_path = 'public';

-- توابع هش زنجیره‌ای terminal_t0/phase12 از قبل search_path صریح دارند
-- (public, extensions) و advisor آن‌ها را flag نکرده — دست نمی‌زنیم تا
-- digest() از extensions.digest بشکند.

-- ─────────────────────────────────────────────────────────────────────
-- §۳ — انتقال pg_net از public به اسکیمای extensions
--       (advisor: extension_in_public)
-- ─────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_net SET SCHEMA extensions;

-- اگر جایی از net.http_post استفادهٔ زنده وجود داشت (cron/webhook داخلی)،
-- بعد از این انتقال باید extensions.http_post صدا زده شود. grep کامل کد main
-- هیچ مصرفی از pg_net پیدا نکرد؛ افزونه فقط نصبِ پیش‌فرض بوده است.

-- ─────────────────────────────────────────────────────────────────────
-- §۴ — راستی‌آزمایی (فقط SELECT — بعد از اجرا نتیجه را چک کنید)
-- ─────────────────────────────────────────────────────────────────────
-- ۴-الف) هیچ تابع SECURITY DEFINER با EXECUTE برای anon نماند مگر سه استثنای §۱-ت:
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 2 DESC, 1;
-- انتظار: anon_can_exec=true فقط برای is_admin ,can_see_announcement ,fn_user_access

-- ۴-ب) هیچ تابع بدون search_path ثابت نماند:
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
  )
ORDER BY 1;
-- انتظار: خروجی خالی (یا فقط توابعی که advisor flag نکرده)

-- ۴-پ) pg_net دیگر در public نیست:
SELECT e.extname, n.nspname
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'pg_net';
-- انتظار: nspname = extensions
