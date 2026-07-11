-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 8: سیستم مدیریت وبینار / رویداد
-- ═══════════════════════════════════════════════════════════════════════════════
-- پیش‌نیاز: فازهای ۱–۶ (profiles, payments, audit_log, telegram_links)
--
-- مدل کسب‌وکار:
--   ادمین هر ۳ ماه یک وبینار تعریف می‌کند → کاربران ثبت‌نام + پرداخت →
--   بعد از وبینار، ادمین دکمه «ارسال دعوت کانال» را می‌زند →
--   لینک دعوت تک‌نفره به شرکت‌کنندگان ارسال می‌شود.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── جدول وبینارها ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webinars (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  -- زمان‌بندی
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz,
  -- تنظیمات ثبت‌نام
  registration_open  boolean NOT NULL DEFAULT false,
  max_capacity       integer,                         -- NULL = بدون محدودیت
  price_toman        integer NOT NULL DEFAULT 0,      -- 0 = رایگان
  -- پلتفرم برگزاری
  platform      text NOT NULL DEFAULT 'link',         -- 'skyroom' | 'zoom' | 'google_meet' | 'link'
  platform_url  text,                                 -- لینک جلسه (ست می‌شود نزدیک زمان وبینار)
  -- وضعیت
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'live', 'ended', 'cancelled')),
  -- بعد از وبینار: آیا دعوت‌های کانال ارسال شده؟
  invites_sent  boolean NOT NULL DEFAULT false,
  -- متادیتا
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── جدول ثبت‌نام‌ها ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webinar_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id    uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- وضعیت پرداخت
  payment_status text NOT NULL DEFAULT 'pending'
                 CHECK (payment_status IN ('pending', 'paid', 'free', 'refunded')),
  payment_id    uuid REFERENCES public.payments(id),  -- NULL اگر رایگان
  -- حضور
  attended      boolean NOT NULL DEFAULT false,
  -- دعوت کانال
  invite_sent   boolean NOT NULL DEFAULT false,
  invite_link   text,
  -- متادیتا
  registered_at timestamptz NOT NULL DEFAULT now(),
  -- هر کاربر فقط یک بار در هر وبینار
  UNIQUE (webinar_id, user_id)
);

-- ── ایندکس‌ها ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_webinars_status ON public.webinars(status);
CREATE INDEX IF NOT EXISTS idx_webinars_starts_at ON public.webinars(starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_wr_webinar_id ON public.webinar_registrations(webinar_id);
CREATE INDEX IF NOT EXISTS idx_wr_user_id ON public.webinar_registrations(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

-- وبینارهای published/live/ended برای همه قابل مشاهده
CREATE POLICY webinars_public_read ON public.webinars
  FOR SELECT USING (status IN ('published', 'live', 'ended'));

-- ادمین همه چیز را می‌بیند و ویرایش می‌کند
CREATE POLICY webinars_admin_all ON public.webinars
  FOR ALL USING (public.is_admin());

-- کاربر فقط ثبت‌نام‌های خودش را می‌بیند
CREATE POLICY wr_user_read ON public.webinar_registrations
  FOR SELECT USING (auth.uid() = user_id);

-- کاربر می‌تواند ثبت‌نام کند (insert)
CREATE POLICY wr_user_insert ON public.webinar_registrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ادمین همه ثبت‌نام‌ها را مدیریت می‌کند
CREATE POLICY wr_admin_all ON public.webinar_registrations
  FOR ALL USING (public.is_admin());

-- ── تابع updated_at ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER webinars_updated_at
  BEFORE UPDATE ON public.webinars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── تابع ثبت‌نام وبینار (RPC) ────────────────────────────────────────────────
-- بررسی ظرفیت + وضعیت ثبت‌نام + idempotent
CREATE OR REPLACE FUNCTION public.register_for_webinar(p_webinar_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_webinar     record;
  v_existing    uuid;
  v_count       integer;
  v_reg_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.';
  END IF;

  SELECT * INTO v_webinar FROM public.webinars WHERE id = p_webinar_id;
  IF v_webinar IS NULL THEN
    RAISE EXCEPTION 'وبینار یافت نشد.';
  END IF;
  IF NOT v_webinar.registration_open THEN
    RAISE EXCEPTION 'ثبت‌نام این وبینار بسته است.';
  END IF;
  IF v_webinar.status NOT IN ('published', 'live') THEN
    RAISE EXCEPTION 'وبینار در وضعیت ثبت‌نام نیست.';
  END IF;

  -- بررسی ثبت‌نام تکراری (idempotent)
  SELECT id INTO v_existing FROM public.webinar_registrations
    WHERE webinar_id = p_webinar_id AND user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('registration_id', v_existing, 'already_registered', true);
  END IF;

  -- بررسی ظرفیت
  IF v_webinar.max_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.webinar_registrations
      WHERE webinar_id = p_webinar_id AND payment_status IN ('paid', 'free');
    IF v_count >= v_webinar.max_capacity THEN
      RAISE EXCEPTION 'ظرفیت وبینار تکمیل شده است.';
    END IF;
  END IF;

  -- ثبت‌نام
  INSERT INTO public.webinar_registrations (webinar_id, user_id, payment_status)
  VALUES (
    p_webinar_id,
    v_user_id,
    CASE WHEN v_webinar.price_toman = 0 THEN 'free' ELSE 'pending' END
  )
  RETURNING id INTO v_reg_id;

  -- audit
  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (v_user_id, 'webinar.register', 'webinar', v_user_id,
          jsonb_build_object('webinar_id', p_webinar_id, 'registration_id', v_reg_id));

  RETURN jsonb_build_object(
    'registration_id', v_reg_id,
    'already_registered', false,
    'needs_payment', v_webinar.price_toman > 0
  );
END $$;

-- ── audit log entry ──────────────────────────────────────────────────────────
COMMENT ON TABLE public.webinars IS 'وبینارها / رویدادهای آنلاین — مدیریت توسط ادمین';
COMMENT ON TABLE public.webinar_registrations IS 'ثبت‌نام کاربران در وبینارها';
