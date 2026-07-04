-- ════════════════════════════════════════════════════════════════════════
-- فاز ۶ — اعلامیه‌ها (Announcements) + تحویل چندکاناله + اعتبارسنجی ۱۸۰روزه
-- ADDITIVE · idempotent · append-only (همان الگوی فازهای قبل).
-- به جدول‌ها/ستون‌های موجود دست نمی‌زند. چند بار اجرا شدنش امن است.
--
-- منبعِ «تاریخچهٔ امتیاز ریسک» همان جدولِ موجودِ public.risk_assessments است
-- (هر تکمیل کوییز = یک ردیفِ append با created_at). این فاز آن را دوباره
-- نمی‌سازد؛ فقط یک لاگِ append-only برای «انقضای دستیِ ادمین» اضافه می‌کند.
--
-- پیش‌نیاز: supabase_schema.sql (is_admin, risk_assessments، profiles) و
--           supabase_portfolio_versioning.sql (audit_log, deny_mutation).
-- ════════════════════════════════════════════════════════════════════════

-- نگهبانِ append-only (اگر از فاز ۰ موجود است، همان؛ برای خوداتکاییِ فایل
-- دوباره تعریف می‌شود — بی‌خطر).
CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $$;

-- ── 1. جدول‌ها ───────────────────────────────────────────────────────────

-- اعلامیه‌ها. append-only. target یکی از: 'all' | 'risk:<category>' | 'user:<uuid>'.
CREATE TABLE IF NOT EXISTS public.announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body_md      text NOT NULL,
  target       text NOT NULL,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_announcements_published
  ON public.announcements(published_at DESC);

-- تحویل‌ها — برای جلوگیری از ارسال تکراری و سنجشِ نرخ تحویل.
CREATE TABLE IF NOT EXISTS public.announcement_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('email','telegram','in_app')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','skipped','delivered','seen')),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_ann  ON public.announcement_deliveries(announcement_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON public.announcement_deliveries(user_id, channel);

-- لاگِ انقضای دستیِ ادمین (force-expire). append-only — تاریخِ قبلی دست‌کاری
-- نمی‌شود؛ فقط یک رویدادِ انقضا ثبت می‌گردد.
CREATE TABLE IF NOT EXISTS public.risk_revalidations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  expired_at timestamptz NOT NULL DEFAULT now(),
  reason     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revalidations_user
  ON public.risk_revalidations(user_id, expired_at DESC);

-- ── 2. append-only enforcement ──────────────────────────────────────────
DROP TRIGGER IF EXISTS no_mutation ON public.announcements;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS no_mutation ON public.risk_revalidations;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.risk_revalidations
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();
-- announcement_deliveries عمداً append-only نیست: وضعیت in_app → 'seen' به‌روز می‌شود.

-- ── 3. helper: آیا کاربرِ جاری مخاطبِ این اعلامیه است؟ ───────────────────
-- SECURITY DEFINER تا بتواند دستهٔ ریسکِ کاربر را بخواند (RLS خودش).
CREATE OR REPLACE FUNCTION public.can_see_announcement(p_target text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_cat text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  IF p_target = 'all' THEN
    RETURN true;
  ELSIF p_target LIKE 'user:%' THEN
    RETURN auth.uid()::text = substring(p_target FROM 6);
  ELSIF p_target LIKE 'risk:%' THEN
    SELECT risk_category INTO v_cat
      FROM public.risk_assessments
     WHERE user_id = auth.uid()
     ORDER BY created_at DESC LIMIT 1;
    RETURN v_cat IS NOT NULL AND v_cat = substring(p_target FROM 6);
  END IF;
  RETURN false;
END $$;

-- ── 4. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.announcements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_deliveries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_revalidations       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('announcements','announcement_deliveries','risk_revalidations')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- اعلامیه: مخاطبِ هدف یا ادمین می‌خواند (فقط منتشرشده‌ها برای کاربر).
CREATE POLICY "ann_target_read" ON public.announcements
  FOR SELECT USING (
    public.is_admin()
    OR (published_at IS NOT NULL AND public.can_see_announcement(target))
  );

-- تحویل: کاربر ردیف خودش را می‌بیند؛ ادمین همه را (برای شمار تحویل).
CREATE POLICY "deliv_self_read" ON public.announcement_deliveries
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- انقضا: کاربر ردیف خودش؛ ادمین همه.
CREATE POLICY "reval_self_read" ON public.risk_revalidations
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- بدون سیاست INSERT/UPDATE/DELETE — نوشتن فقط از توابع SECURITY DEFINER و
-- service_role (تحویل‌ها در route با service_role درج می‌شوند).

-- ── 5. توابع ────────────────────────────────────────────────────────────

-- انتشار اعلامیه (ادمین). ردیف را درج و audit می‌کند؛ تحویل‌ها را route صف می‌کند.
CREATE OR REPLACE FUNCTION public.publish_announcement(
  p_title   text,
  p_body_md text,
  p_target  text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند اعلامیه منتشر کند.';
  END IF;
  IF coalesce(btrim(p_title),'') = '' OR coalesce(btrim(p_body_md),'') = '' THEN
    RAISE EXCEPTION 'عنوان و متن اعلامیه الزامی است.';
  END IF;
  IF NOT (p_target = 'all' OR p_target LIKE 'risk:%' OR p_target LIKE 'user:%') THEN
    RAISE EXCEPTION 'هدفِ اعلامیه نامعتبر است.';
  END IF;

  INSERT INTO public.announcements (title, body_md, target, created_by, published_at)
  VALUES (p_title, p_body_md, p_target, auth.uid(), now())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'announcement.publish', 'announcement', NULL,
          jsonb_build_object('id', v_id, 'target', p_target, 'title', p_title));

  RETURN v_id;
END $$;

-- انقضای دستیِ پروفایل ریسکِ یک کاربر (ادمین). فقط ردیف انقضا ثبت می‌شود.
CREATE OR REPLACE FUNCTION public.force_expire_risk(
  p_user   uuid,
  p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند پروفایل را منقضی کند.';
  END IF;

  INSERT INTO public.risk_revalidations (user_id, expired_at, reason, created_by)
  VALUES (p_user, now(), p_reason, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'risk.force_expire', 'risk_profile', p_user,
          jsonb_build_object('reason', p_reason));

  RETURN v_id;
END $$;

-- علامت‌گذاریِ «دیده‌شد» برای اعلامیهٔ درون‌برنامه‌ایِ کاربرِ جاری.
CREATE OR REPLACE FUNCTION public.mark_announcement_seen(p_announcement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_target text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT target INTO v_target FROM public.announcements
   WHERE id = p_announcement_id AND published_at IS NOT NULL;
  IF v_target IS NULL OR NOT public.can_see_announcement(v_target) THEN
    RETURN;                              -- کاربر مخاطبِ این اعلامیه نیست
  END IF;

  INSERT INTO public.announcement_deliveries (announcement_id, user_id, channel, status, sent_at)
  VALUES (p_announcement_id, auth.uid(), 'in_app', 'seen', now())
  ON CONFLICT (announcement_id, user_id, channel)
  DO UPDATE SET status = 'seen', sent_at = now();
END $$;

-- ── 6. Grants ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.can_see_announcement(text)         FROM public;
REVOKE ALL ON FUNCTION public.publish_announcement(text,text,text) FROM public;
REVOKE ALL ON FUNCTION public.force_expire_risk(uuid,text)       FROM public;
REVOKE ALL ON FUNCTION public.mark_announcement_seen(uuid)       FROM public;

GRANT EXECUTE ON FUNCTION public.can_see_announcement(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_announcement(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_expire_risk(uuid,text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_announcement_seen(uuid)        TO authenticated;
