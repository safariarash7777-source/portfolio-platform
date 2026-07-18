-- ============================================================================
-- فاز ۱۶ — پاک‌سازی یک‌بارهٔ ردیف‌های تکراری symbol_history + ایندکس یکتا
-- ============================================================================
--
-- ⚠️ استثنای یک‌بارهٔ مصوب آرش برای تعمیر درج اشتباه — نه دست‌کاری تاریخچه.
--    جدول symbol_history به‌طور عادی append-only است (تریگر fn_forbid_mutation).
--    این اسکریپت فقط ردیف‌های «درج اشتباهِ دوباره» را حذف می‌کند؛ ردیف اصیلِ
--    اول‌درج‌شده دست‌نخورده می‌ماند. هیچ UPDATE در کار نیست.
--
-- زمینه: بک‌فیل کندل (M8-الف) برای مقایسهٔ «تاریخ‌های موجود» یک SELECT با
-- limit=12000 می‌زد، اما PostgREST پاسخ را به سقف Max Rows پروژه (~۱۰۰۰ ردیف)
-- می‌بُرد؛ در نتیجه برای ۲۸ نمادِ دارای تاریخچهٔ قدیمی brsapi_history، تاریخ‌های
-- موجود «غایب» دیده شدند و دوباره درج شدند (~۵۸٬۶۳۶ جفت symbol/trade_date
-- تکراری در اندازه‌گیری ۲۷ تیر ۱۴۰۵؛ نمونهٔ قطعی: «کگل» با ۳٬۶۲۵ ردیف تکراری).
--
-- قاعدهٔ حذف (generic — تکراری‌های احتمالی بعد از اندازه‌گیری را هم می‌گیرد):
--   از هر گروه (symbol, trade_date) فقط ردیف با «کوچک‌ترین id» می‌ماند —
--   یعنی ردیف اصیلِ اول‌درج‌شده (برای این ۲۸ نماد همان brsapi_history غنی‌تر).
--
-- بعد از حذف، ایندکس یکتا روی (symbol, trade_date) ساخته می‌شود تا تکرار
-- در سطح دیتابیس برای همیشه غیرممکن شود.
--
-- پذیرش (بعد از اجرا چک شود):
--   SELECT symbol, trade_date FROM public.symbol_history
--   GROUP BY 1, 2 HAVING count(*) > 1;   → باید صفر ردیف برگرداند.
-- ============================================================================

BEGIN;

-- ── ۱) غیرفعال‌سازی موقت تریگر append-only فقط برای DELETE همین تراکنش ──────
-- (تریگر بلافاصله در پایان همین تراکنش دوباره فعال می‌شود — گام ۴)
ALTER TABLE public.symbol_history DISABLE TRIGGER USER;

-- ── ۲) حذف تکراری‌ها: از هر (symbol, trade_date) کوچک‌ترین id می‌ماند ────────
DELETE FROM public.symbol_history sh
USING public.symbol_history keep
WHERE keep.symbol = sh.symbol
  AND keep.trade_date = sh.trade_date
  AND keep.id < sh.id;

-- ── ۳) ایندکس یکتا: تکرار از این به بعد در سطح دیتابیس غیرممکن ──────────────
CREATE UNIQUE INDEX symbol_history_symbol_trade_date_key
  ON public.symbol_history (symbol, trade_date);

-- ── ۴) فعال‌سازی دوبارهٔ تریگرهای append-only ────────────────────────────────
ALTER TABLE public.symbol_history ENABLE TRIGGER USER;

COMMIT;

-- ============================================================================
-- راستی‌آزمایی پس از اجرا (خارج از تراکنش، فقط SELECT):
--
--   -- الف) هیچ جفت تکراری نمانده باشد:
--   SELECT symbol, trade_date, count(*)
--   FROM public.symbol_history
--   GROUP BY 1, 2 HAVING count(*) > 1
--   LIMIT 5;
--
--   -- ب) ایندکس یکتا موجود باشد:
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'symbol_history'
--     AND indexname = 'symbol_history_symbol_trade_date_key';
--
--   -- ج) نمونهٔ «کگل» — هر تاریخ فقط یک ردیف (اصیل brsapi_history):
--   SELECT source, count(*) FROM public.symbol_history
--   WHERE symbol = 'کگل' GROUP BY 1;
-- ============================================================================
