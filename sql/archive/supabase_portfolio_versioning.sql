-- ════════════════════════════════════════════════════════════════════════
-- فاز ۰ — ایمنی دادهٔ پرتفوی: نسخه‌دارِ append-only + audit_log
-- ADDITIVE & non-destructive. Does NOT touch existing tables/columns.
-- All portfolio writes funnel through save_portfolio() (SECURITY DEFINER),
-- so versioning + audit can't be bypassed and actor identity can't be forged.
-- Idempotent: safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ───────────────────────────────────────────────────────────
-- Append-only version history. user_id is a plain uuid (no FK cascade) so
-- history is RETAINED even if an auth user is removed, and the append-only
-- triggers below never block user deletion.
CREATE TABLE IF NOT EXISTS public.portfolio_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  version     int  NOT NULL,
  allocations jsonb NOT NULL,
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
CREATE INDEX IF NOT EXISTS idx_pv_user_version ON public.portfolio_versions(user_id, version DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       uuid,
  action         text NOT NULL,
  entity         text NOT NULL,
  target_user_id uuid,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON public.audit_log(target_user_id, created_at DESC);

-- ── 2. Append-only enforcement (block UPDATE/DELETE at the table level) ──
CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $$;

DROP TRIGGER IF EXISTS no_mutation ON public.audit_log;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

DROP TRIGGER IF EXISTS no_mutation ON public.portfolio_versions;
CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE ON public.portfolio_versions
  FOR EACH ROW EXECUTE FUNCTION public.deny_mutation();

-- ── 3. RLS — read-only for the right people; all writes via the function ─
ALTER TABLE public.portfolio_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('portfolio_versions','audit_log')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- A user can read their own versions; admins can read everyone's.
CREATE POLICY "pv_self_read" ON public.portfolio_versions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- audit_log is admin-only to read; never readable by normal users.
CREATE POLICY "audit_admin_read" ON public.audit_log
  FOR SELECT USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policies on either table → only the SECURITY DEFINER
-- function (and service_role) can write. Clients cannot insert directly.

-- ── 4. The single write path: save_portfolio() ─────────────────────────
CREATE OR REPLACE FUNCTION public.save_portfolio(
  p_user_id     uuid,
  p_allocations jsonb,
  p_notes       text
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_next   int;
  v_before jsonb;
  v_after  jsonb;
BEGIN
  -- Only admins may assign portfolios. actor identity comes from the session.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: تنها مدیر می‌تواند پرتفوی ثبت کند.';
  END IF;

  -- Serialize concurrent saves for the same user (avoids version races).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT to_jsonb(p) INTO v_before FROM public.portfolios p WHERE p.user_id = p_user_id;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.portfolio_versions WHERE user_id = p_user_id;

  INSERT INTO public.portfolio_versions (user_id, version, allocations, notes, created_by)
  VALUES (p_user_id, v_next, p_allocations, p_notes, auth.uid());

  INSERT INTO public.portfolios (user_id, allocations, notes, updated_at)
  VALUES (p_user_id, p_allocations, p_notes, now())
  ON CONFLICT (user_id) DO UPDATE
    SET allocations = EXCLUDED.allocations,
        notes       = EXCLUDED.notes,
        updated_at  = now();

  SELECT to_jsonb(p) INTO v_after FROM public.portfolios p WHERE p.user_id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, entity, target_user_id, before, after)
  VALUES (auth.uid(), 'portfolio.save', 'portfolio', p_user_id, v_before, v_after);

  RETURN v_next;
END $$;

REVOKE ALL ON FUNCTION public.save_portfolio(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_portfolio(uuid, jsonb, text) TO authenticated;

-- ── 5. Backfill — snapshot current portfolios as version 1 ─────────────
INSERT INTO public.portfolio_versions (user_id, version, allocations, notes, created_by, created_at)
SELECT p.user_id, 1, p.allocations, p.notes, NULL, COALESCE(p.updated_at, p.created_at, now())
FROM public.portfolios p
WHERE NOT EXISTS (
  SELECT 1 FROM public.portfolio_versions pv WHERE pv.user_id = p.user_id
);
