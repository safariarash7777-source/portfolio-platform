-- RESET-02 selected signup prerequisite. NOT automatically installed.
-- Operator gate: preserve current function/ACL/schema/config in a verified
-- backup receipt; compare its exact hash; test restore/compatible rollback.
-- Keep signup disabled until approved sender/confirmation are working.
-- No existing accounts, profiles, roles, entitlements or consent are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
      AND tgname='recovery_profile_role_guard' AND tgenabled='O') THEN
    RAISE EXCEPTION 'existing profile role guard must be enabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.profiles'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'profiles RLS must be enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'review existing auth triggers before installing';
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION 'inspect existing profile function before installing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $profile$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, national_id, phone, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'national_id', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END
$profile$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
COMMIT;
