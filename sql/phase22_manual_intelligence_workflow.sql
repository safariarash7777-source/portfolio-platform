-- =============================================================================
-- Phase 22 — Manual intelligence workflow and rehearsal ledger (G3-003)
--
-- STATUS
--   Staging (`oqjcvkzyvhqnphopedpn`) — APPLIED and re-measured, see
--     `docs/RUNBOOK-manual-intelligence.md`.
--   Production (`uooeygybrniptzdxuzhj`) — **NOT_APPLIED**. Production does not
--     yet carry `phase20`/`phase21` either; this file depends on both.
--
-- This is an *incremental* migration. It does not restate `phase20`; it
-- narrows and extends it. Three things change:
--
--   1. The analysis lifecycle grows two states — `approved_internal` and
--      `rejected` — and publication becomes reachable **only** through
--      `approved_internal`.
--   2. Every lifecycle transition is written to an append-only ledger by a
--      trigger, so the history is a by-product of the transition rather than
--      something the application is trusted to remember.
--   3. A rehearsal ledger records what actually happened on each real
--      rehearsal day.
--
-- ── The rule this file exists to enforce ────────────────────────────────────
-- `approved_internal` is **not** `published`. Arash approving an analysis for
-- internal use must never, by itself, put it in front of a customer. The two
-- are separated in three independent places, because one place is a single
-- point of failure:
--   • the CHECK constraint (`published_at` must be NULL while
--     `approved_internal`),
--   • the transition guard (`published` is reachable only from
--     `approved_internal`, and only with `published_at` set),
--   • the public read policy, which remains `status = 'published'` and is
--     therefore blind to both new states.
-- `lib/intelligence/workflow.test.ts` asserts all three separately, so
-- removing any one of them turns a test red rather than quietly widening
-- what the public can see.
-- =============================================================================

BEGIN;

-- ── 1) Lifecycle ────────────────────────────────────────────────────────────

ALTER TABLE public.intel_analyses
  DROP CONSTRAINT IF EXISTS intel_analyses_status_check;
ALTER TABLE public.intel_analyses
  ADD CONSTRAINT intel_analyses_status_check CHECK (
    status IN ('draft','pending_approval','approved_internal','rejected','published','superseded')
  );

-- `published_at` is the field that decides whether the public read policy can
-- ever see a row, so it is constrained per state rather than left to the app.
-- Note the middle clause: an internally approved analysis carries an approver
-- **and** a NULL `published_at`. That is what makes "approved but not public"
-- a representable, checkable state instead of a convention.
ALTER TABLE public.intel_analyses
  DROP CONSTRAINT IF EXISTS intel_analyses_publication_consistent;
ALTER TABLE public.intel_analyses
  ADD CONSTRAINT intel_analyses_publication_consistent CHECK (
    (status NOT IN ('published','superseded')
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL))
    AND (status <> 'approved_internal'
      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NULL))
    AND (status NOT IN ('draft','pending_approval','rejected')
      OR published_at IS NULL)
  );

-- The daily brief is an analysis, not a parallel object. Giving it a date
-- column keeps one engine and one approval path; a second table would have
-- meant a second lifecycle to keep honest.
ALTER TABLE public.intel_analyses ADD COLUMN IF NOT EXISTS brief_date date;
ALTER TABLE public.intel_analyses ADD COLUMN IF NOT EXISTS review_note text;

-- One live brief per day. Rejected and superseded briefs are excluded, so a
-- rejected brief can be replaced the same day without the index blocking it.
DROP INDEX IF EXISTS public.intel_analyses_one_live_brief_per_day;
CREATE UNIQUE INDEX intel_analyses_one_live_brief_per_day
  ON public.intel_analyses (brief_date)
  WHERE brief_date IS NOT NULL AND status NOT IN ('rejected','superseded');

CREATE INDEX IF NOT EXISTS intel_analyses_status_brief_idx
  ON public.intel_analyses (status, brief_date DESC);

-- ── 2) Workflow ledger ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intel_workflow_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.intel_analyses(id),
  event       text NOT NULL CHECK (event IN (
                'captured','submitted','approved_internal','rejected',
                'returned_to_draft','published','superseded')),
  -- Deliberately nullable. A write that reaches here without an authenticated
  -- caller (service_role) has **no** actor, and recording NULL is the honest
  -- answer. Defaulting to some placeholder id would fabricate provenance in
  -- the one table whose entire purpose is provenance.
  actor_id    uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  note        text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intel_workflow_events_analysis_idx
  ON public.intel_workflow_events (analysis_id, occurred_at DESC);

-- ── 3) Rehearsal ledger ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intel_rehearsal_days (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rehearsal_date       date NOT NULL UNIQUE,
  day_index            integer NOT NULL CHECK (day_index > 0),
  brief_analysis_id    uuid REFERENCES public.intel_analyses(id),
  brief_produced       boolean NOT NULL,
  minutes_to_approval  integer CHECK (minutes_to_approval IS NULL OR minutes_to_approval >= 0),
  -- Names, not counts. "Three sources were stale" cannot be acted on; "these
  -- three were stale" can. An empty array means measured-and-none; it is not
  -- the same as the day never being recorded, which is the row's absence.
  absent_sources       text[] NOT NULL DEFAULT '{}',
  stale_sources        text[] NOT NULL DEFAULT '{}',
  human_corrections    integer NOT NULL DEFAULT 0 CHECK (human_corrections >= 0),
  rejected_conclusions integer NOT NULL DEFAULT 0 CHECK (rejected_conclusions >= 0),
  missed_events        integer NOT NULL DEFAULT 0 CHECK (missed_events >= 0),
  followup_note        text,
  sealed_at            timestamptz,
  recorded_by          uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- A day with no brief cannot carry a production time or a brief reference.
  -- Without this, "no brief today" and "brief produced in 0 minutes" would be
  -- storable as the same row.
  CONSTRAINT intel_rehearsal_days_brief_consistent CHECK (
    (brief_produced = false AND brief_analysis_id IS NULL AND minutes_to_approval IS NULL)
    OR (brief_produced = true AND brief_analysis_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS intel_rehearsal_days_date_idx
  ON public.intel_rehearsal_days (rehearsal_date DESC);

-- ── 4) Transition guard ─────────────────────────────────────────────────────
--
-- Replaces the `phase20` guard. Two behaviours are new and both are
-- restrictions, not permissions:
--   • `pending_approval → published` no longer exists. Publication is
--     reachable only from `approved_internal`.
--   • Content is editable only while `draft`. Previously a row under review
--     could be rewritten underneath the reviewer.
CREATE OR REPLACE FUNCTION public.intel_guard_analysis_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_changed_other boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analyses cannot be deleted';
  END IF;

  -- Everything except `status`, `review_note` and the bookkeeping timestamps.
  -- `updated_at` is excluded because this trigger sets it itself.
  v_changed_other := (to_jsonb(NEW) - 'status' - 'review_note' - 'updated_at'
                        - 'approved_by' - 'approved_at' - 'published_at')
                  IS DISTINCT FROM
                     (to_jsonb(OLD) - 'status' - 'review_note' - 'updated_at'
                        - 'approved_by' - 'approved_at' - 'published_at');

  IF OLD.status IN ('published','superseded') THEN
    IF NOT (OLD.status = 'published' AND NEW.status = 'superseded'
            AND (to_jsonb(NEW) - 'status' - 'updated_at')
                = (to_jsonb(OLD) - 'status' - 'updated_at')) THEN
      RAISE EXCEPTION 'published analyses are immutable; only status may become superseded';
    END IF;
  END IF;

  IF NEW.status = OLD.status THEN
    IF v_changed_other AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only a draft analysis may be edited; status is %', OLD.status;
    END IF;
  ELSE
    IF NOT (
         (OLD.status = 'draft'             AND NEW.status = 'pending_approval')
      OR (OLD.status = 'pending_approval'  AND NEW.status IN ('approved_internal','rejected','draft'))
      OR (OLD.status = 'rejected'          AND NEW.status = 'draft')
      OR (OLD.status = 'approved_internal' AND NEW.status IN ('published','draft'))
      OR (OLD.status = 'published'         AND NEW.status = 'superseded')
    ) THEN
      RAISE EXCEPTION 'illegal analysis transition % → %', OLD.status, NEW.status;
    END IF;
    IF v_changed_other THEN
      RAISE EXCEPTION 'a status transition may not also change the analysis content';
    END IF;
  END IF;

  -- Internal approval is the real human gate, so the evidence requirement sits
  -- here rather than at publication. By the time something is approved for
  -- internal use it must already be defensible.
  IF NEW.status = 'approved_internal' AND OLD.status <> 'approved_internal' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'internal approval requires an approver and a timestamp';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.intel_claims WHERE analysis_id = OLD.id) THEN
      RAISE EXCEPTION 'an approved analysis requires at least one claim';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.intel_claims c
      WHERE c.analysis_id = OLD.id
        AND NOT EXISTS (SELECT 1 FROM public.intel_claim_evidence ce WHERE ce.claim_id = c.id)
    ) THEN
      RAISE EXCEPTION 'every claim of an approved analysis requires evidence';
    END IF;
  END IF;

  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    IF OLD.status <> 'approved_internal' THEN
      RAISE EXCEPTION 'analysis must be approved_internal before publication';
    END IF;
    IF NEW.published_at IS NULL THEN
      RAISE EXCEPTION 'publication requires a publication timestamp';
    END IF;
  END IF;

  -- Returning to draft clears the approval, otherwise a rewritten draft would
  -- still be carrying the signature of an approval given to the old text.
  IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.published_at := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ── 5) The ledger writes itself ─────────────────────────────────────────────
--
-- An AFTER trigger, not an application call. If the route forgot to log — or
-- chose not to — the history would silently have a hole exactly where it
-- matters most. Here the transition and its record are the same transaction.
CREATE OR REPLACE FUNCTION public.intel_record_workflow_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'captured';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status
      WHEN 'pending_approval'  THEN 'submitted'
      WHEN 'approved_internal' THEN 'approved_internal'
      WHEN 'rejected'          THEN 'rejected'
      WHEN 'draft'             THEN 'returned_to_draft'
      WHEN 'published'         THEN 'published'
      WHEN 'superseded'        THEN 'superseded'
    END;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.intel_workflow_events (analysis_id, event, actor_id, note)
  VALUES (NEW.id, v_event, auth.uid(), NEW.review_note);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_intel_analyses_workflow_log ON public.intel_analyses;
CREATE TRIGGER trg_intel_analyses_workflow_log
AFTER INSERT OR UPDATE ON public.intel_analyses
FOR EACH ROW EXECUTE FUNCTION public.intel_record_workflow_event();

-- ── 6) Rehearsal guard ──────────────────────────────────────────────────────
--
-- A rehearsal day may be corrected while it is still open, because a metric
-- noticed an hour later is still a real metric. Once sealed it is frozen, and
-- the date and ordinal never move — those are what make the ten days countable.
CREATE OR REPLACE FUNCTION public.intel_guard_rehearsal_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rehearsal days cannot be deleted';
  END IF;
  IF OLD.sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'rehearsal day % is sealed', OLD.rehearsal_date;
  END IF;
  IF NEW.rehearsal_date IS DISTINCT FROM OLD.rehearsal_date
     OR NEW.day_index IS DISTINCT FROM OLD.day_index THEN
    RAISE EXCEPTION 'the date and ordinal of a rehearsal day are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_intel_rehearsal_days_guard ON public.intel_rehearsal_days;
CREATE TRIGGER trg_intel_rehearsal_days_guard
BEFORE UPDATE OR DELETE ON public.intel_rehearsal_days
FOR EACH ROW EXECUTE FUNCTION public.intel_guard_rehearsal_day();

-- The workflow ledger is append-only for everyone, including the role that
-- wrote it. `phase20`'s shared guard already raises on UPDATE and DELETE.
DROP TRIGGER IF EXISTS trg_intel_workflow_events_immutable ON public.intel_workflow_events;
CREATE TRIGGER trg_intel_workflow_events_immutable
BEFORE UPDATE OR DELETE ON public.intel_workflow_events
FOR EACH ROW EXECUTE FUNCTION public.intel_deny_mutation();

-- ── 7) Publication RPC follows the new gate ─────────────────────────────────
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
  -- Was `pending_approval`. Publication now requires that a human has already
  -- approved the analysis for internal use in a separate, earlier act.
  IF NOT FOUND OR result.status <> 'approved_internal' THEN
    RAISE EXCEPTION 'analysis must be approved_internal';
  END IF;

  UPDATE public.intel_analyses
  SET status = 'published', published_at = now()
  WHERE id = p_analysis_id
  RETURNING * INTO result;
  RETURN result;
END $$;

-- ── 7b) Atomic capture ──────────────────────────────────────────────────────
--
-- چرا این تابع لازم است: کلاینتِ Supabase تراکنشِ چندعبارتی ندارد. اگر مسیرِ
-- API پنج `INSERT` جدا بفرستد، شکستِ عبارتِ چهارم یک **بستهٔ نصفه** به‌جا
-- می‌گذارد — منبع و شاهدی که به هیچ تحلیلی وصل نیستند. بدتر از خطا این است که
-- آن باقی‌ماندهٔ بی‌صاحب بعداً شبیهِ دادهٔ واقعی به‌نظر برسد.
--
-- `content_hash` عمداً ورودی است و اینجا ساخته نمی‌شود: سمتِ سرور در Node
-- محاسبه می‌شود تا کلاینت هرگز نتواند آن را تعیین کند و این تابع هم به افزونهٔ
-- `pgcrypto` گره نخورد.
CREATE OR REPLACE FUNCTION public.capture_intel_package(
  p_source   jsonb,
  p_evidence jsonb,
  p_event    jsonb,
  p_analysis jsonb,
  p_claims   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_source uuid; v_evidence uuid; v_event uuid; v_analysis uuid; v_claim uuid;
  v_item jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF jsonb_array_length(p_claims) = 0 THEN
    RAISE EXCEPTION 'a package needs at least one claim';
  END IF;

  -- منبع می‌تواند از قبل وجود داشته باشد؛ ساختنِ دوبارهٔ «بانک مرکزی» در هر
  -- ثبت، فهرستِ منابع را ظرفِ یک هفته بی‌معنا می‌کند.
  IF p_source ? 'id' THEN
    v_source := (p_source->>'id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.intel_sources WHERE id = v_source) THEN
      RAISE EXCEPTION 'source not found';
    END IF;
  ELSE
    INSERT INTO public.intel_sources(kind, name, url, trust_tier)
    VALUES (p_source->>'kind', p_source->>'name', p_source->>'url',
            COALESCE(p_source->>'trust_tier', 'unverified'))
    RETURNING id INTO v_source;
  END IF;

  INSERT INTO public.intel_evidence(source_id, excerpt, content_url, observed_at, published_at, content_hash)
  VALUES (v_source, p_evidence->>'excerpt', p_evidence->>'content_url',
          (p_evidence->>'observed_at')::timestamptz,
          NULLIF(p_evidence->>'published_at','')::timestamptz,
          p_evidence->>'content_hash')
  RETURNING id INTO v_evidence;

  IF p_event IS NOT NULL AND p_event <> 'null'::jsonb THEN
    INSERT INTO public.intel_events(domain, title, summary, occurred_at, scope, symbol)
    VALUES (p_event->>'domain', p_event->>'title', p_event->>'summary',
            (p_event->>'occurred_at')::timestamptz, p_event->>'scope',
            NULLIF(p_event->>'symbol',''))
    RETURNING id INTO v_event;
  END IF;

  INSERT INTO public.intel_analyses(domain, title, body_md, brief_date)
  VALUES (p_analysis->>'domain', p_analysis->>'title', p_analysis->>'body_md',
          NULLIF(p_analysis->>'brief_date','')::date)
  RETURNING id INTO v_analysis;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_claims) LOOP
    INSERT INTO public.intel_claims(analysis_id, event_id, kind, statement, confidence, scenario_label)
    VALUES (v_analysis, v_event, v_item->>'kind', v_item->>'statement',
            (v_item->>'confidence')::integer, NULLIF(v_item->>'scenario_label',''))
    RETURNING id INTO v_claim;
    -- هر گزاره از همان ابتدا به شاهد گره می‌خورد. اگر این پیوند به بعد موکول
    -- شود، تأییدِ داخلی به گزاره‌های بی‌شاهد برخورد می‌کند و کاربر نمی‌فهمد چرا.
    INSERT INTO public.intel_claim_evidence(claim_id, evidence_id) VALUES (v_claim, v_evidence);
  END LOOP;

  RETURN v_analysis;
END $$;

CREATE OR REPLACE FUNCTION public.seal_rehearsal_day(p_day_id uuid)
RETURNS public.intel_rehearsal_days
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE result public.intel_rehearsal_days;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;
  UPDATE public.intel_rehearsal_days
  SET sealed_at = now()
  WHERE id = p_day_id AND sealed_at IS NULL
  RETURNING * INTO result;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rehearsal day not found or already sealed';
  END IF;
  RETURN result;
END $$;

-- ── 8) RLS and privileges ───────────────────────────────────────────────────
--
-- Same shape as `phase20`, and the same `B-034` lesson: `service_role` is
-- revoked explicitly, not just the public roles. TRUNCATE does not fire
-- triggers, so a role holding it would walk straight past every guard above.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['intel_workflow_events','intel_rehearsal_days'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'intel_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin'')) '
      'WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))',
      'intel_admin_all', t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', t);
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO service_role', t);
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

-- Only the rehearsal ledger has a legitimate second step (correcting an open
-- day, then sealing it). The workflow ledger has none, so UPDATE is granted to
-- nobody at all — not even the server.
GRANT UPDATE ON public.intel_rehearsal_days TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.intel_guard_rehearsal_day() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intel_record_workflow_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_rehearsal_day(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seal_rehearsal_day(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.capture_intel_package(jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_intel_package(jsonb,jsonb,jsonb,jsonb,jsonb) TO authenticated, service_role;

COMMIT;

-- ── Verification probes (read-only; run separately, never inside the tx) ─────
--  1) SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conrelid = 'public.intel_analyses'::regclass AND contype = 'c';
--  2) SELECT has_table_privilege('anon','public.intel_workflow_events','SELECT');   -- f
--  3) SELECT has_table_privilege('service_role','public.intel_workflow_events','UPDATE'); -- f
--  4) SELECT has_table_privilege('service_role','public.intel_workflow_events','DELETE'); -- f
--  5) SELECT has_table_privilege('service_role','public.intel_rehearsal_days','DELETE');  -- f
--  6) SELECT polname, polqual FROM pg_policy
--       WHERE polrelid = 'public.intel_analyses'::regclass;  -- public read still = 'published'
