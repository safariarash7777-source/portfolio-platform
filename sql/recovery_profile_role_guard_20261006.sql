-- P01-ROLE-01. Existing profiles/UUIDs are preserved. Install separately by P00.
-- No data UPDATE, new user, broad phase23 installation, or insecure down migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.profiles'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'profiles RLS must already be enabled';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.profiles'::regclass
      AND polname IN ('profiles_self_insert', 'profiles_self_update', 'profiles_admin_update')) <> 3 THEN
    RAISE EXCEPTION 'review current profiles policies before installation';
  END IF;
END
$preflight$;

ALTER POLICY profiles_self_insert ON public.profiles
  WITH CHECK (auth.uid() = id AND role = 'user');
ALTER POLICY profiles_self_update ON public.profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = 'user');

-- Invoker deliberately: current_user alone must NOT authorize an owner-definer
-- RPC called by a normal user. The authenticated actor remains auth.uid()/role().
CREATE OR REPLACE FUNCTION public.recovery_guard_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.role = 'user' THEN
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  -- SQL maintenance without request claims is distinct from a PostgREST RPC.
  -- A SECURITY DEFINER RPC keeps its request claims and cannot use this branch.
  IF auth.uid() IS NULL
     AND nullif(current_setting('request.jwt.claims', true), '') IS NULL
     AND session_user IN ('postgres', 'supabase_admin')
     AND current_setting('role', true) NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'profile role change requires an authorized administrator';
END
$guard$;
REVOKE ALL ON FUNCTION public.recovery_guard_profile_role() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS recovery_profile_role_guard ON public.profiles;
CREATE TRIGGER recovery_profile_role_guard
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.recovery_guard_profile_role();

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'recovery_profile_role_guard' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'profile role guard was not enabled';
  END IF;
END
$verify$;
COMMIT;
