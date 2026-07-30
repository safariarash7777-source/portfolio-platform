-- =============================================================================
-- Phase 21 — دفترِ اجرای cron (`public.cron_runs`)
--
-- وضعیت: **NOT_APPLIED** — نه روی Production، نه روی Staging.
--         رجوع به docs/MIGRATION-LEDGER.md
--
-- ── چرا این جدول لازم است ───────────────────────────────────────────────────
--
-- تا امروز «آخرین اجرای موفقِ cron» **از دیتابیس قابل دانستن نبود**، و نمای
-- سلامت مجبور بود از روی نشانه‌های غیرمستقیم حدس بزند:
--
--   • `/api/cron/alerts` هیچ ردیفِ ماندگاری نمی‌نویسد. اگر هیچ هشداری فعال
--     نباشد، یک اجرای کاملاً موفق **هیچ اثری** از خود باقی نمی‌گذارد.
--   • `/api/cron/telegram-sync` فقط وقتی در `content_hub` درج می‌کند که پستِ
--     تازه‌ای باشد. پس «ردیفِ تازه نیست» می‌تواند یعنی «کانال ساکت بوده» یا
--     یعنی «cron سه روز است اجرا نشده» — و این دو از بیرون یکسان به‌نظر
--     می‌رسند.
--
-- نتیجه: شاخصِ تازگی در عمل **حضورِ محصول** را می‌سنجید، نه **اجرای job** را.
-- این جدول آن دو را از هم جدا می‌کند: هر اجرا ردِ خودش را می‌گذارد، حتی اگر
-- کارِ مفیدی نکرده باشد و حتی اگر شکست خورده باشد.
--
-- ── قواعد ──────────────────────────────────────────────────────────────────
--   • append-only نیست: یک ردیف در شروع `running` درج می‌شود و در پایان به
--     `succeeded`/`failed` می‌رود. برای همین `UPDATE` مجاز است — ولی فقط
--     گذارهای معتبر (تریگرِ پایین).
--   • هیچ Secret و هیچ دادهٔ شخصی ذخیره نمی‌شود. `safe_error_summary` عمداً
--     کوتاه و کران‌دار است و کدِ خطا جداست تا نیازی به چسباندنِ متنِ خام نباشد.
--   • درسِ `G2-006` از ابتدا: `REVOKE` از `PUBLIC`/`anon`/`authenticated`،
--     چون **RLS روی `TRUNCATE` اعمال نمی‌شود**.
-- =============================================================================

BEGIN;

-- ── ۱) جدول ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- شناسهٔ پایدارِ job. عمداً `text` و نه enum: افزودنِ jobِ تازه نباید
  -- migration بخواهد.
  job_key          TEXT        NOT NULL CHECK (char_length(job_key) BETWEEN 1 AND 64),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'succeeded', 'failed')),
  -- «چند مورد پردازش شد» — صفر یک نتیجهٔ کاملاً معتبر است (کانالِ ساکت).
  processed_count  INTEGER     CHECK (processed_count IS NULL OR processed_count >= 0),
  -- کدِ کوتاهِ ماشین‌خوان: `feed_unreachable`, `fetch_failed`, `insert_failed`, …
  error_code       TEXT        CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  -- ⚠️ خلاصهٔ **پاک‌شده**. هرگز پیامِ خامِ استثنا، هرگز URL، هرگز توکن.
  safe_error_summary TEXT      CHECK (safe_error_summary IS NULL OR char_length(safe_error_summary) <= 300),
  deployment_sha   TEXT        CHECK (deployment_sha IS NULL OR char_length(deployment_sha) <= 64),
  duration_ms      INTEGER     CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- اجرای تمام‌شده باید زمانِ پایان داشته باشد، و اجرای در جریان نباید.
  CONSTRAINT cron_runs_finished_consistent CHECK (
    (status = 'running'  AND finished_at IS NULL) OR
    (status <> 'running' AND finished_at IS NOT NULL)
  ),
  -- شکست باید دلیل داشته باشد، وگرنه دفتر فقط می‌گوید «خراب شد» و کمکی نمی‌کند.
  CONSTRAINT cron_runs_failure_has_reason CHECK (
    status <> 'failed' OR error_code IS NOT NULL
  )
);

COMMENT ON TABLE public.cron_runs IS
  'دفترِ اجرای jobهای زمان‌بندی‌شده. هر اجرا — موفق یا ناموفق — یک ردیف دارد. بدونِ Secret و بدونِ دادهٔ شخصی.';

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started
  ON public.cron_runs (job_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_status
  ON public.cron_runs (status) WHERE status = 'running';

-- ── ۲) گذارهای معتبر ────────────────────────────────────────────────────────
-- بدونِ این گارد، یک اجرای `succeeded` می‌توانست بعداً به `running` برگردد یا
-- بازنویسی شود و دفتر بی‌ارزش شود.
CREATE OR REPLACE FUNCTION public.cron_runs_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ردیفِ cron_runs حذف نمی‌شود؛ تاریخچهٔ اجرا پاک‌شدنی نیست.';
  END IF;

  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'اجرای تمام‌شده (%) دیگر تغییر نمی‌کند.', OLD.status;
  END IF;
  IF NEW.status = 'running' THEN
    RAISE EXCEPTION 'گذار از running به running معنا ندارد؛ باید succeeded یا failed شود.';
  END IF;
  IF NEW.job_key <> OLD.job_key OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'job_key و started_at پس از درج تغییر نمی‌کنند.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cron_runs_guard ON public.cron_runs;
CREATE TRIGGER trg_cron_runs_guard
  BEFORE UPDATE OR DELETE ON public.cron_runs
  FOR EACH ROW EXECUTE FUNCTION public.cron_runs_guard();

-- ── ۳) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

-- نویسنده فقط سرور است (روت‌های cron با service-role).
DROP POLICY IF EXISTS "Service role manages cron runs" ON public.cron_runs;
CREATE POLICY "Service role manages cron runs" ON public.cron_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ادمین فقط می‌خوانَد — نمای سلامت.
DROP POLICY IF EXISTS "Admin reads cron runs" ON public.cron_runs;
CREATE POLICY "Admin reads cron runs" ON public.cron_runs
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ── ۴) گرنت‌ها — درسِ `G2-006` ──────────────────────────────────────────────
REVOKE ALL ON public.cron_runs FROM PUBLIC;
REVOKE ALL ON public.cron_runs FROM anon;
REVOKE ALL ON public.cron_runs FROM authenticated;
-- ⚠️ `service_role` هم باید صریح پس گرفته شود، نه فقط نقش‌های عمومی.
-- تستِ یکپارچگی نشان داد بدونِ این خط، `service_role` امتیازِ کاملِ محیط را
-- نگه می‌دارد — از جمله `DELETE` و `TRUNCATE`. و **`TRUNCATE` مثلِ RLS از
-- تریگر هم رد می‌شود**، پس گاردِ append-only دور زدنی می‌شد. کلِ ارزشِ این
-- دفتر این است که بعد از یک حادثه هنوز وجود داشته باشد.
REVOKE ALL ON public.cron_runs FROM service_role;

-- نویسنده فقط همین سه کار را لازم دارد: درجِ شروع، به‌روزرسانیِ پایان، خواندن.
GRANT SELECT, INSERT, UPDATE ON public.cron_runs TO service_role;
-- ادمین از نشستِ کاربر می‌خوانَد؛ نوشتن هرگز، حذف هرگز، TRUNCATE هرگز.
GRANT SELECT ON public.cron_runs TO authenticated;

REVOKE ALL ON FUNCTION public.cron_runs_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_runs_guard() FROM anon;
REVOKE ALL ON FUNCTION public.cron_runs_guard() FROM authenticated;

COMMIT;

-- =============================================================================
-- راستی‌آزمایی (پس از اجرا، دستی)
-- =============================================================================
-- ۱) SELECT to_regclass('public.cron_runs');
-- ۲) SELECT relrowsecurity FROM pg_class WHERE oid='public.cron_runs'::regclass;  -- t
-- ۳) SELECT has_table_privilege('anon','public.cron_runs','SELECT');              -- f
-- ۴) SELECT has_table_privilege('authenticated','public.cron_runs','TRUNCATE');   -- f
-- ۵) SELECT has_table_privilege('authenticated','public.cron_runs','INSERT');     -- f
-- ۶) آخرین اجرای هر job:
--    SELECT DISTINCT ON (job_key) job_key, status, started_at, finished_at
--      FROM public.cron_runs ORDER BY job_key, started_at DESC;
--
-- =============================================================================
-- برگشت (Rollback)
-- =============================================================================
--   BEGIN;
--   DROP TRIGGER  IF EXISTS trg_cron_runs_guard ON public.cron_runs;
--   DROP FUNCTION IF EXISTS public.cron_runs_guard();
--   DROP TABLE    IF EXISTS public.cron_runs;
--   COMMIT;
--
-- این جدول دادهٔ محصول ندارد (فقط تله‌متریِ اجرا)، پس برگشتش کم‌خطرتر از
-- `leads` است. با این حال اگر تاریخچهٔ اجرا برای ممیزی لازم باشد، به‌جای
-- `DROP` فقط نوشتن را متوقف کن.
-- =============================================================================
