-- =============================================================================
-- phase30 — مهارِ `create_payment` (`P2-SEC-PAY-001`)
--
-- ── چه چیزی اندازه‌گیری شد (فقط‌خواندنی، ۱۴۰۵/۰۶/۲۲) ─────────────────────────
-- `create_payment(p_amount integer, p_authority text)` روی Production
-- `SECURITY DEFINER` است و **`authenticated` می‌تواند مستقیماً صدایش بزند**.
-- ACLِ واقعی: `postgres=X | authenticated=X | service_role=X`.
-- دو خواهرش این‌طور نیستند: `verify_payment` و `fail_payment` هر دو فقط
-- `service_role=X` دارند. یعنی این خط یک **استثنا**ست، نه یک طرح.
--
-- ── اثرِ واقعی، بدونِ بزرگ‌نمایی ─────────────────────────────────────────────
-- هر کاربرِ لاگین‌کرده می‌تواند از راهِ PostgREST یک ردیفِ `payments` با
-- **مبلغِ دلخواه** بسازد. ولی:
--   • `user_id` از `auth.uid()` می‌آید، نه از ورودی ⇒ نمی‌تواند به نامِ دیگری بسازد.
--   • `payments.authority` یکتاست و رشتهٔ ۳۶ نویسه‌ایِ زرین‌پال است ⇒ نمی‌تواند
--     authorityِ یک تراکنشِ واقعیِ دیگری را از قبل بگیرد (حدس‌زدنی نیست).
--   • callback مبلغ را از **همان ردیف** به زرین‌پال می‌دهد؛ زرین‌پال تراکنشی
--     با مبلغِ نامنطبق را تأیید نمی‌کند ⇒ زنجیره همان‌جا می‌شکند.
--   • هیچ‌جای Production دسترسی را از روی پرداخت صادر نمی‌کند
--     (`finalize_paid_access` **وجود ندارد**، `entitlements` صفر ردیف).
-- پس امروز این یک **ارتقای دسترسیِ زنده نیست**؛ یک مسیرِ نوشتنِ کنترل‌نشده در
-- دفترِ مالی است.
--
-- ── چرا با این حال حالا بسته می‌شود ─────────────────────────────────────────
-- لحظه‌ای که #113 با `finalize_paid_access` بیاید، «ردیفِ paid» معنیِ
-- «دسترسی» پیدا می‌کند — و آن‌وقت همین خط از یک آلودگیِ دفتری به یک حفرهٔ
-- واقعی تبدیل می‌شود. بستنش **قبل از** آن، یک خط است؛ بعد از آن، یک حادثه.
--
-- ── چرا این فایل پشتِ دروازهٔ بکاپ نیست ─────────────────────────────────────
-- نه جدولی، نه ستونی، نه ردیفی، نه امضای تابعی عوض نمی‌شود. فقط یک امتیاز
-- پس گرفته می‌شود. بازگشت **یک دستور** است و در پایینِ همین فایل نوشته شده.
-- هیچ دادهٔ کاربری در معرضِ این تغییر نیست؛ `payments` امروز **صفر ردیف** دارد.
--
-- ── سازگاریِ نسخهٔ جاری ─────────────────────────────────────────────────────
-- `app/api/payment/request/route.ts` این تابع را با کلاینتِ **کاربر** صدا
-- می‌زند. پس از این فایل، آن فراخوانی `permission denied` می‌گیرد. روتِ همان
-- کامیت این حالت را می‌شناسد و **۵۰۳ صادق** برمی‌گرداند («پرداخت موقتاً در
-- دسترس نیست») نه ۵۰۰ مبهم — یعنی برنامه با **هر دو** حالتِ دیتابیس درست کار
-- می‌کند و ترتیبِ انتشار اجباری نیست.
--
-- پایانِ این وضعیتِ موقت، #113 است: آنجا روت با `service_role` و امضای
-- سه‌آرگومانی صدا می‌زند و `authenticated` دیگر اصلاً لازم نیست.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.create_payment(integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_payment(integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_payment(integer, text) FROM authenticated;

-- سرور باید بتواند. این خط عمداً هست تا فایل روی محیطی که گرنت را ندارد هم
-- به وضعیتِ درست برسد، نه فقط روی محیطی که از قبل داشت.
GRANT EXECUTE ON FUNCTION public.create_payment(integer, text) TO service_role;

-- ── راستی‌آزماییِ پس از اجرا ────────────────────────────────────────────────
DO $$
DECLARE
  auth_x bool;
  anon_x bool;
  svc_x  bool;
  v_oid  oid;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_payment'
    AND pg_get_function_identity_arguments(p.oid) = 'p_amount integer, p_authority text';

  IF v_oid IS NULL THEN
    -- روی محیطی که #113 اجرا شده، امضای دوآرگومانی دیگر نیست و این فایل
    -- بی‌موضوع است. ساکت رد نمی‌شویم — صریح می‌گوییم.
    RAISE NOTICE 'phase30: امضای دوآرگومانیِ create_payment نیست — احتمالاً #113 اجرا شده؛ بی‌اثر';
    RETURN;
  END IF;

  SELECT has_function_privilege('authenticated', v_oid, 'EXECUTE'),
         has_function_privilege('anon', v_oid, 'EXECUTE'),
         has_function_privilege('service_role', v_oid, 'EXECUTE')
    INTO auth_x, anon_x, svc_x;

  IF auth_x THEN RAISE EXCEPTION 'phase30: authenticated هنوز EXECUTE دارد'; END IF;
  IF anon_x THEN RAISE EXCEPTION 'phase30: anon هنوز EXECUTE دارد'; END IF;
  IF NOT svc_x THEN RAISE EXCEPTION 'phase30: service_role دیگر EXECUTE ندارد — سرور می‌شکند'; END IF;

  RAISE NOTICE 'phase30 ok — create_payment حالا هم‌ترازِ verify_payment و fail_payment است';
END $$;

-- ── بازگشت (یک دستور) ───────────────────────────────────────────────────────
--   GRANT EXECUTE ON FUNCTION public.create_payment(integer, text) TO authenticated;
