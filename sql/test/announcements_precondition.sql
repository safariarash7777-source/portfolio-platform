-- =============================================================================
-- پیش‌نیازِ تستِ اعلان — بازسازیِ **شکلِ واقعیِ Production**، نه یک مدلِ دلخواه.
--
-- هر چیزی که اینجاست از پرس‌وجوی فقط‌خواندنیِ کاتالوگِ Production در
-- ۱۴۰۵/۰۶/۲۵ گرفته شده: ستون‌ها، تریگرِ `no_mutation`، سیاستِ `ann_target_read`
-- و تعریفِ `can_see_announcement` و `publish_announcement`.
--
-- ⚠️ `announcement_deliveries` عمداً **بدونِ** ستونِ شناسهٔ پیام ساخته می‌شود،
-- چون روی Production هم ندارد. تستی که ستونِ نداشته را فرض کند، چیزی را اثبات
-- نمی‌کند که وجود دارد.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.risk_assessments (
  user_id       uuid NOT NULL,
  risk_category text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id             bigserial PRIMARY KEY,
  actor_id       uuid,
  action         text,
  entity         text,
  target_user_id uuid,
  after          jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text,
  body_md      text,
  target       text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.announcement_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.announcements(id),
  user_id         uuid,
  channel         text,
  status          text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.deny_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $deny$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $deny$;

DROP TRIGGER IF EXISTS no_mutation ON public.announcements;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

CREATE OR REPLACE FUNCTION public.can_see_announcement(p_target text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $see$
DECLARE v_cat text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF p_target = 'all' THEN
    RETURN true;
  ELSIF p_target LIKE 'user:%' THEN
    RETURN auth.uid()::text = substring(p_target FROM 6);
  ELSIF p_target LIKE 'risk:%' THEN
    SELECT risk_category INTO v_cat FROM public.risk_assessments
     WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
    RETURN v_cat IS NOT NULL AND v_cat = substring(p_target FROM 6);
  END IF;
  RETURN false;
END $see$;

CREATE OR REPLACE FUNCTION public.publish_announcement(p_title text, p_body_md text, p_target text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $pub$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند اعلامیه منتشر کند.';
  END IF;
  INSERT INTO public.announcements (title, body_md, target, created_by, published_at)
  VALUES (p_title, p_body_md, p_target, auth.uid(), now()) RETURNING id INTO v_id;
  INSERT INTO public.audit_log (actor_id, action, entity, after)
  VALUES (auth.uid(), 'announcement.publish', 'announcement',
          jsonb_build_object('id', v_id, 'target', p_target, 'title', p_title));
  RETURN v_id;
END $pub$;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ann_target_read ON public.announcements;
CREATE POLICY ann_target_read ON public.announcements FOR SELECT USING (
  public.is_admin() OR (published_at IS NOT NULL AND public.can_see_announcement(target))
);

-- audit_log هم دقیقاً مثل Production فقط با RLS بسته شده، نه با GRANT.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_admin_read ON public.audit_log;
CREATE POLICY audit_admin_read ON public.audit_log FOR SELECT USING (public.is_admin());

ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deliv_self_read ON public.announcement_deliveries;
CREATE POLICY deliv_self_read ON public.announcement_deliveries FOR SELECT USING (
  auth.uid() = user_id OR public.is_admin()
);

-- ⚠️ این بخش را ساده نکن — شکلِ واقعیِ Production است و اگر سخت‌گیرانه‌ترش
-- کنی، تست‌ها به دلیلِ اشتباه سبز می‌شوند.
--
-- اندازه‌گیریِ فقط‌خواندنیِ ۱۴۰۵/۰۶/۲۵ روی پروژهٔ واقعی:
--   pg_default_acl برای schema `public` ⇒  anon=arwdDxtm, authenticated=arwdDxtm,
--   service_role=arwdDxtm  (یعنی **همهٔ** حقوق، شاملِ INSERT/UPDATE/DELETE)
-- و information_schema.role_table_grants همین را برای `announcements`,
-- `audit_log` و `announcement_deliveries` تأیید می‌کند.
--
-- نتیجهٔ مهم: در Production تنها چیزی که این جدول‌ها را می‌بندد **RLS** است،
-- نه GRANT. اگر اینجا فقط `GRANT SELECT` بدهیم، آزمونِ «عضو نمی‌تواند لغو
-- کند» با «permission denied» سبز می‌شود در حالی که در Production ممکن است
-- RLS بی‌اثر باشد و داده لو برود. پس همان GRANT فراخ را بازمی‌سازیم تا RLS
-- واقعاً زیرِ آزمون برود.
GRANT ALL ON public.announcements          TO anon, authenticated, service_role;
GRANT ALL ON public.audit_log              TO anon, authenticated, service_role;
GRANT ALL ON public.announcement_deliveries TO anon, authenticated, service_role;
GRANT ALL ON public.risk_assessments        TO anon, authenticated, service_role;

-- و همان ALTER DEFAULT PRIVILEGES که باعث می‌شود **هر جدولِ تازه‌ای** هم با
-- حقوقِ کامل برای anon/authenticated متولد شود. phase31 باید خودش این را
-- برای `announcement_revocations` پس بگیرد؛ تستِ مربوطه همین را می‌سنجد.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_announcement(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_announcement(text) TO anon, authenticated;
