-- Disposable database only. Matches the observed profiles policies, no real data.
DROP POLICY IF EXISTS "own profile readable" ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING (auth.uid()=id OR public.is_admin());
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid()=id);
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (auth.uid()=id);
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE USING (public.is_admin());
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid, action text, entity text, target_user_id uuid, after jsonb
);
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc'), ('dddddddd-dddd-dddd-dddd-dddddddddddd'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
INSERT INTO public.profiles(id,role,full_name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','user','Fixture A'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','user','Fixture B'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','admin','Fixture Admin');
-- Adversarial definer RPC, test-only. It must not bypass the role trigger.
CREATE FUNCTION public.recovery_fixture_rpc_role(target uuid, wanted text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public
AS $$ UPDATE public.profiles SET role=wanted WHERE id=target $$;
REVOKE ALL ON FUNCTION public.recovery_fixture_rpc_role(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recovery_fixture_rpc_role(uuid,text) TO authenticated,service_role;
