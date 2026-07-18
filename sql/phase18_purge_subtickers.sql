-- ============================================================================
-- C1 — پاک‌سازی زیرنمادها و حق‌تقدم‌ها از symbol_history + قید سطح دیتابیس
-- ----------------------------------------------------------------------------
-- ⚠️ این فایل توسط رله یا سایت اجرا نمی‌شود — تحویل به کلود برای اجرای دستی
--    در Supabase SQL Editor، *بعد از* دیپلوی رلهٔ حاوی فیلترهای C1.
--
-- زمینه: BrsApi رسماً اخطار داد که برای نمادهای فاقد NAV (زیرنمادهای بلوکی/
-- عمده مثل «آوند4») ریکوئست NAV ارسال می‌شود. قاعدهٔ ثبت‌شدهٔ پروژه:
--   زیرنماد  = نمادی که به رقم (لاتین/فارسی/عربی) ختم می‌شود  ~ '[0-9۰-۹٠-٩]$'
--   حق تقدم = نمادی که به «ح» ختم می‌شود                       ~ 'ح$'
-- رله از این پس در مبدأ فیلتر می‌کند (symbols-util.mjs)؛ این اسکریپت دادهٔ
-- تاریخی آلوده را پاک و راه ورود آینده را در سطح دیتابیس هم می‌بندد.
--
-- ترتیب اجرا مهم است: اول DELETE، بعد CHECK constraint.
-- ============================================================================

-- ── گام ۰ — پیش‌بینی ابعاد (اختیاری ولی توصیه‌شده: اول این را اجرا و بررسی کن) ──
-- SELECT
--   count(*) FILTER (WHERE trim(symbol) ~ '[0-9۰-۹٠-٩]$') AS sub_ticker_rows,
--   count(*) FILTER (WHERE trim(symbol) ~ 'ح$')            AS rights_issue_rows,
--   count(*)                                               AS total_rows
-- FROM public.symbol_history;

BEGIN;

-- ── گام ۱ — حذف ردیف‌های زیرنماد (ختم به رقم لاتین/فارسی/عربی) ──
DELETE FROM public.symbol_history
WHERE trim(symbol) ~ '[0-9۰-۹٠-٩]$';

-- ── گام ۲ — حذف ردیف‌های حق تقدم (ختم به «ح») ──
-- تصمیم آرش: حق تقدم در تاریخچهٔ نمادها جایی ندارد (فقط تابلوی اختیار/مشتقه).
DELETE FROM public.symbol_history
WHERE trim(symbol) ~ 'ح$';

-- ── گام ۳ — قید CHECK: راه ورود زیرنماد در سطح دیتابیس بسته شود ──
-- NOT VALID تا روی ردیف‌های موجود (که همین تراکنش پاک شدند) فشار نیاورد؛
-- سپس VALIDATE تا از این به بعد هر INSERT/UPDATE چک شود.
ALTER TABLE public.symbol_history
  DROP CONSTRAINT IF EXISTS symbol_history_no_subticker;

ALTER TABLE public.symbol_history
  ADD CONSTRAINT symbol_history_no_subticker
  CHECK (trim(symbol) !~ '[0-9۰-۹٠-٩]$') NOT VALID;

ALTER TABLE public.symbol_history
  VALIDATE CONSTRAINT symbol_history_no_subticker;

COMMIT;

-- ── گام ۴ — راستی‌آزمایی بعد از اجرا ──
-- انتظار: هر سه کوئری صفر برگردانند.
-- SELECT count(*) FROM public.symbol_history WHERE trim(symbol) ~ '[0-9۰-۹٠-٩]$';
-- SELECT count(*) FROM public.symbol_history WHERE trim(symbol) ~ 'ح$';
-- SELECT count(*) FROM pg_constraint
--   WHERE conname = 'symbol_history_no_subticker' AND NOT convalidated;

-- ── یادداشت‌ها ──
-- ۱) قید CHECK فقط زیرنمادهای رقم‌دار را در سطح DB می‌بندد؛ حق تقدم (ح$) عمداً
--    در قید نیامده چون برخی نمادهای اصلی معتبر به «ح» ختم می‌شوند (مثل «صبح»؟ —
--    الگوی «ح$» به‌تنهایی در سطح DB ریسک false-positive دارد؛ فیلتر حق تقدم در
--    لایهٔ اپلیکیشن (رله) با کانتکست کامل انجام می‌شود.
-- ۲) اگر جدول بزرگ است و قفل نگران‌کننده، گام ۱–۲ را می‌توان به‌صورت دسته‌ای
--    (LIMIT در CTE) اجرا کرد؛ برای ابعاد فعلی پروژه نیاز نیست.
-- ۳) بعد از اجرا، nav_blacklist در ir_market_snapshots دست‌نخورده می‌ماند —
--    مکمل این پاک‌سازی است، نه جایگزین آن.
