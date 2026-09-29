-- phase34 — نسخه‌های کاربرگِ پژوهش و تأییدِ داخلیِ انسانی (#142)
--
-- ── چرا ─────────────────────────────────────────────────────────────────────
-- کاربرگِ `/admin/research` تا امروز فقط در state مرورگر و فایلِ دانلودی زنده
-- بود: بستنِ زبانه یعنی ازدست‌رفتنِ کار، و «نسخهٔ دوم» فقط یک فایلِ دیگر روی
-- دیسکِ کسی بود. این فایل ذخیرهٔ سروریِ **نسخه‌دار و append-only** می‌سازد:
--   · هر ذخیره یک ردیفِ تازه است (نسخهٔ n+1)؛ نسخهٔ قبلی هرگز بازنویسی نمی‌شود.
--   · دو ویرایشِ هم‌زمان روی یک نسخهٔ پایه، هر دو نمی‌توانند n+1 شوند
--     (UNIQUE) — دومی ۴۰۹ می‌گیرد، نه اینکه بی‌صدا کارِ اولی را پاک کند.
--   · تأییدِ داخلی به **یک نسخهٔ مشخص** بسته است؛ نسخهٔ بعدی تأیید را به ارث
--     نمی‌برد. «تأییدِ داخلی» ≠ «انتشار»: این فایل هیچ مسیرِ انتشاری نمی‌سازد.
--
-- ── مرزِ اعتماد ────────────────────────────────────────────────────────────
-- چک‌لیستِ کاملِ ساختار (`reviewWorkbook` در lib/intelligence/research-workbook.ts)
-- سمتِ سرورِ برنامه اجرا می‌شود. دیتابیس یک **کفِ مستقل** نگه می‌دارد که حتی با
-- دورزدنِ برنامه (نوشتنِ مستقیم با نشستِ ادمین روی PostgREST) شکسته نمی‌شود:
-- نسخه‌ای که حتی یک شاهدِ منبع‌دار و تاریخ‌دار ندارد، تأیید نمی‌گیرد.
--
-- ── وابستگی ────────────────────────────────────────────────────────────────
-- فقط `auth.users`، `auth.uid()` و `public.profiles(role)`. به phase20/22
-- (جدول‌های `intel_*`) وابسته **نیست** — آن‌ها روی Production اجرا نشده‌اند.
--
-- ── اجرا ───────────────────────────────────────────────────────────────────
-- فقط پس از بکاپِ معتبر و آزمونِ بازیابی (قاعدهٔ مخزن). اجرای دوباره no-op است.
-- بازگشت: DROP دو جدول و چهار تابع — تا وقتی ردیفی ثبت نشده، بی‌خطر.

-- ── ۱) نسخه‌ها ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.research_workbook_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id uuid NOT NULL,
  version     integer NOT NULL CHECK (version >= 1),
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  body        jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  created_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_workbook_versions_body_size CHECK (octet_length(body::text) <= 1000000),
  CONSTRAINT research_workbook_versions_unique UNIQUE (workbook_id, version)
);
CREATE INDEX IF NOT EXISTS research_workbook_versions_recent
  ON public.research_workbook_versions (created_at DESC);

-- ── ۲) تصمیم‌های بازبینی ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.research_workbook_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL REFERENCES public.research_workbook_versions(id),
  decision    text NOT NULL CHECK (decision IN ('approved_internal', 'returned')),
  note        text CHECK (note IS NULL OR char_length(note) <= 2000),
  reviewed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_workbook_reviews_version
  ON public.research_workbook_reviews (version_id);
-- یک نسخه یک بار تأیید می‌شود؛ تأییدِ تکراری فقط سابقه را شلوغ می‌کند.
CREATE UNIQUE INDEX IF NOT EXISTS research_workbook_reviews_one_approval
  ON public.research_workbook_reviews (version_id) WHERE decision = 'approved_internal';

-- ── ۳) کفِ شاهد ─────────────────────────────────────────────────────────────
-- CASE به‌جای AND: Postgres ترتیبِ ارزیابیِ AND را تضمین نمی‌کند و
-- `jsonb_array_elements` روی غیرآرایه خطا می‌دهد.
-- `IS DISTINCT FROM` نه `<>`: بدنه‌ای که کلیدِ evidence ندارد NULL می‌دهد،
-- `NULL <> 'array'` هم NULL است و CASE از آن رد می‌شد — و `NOT EXISTS` روی
-- مجموعهٔ تهی «درست» برمی‌گرداند. یعنی نسخهٔ بی‌شاهد تأیید می‌گرفت (تستِ
-- `'{}'` همین را گرفت).
CREATE OR REPLACE FUNCTION public.research_workbook_has_evidence(p_body jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_body -> 'evidence') IS DISTINCT FROM 'array' THEN false
    WHEN jsonb_array_length(p_body -> 'evidence') = 0 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_body -> 'evidence') AS e(item)
      WHERE jsonb_typeof(e.item) <> 'object'
         OR coalesce(btrim(e.item ->> 'statement'), '') = ''
         OR coalesce(e.item ->> 'sourceUrl', '') !~* '^https?://[^/@[:space:]]+'
         OR coalesce(e.item ->> 'observedOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR coalesce(e.item ->> 'publishedOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
  END
$$;

-- ── ۴) نگهبان‌های درج ───────────────────────────────────────────────────────
-- زمان و نویسنده از خودِ نشست می‌آید، نه از چیزی که کلاینت فرستاده.
CREATE OR REPLACE FUNCTION public.research_workbook_guard_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.created_at := now();
  NEW.created_by := auth.uid();
  IF NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'research workbook: session user required';
  END IF;
  -- نسخهٔ n فقط وقتی مجاز است که n-1 موجود باشد: بدونِ این، کلاینتی که نسخهٔ
  -- پایهٔ کهنه دارد می‌توانست با پرش (مثلاً ۲ → ۹) از UNIQUE رد شود.
  IF NEW.version > 1 AND NOT EXISTS (
    SELECT 1 FROM public.research_workbook_versions v
    WHERE v.workbook_id = NEW.workbook_id AND v.version = NEW.version - 1
  ) THEN
    RAISE EXCEPTION 'research workbook: version gap (% without %)', NEW.version, NEW.version - 1;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.research_workbook_guard_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v record;
BEGIN
  NEW.reviewed_at := now();
  NEW.reviewed_by := auth.uid();
  IF NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'research workbook: session user required';
  END IF;
  SELECT workbook_id, version, body INTO v
  FROM public.research_workbook_versions WHERE id = NEW.version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research workbook: version not found';
  END IF;
  -- تصمیم فقط روی آخرین نسخه: تأییدِ نسخه‌ای که بعدش ویرایش شده، تأییدِ متنی
  -- است که دیگر کسی نمی‌بیند.
  IF EXISTS (
    SELECT 1 FROM public.research_workbook_versions w
    WHERE w.workbook_id = v.workbook_id AND w.version > v.version
  ) THEN
    RAISE EXCEPTION 'research workbook: stale version';
  END IF;
  IF NEW.decision = 'approved_internal' AND NOT public.research_workbook_has_evidence(v.body) THEN
    RAISE EXCEPTION 'research workbook: approval requires evidence';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.research_workbook_deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'research workbook history is append-only (% on %)', TG_OP, TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_research_workbook_versions_guard ON public.research_workbook_versions;
CREATE TRIGGER trg_research_workbook_versions_guard
BEFORE INSERT ON public.research_workbook_versions
FOR EACH ROW EXECUTE FUNCTION public.research_workbook_guard_version();

DROP TRIGGER IF EXISTS trg_research_workbook_reviews_guard ON public.research_workbook_reviews;
CREATE TRIGGER trg_research_workbook_reviews_guard
BEFORE INSERT ON public.research_workbook_reviews
FOR EACH ROW EXECUTE FUNCTION public.research_workbook_guard_review();

DROP TRIGGER IF EXISTS trg_research_workbook_versions_immutable ON public.research_workbook_versions;
CREATE TRIGGER trg_research_workbook_versions_immutable
BEFORE UPDATE OR DELETE ON public.research_workbook_versions
FOR EACH ROW EXECUTE FUNCTION public.research_workbook_deny_mutation();

DROP TRIGGER IF EXISTS trg_research_workbook_reviews_immutable ON public.research_workbook_reviews;
CREATE TRIGGER trg_research_workbook_reviews_immutable
BEFORE UPDATE OR DELETE ON public.research_workbook_reviews
FOR EACH ROW EXECUTE FUNCTION public.research_workbook_deny_mutation();

-- TRUNCATE تریگرِ سطری را صدا نمی‌زند؛ جدا بسته می‌شود.
DROP TRIGGER IF EXISTS trg_research_workbook_versions_no_truncate ON public.research_workbook_versions;
CREATE TRIGGER trg_research_workbook_versions_no_truncate
BEFORE TRUNCATE ON public.research_workbook_versions
FOR EACH STATEMENT EXECUTE FUNCTION public.research_workbook_deny_mutation();

DROP TRIGGER IF EXISTS trg_research_workbook_reviews_no_truncate ON public.research_workbook_reviews;
CREATE TRIGGER trg_research_workbook_reviews_no_truncate
BEFORE TRUNCATE ON public.research_workbook_reviews
FOR EACH STATEMENT EXECUTE FUNCTION public.research_workbook_deny_mutation();

-- ── ۵) RLS و امتیازِ صریح ──────────────────────────────────────────────────
ALTER TABLE public.research_workbook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_workbook_reviews  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_workbook_versions_admin_read ON public.research_workbook_versions;
CREATE POLICY research_workbook_versions_admin_read ON public.research_workbook_versions
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS research_workbook_versions_admin_insert ON public.research_workbook_versions;
CREATE POLICY research_workbook_versions_admin_insert ON public.research_workbook_versions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS research_workbook_reviews_admin_read ON public.research_workbook_reviews;
CREATE POLICY research_workbook_reviews_admin_read ON public.research_workbook_reviews
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS research_workbook_reviews_admin_insert ON public.research_workbook_reviews;
CREATE POLICY research_workbook_reviews_admin_insert ON public.research_workbook_reviews
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- پیش‌فرض‌های قدیمیِ Supabase به anon/authenticated/service_role «ALL» می‌دهند
-- (شاملِ TRUNCATE که تریگرِ سطری را دور می‌زند) — پس اول همه پس گرفته می‌شود.
REVOKE ALL ON TABLE public.research_workbook_versions, public.research_workbook_reviews
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.research_workbook_versions, public.research_workbook_reviews
  TO authenticated;
-- service_role فقط می‌خواند (بکاپ/عملیات)؛ مسیرِ برنامه با نشستِ خودِ ادمین می‌نویسد.
GRANT SELECT ON TABLE public.research_workbook_versions, public.research_workbook_reviews
  TO service_role;

REVOKE ALL ON FUNCTION public.research_workbook_guard_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.research_workbook_guard_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.research_workbook_deny_mutation() FROM PUBLIC, anon, authenticated;

-- ── ۶) راستی‌آزمایی در همان اجرا ──────────────────────────────────────────
-- اگر یکی از این‌ها برقرار نباشد، کلِ فایل برمی‌گردد (بلوکِ DO داخلِ تراکنشِ
-- اجراکننده است) و چیزی نیمه‌کاره نمی‌ماند.
DO $verify$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['research_workbook_versions', 'research_workbook_reviews'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'phase34: RLS on % is off', t;
    END IF;
    IF has_table_privilege('anon', format('public.%I', t), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', t), 'INSERT') THEN
      RAISE EXCEPTION 'phase34: anon can reach %', t;
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', t), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', t), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', t), 'TRUNCATE')
       OR has_table_privilege('service_role', format('public.%I', t), 'TRUNCATE')
       OR has_table_privilege('service_role', format('public.%I', t), 'DELETE') THEN
      RAISE EXCEPTION 'phase34: a destructive privilege survives on %', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'phase34 ok — research workbook versions are admin-only and append-only';
END
$verify$;
