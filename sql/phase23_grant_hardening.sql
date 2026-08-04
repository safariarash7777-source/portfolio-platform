-- =============================================================================
-- Phase 23 — Schema-wide grant hardening (B-044)
--
-- STATUS
--   Staging (`oqjcvkzyvhqnphopedpn`) — applied, see `docs/MIGRATION-LEDGER.md`.
--   Production (`uooeygybrniptzdxuzhj`) — **NOT_APPLIED**. Awaiting the owner
--     decision recorded in `docs/PRODUCTION-ACTIVATION.md`.
--
-- ── What was actually measured, before any claim about it ────────────────────
-- Read-only survey of Production on 1405/05/13:
--
--     anon           DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE  → 40 tables
--     authenticated  DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE  → 41 tables
--
-- None of it was granted by a migration. It comes from `ALTER DEFAULT
-- PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated, service_role`,
-- which is reproduced for tests in `sql/test/profile_legacy_default_privileges.sql`.
--
-- ── Sizing the risk honestly, in both directions ─────────────────────────────
-- Every write policy on Production was read and classified. All of them are
-- gated by `auth.uid()` or `is_admin()`, with exactly one exception:
-- `waitlist` INSERT is `WITH CHECK (true)`, which is the public waitlist form
-- working as designed.
--
-- So the DELETE grant is **not** a live hole: RLS refuses every DELETE that
-- anon could attempt, because no policy it can satisfy exists. Saying
-- otherwise would be inflating the finding.
--
-- TRUNCATE is a different matter, and it is the part that matters:
--
--   • **RLS does not filter TRUNCATE.** A policy cannot restrict it. The
--     table-level grant is the only control there is.
--   • **TRUNCATE does not fire row triggers.** Every append-only guard in this
--     repository — `codal_reports`, `symbol_history`, `intel_workflow_events`
--     — is a trigger, and TRUNCATE walks straight past all of them. That is
--     lesson `B-034`, learned once already.
--   • Today nothing reaches it: PostgREST never emits TRUNCATE. That is a
--     single point of failure with no second layer behind it. One
--     `SECURITY INVOKER` function doing dynamic SQL, one future endpoint, and
--     1,967,420 rows of `symbol_history` are gone with no trigger firing and
--     no audit row written.
--
-- The fix is therefore not urgent, but it is unambiguous: take away a
-- privilege that no code path in this repository has ever used. `grep -rn
-- TRUNCATE` over the app finds exactly two hits, both inside
-- `scripts/validate-sql.mjs`, both of which exist to *forbid* it.
--
-- ── Why this migration derives its work instead of listing tables ────────────
-- A hardcoded table list is correct on the day it is written and wrong on the
-- day someone adds a table. Sections 2 and 3 compute their target from the
-- catalog, so the file states an *invariant* rather than a snapshot:
--
--     a write privilege that no RLS policy can ever satisfy should not exist
--
-- Section 4 then re-reads the catalog and raises if the invariant does not
-- hold, so a partially-applied run fails loudly rather than reporting success.
-- Re-running the file is a no-op — every statement is a REVOKE or a GRANT of
-- a state that is already true.
-- =============================================================================

BEGIN;

-- ── 1) Privileges that are never legitimate, for anybody ────────────────────
--
-- TRUNCATE: the `B-044` finding itself, unreachable by RLS.
-- TRIGGER:  lets the holder attach a trigger to the table — arbitrary code on
--           every write, including writes made by other roles.
-- REFERENCES: lets the holder create a foreign key onto the table, which
--           blocks deletes there and leaks row existence through FK violations.
--
-- `service_role` is included deliberately. It bypasses RLS already; leaving it
-- TRUNCATE on an append-only table would mean the server can silently erase
-- the ledger meant to hold it accountable. It has never needed it: no SQL,
-- route, or script in this repository issues TRUNCATE.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- ── 2) `anon` writes nothing ────────────────────────────────────────────────
--
-- `anon` is the unauthenticated role: `auth.uid()` is NULL and `is_admin()` is
-- false for it, so every write policy on every table refuses it already. The
-- single genuinely public write is the waitlist form, which is granted back
-- immediately below.
--
-- This is a defence-in-depth revoke, not a behaviour change: it removes a
-- grant that RLS was already refusing to honour.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', t);
  END LOOP;

  -- `app/api/waitlist/route.ts` posts with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  -- policy `wl_public_insert` is `WITH CHECK (true)`. This grant is load-bearing
  -- for the public form. Guarded by `to_regclass` because Staging has no
  -- `waitlist` table and the file must run unchanged on both.
  IF to_regclass('public.waitlist') IS NOT NULL THEN
    GRANT INSERT ON TABLE public.waitlist TO anon;
  END IF;
END $$;

-- ── 3) `authenticated` keeps only writes a policy could accept ──────────────
--
-- For an RLS-enabled table, a command with no matching policy is already
-- impossible for a non-superuser role. The grant is dead weight, so removing
-- it cannot change behaviour — and it means a future `CREATE POLICY` has to
-- be paired with a deliberate `GRANT` rather than silently switching on a
-- privilege that was lying around.
--
-- `pg_policy.polcmd`: 'r' SELECT · 'a' INSERT · 'w' UPDATE · 'd' DELETE · '*' ALL.
--
-- Tables with RLS **disabled** are skipped on purpose. There, the grant is the
-- only control and revoking it would be a real behaviour change, not a
-- tightening. Section 4 reports any such table instead of silently passing.
DO $$
DECLARE
  r record;
  cmds CONSTANT text[] := ARRAY['INSERT','UPDATE','DELETE'];
  codes CONSTANT text[] := ARRAY['a','w','d'];
  i int;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     ORDER BY c.relname
  LOOP
    FOR i IN 1..array_length(cmds, 1) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policy p
         WHERE p.polrelid = r.oid
           AND p.polcmd IN (codes[i], '*')
           AND p.polpermissive
      ) THEN
        EXECUTE format('REVOKE %s ON TABLE public.%I FROM authenticated', cmds[i], r.relname);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ── 4) Assert the invariant, or fail the migration ──────────────────────────
--
-- A migration that reports success without checking is how `B-044` survived
-- this long. This block re-reads the catalog and raises, so a partial run is
-- visibly broken rather than quietly incomplete.
DO $$
DECLARE
  bad_truncate int;
  bad_anon int;
  rls_off text[];
BEGIN
  SELECT count(*) INTO bad_truncate
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee IN ('anon','authenticated','service_role')
     AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');
  IF bad_truncate <> 0 THEN
    RAISE EXCEPTION 'B-044 not closed: % TRUNCATE/TRIGGER/REFERENCES grants survive', bad_truncate;
  END IF;

  SELECT count(*) INTO bad_anon
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee = 'anon'
     AND privilege_type IN ('INSERT','UPDATE','DELETE')
     AND NOT (table_name = 'waitlist' AND privilege_type = 'INSERT');
  IF bad_anon <> 0 THEN
    RAISE EXCEPTION 'B-044 not closed: anon retains % write grants outside the waitlist form', bad_anon;
  END IF;

  -- Not a failure — a table with RLS off was never in this file's scope. It is
  -- surfaced because "we did not look here" must not read as "nothing here".
  SELECT array_agg(c.relname ORDER BY c.relname) INTO rls_off
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF rls_off IS NOT NULL THEN
    RAISE NOTICE 'phase23: RLS disabled, section 3 skipped: %', array_to_string(rls_off, ', ');
  END IF;
END $$;

COMMIT;

-- ── Verification probes (read-only; run separately, never inside the tx) ─────
--  1) SELECT grantee, privilege_type, count(*)
--       FROM information_schema.role_table_grants
--      WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
--      GROUP BY 1,2 ORDER BY 1,2;
--     Expect: no TRUNCATE / TRIGGER / REFERENCES row at all; anon holds
--     SELECT plus exactly one INSERT (on `waitlist`, Production only).
--
--  2) SELECT has_table_privilege('anon','public.symbol_history','TRUNCATE');
--     Expect: false.
--
--  3) Root cause, unchanged by this file and deliberately so:
--     SELECT defaclrole::regrole, defaclacl FROM pg_default_acl
--       WHERE defaclnamespace = 'public'::regnamespace;
--     `ALTER DEFAULT PRIVILEGES` is owned by roles this migration does not
--     control, so a *future* table can still be created wide open. The durable
--     guard is `lib/security/grants.integration.test.ts`, which fails on any
--     table that reintroduces one of these grants — a test that runs on every
--     PR is worth more here than a default we cannot guarantee we own.
