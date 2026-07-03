-- ============================================================================
-- admin_dashboard_stats.sql — آمار فقط‌خواندنیِ داشبورد ادمین
-- ----------------------------------------------------------------------------
-- سه تابعِ فقط‌خواندنی که دقیقاً از الگوی امنیتیِ public.save_portfolio() پیروی می‌کنند:
--   • SECURITY DEFINER + SET search_path = public
--   • گیتِ صریحِ public.is_admin() داخل هر تابع (RAISE EXCEPTION در صورت عدم دسترسی)
--   • REVOKE ALL از public و GRANT EXECUTE فقط به authenticated
--
-- این فایل هیچ نوشتنی در دیتابیس ندارد و هیچ تغییری در schema نمی‌دهد.
-- با CREATE OR REPLACE چند بار هم اجرا شود بی‌خطر است.
--
-- اجرا: Supabase → SQL Editor → Run  (نیازمندِ اجرای قبلیِ supabase_schema.sql
-- برای وجودِ public.is_admin()).
-- ============================================================================

-- ── ۱) شمارنده‌های کل به‌صورت یک payload از jsonb ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند آمار را ببیند.';
  END IF;

  SELECT jsonb_build_object(
    -- کاربران کل (ادمین‌ها شمرده نمی‌شوند)
    'total_users',     (SELECT count(*) FROM public.profiles WHERE role = 'user'),
    -- کاربر جدید در ۷ روز اخیر
    'new_users_7d',    (SELECT count(*) FROM public.profiles
                         WHERE role = 'user' AND created_at >= now() - interval '7 days'),
    -- کاربرانِ یکتای دارای حداقل یک ارزیابی ریسک
    'assessed_users',  (SELECT count(DISTINCT ra.user_id)
                         FROM public.risk_assessments ra
                         JOIN public.profiles p ON p.id = ra.user_id
                         WHERE p.role = 'user'),
    -- کاربرانِ دارای ردیف در portfolios (پوشش پرتفوی)
    'portfolio_users', (SELECT count(*)
                         FROM public.portfolios pf
                         JOIN public.profiles p ON p.id = pf.user_id
                         WHERE p.role = 'user'),
    -- لیست انتظار
    'waitlist_count',  (SELECT count(*) FROM public.waitlist)
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;


-- ── ۲) رشد کاربران: سری هفتگی در p_days روزِ اخیر (با پرکردنِ صفرِ هفته‌های خالی) ─
CREATE OR REPLACE FUNCTION public.admin_user_growth(p_days int DEFAULT 90)
RETURNS TABLE (week_start date, signups bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_from timestamptz := date_trunc('week', now() - make_interval(days => greatest(p_days, 7)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند آمار را ببیند.';
  END IF;

  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(v_from, date_trunc('week', now()), interval '1 week')::date AS wk
  ),
  signups AS (
    SELECT date_trunc('week', created_at)::date AS wk, count(*) AS n
    FROM public.profiles
    WHERE role = 'user' AND created_at >= v_from
    GROUP BY 1
  )
  SELECT w.wk, COALESCE(s.n, 0)::bigint
  FROM weeks w
  LEFT JOIN signups s ON s.wk = w.wk
  ORDER BY w.wk;
END $$;

REVOKE ALL ON FUNCTION public.admin_user_growth(int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_user_growth(int) TO authenticated;


-- ── ۳) توزیع پروفایل ریسک بر اساس «آخرین» ارزیابیِ هر کاربر ──────────────────
CREATE OR REPLACE FUNCTION public.admin_risk_distribution()
RETURNS TABLE (risk_category text, users bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند آمار را ببیند.';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (ra.user_id) ra.user_id, ra.risk_category
    FROM public.risk_assessments ra
    JOIN public.profiles p ON p.id = ra.user_id
    WHERE p.role = 'user'
    ORDER BY ra.user_id, ra.created_at DESC
  )
  SELECT l.risk_category, count(*)::bigint
  FROM latest l
  GROUP BY l.risk_category
  ORDER BY count(*) DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_risk_distribution() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_risk_distribution() TO authenticated;
