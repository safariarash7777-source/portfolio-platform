-- =============================================================================
-- Phase 20 — Market-intelligence data model (G3-001, ADR-005)
-- STATUS: NOT_APPLIED — design and CI rehearsal only.
--
-- This migration adds the upstream intelligence ledger. Existing public track
-- record tables (`signals`, `signal_outcomes`) and the existing allocation
-- engine remain the source of truth for their domains.
-- =============================================================================

BEGIN;

-- Dedicated guard: this migration is self-contained and does not depend on the
-- deployment order of older phase files.
CREATE OR REPLACE FUNCTION public.intel_deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'intelligence ledger rows are append-only';
END $$;

CREATE TABLE IF NOT EXISTS public.intel_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('codal','telegram','instagram','news','official','market_data','manual')),
  name         text NOT NULL,
  url          text,
  trust_tier   text NOT NULL DEFAULT 'unverified' CHECK (trust_tier IN ('primary','secondary','unverified')),
  approved     boolean NOT NULL DEFAULT false,
  approved_by  uuid REFERENCES public.profiles(id),
  approved_at  timestamptz,
  created_by   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_sources_approval_consistent CHECK (
    (approved = false AND approved_by IS NULL AND approved_at IS NULL)
    OR (approved = true AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.intel_evidence (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    uuid NOT NULL REFERENCES public.intel_sources(id),
  excerpt      text NOT NULL CHECK (char_length(excerpt) BETWEEN 1 AND 2000),
  content_url  text,
  observed_at  timestamptz NOT NULL,
  published_at timestamptz,
  content_hash text NOT NULL CHECK (char_length(content_hash) >= 16),
  created_by   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS public.intel_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      text NOT NULL CHECK (domain IN (
                'politics_geo','macro_ir','macro_global','fx_gold','equity_ir',
                'company_codal','fixed_income','commodity_funds','capital_risk','allocation')),
  title       text NOT NULL,
  summary     text,
  occurred_at timestamptz NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('iran','global','sector','company')),
  symbol      text,
  created_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_events_symbol_scope CHECK (symbol IS NULL OR scope = 'company')
);

CREATE TABLE IF NOT EXISTS public.intel_analyses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text NOT NULL CHECK (domain IN (
                  'politics_geo','macro_ir','macro_global','fx_gold','equity_ir',
                  'company_codal','fixed_income','commodity_funds','capital_risk','allocation')),
  title         text NOT NULL,
  body_md       text NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','published','superseded')),
  decision_note jsonb,
  created_by    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  approved_by   uuid REFERENCES public.profiles(id),
  approved_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_analyses_publication_consistent CHECK (
    status NOT IN ('published','superseded')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.intel_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    uuid NOT NULL REFERENCES public.intel_analyses(id),
  event_id       uuid REFERENCES public.intel_events(id),
  kind           text NOT NULL CHECK (kind IN ('FACT','INFERENCE','SCENARIO')),
  statement      text NOT NULL,
  confidence     integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  scenario_label text CHECK (scenario_label IN ('base','upside','downside')),
  created_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_claims_scenario_consistent
    CHECK ((kind = 'SCENARIO') = (scenario_label IS NOT NULL))
);

-- A claim can rely on several independent sources. Evidence is never stored in
-- an array, so referential integrity remains enforceable.
CREATE TABLE IF NOT EXISTS public.intel_claim_evidence (
  claim_id    uuid NOT NULL REFERENCES public.intel_claims(id),
  evidence_id uuid NOT NULL REFERENCES public.intel_evidence(id),
  linked_by   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS public.intel_effects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    uuid NOT NULL REFERENCES public.intel_analyses(id),
  event_id       uuid REFERENCES public.intel_events(id),
  target         text NOT NULL CHECK (target IN ('asset_class','symbol','index','fx','commodity')),
  target_key     text NOT NULL,
  direction      text NOT NULL CHECK (direction IN ('up','down','unclear')),
  magnitude_band text NOT NULL CHECK (magnitude_band IN ('low','medium','high')),
  horizon        text NOT NULL CHECK (horizon IN ('intraday','short_term','medium_term','long_term','structural')),
  confidence     integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  created_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intel_portfolio_effects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         uuid NOT NULL REFERENCES public.intel_analyses(id),
  asset_class         text NOT NULL CHECK (asset_class IN (
                        'equity_ir','gold','fx','fixed_income','commodity_fund','commodity_certificate','cash')),
  suggested_direction text NOT NULL CHECK (suggested_direction IN ('increase','decrease','hold')),
  horizon             text NOT NULL CHECK (horizon IN ('intraday','short_term','medium_term','long_term','structural')),
  confidence          integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  rationale           text NOT NULL,
  created_by          uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, asset_class, horizon)
);

-- Relational bridge to the existing immutable public track record.
CREATE TABLE IF NOT EXISTS public.intel_analysis_signals (
  analysis_id uuid NOT NULL REFERENCES public.intel_analyses(id),
  signal_id   uuid NOT NULL REFERENCES public.signals(id),
  linked_by   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (analysis_id, signal_id)
);

-- Provenance stores metadata and hashes only; it deliberately stores neither
-- raw financial data nor raw prompts.
CREATE TABLE IF NOT EXISTS public.intel_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin             text NOT NULL CHECK (origin IN ('human','agent')),
  actor_id           uuid REFERENCES public.profiles(id),
  model_provider     text,
  model_name         text,
  model_version      text,
  prompt_hash        text,
  config_hash        text,
  status             text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','rejected')),
  output_analysis_id uuid REFERENCES public.intel_analyses(id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_runs_origin_consistent CHECK (
    (origin = 'human' AND actor_id IS NOT NULL AND model_provider IS NULL AND model_name IS NULL
      AND model_version IS NULL AND prompt_hash IS NULL AND config_hash IS NULL)
    OR
    (origin = 'agent' AND model_provider IS NOT NULL AND model_name IS NOT NULL
      AND model_version IS NOT NULL AND prompt_hash IS NOT NULL AND config_hash IS NOT NULL)
  ),
  CONSTRAINT intel_runs_completion_consistent CHECK (
    (status IN ('queued','running') AND completed_at IS NULL)
    OR (status IN ('succeeded','failed','rejected') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.intel_run_inputs (
  run_id      uuid NOT NULL REFERENCES public.intel_runs(id),
  evidence_id uuid REFERENCES public.intel_evidence(id),
  event_id    uuid REFERENCES public.intel_events(id),
  analysis_id uuid REFERENCES public.intel_analyses(id),
  claim_id    uuid REFERENCES public.intel_claims(id),
  linked_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_run_inputs_exactly_one CHECK (
    num_nonnulls(evidence_id, event_id, analysis_id, claim_id) = 1
  ),
  UNIQUE NULLS NOT DISTINCT (run_id, evidence_id, event_id, analysis_id, claim_id)
);

-- Reference allocation is versioned. A version is editable only while draft;
-- finalization atomically validates a complete 100% allocation.
CREATE TABLE IF NOT EXISTS public.intel_reference_portfolios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  base_currency text NOT NULL DEFAULT 'IRR',
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intel_reference_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id       uuid NOT NULL REFERENCES public.intel_reference_portfolios(id),
  version_no         integer NOT NULL CHECK (version_no > 0),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  effective_at       timestamptz NOT NULL,
  reason_analysis_id uuid REFERENCES public.intel_analyses(id),
  reason_text        text NOT NULL CHECK (char_length(reason_text) > 0),
  created_by         uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  finalized_by       uuid REFERENCES public.profiles(id),
  finalized_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, version_no),
  CONSTRAINT intel_reference_versions_finalized_consistent CHECK (
    (status = 'draft' AND finalized_by IS NULL AND finalized_at IS NULL)
    OR (status = 'finalized' AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.intel_reference_positions (
  version_id  uuid NOT NULL REFERENCES public.intel_reference_versions(id),
  asset_class text NOT NULL CHECK (asset_class IN (
                'equity_ir','gold','fx','fixed_income','commodity_fund','commodity_certificate','cash')),
  weight_pct  numeric(7,4) NOT NULL CHECK (weight_pct > 0 AND weight_pct <= 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, asset_class)
);

CREATE TABLE IF NOT EXISTS public.intel_corrections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id             uuid NOT NULL REFERENCES public.intel_analyses(id),
  replacement_analysis_id uuid REFERENCES public.intel_analyses(id),
  correction_md           text NOT NULL,
  reason                  text NOT NULL,
  created_by              uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_corrections_not_self CHECK (replacement_analysis_id IS DISTINCT FROM analysis_id)
);

-- ── Integrity triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.intel_guard_analysis_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analyses cannot be deleted';
  END IF;

  IF OLD.status IN ('published','superseded') THEN
    IF NOT (
      OLD.status = 'published' AND NEW.status = 'superseded'
      AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')
    ) THEN
      RAISE EXCEPTION 'published analyses are immutable; only status may become superseded';
    END IF;
  END IF;
  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    IF OLD.status <> 'pending_approval' THEN
      RAISE EXCEPTION 'analysis must be pending_approval before publication';
    END IF;
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.published_at IS NULL THEN
      RAISE EXCEPTION 'publication requires approver and timestamps';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.intel_claims WHERE analysis_id = OLD.id) THEN
      RAISE EXCEPTION 'published analysis requires at least one claim';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.intel_claims c
      WHERE c.analysis_id = OLD.id
        AND NOT EXISTS (SELECT 1 FROM public.intel_claim_evidence ce WHERE ce.claim_id = c.id)
    ) THEN
      RAISE EXCEPTION 'every published claim requires evidence';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.intel_guard_reference_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'finalized portfolio versions are immutable';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'finalized portfolio versions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.intel_guard_reference_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.intel_reference_versions
  WHERE id = COALESCE(NEW.version_id, OLD.version_id)
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'positions of a finalized portfolio version are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_intel_analyses_guard ON public.intel_analyses;
CREATE TRIGGER trg_intel_analyses_guard BEFORE UPDATE OR DELETE ON public.intel_analyses
FOR EACH ROW EXECUTE FUNCTION public.intel_guard_analysis_mutation();

DROP TRIGGER IF EXISTS trg_intel_reference_versions_guard ON public.intel_reference_versions;
CREATE TRIGGER trg_intel_reference_versions_guard BEFORE UPDATE OR DELETE ON public.intel_reference_versions
FOR EACH ROW EXECUTE FUNCTION public.intel_guard_reference_version();

DROP TRIGGER IF EXISTS trg_intel_reference_positions_guard ON public.intel_reference_positions;
CREATE TRIGGER trg_intel_reference_positions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.intel_reference_positions
FOR EACH ROW EXECUTE FUNCTION public.intel_guard_reference_position();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'intel_evidence','intel_events','intel_claims','intel_claim_evidence',
    'intel_effects','intel_portfolio_effects','intel_analysis_signals',
    'intel_run_inputs','intel_corrections'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || table_name || '_immutable', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.intel_deny_mutation()',
      'trg_' || table_name || '_immutable', table_name
    );
  END LOOP;
END $$;

-- ── Controlled transitions ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_intel_analysis(p_analysis_id uuid)
RETURNS public.intel_analyses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE result public.intel_analyses;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin approval required';
  END IF;

  SELECT * INTO result FROM public.intel_analyses
  WHERE id = p_analysis_id FOR UPDATE;
  IF NOT FOUND OR result.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'analysis must be pending_approval';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intel_claims WHERE analysis_id = p_analysis_id) THEN
    RAISE EXCEPTION 'published analysis requires at least one claim';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.intel_claims c
    WHERE c.analysis_id = p_analysis_id
      AND NOT EXISTS (SELECT 1 FROM public.intel_claim_evidence ce WHERE ce.claim_id = c.id)
  ) THEN
    RAISE EXCEPTION 'every published claim requires evidence';
  END IF;

  UPDATE public.intel_analyses
  SET status = 'published', approved_by = auth.uid(), approved_at = now(), published_at = now()
  WHERE id = p_analysis_id
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_reference_version(p_version_id uuid)
RETURNS public.intel_reference_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  result public.intel_reference_versions;
  position_count integer;
  weight_sum numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin approval required';
  END IF;
  SELECT * INTO result FROM public.intel_reference_versions
  WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND OR result.status <> 'draft' THEN
    RAISE EXCEPTION 'portfolio version must be draft';
  END IF;
  SELECT count(*), COALESCE(sum(weight_pct), 0)
  INTO position_count, weight_sum
  FROM public.intel_reference_positions WHERE version_id = p_version_id;
  IF position_count = 0 OR weight_sum <> 100.0000 THEN
    RAISE EXCEPTION 'final allocation must contain positions totaling exactly 100%%';
  END IF;
  UPDATE public.intel_reference_versions
  SET status = 'finalized', finalized_by = auth.uid(), finalized_at = now()
  WHERE id = p_version_id
  RETURNING * INTO result;
  RETURN result;
END $$;

-- ── RLS and explicit privileges ─────────────────────────────────────────────
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'intel_sources','intel_evidence','intel_events','intel_analyses','intel_claims',
    'intel_claim_evidence','intel_effects','intel_portfolio_effects',
    'intel_analysis_signals','intel_runs','intel_run_inputs',
    'intel_reference_portfolios','intel_reference_versions',
    'intel_reference_positions','intel_corrections'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'intel_admin_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin'')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))',
      'intel_admin_all', table_name
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS intel_public_read_published ON public.intel_analyses;
CREATE POLICY intel_public_read_published ON public.intel_analyses
FOR SELECT TO anon, authenticated USING (status = 'published');

GRANT SELECT ON public.intel_analyses TO anon;
GRANT SELECT ON public.intel_sources, public.intel_evidence, public.intel_events,
  public.intel_analyses, public.intel_claims, public.intel_claim_evidence,
  public.intel_effects, public.intel_portfolio_effects, public.intel_analysis_signals,
  public.intel_runs, public.intel_run_inputs, public.intel_reference_portfolios,
  public.intel_reference_versions, public.intel_reference_positions,
  public.intel_corrections TO authenticated;
GRANT INSERT ON public.intel_sources, public.intel_evidence, public.intel_events,
  public.intel_analyses, public.intel_claims, public.intel_claim_evidence,
  public.intel_effects, public.intel_portfolio_effects, public.intel_analysis_signals,
  public.intel_runs, public.intel_run_inputs, public.intel_reference_portfolios,
  public.intel_reference_versions, public.intel_reference_positions,
  public.intel_corrections TO authenticated;
GRANT UPDATE ON public.intel_sources, public.intel_analyses,
  public.intel_runs, public.intel_reference_portfolios,
  public.intel_reference_versions, public.intel_reference_positions TO authenticated;

REVOKE ALL ON FUNCTION public.intel_deny_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intel_guard_analysis_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intel_guard_reference_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intel_guard_reference_position() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_intel_analysis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_reference_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_intel_analysis(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_reference_version(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_intel_evidence_source ON public.intel_evidence(source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_events_domain ON public.intel_events(domain, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_analyses_status ON public.intel_analyses(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_claims_analysis ON public.intel_claims(analysis_id);
CREATE INDEX IF NOT EXISTS idx_intel_runs_status ON public.intel_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_versions_portfolio ON public.intel_reference_versions(portfolio_id, version_no DESC);

COMMIT;

