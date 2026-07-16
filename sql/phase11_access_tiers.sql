-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 11: طبقه‌بندی دسترسی (Access Tiers) — سند مانیتایز «قطب‌نمای بازار»
-- ═══════════════════════════════════════════════════════════════════════════════
-- مدل چهارلایه:
--   visitor    → بدون لاگین: صفحات عمومی، بانک داده، رصد بازار
--   registered → لاگین‌کرده: داشبورد، واچ‌لیست شخصی، هشدار قیمتی
--   consulting → مشتری مشاوره: دسترسی کامل ۳ ماهه (starts_at + interval '3 months')
--   webinar    → شرکت‌کنندهٔ وبینار فصلی: دسترسی کامل تا وبینار بعدی (~۳ ماه)
--
-- طراحی: به‌جای تغییر profiles (که CHECK دارد)، جدول جداگانهٔ entitlements
-- append-friendly: هر اعطای دسترسی یک ردیف؛ آخرین ردیف معتبرِ منقضی‌نشده برنده است.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.entitlements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- نوع دسترسی اعطاشده
  kind        text NOT NULL CHECK (kind IN ('consulting', 'webinar', 'manual')),
  -- منبع اعطا (برای ممیزی): payment id، webinar id، یا 'admin_grant'
  source      text,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  -- ابطال دستی (بدون DELETE — جدول ممیزی‌پذیر می‌ماند)
  revoked_at  timestamptz,
  granted_by  uuid REFERENCES public.profiles(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user
  ON public.entitlements(user_id, expires_at DESC);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- کاربر فقط دسترسی‌های خودش را می‌بیند
DROP POLICY IF EXISTS "entitlements_select_own" ON public.entitlements;
CREATE POLICY "entitlements_select_own" ON public.entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- ادمین همه را می‌بیند
DROP POLICY IF EXISTS "entitlements_select_admin" ON public.entitlements;
CREATE POLICY "entitlements_select_admin" ON public.entitlements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- فقط ادمین درج می‌کند (service_role هم که RLS را دور می‌زند)
DROP POLICY IF EXISTS "entitlements_insert_admin" ON public.entitlements;
CREATE POLICY "entitlements_insert_admin" ON public.entitlements
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- فقط ادمین ابطال می‌کند (تنها revoked_at/note قابل تغییر است — بقیه با تریگر قفل)
DROP POLICY IF EXISTS "entitlements_update_admin" ON public.entitlements;
CREATE POLICY "entitlements_update_admin" ON public.entitlements
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- تریگر: فقط revoked_at و note قابل به‌روزرسانی‌اند؛ DELETE ممنوع
CREATE OR REPLACE FUNCTION public.fn_entitlements_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entitlements is append-only; use revoked_at';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.kind <> OLD.kind
     OR NEW.starts_at <> OLD.starts_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'only revoked_at/note can be updated';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_entitlements_guard ON public.entitlements;
CREATE TRIGGER trg_entitlements_guard
  BEFORE UPDATE OR DELETE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.fn_entitlements_guard();

-- ── تابع کمکی: بالاترین سطح دسترسی فعال کاربر ────────────────────────────────
-- خروجی: 'full' | 'registered'  (visitor یعنی auth.uid() تهی — به این تابع نمی‌رسد)
CREATE OR REPLACE FUNCTION public.fn_user_access(p_user uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'admin')
      THEN 'full'
    WHEN EXISTS (
      SELECT 1 FROM public.entitlements
      WHERE user_id = p_user AND revoked_at IS NULL
        AND starts_at <= now() AND expires_at > now()
    ) THEN 'full'
    ELSE 'registered'
  END;
$$;
