-- =============================================================================
-- phase31 — لغوِ انتشارِ اعلان، بدونِ نابودکردنِ سابقه (`#139`)
--
-- ── مسئله ──────────────────────────────────────────────────────────────────
-- ادمین اعلان می‌سازد و هیچ راهی برای برداشتنش از دیدِ کاربر ندارد.
--
-- ── چرا نمی‌شود سادهٔ آن را حل کرد (اندازه‌گیریِ فقط‌خواندنیِ ۱۴۰۵/۰۶/۲۵) ─────
-- `announcements` تریگرِ `no_mutation` دارد که **هر** UPDATE و DELETE را با
-- استثنا رد می‌کند. پس نه `published_at = NULL` ممکن است و نه حذفِ ردیف.
-- و این درست است: اعلان یک رکوردِ ارسال‌شده به آدم‌هاست؛ پاک‌کردنش یعنی
-- پاک‌کردنِ شاهدِ چیزی که واقعاً فرستاده شده.
--
-- ⚠️ برداشتنِ آن تریگر «راه‌حل» نیست؛ همان حفاظتی است که سابقه را نگه می‌دارد.
--
-- ── راه‌حل: یک رویدادِ افزایشیِ جدا ─────────────────────────────────────────
-- لغو، **خودش یک رکورد** است نه پاک‌کردنِ رکوردِ قبلی. جدولِ
-- `announcement_revocations` یک ردیف به ازای هر اعلانِ لغوشده می‌گیرد، و
-- سیاستِ خواندنِ `announcements` آن‌ها را از دیدِ عضو بیرون می‌برد. ادمین
-- همچنان همه‌چیز را می‌بیند — هم اعلان، هم اینکه چه کسی، کِی و چرا لغوش کرد.
--
-- ── آنچه این کار **نمی‌کند** ───────────────────────────────────────────────
-- `announcement_deliveries` هیچ ستونی برای شناسهٔ پیامِ تلگرام یا ایمیل ندارد
-- (ستون‌های واقعی: id, announcement_id, user_id, channel, status, sent_at,
-- created_at). پس پیامی که رفته، رفته. این migration فقط نمایشِ **درون
-- محصول** را برمی‌دارد و هیچ ادعایی دربارهٔ پس‌گرفتنِ ایمیل یا پیامِ تلگرام
-- نمی‌کند. UI هم باید همین را صریح بگوید.
--
-- وضعیت روی Production: NOT_APPLIED — پشتِ دروازهٔ بکاپ.
-- =============================================================================

BEGIN;

-- ── ۱) جدولِ رویداد ─────────────────────────────────────────────────────────
-- `announcement_id` یکتاست: لغوِ دوباره یک no-op است، نه یک ردیفِ تکراری یا
-- یک خطا. این همان idempotency است که `#139` می‌خواهد.
CREATE TABLE IF NOT EXISTS public.announcement_revocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- بندِ یکتایی نامِ صریح دارد چون `revoke_announcement` در `ON CONFLICT` به
  -- آن ارجاع می‌دهد؛ با نامِ خودکار، ستون با پارامترِ خروجیِ هم‌نامِ تابع
  -- اشتباه گرفته می‌شود و Postgres «ambiguous» می‌دهد.
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE RESTRICT
                       CONSTRAINT announcement_revocations_once UNIQUE,
  revoked_by      uuid NOT NULL REFERENCES auth.users(id),
  revoked_at      timestamptz NOT NULL DEFAULT now(),
  reason          text
);

COMMENT ON TABLE public.announcement_revocations IS
  'رویدادِ لغوِ انتشار — افزایشی. `announcements` تریگرِ no_mutation دارد و نباید تغییر کند.';

-- همین جدول هم افزایشی است: لغو را نمی‌شود «پس گرفت» با ویرایشِ بی‌رد.
DROP TRIGGER IF EXISTS no_mutation ON public.announcement_revocations;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.announcement_revocations
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

ALTER TABLE public.announcement_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_revocations FORCE ROW LEVEL SECURITY;

-- فقط مدیر سابقهٔ لغو را می‌بیند. عضو لازم نیست بداند چه چیزی لغو شده —
-- برای او آن اعلان اصلاً وجود ندارد.
DROP POLICY IF EXISTS ann_revoke_admin_read ON public.announcement_revocations;
CREATE POLICY ann_revoke_admin_read ON public.announcement_revocations
  FOR SELECT USING (public.is_admin());

-- ⚠️ این REVOKE تشریفاتی نیست. در این پروژه `ALTER DEFAULT PRIVILEGES` برای
-- schema `public` به anon/authenticated/service_role حقِ `arwdDxtm` می‌دهد
-- (اندازه‌گیریِ فقط‌خواندنیِ ۱۴۰۵/۰۶/۲۵ روی pg_default_acl). یعنی این جدول
-- **با حقِ INSERT برای هر عضو و حتی anon متولد می‌شود** و تنها گیتِ نوشتن،
-- نبودِ سیاستِ INSERT در RLS است. یک ردیفِ INSERTی از سمتِ عضو یعنی او
-- می‌تواند اعلانِ هرکسی را برای همه لغو کند؛ پس حق را صریح پس می‌گیریم و
-- بلوکِ راستی‌آزمایی هم آن را تثبیت می‌کند.
REVOKE ALL ON public.announcement_revocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.announcement_revocations TO authenticated;
GRANT ALL  ON public.announcement_revocations TO service_role;

-- ── ۲) «لغو شده؟» به‌عنوانِ تابعِ SECURITY DEFINER ──────────────────────────
-- ⚠️ این تابع لازم است و دورزدنِ RLS نیست — **شرطِ درست‌کارکردنِ** آن است.
--
-- نسخهٔ اولِ همین migration شرط را مستقیم به‌صورتِ زیرپرس‌وجو در سیاست نوشته
-- بود. تستِ محلی نشان داد عضو **همچنان اعلانِ لغوشده را می‌بیند**: آن
-- زیرپرس‌وجو با مجوزِ خودِ عضو اجرا می‌شود، و چون `announcement_revocations`
-- فقط برای مدیر خواندنی است، ردیفِ لغو برای عضو نامرئی می‌ماند، `NOT EXISTS`
-- درست می‌شود و اعلان سرِ جایش می‌ماند.
--
-- سیاستی که به جدولی تکیه کند که کاربر حقِ خواندنش را ندارد، بی‌اثر است.
-- تابع فقط یک `boolean` برمی‌گرداند و هیچ محتوایی از رویدادِ لغو بیرون نمی‌دهد.
CREATE OR REPLACE FUNCTION public.is_announcement_revoked(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $revoked$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_revocations r
     WHERE r.announcement_id = p_announcement_id
  );
$revoked$;

-- ⚠️ anon هم باید EXECUTE داشته باشد و این سهل‌انگاری نیست.
-- در Production نقشِ anon روی `announcements` حقِ SELECT دارد (ACLِ فراخِ
-- Supabase) و RLS تنها گیتِ اوست. اگر anon نتواند این تابع را اجرا کند،
-- ارزیابیِ محمولِ سیاست با «permission denied for function» شکست می‌خورد و
-- خواندنِ ناشناسِ `announcements` به‌جای «صفر ردیف»، **خطای سخت** می‌دهد.
-- تستِ محلی دقیقاً همین را نشان داد.
--
-- همین الگو در خودِ Production هم برقرار است (اندازه‌گیریِ ۱۴۰۵/۰۶/۲۵):
-- `can_see_announcement` و `is_admin` برای anon اجراشدنی‌اند، و فقط RPCِ
-- نویسنده (`publish_announcement`) نیست. تابعِ ما هم فقط یک boolean برای
-- شناسه‌ای برمی‌گرداند که فراخواننده از قبل دارد؛ هیچ محتوایی بیرون نمی‌دهد.
REVOKE ALL ON FUNCTION public.is_announcement_revoked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_announcement_revoked(uuid) TO anon, authenticated, service_role;

-- ── ۳) سیاستِ خواندنِ اعلان ─────────────────────────────────────────────────
-- سیاستِ فعلی: `is_admin() OR (published_at IS NOT NULL AND can_see_announcement(target))`
-- تنها چیزی که اضافه می‌شود، بیرون‌بردنِ لغوشده‌هاست. شاخهٔ ادمین دست نمی‌خورد،
-- پس مدیر سابقه را از دست نمی‌دهد.
DROP POLICY IF EXISTS ann_target_read ON public.announcements;
CREATE POLICY ann_target_read ON public.announcements
  FOR SELECT USING (
    public.is_admin()
    OR (
      published_at IS NOT NULL
      AND public.can_see_announcement(target)
      AND NOT public.is_announcement_revoked(id)
    )
  );

-- ── ۴) RPCِ لغو ─────────────────────────────────────────────────────────────
-- `SECURITY DEFINER` چون باید در جدولی بنویسد که `authenticated` حقِ INSERT
-- ندارد؛ ولی **خودش** ادمین‌بودن را چک می‌کند، دقیقاً مثل `publish_announcement`.
-- یعنی مسیرِ service-role لازم نیست و API می‌تواند با کلاینتِ نشست صدایش بزند.
CREATE OR REPLACE FUNCTION public.revoke_announcement(
  p_announcement_id uuid,
  p_reason          text DEFAULT NULL
)
RETURNS TABLE (announcement_id uuid, revoked_at timestamptz, already_revoked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $revoke$
DECLARE
  v_existing public.announcement_revocations%ROWTYPE;
  v_title    text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند اعلامیه را لغو کند.';
  END IF;

  SELECT a.title INTO v_title FROM public.announcements a WHERE a.id = p_announcement_id;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'اعلامیه پیدا نشد.';
  END IF;

  -- ⚠️ «بخوان، اگر نبود بنویس» دو درخواستِ هم‌زمان را امن نمی‌کند: هر دو
  -- می‌توانند نبودِ ردیف را ببینند و یکی با نقضِ یکتایی بترکد — یعنی مدیر
  -- خطا می‌گیرد در حالی که لغو واقعاً انجام شده. پس نوشتن **اتمیک** است:
  -- یک INSERT با `ON CONFLICT DO NOTHING`. برنده ردیف را می‌گیرد، بازنده
  -- هیچ ردیفی نمی‌گیرد و در گامِ بعد همان ردیفِ موجود را می‌خوانَد.
  INSERT INTO public.announcement_revocations (announcement_id, revoked_by, reason)
  VALUES (p_announcement_id, auth.uid(), nullif(btrim(coalesce(p_reason,'')), ''))
  ON CONFLICT ON CONSTRAINT announcement_revocations_once DO NOTHING
  RETURNING * INTO v_existing;

  IF NOT FOUND THEN
    -- یا قبلاً لغو شده بود، یا درخواستِ هم‌زمانِ دیگری برنده شد. هر دو حالت
    -- یک معنا دارند: لغو انجام شده است. هیچ `audit_log` تازه‌ای ثبت نمی‌شود،
    -- پس یک لغو دقیقاً یک رویداد دارد نه چند تا.
    SELECT * INTO v_existing
      FROM public.announcement_revocations r
     WHERE r.announcement_id = p_announcement_id;
    RETURN QUERY SELECT v_existing.announcement_id, v_existing.revoked_at, true;
    RETURN;
  END IF;

  -- فقط برندهٔ واقعیِ INSERT به اینجا می‌رسد، پس رویدادِ ممیزی یکتاست.
  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, after)
  VALUES (auth.uid(), 'announcement.revoke', 'announcement', NULL,
          jsonb_build_object('id', p_announcement_id, 'title', v_title,
                             'reason', v_existing.reason));

  RETURN QUERY SELECT v_existing.announcement_id, v_existing.revoked_at, false;
END
$revoke$;

REVOKE ALL ON FUNCTION public.revoke_announcement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_announcement(uuid, text) TO authenticated;

-- ── ۵) راستی‌آزمایی، درونِ همین تراکنش ──────────────────────────────────────
-- اگر هرکدام نگیرد، کلِ بلوک برمی‌گردد و ACLِ نیمه‌تغییریافته جا نمی‌ماند.
DO $verify$
DECLARE v_qual text;
BEGIN
  IF to_regclass('public.announcement_revocations') IS NULL THEN
    RAISE EXCEPTION 'phase31: جدولِ announcement_revocations ساخته نشد.';
  END IF;

  IF to_regprocedure('public.revoke_announcement(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'phase31: تابعِ revoke_announcement ساخته نشد.';
  END IF;

  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_qual
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'announcements' AND p.polname = 'ann_target_read';

  IF v_qual IS NULL OR v_qual NOT LIKE '%is_announcement_revoked%' THEN
    RAISE EXCEPTION 'phase31: سیاستِ خواندن لغوشده‌ها را بیرون نمی‌برد.';
  END IF;

  -- تابع باید SECURITY DEFINER بماند، وگرنه سیاست دوباره بی‌اثر می‌شود.
  IF NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'is_announcement_revoked') THEN
    RAISE EXCEPTION 'phase31: is_announcement_revoked باید SECURITY DEFINER باشد.';
  END IF;

  IF has_function_privilege('anon', 'public.revoke_announcement(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'phase31: anon نباید بتواند لغو کند.';
  END IF;

  -- ولی محمولِ سیاست باید برای anon اجراشدنی بماند، وگرنه خواندنِ ناشناسِ
  -- `announcements` به‌جای صفر ردیف، خطای «permission denied» می‌دهد.
  IF NOT has_function_privilege('anon', 'public.is_announcement_revoked(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'phase31: anon باید بتواند محمولِ سیاست را اجرا کند.';
  END IF;

  -- ACLِ پیش‌فرضِ schema حقِ نوشتن می‌دهد؛ اینجا ثابت می‌کنیم پس گرفته شده.
  IF has_table_privilege('authenticated', 'public.announcement_revocations', 'INSERT')
     OR has_table_privilege('anon', 'public.announcement_revocations', 'INSERT') THEN
    RAISE EXCEPTION 'phase31: هیچ‌کس جز service_role نباید مستقیم در جدولِ لغو بنویسد.';
  END IF;

  IF has_table_privilege('anon', 'public.announcement_revocations', 'SELECT') THEN
    RAISE EXCEPTION 'phase31: anon نباید سابقهٔ لغو را ببیند.';
  END IF;

  RAISE NOTICE 'phase31 OK — جدول، تابع و سیاست هر سه سرِ جا هستند.';
END
$verify$;

COMMIT;
