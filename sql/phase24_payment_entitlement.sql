-- ═══════════════════════════════════════════════════════════════════════════════
-- فاز ۲۴ — بستنِ مسیرِ «پرداخت → دسترسی» با یک ماشینِ حالتِ واحد
-- ADDITIVE · idempotent · append-only. به داده یا ستونِ موجود دست نمی‌زند.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ── مسئله‌ای که این فایل حل می‌کند ──────────────────────────────────────────
--
-- تا پیش از این، دو مسیرِ پرداخت وجود داشت و هر کدام ماشینِ حالتِ خودش را داشت:
--
--   • `/api/payment/callback`          → RPCهای create_payment/verify_payment/fail_payment
--   • `/api/webinars/payment/callback` → UPDATE مستقیم روی public.payments
--
-- مسیرِ دوم علاوه بر دور زدنِ ممیزی، وضعیتِ `'verified'` می‌نوشت که اصلاً در
-- CHECK جدول نیست، و ستون‌های `amount_toman`/`description` را هدف می‌گرفت که
-- وجود ندارند.
--
-- مسئلهٔ دوم: هیچ‌کدام از دو مسیر `entitlements` را نمی‌نوشت، در حالی که
-- `lib/access.ts` و `middleware.ts` سطحِ دسترسی را دقیقاً از همان جدول
-- می‌خوانند. نتیجه: مشتری پول می‌داد و `registered` می‌ماند.
--
-- ── بازنگریِ Command Center (بندهای P1) ─────────────────────────────────────
--
-- نسخهٔ اولِ همین فایل یک نقصِ جدی داشت: **نوعِ محصول به ردیفِ پرداخت بسته
-- نبود.** هر callback خودش `kind` را تعیین می‌کرد و `source` را با پیشوندِ
-- خودش می‌ساخت (`payment:` در برابر `webinar_payment:`). پس یک authorityِ
-- پرداخت‌شده می‌توانست از **هر دو** callback عبور کند و **دو** دسترسی بسازد؛
-- قیدِ یکتای `(user_id, source)` جلویش را نمی‌گرفت چون دو رشتهٔ متفاوت بودند.
--
-- چهار تغییرِ ساختاری این را می‌بندد:
--
--   ۱. `payments.purpose` — نوعِ محصول در **لحظهٔ ساختِ پرداخت** ثبت و
--      تغییرناپذیر می‌شود. finalizer نوعِ ارسالیِ callback را با همین ستون
--      می‌سنجد و در صورتِ عدم تطابق می‌شکند.
--   ۲. `entitlements.payment_id` + قیدِ **یکتا** — یک پرداخت حداکثر یک دسترسی.
--      این قید به قالبِ رشته وابسته نیست، پس با تغییرِ نام‌گذاری نمی‌شکند.
--   ۳. پرداختِ وبینار **بدونِ ثبت‌نامِ متصل** رد می‌شود — در همین تابع.
--   ۴. مدتِ دسترسی از جدولِ `entitlement_durations` خوانده می‌شود؛ نه هاردکدِ
--      سراسری، نه ورودیِ قابلِ دست‌کاریِ کلاینت.
--
-- پیش‌نیاز: phase5 (payments + RPCها) · phase8 (webinar_registrations) ·
--           phase11 (entitlements) · audit_log.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── ۱. نوعِ محصول روی ردیفِ پرداخت ──────────────────────────────────────────
--
-- nullable می‌ماند چون ردیف‌های قدیمی مقدار ندارند (روی Production صفر ردیف
-- پرداخت وجود دارد، ولی فرض نمی‌کنیم). finalizer ردیفِ بدونِ purpose را
-- **رد می‌کند**، پس nullable بودن یک درِ باز نیست.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS purpose text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_purpose_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_purpose_check
      CHECK (purpose IS NULL OR purpose IN ('consulting', 'webinar'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_purpose
  ON public.payments(purpose, status);

-- گاردِ append-only بازنویسی می‌شود تا `purpose` هم تغییرناپذیر شود.
-- CREATE OR REPLACE است، پس افزایشی می‌ماند و منطقِ قبلی حفظ می‌شود.
CREATE OR REPLACE FUNCTION public.payments_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'حذف پرداخت مجاز نیست (این جدول append-only است).';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'پرداختِ نهایی‌شده قابل تغییر نیست.';
  END IF;
  IF NEW.status NOT IN ('paid','failed') THEN
    RAISE EXCEPTION 'گذارِ وضعیتِ پرداخت نامعتبر است.';
  END IF;
  IF NEW.user_id  <> OLD.user_id
     OR NEW.amount <> OLD.amount
     OR NEW.authority IS DISTINCT FROM OLD.authority
     OR NEW.purpose IS DISTINCT FROM OLD.purpose      -- ← افزودهٔ فاز ۲۴
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'فیلدهای پایهٔ پرداخت تغییرناپذیرند.';
  END IF;
  RETURN NEW;
END $$;

-- ── ۲. یک پرداخت ⇒ حداکثر یک دسترسی ────────────────────────────────────────
--
-- این قیدِ اصلی است. قالبِ `source` صرفاً توضیحی می‌ماند؛ یکتاییِ واقعی روی
-- کلیدِ خارجی است، پس تغییرِ نام‌گذاری نمی‌تواند آن را دور بزند.
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_payment
  ON public.entitlements(payment_id)
  WHERE payment_id IS NOT NULL;

-- لایهٔ دوم (نه لایهٔ اول): جلوگیری از درجِ تکراری با همان منبع.
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_user_source
  ON public.entitlements(user_id, source)
  WHERE source IS NOT NULL;

-- `payment_id` هم باید تغییرناپذیر باشد.
CREATE OR REPLACE FUNCTION public.fn_entitlements_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entitlements is append-only; use revoked_at';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.kind <> OLD.kind
     OR NEW.starts_at <> OLD.starts_at OR NEW.expires_at <> OLD.expires_at
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
    RAISE EXCEPTION 'only revoked_at/note can be updated';
  END IF;
  RETURN NEW;
END $$;

-- ── ۳. یک ثبت‌نامِ وبینار ⇒ حداکثر یک پرداخت ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_webinar_registrations_payment
  ON public.webinar_registrations(payment_id)
  WHERE payment_id IS NOT NULL;

-- ── ۴. مدتِ دسترسی — سمتِ سرور و قابلِ تنظیم، نه هاردکدِ سراسری ─────────────
--
-- «سه ماه برای همه» تصمیمِ تأییدشدهٔ محصول نیست. مدت اینجا به ازای هر محصول
-- نگه داشته می‌شود تا آرش بتواند بدونِ استقرارِ کد عوضش کند، و کلاینت هرگز
-- نتواند آن را تعیین کند.
CREATE TABLE IF NOT EXISTS public.entitlement_durations (
  purpose    text PRIMARY KEY CHECK (purpose IN ('consulting', 'webinar')),
  months     integer NOT NULL CHECK (months > 0 AND months <= 120),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- مقادیرِ اولیه = رفتارِ امروز. این **پیش‌فرضِ عملیاتی** است، نه تصمیمِ محصول؛
-- تصمیمِ آرش در DECISION-LOG ثبت می‌شود و مقدار اینجا به‌روز می‌شود.
INSERT INTO public.entitlement_durations (purpose, months) VALUES
  ('consulting', 3),
  ('webinar', 3)
ON CONFLICT (purpose) DO NOTHING;

ALTER TABLE public.entitlement_durations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "durations_admin_read" ON public.entitlement_durations;
CREATE POLICY "durations_admin_read" ON public.entitlement_durations
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "durations_admin_write" ON public.entitlement_durations;
CREATE POLICY "durations_admin_write" ON public.entitlement_durations
  FOR UPDATE USING (public.is_admin());

-- ── ۵. ساختِ پرداخت با نوعِ محصولِ الزامی ───────────────────────────────────
--
-- نسخهٔ دوآرگومانیِ phase5 هنوز وجود دارد ولی در بخشِ Grants از
-- `authenticated` گرفته می‌شود، تا هیچ پرداختِ بی‌purpose ساخته نشود.
CREATE OR REPLACE FUNCTION public.create_payment(
  p_amount    integer,
  p_authority text,
  p_purpose   text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ نامعتبر.';
  END IF;
  IF p_purpose IS NULL OR p_purpose NOT IN ('consulting', 'webinar') THEN
    RAISE EXCEPTION 'نوعِ محصولِ پرداخت نامعتبر است: %', p_purpose;
  END IF;

  INSERT INTO public.payments (user_id, amount, authority, status, purpose)
  VALUES (auth.uid(), p_amount, p_authority, 'pending', p_purpose)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'payment.request', 'payment', auth.uid(),
          jsonb_build_object('amount', p_amount, 'authority', p_authority,
                             'purpose', p_purpose));

  RETURN v_id;
END $$;

-- ── ۶. پرداختِ وبینار: ساخت و اتصال در **یک** تراکنش ───────────────────────
--
-- پیش از این، مسیرِ API ابتدا پرداخت را می‌ساخت و بعد در یک دستورِ جدا
-- `payment_id` را روی ثبت‌نام می‌نوشت **بدونِ بررسیِ نتیجه**. اگر آن نوشتن
-- شکست می‌خورد، کاربر به درگاه می‌رفت و پرداختش هرگز به ثبت‌نامی وصل نمی‌شد.
-- حالا هر دو در یک تابع و یک تراکنش انجام می‌شوند: یا هر دو، یا هیچ‌کدام.
CREATE OR REPLACE FUNCTION public.create_webinar_payment(
  p_registration_id uuid,
  p_amount          integer,
  p_authority       text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_reg     record;
  v_payment uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.';
  END IF;

  SELECT id, user_id, payment_status, payment_id
    INTO v_reg
    FROM public.webinar_registrations
   WHERE id = p_registration_id
     FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'ثبت‌نام یافت نشد.';
  END IF;
  IF v_reg.user_id <> v_user THEN
    RAISE EXCEPTION 'این ثبت‌نام متعلقِ شما نیست.';
  END IF;
  IF v_reg.payment_status = 'paid' THEN
    RAISE EXCEPTION 'این ثبت‌نام قبلاً پرداخت شده.';
  END IF;

  v_payment := public.create_payment(p_amount, p_authority, 'webinar');

  UPDATE public.webinar_registrations
     SET payment_id = v_payment
   WHERE id = p_registration_id;

  RETURN v_payment;
END $$;

-- ── ۷. تابعِ واحدِ نهایی‌سازی ────────────────────────────────────────────────
--
-- خروجی jsonb:
--   { user_id, payment_id, entitlement_id, expires_at,
--     already_finalized, registration_id, purpose }
CREATE OR REPLACE FUNCTION public.finalize_paid_access(
  p_authority       text,
  p_ref_id          text,
  p_amount          integer,
  p_kind            text,
  p_invite_link     text DEFAULT NULL,
  p_registration_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payment_id  uuid;
  v_user        uuid;
  v_amount      integer;
  v_status      text;
  v_purpose     text;
  v_already     boolean := false;
  v_months      integer;
  v_expires     timestamptz;
  v_source      text;
  v_ent_id      uuid;
  v_ent_expires timestamptz;
  v_reg_user    uuid;
  v_reg_payment uuid;
  v_reg_id      uuid;
BEGIN
  -- ── اعتبارسنجیِ ورودی ────────────────────────────────────────────────────
  IF p_authority IS NULL OR p_authority = '' THEN
    RAISE EXCEPTION 'authority تهی است.';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('consulting', 'webinar') THEN
    RAISE EXCEPTION 'نوعِ دسترسی نامعتبر است: %', p_kind;
  END IF;

  -- ── قفلِ ردیفِ پرداخت ─────────────────────────────────────────────────────
  SELECT id, user_id, amount, status, purpose
    INTO v_payment_id, v_user, v_amount, v_status, v_purpose
    FROM public.payments
   WHERE authority = p_authority
     FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'پرداختی با این authority یافت نشد.';
  END IF;

  -- ── نوعِ محصول: مرجع، ردیفِ پرداخت است — نه ادعای callback ────────────────
  -- بدونِ این بند، یک authorityِ پرداخت‌شده می‌توانست از هر دو callback رد شود
  -- و دو دسترسیِ متفاوت بسازد.
  IF v_purpose IS NULL THEN
    RAISE EXCEPTION 'این پرداخت نوعِ محصول ندارد و قابلِ نهایی‌سازی نیست.';
  END IF;
  IF v_purpose <> p_kind THEN
    RAISE EXCEPTION 'نوعِ محصولِ callback (%) با نوعِ ثبت‌شدهٔ پرداخت (%) نمی‌خواند.',
      p_kind, v_purpose;
  END IF;

  IF v_status = 'failed' THEN
    RAISE EXCEPTION 'این پرداخت پیش‌تر ناموفق ثبت شده و قابلِ نهایی‌سازی نیست.';
  END IF;
  IF v_amount <> p_amount THEN
    RAISE EXCEPTION 'عدم تطبیق مبلغ پرداخت.';
  END IF;

  v_already := (v_status = 'paid');

  -- ── ثبت‌نامِ وبینار: **الزامی** برای محصولِ وبینار ─────────────────────────
  IF v_purpose = 'webinar' THEN
    SELECT id INTO v_reg_id
      FROM public.webinar_registrations
     WHERE payment_id = v_payment_id
       FOR UPDATE;

    IF v_reg_id IS NULL THEN
      RAISE EXCEPTION 'پرداختِ وبینار بدونِ ثبت‌نامِ متصل قابلِ نهایی‌سازی نیست.';
    END IF;
    IF p_registration_id IS NOT NULL AND p_registration_id <> v_reg_id THEN
      RAISE EXCEPTION 'ثبت‌نامِ اعلام‌شده با ثبت‌نامِ متصل به این پرداخت یکی نیست.';
    END IF;

    SELECT user_id, payment_id INTO v_reg_user, v_reg_payment
      FROM public.webinar_registrations WHERE id = v_reg_id;
    IF v_reg_user <> v_user THEN
      RAISE EXCEPTION 'ثبت‌نام به کاربرِ دیگری تعلق دارد.';
    END IF;
    IF v_reg_payment IS DISTINCT FROM v_payment_id THEN
      RAISE EXCEPTION 'ثبت‌نام به این پرداخت متصل نیست.';
    END IF;
  ELSIF p_registration_id IS NOT NULL THEN
    RAISE EXCEPTION 'پرداختِ غیروبیناری نباید ثبت‌نام داشته باشد.';
  END IF;

  -- ── نهایی‌سازیِ پرداخت — تنها از راهِ primitiveِ حاکمیتی ───────────────────
  IF NOT v_already THEN
    PERFORM public.verify_payment(p_authority, p_ref_id, p_amount, p_invite_link);
  END IF;

  IF v_reg_id IS NOT NULL THEN
    UPDATE public.webinar_registrations
       SET payment_status = 'paid'
     WHERE id = v_reg_id AND payment_status <> 'paid';
  END IF;

  -- ── مدتِ دسترسی از جدولِ پیکربندی، نه از ورودی ────────────────────────────
  SELECT months INTO v_months
    FROM public.entitlement_durations WHERE purpose = v_purpose;
  IF v_months IS NULL THEN
    RAISE EXCEPTION 'مدتِ دسترسی برای محصولِ % تعریف نشده است.', v_purpose;
  END IF;
  v_expires := now() + make_interval(months => v_months);
  v_source  := v_purpose || ':' || p_authority;

  -- ── اعطای دسترسی ─────────────────────────────────────────────────────────
  INSERT INTO public.entitlements
    (user_id, kind, source, expires_at, note, payment_id)
  VALUES (v_user, v_purpose, v_source, v_expires,
          CASE WHEN v_reg_id IS NULL THEN NULL
               ELSE 'webinar_registration:' || v_reg_id::text END,
          v_payment_id)
  ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING;

  SELECT id, expires_at INTO v_ent_id, v_ent_expires
    FROM public.entitlements
   WHERE payment_id = v_payment_id;

  IF v_ent_id IS NULL THEN
    RAISE EXCEPTION 'اعطای دسترسی انجام نشد (پرداخت: %).', v_payment_id;
  END IF;

  IF NOT v_already THEN
    INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
    VALUES (v_user, 'entitlement.granted', 'entitlement', v_user,
            jsonb_build_object(
              'kind', v_purpose, 'source', v_source,
              'payment_id', v_payment_id, 'entitlement_id', v_ent_id,
              'expires_at', v_ent_expires, 'registration_id', v_reg_id,
              'months', v_months
            ));
  END IF;

  RETURN jsonb_build_object(
    'user_id',           v_user,
    'payment_id',        v_payment_id,
    'entitlement_id',    v_ent_id,
    'expires_at',        v_ent_expires,
    'already_finalized', v_already,
    'registration_id',   v_reg_id,
    'purpose',           v_purpose
  );
END $$;

-- ── ۸. Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.finalize_paid_access(text, text, integer, text, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.finalize_paid_access(text, text, integer, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_access(text, text, integer, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_access(text, text, integer, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_payment(integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_payment(integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_webinar_payment(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_webinar_payment(uuid, integer, text) TO authenticated;

-- نسخهٔ دوآرگومانیِ phase5 دیگر نباید قابلِ فراخوانی باشد: پرداختِ بدونِ
-- purpose در finalizer رد می‌شود، پس ساختنش فقط ردیفِ مرده تولید می‌کند.
-- شرطی است تا این فایل روی محیطی که phase5 ندارد هم اجرا شود (idempotency).
DO $$
BEGIN
  IF to_regprocedure('public.create_payment(integer, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.create_payment(integer, text) FROM public, anon, authenticated;
  END IF;
END $$;

REVOKE ALL ON TABLE public.entitlement_durations FROM public, anon;
GRANT SELECT ON TABLE public.entitlement_durations TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.entitlement_durations TO service_role;

-- ── ۹. تأییدِ خودکارِ پس از اجرا ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='payments' AND column_name='purpose') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: ستونِ payments.purpose ساخته نشد.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='uq_entitlements_payment') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: قیدِ یکتای entitlements.payment_id ساخته نشد.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='uq_webinar_registrations_payment') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: قیدِ یکتای webinar_registrations.payment_id ساخته نشد.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='finalize_paid_access') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: تابعِ finalize_paid_access ساخته نشد.';
  END IF;
  IF (SELECT count(*) FROM public.entitlement_durations) < 2 THEN
    RAISE EXCEPTION 'تأیید شکست خورد: مدتِ دسترسیِ محصولات مقداردهی نشد.';
  END IF;

  IF has_function_privilege('anon',
       'public.finalize_paid_access(text, text, integer, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: anon هنوز اجازهٔ اجرای نهایی‌سازی را دارد.';
  END IF;
  IF has_function_privilege('authenticated',
       'public.finalize_paid_access(text, text, integer, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: authenticated هنوز اجازهٔ اجرای نهایی‌سازی را دارد.';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.finalize_paid_access(text, text, integer, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: service_role اجازهٔ اجرای نهایی‌سازی را ندارد.';
  END IF;
  IF to_regprocedure('public.create_payment(integer, text)') IS NOT NULL
     AND has_function_privilege('authenticated',
           'public.create_payment(integer, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: نسخهٔ بدونِ purposeِ create_payment هنوز باز است.';
  END IF;
END $$;

COMMENT ON FUNCTION public.finalize_paid_access(text, text, integer, text, text, uuid) IS
  'نهایی‌سازیِ اتمیکِ پرداخت → ثبت‌نام → دسترسی. نوعِ محصول از payments.purpose خوانده می‌شود، نه از فراخواننده.';
COMMENT ON COLUMN public.payments.purpose IS
  'نوعِ محصول، در لحظهٔ ساختِ پرداخت ثبت می‌شود و تغییرناپذیر است.';
