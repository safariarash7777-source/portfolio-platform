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
-- وجود ندارند. یعنی عملاً کار نمی‌کرد — ولی همان‌قدر مهم است که **حتی اگر کار
-- می‌کرد هم غلط بود**: دو ماشینِ حالت برای یک جدولِ append-only یعنی دو جا برای
-- فراموش‌کردنِ یک گارد.
--
-- مسئلهٔ دوم: هیچ‌کدام از دو مسیر `entitlements` را نمی‌نوشت، در حالی که
-- `lib/access.ts` و `middleware.ts` سطحِ دسترسی را دقیقاً از همان جدول
-- می‌خوانند. نتیجه: مشتری پول می‌داد و `registered` می‌ماند.
--
-- ── تصمیمِ طراحی ────────────────────────────────────────────────────────────
--
-- `verify_payment` تنها نویسندهٔ `payments.status` می‌ماند — این فایل جایگزینش
-- نمی‌کند، **دورش می‌پیچد**. تابعِ `finalize_paid_access` هر سه اثرِ یک پرداختِ
-- موفق را در **یک تراکنش** انجام می‌دهد:
--
--   ۱. نهایی‌سازیِ پرداخت      (از راهِ verify_payment)
--   ۲. علامت‌زدنِ ثبت‌نامِ وبینار (اگر پرداختِ وبینار باشد)
--   ۳. اعطای دسترسی           (entitlements)
--
-- چرا یک تراکنش: اگر مرحلهٔ ۳ شکست بخورد و مرحلهٔ ۱ کامیت شده باشد، مشتری پول
-- داده و دسترسی ندارد و هیچ‌کس خبردار نمی‌شود. با یک تراکنش، شکستِ هر مرحله
-- کلِ کار را برمی‌گرداند و فراخواننده خطا می‌بیند — قابلِ تشخیص، قابلِ تکرار.
--
-- مدتِ دسترسی عمداً اینجا محاسبه **نمی‌شود**؛ `p_expires_at` را فراخواننده از
-- `ENTITLEMENT_MONTHS` در `lib/entitlements.ts` می‌دهد. اگر مدت در هر دو جا
-- تعریف می‌شد، روزی یکی عوض می‌شد و دیگری نه.
--
-- پیش‌نیاز: phase5 (payments + RPCها) · phase8 (webinar_registrations) ·
--           phase11 (entitlements) · audit_log.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── ۱. idempotencyِ اعطای دسترسی در سطحِ دیتابیس ────────────────────────────
--
-- بدونِ این ایندکس، «اول SELECT بعد INSERT» در کدِ برنامه یک TOCTOU است: دو
-- callbackِ هم‌زمان هر دو خالی می‌بینند و هر دو درج می‌کنند. قید یکتایی تنها
-- جایی است که این مسابقه واقعاً بسته می‌شود.
--
-- کلید `(user_id, source)` است چون `source` شاملِ authorityِ زرین‌پال است و
-- authority در `payments` یکتاست — پس هر تراکنش حداکثر یک دسترسی می‌سازد.
-- ردیف‌های دستیِ ادمین که `source` تهی دارند مشمولِ قید نیستند (NULL در ایندکسِ
-- یکتا تکرارپذیر است) و همان رفتارِ قبلی را نگه می‌دارند.
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_user_source
  ON public.entitlements(user_id, source)
  WHERE source IS NOT NULL;

-- ── ۲. تابعِ واحدِ نهایی‌سازی ────────────────────────────────────────────────
--
-- خروجی jsonb:
--   { user_id, payment_id, entitlement_id, expires_at,
--     already_finalized: bool, registration_id: uuid|null }
--
-- خطاها با SQLSTATE اختصاصی بلند می‌شوند تا فراخواننده بتواند تفکیک کند:
--   P0001 پیش‌فرضِ RAISE (شرایطِ کسب‌وکار)  ·  متن فارسی برای لاگِ اپراتور
CREATE OR REPLACE FUNCTION public.finalize_paid_access(
  p_authority       text,
  p_ref_id          text,
  p_amount          integer,
  p_kind            text,
  p_source          text,
  p_expires_at      timestamptz,
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
  v_already     boolean := false;
  v_ent_id      uuid;
  v_ent_expires timestamptz;
  v_reg_user    uuid;
  v_reg_payment uuid;
BEGIN
  -- ── اعتبارسنجیِ ورودی ────────────────────────────────────────────────────
  IF p_authority IS NULL OR p_authority = '' THEN
    RAISE EXCEPTION 'authority تهی است.';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('consulting', 'webinar', 'manual') THEN
    RAISE EXCEPTION 'نوعِ دسترسی نامعتبر است: %', p_kind;
  END IF;
  IF p_source IS NULL OR p_source = '' THEN
    RAISE EXCEPTION 'منبعِ دسترسی تهی است (idempotency بدونِ آن ممکن نیست).';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'تاریخِ انقضای دسترسی باید در آینده باشد.';
  END IF;

  -- ── قفلِ ردیفِ پرداخت ─────────────────────────────────────────────────────
  -- این قفل تمامِ تابع را سریالی می‌کند: دو callbackِ هم‌زمان با یک authority
  -- پشتِ هم می‌ایستند و دومی وضعیتِ نهایی‌شده را می‌بیند.
  SELECT id, user_id, amount, status
    INTO v_payment_id, v_user, v_amount, v_status
    FROM public.payments
   WHERE authority = p_authority
     FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'پرداختی با این authority یافت نشد.';
  END IF;
  IF v_status = 'failed' THEN
    RAISE EXCEPTION 'این پرداخت پیش‌تر ناموفق ثبت شده و قابلِ نهایی‌سازی نیست.';
  END IF;
  -- مبلغ همیشه با ردیفِ خودمان سنجیده می‌شود، نه با پارامترِ برگشتیِ درگاه.
  IF v_amount <> p_amount THEN
    RAISE EXCEPTION 'عدم تطبیق مبلغ پرداخت.';
  END IF;

  v_already := (v_status = 'paid');

  -- ── ۱) نهایی‌سازیِ پرداخت — تنها از راهِ primitiveِ حاکمیتی ────────────────
  IF NOT v_already THEN
    PERFORM public.verify_payment(p_authority, p_ref_id, p_amount, p_invite_link);
  END IF;

  -- ── ۲) ثبت‌نامِ وبینار (اختیاری) ──────────────────────────────────────────
  -- بایندِ سه‌طرفه: ثبت‌نام باید هم متعلقِ همان کاربر باشد و هم به همین ردیفِ
  -- پرداخت وصل باشد. بدونِ بندِ دوم، یک replay با registration_idِ دیگری
  -- می‌توانست ثبت‌نامِ بی‌ربط را «پرداخت‌شده» کند.
  IF p_registration_id IS NOT NULL THEN
    SELECT user_id, payment_id
      INTO v_reg_user, v_reg_payment
      FROM public.webinar_registrations
     WHERE id = p_registration_id
       FOR UPDATE;

    IF v_reg_user IS NULL THEN
      RAISE EXCEPTION 'ثبت‌نامِ وبینار یافت نشد.';
    END IF;
    IF v_reg_user <> v_user THEN
      RAISE EXCEPTION 'ثبت‌نام به کاربرِ دیگری تعلق دارد.';
    END IF;
    IF v_reg_payment IS DISTINCT FROM v_payment_id THEN
      RAISE EXCEPTION 'ثبت‌نام به این پرداخت متصل نیست.';
    END IF;

    UPDATE public.webinar_registrations
       SET payment_status = 'paid'
     WHERE id = p_registration_id
       AND payment_status <> 'paid';
  END IF;

  -- ── ۳) اعطای دسترسی ──────────────────────────────────────────────────────
  -- ON CONFLICT DO NOTHING روی قیدِ یکتا؛ سپس خواندنِ ردیفِ نهایی. این ترتیب
  -- هم بارِ اول و هم replay را به یک نتیجه می‌رساند.
  INSERT INTO public.entitlements (user_id, kind, source, expires_at, note)
  VALUES (v_user, p_kind, p_source, p_expires_at,
          CASE WHEN p_registration_id IS NULL THEN NULL
               ELSE 'webinar_registration:' || p_registration_id::text END)
  ON CONFLICT (user_id, source) WHERE source IS NOT NULL DO NOTHING;

  SELECT id, expires_at INTO v_ent_id, v_ent_expires
    FROM public.entitlements
   WHERE user_id = v_user AND source = p_source
   ORDER BY created_at ASC
   LIMIT 1;

  -- اگر به هر دلیلی ردیف ساخته نشد، کلِ تراکنش باید برگردد. «پول گرفته شد ولی
  -- دسترسی داده نشد» هرگز نباید به‌عنوانِ موفقیت به مشتری نشان داده شود.
  IF v_ent_id IS NULL THEN
    RAISE EXCEPTION 'اعطای دسترسی انجام نشد (منبع: %).', p_source;
  END IF;

  -- ── ۴) ممیزی ─────────────────────────────────────────────────────────────
  -- فقط بارِ اول ثبت می‌شود؛ replay ردیفِ ممیزیِ تکراری نمی‌سازد.
  IF NOT v_already THEN
    INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
    VALUES (v_user, 'entitlement.granted', 'entitlement', v_user,
            jsonb_build_object(
              'kind', p_kind,
              'source', p_source,
              'payment_id', v_payment_id,
              'entitlement_id', v_ent_id,
              'expires_at', v_ent_expires,
              'registration_id', p_registration_id
            ));
  END IF;

  RETURN jsonb_build_object(
    'user_id',           v_user,
    'payment_id',        v_payment_id,
    'entitlement_id',    v_ent_id,
    'expires_at',        v_ent_expires,
    'already_finalized', v_already,
    'registration_id',   p_registration_id
  );
END $$;

-- ── ۳. Grants ───────────────────────────────────────────────────────────────
-- نهایی‌سازی فقط کارِ سرورِ مورد اعتماد است — پس از verify واقعیِ زرین‌پال.
-- هیچ نقشِ عمومی/کاربری نباید بتواند دسترسی برای خودش بسازد.
REVOKE ALL ON FUNCTION public.finalize_paid_access(
  text, text, integer, text, text, timestamptz, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.finalize_paid_access(
  text, text, integer, text, text, timestamptz, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_paid_access(
  text, text, integer, text, text, timestamptz, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_access(
  text, text, integer, text, text, timestamptz, text, uuid) TO service_role;

-- ── ۴. تأییدِ خودکارِ پس از اجرا ─────────────────────────────────────────────
-- migration بی‌صدا موفق اعلام نمی‌شود؛ اگر هر کدام از فرض‌ها برقرار نباشد
-- همین‌جا می‌شکند.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_entitlements_user_source'
  ) THEN
    RAISE EXCEPTION 'تأیید شکست خورد: ایندکسِ یکتای entitlements ساخته نشد.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'finalize_paid_access'
  ) THEN
    RAISE EXCEPTION 'تأیید شکست خورد: تابعِ finalize_paid_access ساخته نشد.';
  END IF;

  IF has_function_privilege('anon',
       'public.finalize_paid_access(text, text, integer, text, text, timestamptz, text, uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: anon هنوز اجازهٔ اجرای نهایی‌سازی را دارد.';
  END IF;

  IF has_function_privilege('authenticated',
       'public.finalize_paid_access(text, text, integer, text, text, timestamptz, text, uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: authenticated هنوز اجازهٔ اجرای نهایی‌سازی را دارد.';
  END IF;

  IF NOT has_function_privilege('service_role',
       'public.finalize_paid_access(text, text, integer, text, text, timestamptz, text, uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: service_role اجازهٔ اجرای نهایی‌سازی را ندارد.';
  END IF;
END $$;

COMMENT ON FUNCTION public.finalize_paid_access(
  text, text, integer, text, text, timestamptz, text, uuid) IS
  'نهایی‌سازیِ اتمیکِ پرداخت → ثبت‌نام → دسترسی. تنها مسیرِ مجازِ اعطای دسترسیِ پولی.';
