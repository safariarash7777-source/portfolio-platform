-- =============================================================================
-- phase26 — رادارِ تغییر (`P2-CORE-RADAR-001`)
--
-- ── مسئله‌ای که حل می‌کند ───────────────────────────────────────────────────
-- «رصد بازار» امروز یک **گزارشِ لحظه‌ای** است: هر بار از صفر حساب می‌شود و
-- می‌گوید «امروز وضع چنین است». چیزی که لازم داریم می‌گوید **«از دیروز چه چیزی
-- عوض شد»** — و آن بدونِ حافظه ممکن نیست.
--
-- ── سه چیزِ متفاوت که نباید یکی شوند ────────────────────────────────────────
--   • `new_report`         — اطلاعیهٔ تازه منتشر شد.
--   • `amendment`          — نسخهٔ اصلاحیِ یک اطلاعیهٔ قبلی آمد.
--   • `performance_change` — عددِ عملکرد به‌اندازهٔ معنادار تکان خورد.
-- اینها سه رویدادِ متفاوت با سه واکنشِ متفاوت‌اند. ادغامشان در یک «هشدار»
-- همان اشتباهی است که `empty` و `unavailable` را یکی می‌گرفت.
--
-- ── چرا `dedup_key` قلبِ این فایل است ───────────────────────────────────────
-- رادار قرار است **بارها** روی همان داده اجرا شود (کرون، رفرشِ دستی، دیپلوی).
-- اگر هر اجرا هشدارِ تازه بسازد، صفحه در یک هفته پر از تکرار می‌شود و کسی
-- دیگر نگاهش نمی‌کند — یعنی رادار دقیقاً به‌خاطرِ کارکردنش بی‌فایده می‌شود.
-- پس هر رویداد یک **کلیدِ طبیعیِ قطعی** دارد و ایندکسِ یکتا تضمین می‌کند
-- پردازشِ تکراری ردیفِ تکراری نسازد. تکرار در **مبدأ** بسته می‌شود، نه با
-- فیلترِ نمایش.
--
-- ── چرا «دیده‌شده» جدولِ جداست ──────────────────────────────────────────────
-- «دیده‌شده» یک واقعیتِ **کاربر** است، نه واقعیتِ **رویداد**. اگر ستونی روی
-- `radar_events` بود، اولین کاربری که می‌دید آن را برای همه می‌خواند. پس
-- `radar_seen` با کلیدِ (کاربر، رویداد) و RLSِ سخت: هر کس فقط ردیفِ خودش را
-- می‌بیند و می‌نویسد. جدولِ رویداد **مشترک و فقط‌خواندنی** می‌ماند.
--
-- ── چرا اصلاحیه باید وابسته‌ها را علامت بزند ────────────────────────────────
-- اصلاحیهٔ یک صورتِ مالی، هر محاسبه‌ای را که از آن ساخته شده مشکوک می‌کند —
-- فصل‌سازی، حاشیه، P/E دوازده‌ماهه. اگر این را ثبت نکنیم، تحلیلی که روی عددِ
-- باطل‌شده نوشته شده بی‌صدا سرِ جایش می‌ماند. `radar_review_flags` همان فهرستِ
-- «اینها را دوباره نگاه کن» است.
--
-- ── دامنه ──────────────────────────────────────────────────────────────────
-- افزایشی. هیچ جدول/ستون/سیاستِ موجودی را تغییر نمی‌دهد. فقط سه جدولِ تازه.
-- پیش‌نیاز: `auth.users` و `public.profiles` (برای `is_admin()`).
-- =============================================================================

-- ── ۱) رویدادها ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.radar_events (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('new_report', 'amendment', 'performance_change')),
  symbol        text NOT NULL CHECK (length(btrim(symbol)) > 0),

  -- کلیدِ قطعیِ یکتاسازی: هر اجرای دوباره باید دقیقاً همین رشته را بسازد.
  dedup_key     text NOT NULL CHECK (length(btrim(dedup_key)) > 0),

  -- مبنا: در برابرِ چه چیزی سنجیده شد. بدونِ این، «۳۰٪ رشد» عددِ بی‌معناست.
  basis         jsonb NOT NULL,

  -- مقدارِ تغییر و واحدش. برای `new_report` معنا ندارد و `null` می‌ماند —
  -- که با «صفر تغییر» یکی نیست.
  change_value  numeric,
  change_unit   text,

  event_date    date NOT NULL,
  source_url    text CHECK (source_url IS NULL OR source_url ~ '^https?://'),

  -- علتِ اهمیت. اجباری و حداقلی — هشداری که نمی‌تواند بگوید چرا مهم است،
  -- هشدار نیست، نویز است.
  significance  text NOT NULL CHECK (length(btrim(significance)) >= 10),

  -- فقط برای `amendment`: کدام رویداد را باطل می‌کند.
  supersedes_event_id bigint REFERENCES public.radar_events(id),

  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.radar_events IS
  'رویدادهای رادارِ تغییر. append-only؛ dedup_key از پردازشِ تکراری جلوگیری می‌کند.';

-- یکتاسازی: قلبِ ایده‌مپوتنسی.
CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_events_dedup
  ON public.radar_events (dedup_key);

CREATE INDEX IF NOT EXISTS idx_radar_events_symbol_date
  ON public.radar_events (symbol, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_radar_events_kind_date
  ON public.radar_events (kind, event_date DESC);

-- فقط `amendment` می‌تواند رویدادِ دیگری را باطل کند، و هرگز خودش را.
ALTER TABLE public.radar_events DROP CONSTRAINT IF EXISTS radar_supersedes_only_amendment;
ALTER TABLE public.radar_events ADD CONSTRAINT radar_supersedes_only_amendment
  CHECK (supersedes_event_id IS NULL OR kind = 'amendment');

ALTER TABLE public.radar_events DROP CONSTRAINT IF EXISTS radar_no_self_supersede;
ALTER TABLE public.radar_events ADD CONSTRAINT radar_no_self_supersede
  CHECK (supersedes_event_id IS NULL OR supersedes_event_id <> id);

-- `performance_change` بدونِ مقدارِ تغییر بی‌معناست.
ALTER TABLE public.radar_events DROP CONSTRAINT IF EXISTS radar_perf_needs_value;
ALTER TABLE public.radar_events ADD CONSTRAINT radar_perf_needs_value
  CHECK (kind <> 'performance_change' OR (change_value IS NOT NULL AND change_unit IS NOT NULL));

-- ── ۲) پرچمِ بازبینیِ وابسته‌ها ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.radar_review_flags (
  id             bigserial PRIMARY KEY,
  event_id       bigint NOT NULL REFERENCES public.radar_events(id) ON DELETE RESTRICT,
  -- چه نوع محاسبه‌ای مشکوک شد: 'quarterly' | 'monthly_rate' | 'fundamental_card' | …
  dependent_kind text NOT NULL CHECK (length(btrim(dependent_kind)) > 0),
  -- ارجاعِ دقیق به آن محاسبه (مثلاً نماد + دوره)
  dependent_ref  text NOT NULL CHECK (length(btrim(dependent_ref)) > 0),
  resolved_at    timestamptz,
  resolved_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (resolved_at IS NULL OR length(btrim(coalesce(resolved_note, ''))) >= 10)
);

COMMENT ON TABLE public.radar_review_flags IS
  'محاسبه‌هایی که یک اصلاحیه مشکوکشان کرده و باید بازبینی شوند.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_flag_target
  ON public.radar_review_flags (event_id, dependent_kind, dependent_ref);

CREATE INDEX IF NOT EXISTS idx_radar_flags_open
  ON public.radar_review_flags (created_at DESC) WHERE resolved_at IS NULL;

-- ── ۳) وضعیتِ «دیده‌شده» — به تفکیکِ کاربر ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.radar_seen (
  user_id  uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id bigint NOT NULL REFERENCES public.radar_events(id) ON DELETE CASCADE,
  seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

COMMENT ON TABLE public.radar_seen IS
  'کدام کاربر کدام رویداد را دیده. واقعیتِ کاربر است، نه واقعیتِ رویداد.';

-- ── ۴) گاردِ append-only روی رویدادها ───────────────────────────────────────
--
-- رویداد پس از ثبت تغییر نمی‌کند. تنها استثنا وجود ندارد: اصلاحِ یک هشدار
-- یعنی هشدارِ تازه با `supersedes_event_id`، نه بازنویسیِ قبلی.

CREATE OR REPLACE FUNCTION public.fn_radar_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'radar_events فقط افزودنی است (تلاش برای %)', TG_OP
    USING ERRCODE = 'PT409';
END $$;

DROP TRIGGER IF EXISTS trg_radar_events_immutable ON public.radar_events;
CREATE TRIGGER trg_radar_events_immutable
  BEFORE UPDATE OR DELETE ON public.radar_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_radar_events_immutable();

-- ── ۵) RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.radar_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_events       FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.radar_review_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_review_flags FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.radar_seen         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_seen         FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS radar_events_read ON public.radar_events;
CREATE POLICY radar_events_read ON public.radar_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS radar_flags_read ON public.radar_review_flags;
CREATE POLICY radar_flags_read ON public.radar_review_flags
  FOR SELECT TO authenticated USING (public.is_admin());

-- «دیده‌شده»: هر کاربر فقط ردیفِ خودش. سه سیاستِ جدا، چون سه عملِ جدا است.
DROP POLICY IF EXISTS radar_seen_own_read ON public.radar_seen;
CREATE POLICY radar_seen_own_read ON public.radar_seen
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS radar_seen_own_insert ON public.radar_seen;
CREATE POLICY radar_seen_own_insert ON public.radar_seen
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS radar_seen_own_delete ON public.radar_seen;
CREATE POLICY radar_seen_own_delete ON public.radar_seen
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── ۶) گرنت‌ها — REVOKE اول، بعد حداقلِ لازم ────────────────────────────────
--
-- درسِ `B-044`: `TRUNCATE` را RLS **فیلتر نمی‌کند** و تریگر هم شلیک نمی‌کند.
-- پس گاردِ append-only بالا بدونِ این بخش دور زدنی است.

REVOKE ALL ON TABLE public.radar_events       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.radar_review_flags FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.radar_seen         FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT                  ON TABLE public.radar_events       TO authenticated;
GRANT SELECT                  ON TABLE public.radar_review_flags TO authenticated;
GRANT SELECT, INSERT, DELETE  ON TABLE public.radar_seen         TO authenticated;

-- نویسندهٔ رویدادها فقط کارِ پس‌زمینه است. حذف ندارد، TRUNCATE ندارد.
GRANT SELECT, INSERT          ON TABLE public.radar_events       TO service_role;
GRANT SELECT, INSERT, UPDATE  ON TABLE public.radar_review_flags TO service_role;
GRANT SELECT                  ON TABLE public.radar_seen         TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.radar_events_id_seq       TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.radar_review_flags_id_seq TO service_role;

-- ── ۷) راستی‌آزماییِ پس از اجرا ─────────────────────────────────────────────
--
-- ادعای «گرنت‌ها درست‌اند» باید **اندازه‌گیری** شود، نه فرض. اگر
-- `ALTER DEFAULT PRIVILEGES` چیزی اضافه کرده باشد که REVOKE بالا نگرفته،
-- اینجا صدا می‌کند — نه شش ماه بعد.

DO $$
DECLARE
  t text;
  r text;
  p text;
  bad int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['radar_events', 'radar_review_flags'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        IF has_table_privilege(r, format('public.%I', t), p) THEN
          RAISE WARNING 'گرنتِ ناخواسته: % روی % دارای %', r, t, p;
          bad := bad + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- هیچ نقشی نباید TRUNCATE داشته باشد — حتی service_role.
  FOREACH t IN ARRAY ARRAY['radar_events', 'radar_review_flags', 'radar_seen'] LOOP
    IF has_table_privilege('service_role', format('public.%I', t), 'TRUNCATE') THEN
      RAISE WARNING 'گرنتِ ناخواسته: service_role روی % دارای TRUNCATE', t;
      bad := bad + 1;
    END IF;
  END LOOP;

  IF bad > 0 THEN
    RAISE EXCEPTION 'phase26: % گرنتِ خطرناک پس از اجرا باقی ماند', bad;
  END IF;
END $$;
