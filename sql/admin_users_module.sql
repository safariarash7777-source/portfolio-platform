-- ============================================================================
-- admin_users_module.sql — فهرستِ فقط‌خواندنیِ کاربران برای پنل ادمین
-- ----------------------------------------------------------------------------
-- یک تابعِ فقط‌خواندنی با همان الگوی امنیتیِ public.save_portfolio():
--   • SECURITY DEFINER + SET search_path = public
--   • گیتِ صریحِ public.is_admin() (RAISE EXCEPTION در صورت عدم دسترسی)
--   • REVOKE ALL از public و GRANT EXECUTE فقط به authenticated
--
-- هیچ نوشتنی، هیچ تغییرِ schema. با CREATE OR REPLACE بارها هم اجرا شود بی‌خطر است.
-- اجرا: Supabase → SQL Editor → Run  (نیازمندِ اجرای قبلیِ supabase_schema.sql).
--
-- نکتهٔ سقفِ p_limit: برای پشتیبانیِ خروجیِ CSV «همان چیزی که می‌بینی» تا ۱۰٬۰۰۰
-- ردیف، سقفِ تابع ۱۰٬۰۰۰ است؛ صفحه‌بندیِ تعاملیِ رابط ۲۵تایی درخواست می‌دهد.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_users_list(
  p_search text DEFAULT NULL,
  p_risk   text DEFAULT NULL,
  p_quiz   text DEFAULT NULL,   -- 'done' | 'pending' | NULL
  p_limit  int  DEFAULT 25,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  id                 uuid,
  full_name          text,
  email              text,
  phone              text,
  national_id        text,
  joined_at          timestamptz,
  last_risk_category text,
  last_score         int,
  last_assessed_at   timestamptz,
  has_portfolio      boolean,
  total_count        bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_limit  int  := least(greatest(coalesce(p_limit, 25), 1), 10000);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند فهرست کاربران را ببیند.';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      p.full_name,
      p.email,
      p.phone,
      p.national_id,
      p.created_at AS joined_at,
      la.risk_category AS last_risk_category,
      la.total_score   AS last_score,
      la.created_at    AS last_assessed_at,
      (pf.user_id IS NOT NULL) AS has_portfolio
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT ra.risk_category, ra.total_score, ra.created_at
      FROM public.risk_assessments ra
      WHERE ra.user_id = p.id
      ORDER BY ra.created_at DESC
      LIMIT 1
    ) la ON true
    LEFT JOIN public.portfolios pf ON pf.user_id = p.id
    WHERE p.role = 'user'
      AND (
        v_search IS NULL
        OR p.full_name   ILIKE '%' || v_search || '%'
        OR p.email       ILIKE '%' || v_search || '%'
        OR p.phone       ILIKE '%' || v_search || '%'
        OR p.national_id ILIKE '%' || v_search || '%'
      )
      AND (p_risk IS NULL OR la.risk_category = p_risk)
      AND (
        p_quiz IS NULL
        OR (p_quiz = 'done'    AND la.created_at IS NOT NULL)
        OR (p_quiz = 'pending' AND la.created_at IS NULL)
      )
  )
  SELECT
    b.id, b.full_name, b.email, b.phone, b.national_id, b.joined_at,
    b.last_risk_category, b.last_score, b.last_assessed_at, b.has_portfolio,
    count(*) OVER () AS total_count
  FROM base b
  ORDER BY b.joined_at DESC NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END $$;

REVOKE ALL ON FUNCTION public.admin_users_list(text, text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_users_list(text, text, text, int, int) TO authenticated;
