-- =============================================================================
-- phase29 — آخرین روزِ معاملاتیِ هر نماد (`P2-CORE-LIVENESS-001`)
--
-- ── مسئله‌ای که حل می‌کند ───────────────────────────────────────────────────
-- اندازه‌گیریِ فقط‌خواندنیِ Production در ۱۴۰۵/۰۶/۲۱: از ۱٬۱۳۴ نمادِ
-- `symbol_history`، ۶۹ نماد آخرین روزِ معاملاتیِ بازار را ندارند — و تا امروز
-- **دقیقاً مثلِ یک نمادِ زنده** رندر می‌شدند. نمادی که آخرین ردیفش
-- `2018-10-29` است کنارِ نمادی نشسته که امروز معامله شده.
--
-- برای تشخیصش یک چیز لازم است: «آخرین `trade_date` هر نماد». این یک
-- `DISTINCT ON` است و PostgREST نمی‌تواند بسازد — نه `GROUP BY` دارد نه
-- `DISTINCT ON`. بدونِ این تابع، تنها راه خواندنِ ۲.۱ میلیون ردیف در کلاینت
-- است؛ یعنی عملاً هیچ.
--
-- ── چرا تابع، و نه VIEW ─────────────────────────────────────────────────────
-- `VIEW` هم کار می‌کرد، ولی PostgREST رویش `select=*` می‌زند و فیلترِ سمتِ
-- کلاینت می‌گذارد. تابع قرارداد را صریح می‌کند: دقیقاً دو ستون، هیچ ستونِ
-- قیمت و حجمی نشت نمی‌کند.
--
-- ── چرا INVOKER و نه DEFINER ────────────────────────────────────────────────
-- این تابع هیچ امتیازِ تازه‌ای لازم ندارد: هرکس که حق خواندنِ `symbol_history`
-- را دارد همین را می‌خواند. `SECURITY DEFINER` اینجا فقط یک دورزنِ RLS
-- می‌ساخت بدونِ آنکه چیزی را ممکن کند. `search_path = ''` تا نامِ جدول با
-- schemaی دیگری قابلِ ربودن نباشد.
--
-- ── دامنه ──────────────────────────────────────────────────────────────────
-- افزایشی و **فقط‌خواندنی**. هیچ جدول، ستون، ایندکس یا سیاستی را تغییر
-- نمی‌دهد. بازگشت: `DROP FUNCTION public.symbol_last_trade_dates();`
-- پیش‌نیاز: جدولِ `public.symbol_history` و ایندکسِ
-- `idx_symbol_history_symbol_date` (هر دو از phase16 موجودند).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.symbol_last_trade_dates()
RETURNS TABLE (symbol text, last_trade_date date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- `DISTINCT ON` روی همان ایندکسِ (symbol, trade_date) می‌نشیند؛ برای هر نماد
  -- یک ردیف، بدونِ اسکنِ کاملِ ۲.۱ میلیون ردیف.
  SELECT DISTINCT ON (h.symbol) h.symbol, h.trade_date
  FROM public.symbol_history h
  ORDER BY h.symbol, h.trade_date DESC;
$$;

COMMENT ON FUNCTION public.symbol_last_trade_dates() IS
  'آخرین روزِ معاملاتیِ ثبت‌شدهٔ هر نماد. فقط‌خواندنی، SECURITY INVOKER، بدونِ ستونِ قیمت.';

-- ── گرنت‌ها ─────────────────────────────────────────────────────────────────
-- درسِ G2-006 و P2-CLAUDE-MEGA-004: امتیازِ پیش‌فرضِ `PUBLIC` روی تابع
-- `EXECUTE` است. پس اول همه را پس می‌گیریم، بعد صریح می‌دهیم.
REVOKE ALL ON FUNCTION public.symbol_last_trade_dates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.symbol_last_trade_dates() FROM anon;
REVOKE ALL ON FUNCTION public.symbol_last_trade_dates() FROM authenticated;
REVOKE ALL ON FUNCTION public.symbol_last_trade_dates() FROM service_role;

GRANT EXECUTE ON FUNCTION public.symbol_last_trade_dates() TO anon;
GRANT EXECUTE ON FUNCTION public.symbol_last_trade_dates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.symbol_last_trade_dates() TO service_role;

-- ── راستی‌آزماییِ پس از اجرا ────────────────────────────────────────────────
-- «فایل اجرا شد» با «فایل کار کرد» یکی نیست. این بلوک هر سه ادعای فایل را
-- می‌سنجد و در صورتِ شکست اجرا را می‌اندازد.
DO $$
DECLARE
  n_rows int;
  n_syms int;
  is_definer bool;
BEGIN
  SELECT p.prosecdef INTO is_definer
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'symbol_last_trade_dates';

  IF is_definer IS NULL THEN
    RAISE EXCEPTION 'phase29: تابع ساخته نشد';
  END IF;
  IF is_definer THEN
    RAISE EXCEPTION 'phase29: تابع SECURITY DEFINER شد — RLS دور زده می‌شود';
  END IF;

  SELECT count(*) INTO n_rows FROM public.symbol_last_trade_dates();
  SELECT count(DISTINCT h.symbol) INTO n_syms FROM public.symbol_history h;

  -- یک ردیف به‌ازای هر نماد، نه بیشتر و نه کمتر. اگر `DISTINCT ON` بشکند،
  -- خروجی چند برابر می‌شود و این خط آن را می‌گیرد.
  IF n_rows <> n_syms THEN
    RAISE EXCEPTION 'phase29: % ردیف برگشت در برابرِ % نماد', n_rows, n_syms;
  END IF;

  RAISE NOTICE 'phase29 ok — % نماد', n_rows;
END $$;
