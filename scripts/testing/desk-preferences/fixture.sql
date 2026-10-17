-- Synthetic fixture only: no production credentials, accounts or data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text NOT NULL);
INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000001','admin'),
 ('00000000-0000-4000-8000-000000000002','admin'),
 ('00000000-0000-4000-8000-000000000003','member');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY profile_self_read ON public.profiles TO authenticated USING(id=auth.uid());
-- Deliberately hostile ambient defaults: migration must remove these itself.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO PUBLIC,anon,authenticated,service_role;
