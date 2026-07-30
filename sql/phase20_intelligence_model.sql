-- =============================================================================
-- Phase 20 — مدلِ دادهٔ هوشمندیِ بازار (`G3-001`، ADR-005)
--
-- وضعیت: **NOT_APPLIED** — نه روی Production، نه روی Staging.
--         رجوع به docs/MIGRATION-LEDGER.md و docs/ADR/005-intelligence-data-model.md
--
-- پیش‌نیازِ اجرا: بسته‌شدنِ ریسک‌های Gate 2 (`DD-024`). این فایل عمداً فقط
-- **طراحی** است تا Command Center بتواند پیش از هر اجرایی بازبینی کند.
--
-- خواص:
--   • فقط جدولِ **تازه** می‌سازد؛ هیچ شیٔ موجودی را تغییر نمی‌دهد یا حذف نمی‌کند.
--   • idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`).
--   • هیچ Secret ندارد و نباید افزوده شود.
--   • کارنامهٔ عمومی (`signals` + `signal_outcomes`) **دست‌نخورده** می‌ماند؛
--     این مدل فقط به آن ارجاع می‌دهد و رقیبش نیست.
--
-- ⚠️ درسِ `G2-006` که اینجا از ابتدا اعمال شده: `REVOKE ALL … FROM anon`
--    کافی نیست. `authenticated` هم باید صریح پس گرفته شود، چون **RLS روی
--    `TRUNCATE` اعمال نمی‌شود** و یک کاربرِ عادی می‌تواند جدول را خالی کند.
-- =============================================================================

BEGIN;

-- ── ۰) کمکی‌های موجود ───────────────────────────────────────────────────────
-- `public.deny_mutation()` از `sql/phase7_watchlist_alerts.sql` می‌آید و دوباره
-- تعریف نمی‌شود. اگر روزی این فایل مستقل اجرا شد، آن را اول اجرا کن.

-- ── ۱) منبع ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intel_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('codal','telegram','news','official','market_data','manual')),
  name        TEXT NOT NULL,
  url         TEXT,
  trust_tier  TEXT NOT NULL DEFAULT 'unverified'
              CHECK (trust_tier IN ('primary','secondary','unverified')),
  -- `D-022` باز است؛ تا تصمیمِ آرش هیچ منبعی تأییدشده فرض نمی‌شود.
  approved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.intel_sources IS
  'منابعِ ورودیِ هوشمندی. approved=false تا تصمیمِ D-022 توسطِ آرش.';

-- ── ۲) شاهد ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intel_evidence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    UUID NOT NULL REFERENCES public.intel_sources(id),
  -- نقلِ کوتاه، نه کلِ متن: بازنشرِ کاملِ محتوای دیگران نه لازم است نه بی‌خطر.
  excerpt      TEXT NOT NULL CHECK (char_length(excerpt) BETWEEN 1 AND 2000),
  content_url  TEXT,
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intel_evidence_source  ON public.intel_evidence(source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_evidence_hash    ON public.intel_evidence(content_hash);

-- ── ۳) رخداد ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intel_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT NOT NULL CHECK (domain IN (
                'politics_geo','macro_ir','macro_global','fx_gold','equity_ir',
                'company_codal','fixed_income','commodity_funds','capital_risk','allocation')),
  title       TEXT NOT NULL,
  summary     TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('iran','global','sector','company')),
  symbol      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- نماد فقط وقتی معنا دارد که رخداد شرکتی باشد.
  CONSTRAINT intel_events_symbol_scope CHECK (symbol IS NULL OR scope = 'company')
);
CREATE INDEX IF NOT EXISTS idx_intel_events_domain ON public.intel_events(domain, occurred_at DESC);

-- ── ۴) تحلیل ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intel_analyses (
  id            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  seq           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain        TEXT NOT NULL CHECK (domain IN (
                  'politics_geo','macro_ir','macro_global','fx_gold','equity_ir',
                  'company_codal','fixed_income','commodity_funds','capital_risk','allocation')),
  title         TEXT NOT NULL,
  body_md       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending_approval','published','superseded')),
  -- `DD-023`: انتشارِ تحلیلِ حساس بدونِ تأییدِ انسانی ممنوع.
  approved_by   UUID,
  approved_at   TIMESTAMPTZ,
  decision_note JSONB,
  -- پل به کارنامهٔ موجود. کارنامهٔ عمومی همچنان فقط `signals` است.
  published_signal_ids UUID[] NOT NULL DEFAULT '{}',
  published_at  TIMESTAMPTZ,
  prev_hash     TEXT NOT NULL DEFAULT 'GENESIS',
  record_hash   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- منتشرشده بدونِ تأییدکننده یعنی حلقهٔ انسانی دور زده شده.
  CONSTRAINT intel_analyses_publish_needs_approval
    CHECK (status <> 'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
COMMENT ON TABLE public.intel_analyses IS
  'تحلیلِ سطحِ روایت (کلان/سیاست/ارز). سطحِ نماد در signals می‌ماند — این رقیبش نیست.';
CREATE INDEX IF NOT EXISTS idx_intel_analyses_status ON public.intel_analyses(status, created_at DESC);

-- ── ۵) ادعا: واقعیت / استنباط / سناریو ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intel_claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    UUID NOT NULL REFERENCES public.intel_analyses(id),
  event_id       UUID REFERENCES public.intel_events(id),
  -- **اجباری.** ادعای بی‌منبع در سطحِ اسکیما رد می‌شود، نه در سطحِ اپلیکیشن —
  -- چون لایهٔ اپلیکیشن همان جایی است که زیرِ فشار دور زده می‌شود.
  evidence_id    UUID NOT NULL REFERENCES public.intel_evidence(id),
  kind           TEXT NOT NULL CHECK (kind IN ('FACT','INFERENCE','SCENARIO')),
  statement      TEXT NOT NULL,
  confidence     INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  scenario_label TEXT CHECK (scenario_label IN ('پایه','خوش‌بینانه','بدبینانه')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- برچسبِ سناریو فقط برای سناریو؛ نه کمتر، نه بیشتر.
  CONSTRAINT intel_claims_scenario_label_consistent
    CHECK ((kind = 'SCENARIO') = (scenario_label IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_intel_claims_analysis ON public.intel_claims(analysis_id);
CREATE INDEX IF NOT EXISTS idx_intel_claims_kind     ON public.intel_claims(kind);

-- ── ۶) اثرِ موردانتظار بر بازار ─────────────────────────────────────────────
-- عمداً جدولِ جدا از رخداد: یک رخداد چند اثر دارد و هر اثر اطمینانِ خودش.
CREATE TABLE IF NOT EXISTS public.intel_effects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    UUID NOT NULL REFERENCES public.intel_analyses(id),
  event_id       UUID REFERENCES public.intel_events(id),
  target         TEXT NOT NULL CHECK (target IN ('asset_class','symbol','index','fx','commodity')),
  target_key     TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('up','down','unclear')),
  -- **باند، نه عدد.** هم قانونِ «بازه نه قیمتِ هدف»، هم امنیتِ مسیرِ آیندهٔ LLM.
  magnitude_band TEXT NOT NULL CHECK (magnitude_band IN ('low','medium','high')),
  horizon        TEXT,
  confidence     INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intel_effects_analysis ON public.intel_effects(analysis_id);

-- ── ۷) اثر بر سبدِ مرجع ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intel_portfolio_effects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         UUID NOT NULL REFERENCES public.intel_analyses(id),
  asset_class         TEXT NOT NULL,
  suggested_direction TEXT NOT NULL CHECK (suggested_direction IN ('increase','decrease','hold')),
  rationale           TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- وزنِ واقعیِ سبدِ مرجع — append-only.
-- ⚠️ این سبدِ **آرش** است، نه سبدِ کاربر. `portfolios` دست‌نخورده می‌ماند؛
-- قاطی‌کردنشان RLS مالکیتیِ کاربر را خراب می‌کند.
CREATE TABLE IF NOT EXISTS public.intel_reference_positions (
  id                 UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  seq                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_class        TEXT NOT NULL,
  weight_pct         NUMERIC NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
  reason_analysis_id UUID REFERENCES public.intel_analyses(id),
  -- **اجباری.** تغییرِ وزنِ بی‌دلیل همان چیزی است که کارنامه را بی‌ارزش می‌کند.
  reason_text        TEXT NOT NULL CHECK (char_length(reason_text) >= 1),
  effective_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ۸) اصلاح ───────────────────────────────────────────────────────────────
-- اصلاح **ردیفِ تازه** است، نه ویرایشِ ردیفِ قبلی.
CREATE TABLE IF NOT EXISTS public.intel_corrections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES public.intel_analyses(id),
  correction_md TEXT NOT NULL,
  reason        TEXT NOT NULL,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intel_corrections_analysis ON public.intel_corrections(analysis_id, created_at DESC);

-- ── ۹) append-only ─────────────────────────────────────────────────────────
-- تحلیلِ منتشرشده و ادعاهایش بازنویسی نمی‌شوند. اصلاح از راهِ
-- `intel_corrections` + `status='superseded'` انجام می‌شود.
--
-- توجه: `intel_analyses` پیش از انتشار باید قابلِ ویرایش باشد، پس UPDATE کامل
-- بسته نمی‌شود؛ فقط ردیفِ **منتشرشده** قفل می‌شود.
CREATE OR REPLACE FUNCTION public.intel_deny_published_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'تحلیل حذف نمی‌شود؛ از intel_corrections و status=superseded استفاده کن.';
  END IF;
  IF OLD.status = 'published' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'تحلیلِ منتشرشده بازنویسی نمی‌شود؛ فقط می‌تواند superseded شود.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_intel_analyses_append_only ON public.intel_analyses;
CREATE TRIGGER trg_intel_analyses_append_only
  BEFORE UPDATE OR DELETE ON public.intel_analyses
  FOR EACH ROW EXECUTE FUNCTION public.intel_deny_published_mutation();

-- این چهار جدول کاملاً append-only‌اند.
DROP TRIGGER IF EXISTS trg_intel_claims_append_only ON public.intel_claims;
CREATE TRIGGER trg_intel_claims_append_only
  BEFORE UPDATE OR DELETE ON public.intel_claims
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS trg_intel_effects_append_only ON public.intel_effects;
CREATE TRIGGER trg_intel_effects_append_only
  BEFORE UPDATE OR DELETE ON public.intel_effects
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS trg_intel_reference_positions_append_only ON public.intel_reference_positions;
CREATE TRIGGER trg_intel_reference_positions_append_only
  BEFORE UPDATE OR DELETE ON public.intel_reference_positions
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS trg_intel_corrections_append_only ON public.intel_corrections;
CREATE TRIGGER trg_intel_corrections_append_only
  BEFORE UPDATE OR DELETE ON public.intel_corrections
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

-- ── ۱۰) RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.intel_sources             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_evidence            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_analyses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_claims              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_effects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_portfolio_effects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_reference_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_corrections         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intel_sources','intel_evidence','intel_events','intel_analyses','intel_claims',
    'intel_effects','intel_portfolio_effects','intel_reference_positions','intel_corrections'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin manages %1$s" ON public.%1$I', t);
    EXECUTE format($f$
      CREATE POLICY "Admin manages %1$s" ON public.%1$I
        FOR ALL
        USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
    $f$, t);
  END LOOP;
END $$;

-- تحلیلِ **منتشرشده** برای همه خواندنی است؛ پیش‌نویس هرگز.
DROP POLICY IF EXISTS "Published analyses are public" ON public.intel_analyses;
CREATE POLICY "Published analyses are public" ON public.intel_analyses
  FOR SELECT USING (status = 'published');

-- ── ۱۱) گرنت‌ها — درسِ `G2-006` از ابتدا ────────────────────────────────────
-- `REVOKE … FROM anon` به‌تنهایی کافی نیست: `authenticated` هم باید صریح پس
-- گرفته شود، چون **RLS روی `TRUNCATE` اعمال نمی‌شود**.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intel_sources','intel_evidence','intel_events','intel_analyses','intel_claims',
    'intel_effects','intel_portfolio_effects','intel_reference_positions','intel_corrections'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',        t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon',          t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ادمین از نشستِ کاربر می‌خوانَد و می‌نویسد، پس نقشِ `authenticated` امتیازِ
-- جدولی لازم دارد؛ ولی هرگز `DELETE` و هرگز `TRUNCATE`. ردیف‌ها با RLS محدودند.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intel_sources','intel_evidence','intel_events','intel_analyses','intel_claims',
    'intel_effects','intel_portfolio_effects','intel_reference_positions','intel_corrections'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- تحلیلِ منتشرشده باید برای بازدیدکنندهٔ ناشناس خواندنی باشد — و **فقط** آن.
GRANT SELECT ON public.intel_analyses TO anon;

REVOKE ALL ON FUNCTION public.intel_deny_published_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intel_deny_published_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.intel_deny_published_mutation() FROM authenticated;

COMMIT;

-- =============================================================================
-- راستی‌آزمایی (پس از اجرا، دستی — بخشی از migration نیستند)
-- =============================================================================
-- ۱) هر نُه جدول ساخته شد؟
--    SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'intel\_%';  -- 9
-- ۲) RLS روی همه روشن است؟
--    SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname LIKE 'intel\_%' AND relkind='r';
-- ۳) anon فقط روی intel_analyses امتیاز دارد؟
--    SELECT table_name, privilege_type FROM information_schema.role_table_grants
--     WHERE grantee='anon' AND table_name LIKE 'intel\_%';
-- ۴) authenticated هیچ‌جا TRUNCATE/DELETE ندارد؟
--    SELECT has_table_privilege('authenticated','public.intel_analyses','TRUNCATE');  -- f
--    SELECT has_table_privilege('authenticated','public.intel_analyses','DELETE');    -- f
-- ۵) ادعای بی‌شاهد رد می‌شود؟
--    INSERT INTO public.intel_claims (analysis_id, kind, statement, confidence)
--    VALUES (…, 'FACT', 'x', 50);   -- انتظار: null value in column "evidence_id"
--
-- =============================================================================
-- برگشت (Rollback)
-- =============================================================================
-- فقط اگر جدول‌ها **خالی** باشند:
--
--   BEGIN;
--   DROP TABLE IF EXISTS public.intel_corrections;
--   DROP TABLE IF EXISTS public.intel_reference_positions;
--   DROP TABLE IF EXISTS public.intel_portfolio_effects;
--   DROP TABLE IF EXISTS public.intel_effects;
--   DROP TABLE IF EXISTS public.intel_claims;
--   DROP TABLE IF EXISTS public.intel_analyses;
--   DROP TABLE IF EXISTS public.intel_events;
--   DROP TABLE IF EXISTS public.intel_evidence;
--   DROP TABLE IF EXISTS public.intel_sources;
--   DROP FUNCTION IF EXISTS public.intel_deny_published_mutation();
--   COMMIT;
--
-- ⚠️ اگر تحلیلِ واقعیِ آرش داخلشان باشد `DROP` **ممنوع** است — همان قاعدهٔ
-- phase8b_leads: مسیر را ببند، داده را نگه دار.
-- =============================================================================
