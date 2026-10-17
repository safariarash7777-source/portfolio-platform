-- REVIEW ONLY. Do not execute before coordinator confirms the native signup
-- trigger installation, backup/rehearsal and this exact marker-bound recovery.
-- Repairs only the one Auth-admin-created synthetic A identity left without a
-- profile when the missing native trigger was discovered. No bulk backfill,
-- role promotion, customer lookup, schema change, RLS/trigger bypass or upsert.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DO $controlled_a$
DECLARE
  target_id constant uuid := '0e3e636a-5d5f-49e0-9207-c5cc7c6147ba';
  run_marker constant text := 'member-primary-20261017-01';
  target_email constant text := 'member-primary-20261017-01-a@example.invalid';
  actor auth.users%ROWTYPE;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'controlled repair database mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created'
      AND NOT tgisinternal AND tgenabled='O'
      AND tgfoid='public.handle_new_user()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'native signup trigger must be installed first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.profiles'::regclass
      AND tgname='recovery_profile_role_guard' AND tgenabled='O'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.profiles'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'existing profile role guard and RLS must remain enabled';
  END IF;

  -- Lock this exact synthetic Auth row; never discover or modify another user.
  SELECT * INTO actor FROM auth.users WHERE id=target_id FOR UPDATE;
  IF NOT FOUND OR actor.email IS DISTINCT FROM target_email
      OR actor.raw_app_meta_data->>'acceptance_run' IS DISTINCT FROM run_marker
      OR actor.email_confirmed_at IS NULL
      OR coalesce(actor.banned_until>now(),false) THEN
    RAISE EXCEPTION 'controlled Auth identity, marker or lifecycle mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=target_id) THEN
    RAISE EXCEPTION 'profile already exists; inspect instead of overwriting';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_holding_versions WHERE user_id=target_id) THEN
    RAISE EXCEPTION 'financial writes must not precede controlled profile repair';
  END IF;

  INSERT INTO public.profiles(id,email,full_name,national_id,phone,role)
  VALUES(target_id,target_email,'آزمون کنترل‌شده عضو A',NULL,NULL,'user');

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=target_id AND email=target_email
      AND role='user' AND national_id IS NULL AND phone IS NULL
      AND full_name='آزمون کنترل‌شده عضو A'
  ) THEN
    RAISE EXCEPTION 'controlled member profile postcondition failed';
  END IF;
END
$controlled_a$;

SELECT json_build_object(
  'marker','member-primary-20261017-01',
  'id',id,'role',role,'profileRepaired',true,
  'customerRowsChanged',0,'financialRowsWritten',0
)
FROM public.profiles
WHERE id='0e3e636a-5d5f-49e0-9207-c5cc7c6147ba'::uuid;
COMMIT;
