-- =============================================================================
-- phase32 — داراییِ واقعیِ عضو، نسخه‌دار و جدا از هدف (`#140`)
--
-- ── سه چیز که نباید یکی شوند ───────────────────────────────────────────────
--   ۱. سبدِ مرجعِ آرش   → `intel_reference_*` (phase20) — بدونِ `user_id`
--   ۲. سبدِ هدفِ عضو    → `portfolio_versions`        — با `user_id`
--   ۳. داراییِ واقعیِ عضو → همین فایل                  — با `user_id`
--
-- این فایل فقط «۳» را می‌سازد و یک بندِ اتصال به «۱» اضافه می‌کند. هیچ‌کدام از
-- آن دو بازنویسی نمی‌شوند.
--
-- ── چرا snapshotِ نسخه‌دار و نه رویدادِ خام ─────────────────────────────────
-- هویتِ محاسبه باید قطعی باشد: (نسخهٔ دارایی × نسخهٔ هدف × snapshotِ قیمت).
-- با نسخه، همان ورودی همیشه همان خروجی را می‌دهد و «چرا عدد عوض شد؟» جواب
-- دارد. با رویدادِ خام باید حالت را بازسازی کرد و هویت مبهم می‌شود.
--
-- ── آنچه این فایل **نمی‌کند** ───────────────────────────────────────────────
-- `holdings` را نه حذف می‌کند نه تغییر می‌دهد. آن جدول تصویرِ «وضعیتِ جاری»
-- می‌ماند تا داشبورد و بات نشکنند. مهاجرتِ خواننده‌ها کارِ جداست و تا شناساییِ
-- کاملِ آن‌ها انجام نمی‌شود.
--
-- وضعیت روی Production: NOT_APPLIED — پشتِ دروازهٔ بکاپ.
-- =============================================================================

BEGIN;

-- ── ۱) نسخهٔ دارایی ─────────────────────────────────────────────────────────
-- `client_token` یکتاست تا ثبتِ دوباره (رفرشِ صفحه، دوبار کلیک، retryِ شبکه)
-- نسخهٔ تکراری نسازد. این ایده‌مپوتنسی در **دیتابیس** است، نه در UI — چون
-- UI را می‌شود دور زد.
CREATE TABLE IF NOT EXISTS public.member_holding_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  version      integer NOT NULL CHECK (version > 0),
  client_token text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version),
  UNIQUE (user_id, client_token)
);

COMMENT ON TABLE public.member_holding_versions IS
  'داراییِ واقعیِ عضو — افزایشی و نسخه‌دار. هدفِ عضو در portfolio_versions است و قاطی نمی‌شود.';

-- ── ۲) موقعیت‌های هر نسخه ───────────────────────────────────────────────────
-- `position_key` کلیدِ پایدارِ یک قلم است: نمادِ واقعی، یا برچسبِ دستیِ
-- نرمال‌شده. `PRIMARY KEY (version_id, position_key)` یعنی یک قلم در یک نسخه
-- دوبار نمی‌آید — همان چیزی که امروز `holdings` ندارد.
--
-- `symbol` و `manual_label` دقیقاً یکی پر است: یا نمادِ سرمایه‌پذیرِ واقعی، یا
-- داراییِ دستیِ برچسب‌دار. «نفت» بدونِ ابزارِ مشخص از راهِ `manual_label`
-- می‌آید و هرگز به‌عنوانِ نمادِ قابلِ اجرا وانمود نمی‌شود.
CREATE TABLE IF NOT EXISTS public.member_holding_positions (
  version_id   uuid NOT NULL REFERENCES public.member_holding_versions(id) ON DELETE RESTRICT,
  position_key text NOT NULL CHECK (btrim(position_key) <> ''),
  symbol       text,
  manual_label text,
  asset_class  text NOT NULL CHECK (btrim(asset_class) <> ''),
  qty          numeric NOT NULL CHECK (qty > 0),
  unit         text NOT NULL CHECK (btrim(unit) <> ''),
  cost_basis   bigint CHECK (cost_basis IS NULL OR cost_basis >= 0),
  as_of        date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, position_key),
  CONSTRAINT mhp_symbol_xor_manual CHECK (
    (symbol IS NOT NULL AND manual_label IS NULL)
    OR (symbol IS NULL AND manual_label IS NOT NULL)
  )
);

-- ── ۳) افزایشی‌بودن، با همان تریگرِ موجودِ مخزن ─────────────────────────────
-- ویرایش و حذف ممنوع است: «اصلاح» یعنی نسخهٔ تازه. بدونِ این، عضو می‌تواند
-- تاریخچهٔ خودش را پاک کند و مقایسه‌های قبلی بی‌معنا شوند.
DROP TRIGGER IF EXISTS no_mutation ON public.member_holding_versions;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.member_holding_versions
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS no_mutation ON public.member_holding_positions;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.member_holding_positions
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

-- ── ۴) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.member_holding_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_holding_versions  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.member_holding_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_holding_positions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mhv_self_read ON public.member_holding_versions;
CREATE POLICY mhv_self_read ON public.member_holding_versions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- ⚠️ محمول از راهِ تابعِ SECURITY DEFINER می‌آید و این دورزدنِ RLS نیست —
-- **شرطِ کارکردنش** است. اگر مستقیم `EXISTS (SELECT 1 FROM member_holding_versions …)`
-- بنویسیم، آن زیرپرس‌وجو با مجوزِ خودِ کاربر اجرا می‌شود؛ برای کاربرِ B ردیفِ
-- نسخهٔ A نامرئی است، پس شرط برایش **false** می‌شود و او هیچ‌چیز نمی‌بیند —
-- که اینجا اتفاقاً امن است ولی برای مالکِ واقعی هم صدق می‌کند و موقعیت‌های
-- خودش را هم نمی‌بیند. این دقیقاً همان تله‌ای است که در `#139` سیاست را
-- بی‌اثر کرد، با علامتِ مخالف.
CREATE OR REPLACE FUNCTION public.owns_holding_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $owns$
  SELECT EXISTS (
    SELECT 1 FROM public.member_holding_versions v
     WHERE v.id = p_version_id
       AND (v.user_id = auth.uid() OR public.is_admin())
  );
$owns$;

REVOKE ALL ON FUNCTION public.owns_holding_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_holding_version(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS mhp_self_read ON public.member_holding_positions;
CREATE POLICY mhp_self_read ON public.member_holding_positions
  FOR SELECT USING (public.owns_holding_version(version_id));

-- ⚠️ REVOKE تشریفاتی نیست. `ALTER DEFAULT PRIVILEGES` این پروژه به anon و
-- authenticated روی **هر جدولِ تازهٔ** `public` حقِ `arwdDxtm` می‌دهد؛ یعنی این
-- دو جدول با حقِ INSERT برای هر کسی متولد می‌شوند و تنها گیتِ نوشتن، نبودِ
-- سیاستِ INSERT است. یک INSERTِ مستقیم یعنی عضو می‌تواند نسخهٔ دارایی برای
-- **کاربرِ دیگری** جعل کند. حق صریح پس گرفته می‌شود و بلوکِ راستی‌آزمایی
-- تثبیتش می‌کند.
REVOKE ALL ON public.member_holding_versions  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.member_holding_positions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_holding_versions  TO authenticated;
GRANT SELECT ON public.member_holding_positions TO authenticated;

-- ── ۵) اتصالِ هدفِ عضو به نسخهٔ مرجع ────────────────────────────────────────
-- افزودنی و nullable. اثرِ مهمش ساختاری است: چون این ستون روی **ردیفِ هدفِ
-- عضو** می‌نشیند و ردیف‌های قبلی دست نمی‌خورند، انتشارِ نسخهٔ تازهٔ مرجع
-- هیچ هدفِ قبلی و هیچ داراییِ واقعی را عوض نمی‌کند. «بی‌اطلاع عوض نشدن» یک
-- خاصیتِ schema است، نه یک قولِ کد.
--
-- FK فقط وقتی اضافه می‌شود که phase20 اجرا شده باشد؛ وگرنه ستون بدونِ FK
-- می‌ماند و همین فایل بعد از phase20 دوباره اجرا می‌شود تا بند را ببندد.
ALTER TABLE public.portfolio_versions
  ADD COLUMN IF NOT EXISTS reference_version_id uuid;

DO $link$
BEGIN
  IF to_regclass('public.intel_reference_versions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'portfolio_versions_reference_version_fk'
     )
  THEN
    ALTER TABLE public.portfolio_versions
      ADD CONSTRAINT portfolio_versions_reference_version_fk
      FOREIGN KEY (reference_version_id)
      REFERENCES public.intel_reference_versions(id);
    RAISE NOTICE 'phase32: بندِ ارجاع به نسخهٔ مرجع بسته شد.';
  ELSIF to_regclass('public.intel_reference_versions') IS NULL THEN
    RAISE NOTICE 'phase32: phase20 اجرا نشده — ستون ساخته شد ولی بدونِ FK. پس از phase20 همین فایل را دوباره اجرا کن.';
  END IF;
END
$link$;

-- ── ۶) تنها مسیرِ نوشتن ─────────────────────────────────────────────────────
-- `SECURITY DEFINER` چون `authenticated` حقِ INSERT ندارد؛ ولی تابع **خودش**
-- مالکیت را اعمال می‌کند و هرگز `p_user_id` از بیرون نمی‌گیرد. یعنی «ثبت برای
-- کاربرِ دیگر» حتی قابلِ بیان هم نیست.
CREATE OR REPLACE FUNCTION public.record_member_holdings(
  p_positions    jsonb,
  p_note         text DEFAULT NULL,
  p_client_token text DEFAULT NULL
)
RETURNS TABLE (version_id uuid, version integer, position_count integer, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $record$
DECLARE
  v_user     uuid := auth.uid();
  v_token    text := nullif(btrim(coalesce(p_client_token, '')), '');
  v_existing public.member_holding_versions%ROWTYPE;
  v_next     integer;
  v_id       uuid;
  v_count    integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: ثبت دارایی نیاز به ورود دارد.';
  END IF;

  IF jsonb_typeof(p_positions) <> 'array' OR jsonb_array_length(p_positions) = 0 THEN
    RAISE EXCEPTION 'حداقل یک قلم دارایی لازم است.';
  END IF;

  -- ⚠️ قفلِ هم‌زمانی. بدونِ آن، دو درخواستِ موازی هر دو `max(version)` یکسان
  -- می‌خوانند و یکی با نقضِ یکتایی می‌ترکد. قفل روی **همین کاربر** است، پس
  -- کاربرهای دیگر معطل نمی‌شوند.
  PERFORM pg_advisory_xact_lock(hashtext('member_holdings'), hashtext(v_user::text));

  -- ثبتِ دوباره با همان توکن = همان نسخه، نه نسخهٔ تازه.
  IF v_token IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.member_holding_versions
     WHERE user_id = v_user AND client_token = v_token;
    IF FOUND THEN
      SELECT count(*) INTO v_count FROM public.member_holding_positions
       WHERE member_holding_positions.version_id = v_existing.id;
      RETURN QUERY SELECT v_existing.id, v_existing.version, v_count, true;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(max(v.version), 0) + 1 INTO v_next
    FROM public.member_holding_versions v WHERE v.user_id = v_user;

  INSERT INTO public.member_holding_versions (user_id, version, client_token, note)
  VALUES (v_user, v_next, v_token, nullif(btrim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.member_holding_positions
    (version_id, position_key, symbol, manual_label, asset_class, qty, unit, cost_basis, as_of)
  SELECT
    v_id,
    btrim(e->>'position_key'),
    nullif(btrim(coalesce(e->>'symbol', '')), ''),
    nullif(btrim(coalesce(e->>'manual_label', '')), ''),
    btrim(e->>'asset_class'),
    (e->>'qty')::numeric,
    btrim(e->>'unit'),
    nullif(btrim(coalesce(e->>'cost_basis', '')), '')::bigint,
    (e->>'as_of')::date
  FROM jsonb_array_elements(p_positions) AS e;

  SELECT count(*) INTO v_count FROM public.member_holding_positions
   WHERE member_holding_positions.version_id = v_id;

  RETURN QUERY SELECT v_id, v_next, v_count, false;
END
$record$;

REVOKE ALL ON FUNCTION public.record_member_holdings(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_holdings(jsonb, text, text) TO authenticated;

-- ── ۷) راستی‌آزمایی، درونِ همین تراکنش ──────────────────────────────────────
DO $verify$
BEGIN
  IF to_regclass('public.member_holding_versions') IS NULL
     OR to_regclass('public.member_holding_positions') IS NULL THEN
    RAISE EXCEPTION 'phase32: جدول‌ها ساخته نشدند.';
  END IF;

  -- ACLِ پیش‌فرض حقِ نوشتن می‌دهد؛ اینجا ثابت می‌کنیم پس گرفته شده.
  IF has_table_privilege('authenticated', 'public.member_holding_versions', 'INSERT')
     OR has_table_privilege('anon', 'public.member_holding_versions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.member_holding_positions', 'INSERT')
     OR has_table_privilege('anon', 'public.member_holding_positions', 'INSERT') THEN
    RAISE EXCEPTION 'phase32: نوشتنِ مستقیم باید فقط از راهِ RPC باشد.';
  END IF;

  IF has_function_privilege('anon', 'public.record_member_holdings(jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'phase32: anon نباید بتواند دارایی ثبت کند.';
  END IF;

  -- محمولِ سیاست باید SECURITY DEFINER بماند، وگرنه مالک هم موقعیت‌های
  -- خودش را نمی‌بیند.
  IF NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'owns_holding_version') THEN
    RAISE EXCEPTION 'phase32: owns_holding_version باید SECURITY DEFINER باشد.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='portfolio_versions'
                    AND column_name='reference_version_id') THEN
    RAISE EXCEPTION 'phase32: ستونِ اتصال به نسخهٔ مرجع اضافه نشد.';
  END IF;

  RAISE NOTICE 'phase32 OK — داراییِ نسخه‌دار، RLS و مسیرِ نوشتن سرِ جا هستند.';
END
$verify$;

COMMIT;
