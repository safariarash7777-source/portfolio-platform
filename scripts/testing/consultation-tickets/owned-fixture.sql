-- TEST FIXTURE ONLY. Never import into product SQL, production or the copied proof DB.
-- The driver must attest a NEW disposable DB/container/network and persist its run
-- identity before this file. No caller-controlled GUC/JWT/profile grants a right.
BEGIN;
DO $$ BEGIN
 IF to_regclass('e2e_identity.environment') IS NULL
 OR to_regprocedure('consultation_ticket_private.permission(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'owned fixture prerequisites missing';END IF;
 IF (SELECT count(*) FROM e2e_identity.environment)<>1
 OR NOT EXISTS(SELECT FROM e2e_identity.environment WHERE run_id ~ '^consultation-ticket-[a-z0-9-]{8,80}$') THEN
  RAISE EXCEPTION 'owned ticket run marker required';END IF;
 IF (SELECT count(*) FROM auth.users)<>4 THEN RAISE EXCEPTION 'four new owned Auth actors required';END IF;
END $$;
CREATE SCHEMA consultation_ticket_fixture;
REVOKE ALL ON SCHEMA consultation_ticket_fixture FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE consultation_ticket_fixture.environment(run_id text PRIMARY KEY);
INSERT INTO consultation_ticket_fixture.environment SELECT run_id FROM e2e_identity.environment;
CREATE TABLE consultation_ticket_fixture.allowed(
 relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(relationship_id,actor_id)
);
CREATE TABLE consultation_ticket_fixture.revoked(
 relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(relationship_id,actor_id)
);
ALTER TABLE consultation_ticket_fixture.environment ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_ticket_fixture.allowed ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_ticket_fixture.revoked ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA consultation_ticket_fixture FROM PUBLIC,anon,authenticated,service_role;
-- Only the run-owning SQL driver may add exact relationship/actor grants after
-- the real consent receipt is independently read back. App roles have no DML.
CREATE OR REPLACE FUNCTION consultation_ticket_private.permission(p_relationship uuid,p_actor uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_actor=auth.uid() AND EXISTS(
  SELECT FROM consultation_ticket_fixture.allowed a
  WHERE a.relationship_id=p_relationship AND a.actor_id=p_actor
   AND NOT EXISTS(SELECT FROM consultation_ticket_fixture.revoked v WHERE v.relationship_id=a.relationship_id AND v.actor_id=a.actor_id)
   AND EXISTS(SELECT FROM consultation_ticket_fixture.environment f JOIN e2e_identity.environment e ON e.run_id=f.run_id)
 ) THEN jsonb_build_object('state','owned_fixture','runId',(SELECT run_id FROM consultation_ticket_fixture.environment))
 ELSE jsonb_build_object('state','not_connected','runId',NULL) END;
$$;
REVOKE ALL ON FUNCTION consultation_ticket_private.permission(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
