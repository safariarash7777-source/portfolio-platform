-- ════════════════════════════════════════════════════════════════════════════
-- phase33 — ذخیرهٔ پایدارِ وضعیتِ هشدارِ بازتوازن و دفترِ ارسال
--
-- ── چه مشکلی را حل می‌کند ───────────────────────────────────────────────────
-- `decideDeviationAlert` یک **موتورِ تصمیم** است و تا امروز حافظه‌اش در RAM
-- بود. یعنی سه چیز:
--   ۱. با هر ری‌استارتِ پردازش، «قبلاً فرستادیم» پاک می‌شد و همان هشدار دوباره
--      می‌رفت.
--   ۲. دو درخواستِ هم‌زمان هر دو می‌دیدند «هنوز نفرستاده‌ایم» و دو پیام می‌رفت.
--   ۳. شکستِ ارسال از موفقیت قابلِ تفکیک نبود.
--
-- ── چرا دو جدول، نه یکی ─────────────────────────────────────────────────────
-- «تصمیم گرفتیم هشدار بدهیم» و «پیام واقعاً رفت» دو واقعیتِ جدا هستند و
-- یکی‌کردنشان همان اشتباهی است که بازبینی هشدار داد. `events` تصمیم را ثبت
-- می‌کند (یک‌بار، با قفلِ یکتایی) و `deliveries` هر **تلاش** را — پس تلاشِ
-- دوباره و شکست هر دو دیده می‌شوند و هیچ‌کدام موفقیت جا نمی‌زنند.
--
-- ── قفلِ هم‌زمانی در خودِ دیتابیس ────────────────────────────────────────────
-- `UNIQUE (user_id, alert_key)` تضمینِ واقعیِ ضدتکرار است، نه بررسیِ برنامه‌ای.
-- برنامه با `INSERT … ON CONFLICT DO NOTHING RETURNING id` ادعای رویداد می‌کند:
-- اگر ردیفی برنگشت یعنی رقیبی زودتر ادعا کرده و **ارسال انجام نمی‌شود**.
-- بررسیِ «اول بخوان بعد بنویس» این خاصیت را ندارد؛ دو تراکنش هم‌زمان هر دو
-- خالی می‌بینند.
--
-- پیش‌نیاز: `deny_mutation()` و `auth.users`. وابستگیِ دیگری ندارد و مستقل از
-- phase20/phase32 اجرا می‌شود.
-- ════════════════════════════════════════════════════════════════════════════

-- نگهبانِ append-only — برای خوداتکاییِ فایل دوباره تعریف می‌شود (بی‌خطر).
CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $deny$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $deny$;

-- ── ۱) رویدادِ هشدار — تصمیم، نه ارسال ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rebalance_alert_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id),
  -- اثرِ انگشتِ وضعیت: نسخهٔ دارایی + نسخهٔ هدف + دسته‌های عبورکرده.
  -- ⚠️ عددِ انحراف عمداً داخلش نیست؛ وگرنه هر نوسانِ کوچکِ قیمت کلید را عوض
  -- می‌کند و همان هشدار بارها می‌رود — همان اسپمی که قرار بود بسته شود.
  alert_key            text NOT NULL CHECK (btrim(alert_key) <> ''),
  holding_version_id   uuid NOT NULL,
  target_version_id    uuid NOT NULL,
  breached_classes     text[] NOT NULL CHECK (cardinality(breached_classes) > 0),
  max_deviation_points numeric NOT NULL CHECK (max_deviation_points >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rae_user_key_unique UNIQUE (user_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_rae_user_time
  ON public.rebalance_alert_events(user_id, created_at DESC);

-- ── ۲) دفترِ ارسال — هر تلاش یک ردیف ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rebalance_alert_deliveries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.rebalance_alert_events(id) ON DELETE RESTRICT,
  -- `log` گیرندهٔ آزمایشیِ محلی است: پیام ثبت می‌شود و جایی نمی‌رود.
  channel    text NOT NULL CHECK (channel IN ('log','email','telegram')),
  -- ⚠️ چهار وضعیت، نه سه. `pending` **پیش از** تماس با کانال نوشته می‌شود و
  -- `unknown` وقتی که هرگز نفهمیدیم آن تماس به کجا رسید.
  --
  -- چرا `pending` لازم است: بدونش ترتیب «ادعا ← ارسال ← ثبت» بود و اگر
  -- پردازش **بین** ارسالِ موفق و ثبتِ آن می‌مرد، رویداد با صفر تلاشِ ثبت‌شده
  -- می‌ماند. هر اجرای بعدی آن را «رقیبِ در حالِ اجرا» می‌دید و برای همیشه
  -- ساکت می‌شد — یعنی هشدار گم می‌شد، نه اینکه تکرار نشود.
  --
  -- چرا `unknown` لازم است: وقتی یک تلاشِ `pending` رها شده، نمی‌دانیم پیام
  -- رسید یا نه. نوشتنِ `failed` یعنی جعلِ شکست و نوشتنِ `sent` یعنی جعلِ
  -- موفقیت. هر دو دروغ‌اند؛ `unknown` همان حقیقت است.
  status     text NOT NULL CHECK (status IN ('pending','sent','failed','unknown')),
  attempt    integer NOT NULL CHECK (attempt >= 1),
  error      text,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- «خطا با موفقیت اشتباه نشود» در سطحِ دیتابیس، نه در سطحِ ادبِ برنامه.
  CONSTRAINT rad_sent_needs_time  CHECK (status <> 'sent'   OR sent_at IS NOT NULL),
  CONSTRAINT rad_failed_needs_why CHECK (status <> 'failed' OR btrim(coalesce(error,'')) <> ''),
  -- وضعیتِ نامعلوم هم باید بگوید **چرا** نامعلوم ماند.
  CONSTRAINT rad_unknown_needs_why CHECK (status <> 'unknown' OR btrim(coalesce(error,'')) <> ''),
  -- `pending` هنوز نتیجه‌ای ندارد؛ زمانِ ارسال روی آن یعنی ردیف دروغ می‌گوید.
  CONSTRAINT rad_pending_is_open  CHECK (status <> 'pending' OR sent_at IS NULL),
  -- هر تلاش دقیقاً یک ردیفِ آغاز و حداکثر یک ردیفِ پایان دارد.
  CONSTRAINT rad_attempt_once UNIQUE (event_id, channel, attempt, status)
);

CREATE INDEX IF NOT EXISTS idx_rad_event ON public.rebalance_alert_deliveries(event_id);

-- ── ۳) append-only ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS no_mutation ON public.rebalance_alert_events;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.rebalance_alert_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS no_mutation ON public.rebalance_alert_deliveries;
CREATE TRIGGER no_mutation
  BEFORE UPDATE OR DELETE ON public.rebalance_alert_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

-- ── ۴) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.rebalance_alert_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebalance_alert_events     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.rebalance_alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebalance_alert_deliveries FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rae_self_read ON public.rebalance_alert_events;
CREATE POLICY rae_self_read ON public.rebalance_alert_events
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- ⚠️ همان تلهٔ phase32: اگر شرط را مستقیم به‌صورت زیرپرس‌وجو روی جدولِ
-- رویدادها بنویسیم، آن زیرپرس‌وجو با مجوزِ خودِ کاربر اجرا می‌شود و برای
-- مالکِ واقعی هم ردیف را نامرئی می‌کند. پس از تابعِ SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.owns_alert_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $owns$
  SELECT EXISTS (
    SELECT 1 FROM public.rebalance_alert_events e
     WHERE e.id = p_event_id
       AND (e.user_id = auth.uid() OR public.is_admin())
  );
$owns$;

REVOKE ALL ON FUNCTION public.owns_alert_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_alert_event(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS rad_self_read ON public.rebalance_alert_deliveries;
CREATE POLICY rad_self_read ON public.rebalance_alert_deliveries
  FOR SELECT USING (public.owns_alert_event(event_id));

-- ── ۵) مجوزها ───────────────────────────────────────────────────────────────
-- ⚠️ `ALTER DEFAULT PRIVILEGES` این پروژه به anon و authenticated روی هر جدولِ
-- تازهٔ `public` حقِ نوشتن می‌دهد. بدونِ REVOKE، عضو می‌توانست رویدادِ هشدار
-- برای کاربرِ دیگری جعل کند و تنها مانع، نبودِ سیاستِ INSERT بود.
REVOKE ALL ON public.rebalance_alert_events     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rebalance_alert_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rebalance_alert_events     TO authenticated;
GRANT SELECT ON public.rebalance_alert_deliveries TO authenticated;

-- ⚠️ درسِ phase20: `GRANT ALL … TO service_role` یعنی `TRUNCATE`، و `TRUNCATE`
-- تریگر را شلیک **نمی‌کند** — پس کلِ گاردِ append-only بالا دور زدنی می‌شد.
-- حقِ لازم صریح داده می‌شود و نه بیشتر.
REVOKE ALL ON public.rebalance_alert_events     FROM service_role;
REVOKE ALL ON public.rebalance_alert_deliveries FROM service_role;
GRANT SELECT, INSERT ON public.rebalance_alert_events     TO service_role;
GRANT SELECT, INSERT ON public.rebalance_alert_deliveries TO service_role;

-- ── ۶) راستی‌آزماییِ درون‌تراکنشی ───────────────────────────────────────────
-- اگر چیزی سرِ جایش نباشد، کلِ این فایل برمی‌گردد و نیمه‌کاره نمی‌ماند.
DO $verify$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.rebalance_alert_events') IS NULL
     OR to_regclass('public.rebalance_alert_deliveries') IS NULL THEN
    RAISE EXCEPTION 'phase33: جدول‌ها ساخته نشدند.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rae_user_key_unique'
  ) THEN
    RAISE EXCEPTION 'phase33: قیدِ یکتاییِ (user_id, alert_key) نیست — قفلِ ضدتکرار وجود ندارد.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'no_mutation'
       AND tgrelid = 'public.rebalance_alert_events'::regclass
  ) THEN
    RAISE EXCEPTION 'phase33: گاردِ append-only روی رویدادها نصب نشد.';
  END IF;

  -- ⚠️ بدونِ این سه، مسیرِ بازیابیِ تلاشِ نیمه‌تمام توخالی است.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rad_unknown_needs_why') THEN
    RAISE EXCEPTION 'phase33: وضعیتِ نامعلوم بدونِ دلیل مجاز مانده است.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rad_pending_is_open') THEN
    RAISE EXCEPTION 'phase33: تلاشِ باز می‌تواند زمانِ ارسال بگیرد — ردیفِ دروغ.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rad_attempt_once') THEN
    RAISE EXCEPTION 'phase33: یک تلاش می‌تواند دوبار همان وضعیت را بگیرد.';
  END IF;

  -- حقِ نوشتنِ اضافی روی نقش‌های عمومی نماند.
  SELECT string_agg(format('%s:%s', grantee, privilege_type), ', ')
    INTO v_missing
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('rebalance_alert_events','rebalance_alert_deliveries')
     AND grantee IN ('anon','authenticated')
     AND privilege_type <> 'SELECT';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'phase33: حقِ نوشتنِ باقی‌مانده روی نقشِ عمومی: %', v_missing;
  END IF;

  -- service_role نباید TRUNCATE/DELETE داشته باشد، وگرنه append-only توخالی است.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN ('rebalance_alert_events','rebalance_alert_deliveries')
       AND grantee = 'service_role'
       AND privilege_type IN ('TRUNCATE','DELETE','UPDATE')
  ) THEN
    RAISE EXCEPTION 'phase33: service_role حقِ تخریب دارد؛ گاردِ append-only توخالی است.';
  END IF;

  RAISE NOTICE 'phase33: جدول‌ها، قفلِ یکتایی، گاردِ افزایشی و مجوزها تأیید شدند.';
END
$verify$;
