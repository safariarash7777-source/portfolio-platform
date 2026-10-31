-- Review candidate only; no primary installation or product-right activation.
-- Adds immutable intent retention. Never invokes the ticket command kernel.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF to_regprocedure('consultation_ticket_private.authorized(uuid)') IS NULL
 OR to_regprocedure('consultation_ticket_private.command(jsonb)') IS NULL
 OR to_regprocedure('consultation_ticket_private.capability(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'reviewed ticket prerequisite missing';END IF;
 IF to_regclass('consultation_ticket_private.prepared_intents') IS NOT NULL THEN
  RAISE EXCEPTION 'prepared intents already exist; compare/read back, never overwrite';END IF;
END $$;
CREATE TABLE consultation_ticket_private.prepared_intents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),
 request_id uuid NOT NULL,
 client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 request_body text NOT NULL CHECK(octet_length(convert_to(request_body,'UTF8')) BETWEEN 1 AND 20000),
 body_sha256 text NOT NULL CHECK(body_sha256=encode(sha256(convert_to(request_body,'UTF8')),'hex')),
 kind text NOT NULL CHECK(kind IN('open','member_followup','advisor_clarification','link_recommendation','close')),
 base_version integer NOT NULL CHECK(base_version BETWEEN 0 AND 2147483646),
 created_at timestamptz NOT NULL,
 fixture_run_id text NOT NULL CHECK(length(fixture_run_id) BETWEEN 1 AND 200),
 UNIQUE(actor_id,client_token)
);
CREATE INDEX ticket_prepared_actor_relation ON consultation_ticket_private.prepared_intents(actor_id,relationship_id,created_at,id);
ALTER TABLE consultation_ticket_private.prepared_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON consultation_ticket_private.prepared_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ticket_prepared_immutable BEFORE UPDATE OR DELETE ON consultation_ticket_private.prepared_intents FOR EACH ROW EXECUTE FUNCTION consultation_private.reject_mutation();

CREATE FUNCTION consultation_ticket_private.prepared_access(p_relationship uuid) RETURNS public.consultation_relationships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(auth.uid()::text));
 RETURN consultation_ticket_private.authorized(p_relationship);
END $$;
CREATE FUNCTION consultation_ticket_private.prepared_metadata(t consultation_ticket_private.prepared_intents) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('preparationId',t.id,'requestId',t.request_id,'kind',t.kind,'baseVersion',t.base_version,'bodyHash',t.body_sha256,'createdAt',t.created_at);
$$;
CREATE FUNCTION consultation_ticket_private.prepared_receipt(t consultation_ticket_private.prepared_intents,p_reused boolean) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('contractVersion','consultation-ticket-preparation.v1','actorId',t.actor_id,'relationshipId',t.relationship_id,
  'preparationId',t.id,'requestId',t.request_id,'clientToken',t.client_token,'bodyHash',t.body_sha256,'createdAt',t.created_at,'fixtureRunId',t.fixture_run_id,'reused',p_reused);
$$;
CREATE FUNCTION consultation_ticket_private.prepare(p_body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();p jsonb;c jsonb;token text;fingerprint text;cap jsonb;r public.consultation_relationships;
 saved consultation_ticket_private.prepared_intents;last_event consultation_ticket_private.events;reference public.consultation_sessions;written_at timestamptz;k text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 IF p_body IS NULL OR octet_length(convert_to(p_body,'UTF8')) NOT BETWEEN 1 AND 20000 THEN
  RAISE EXCEPTION 'invalid exact body' USING ERRCODE='22023';END IF;
 p:=p_body::jsonb;
 PERFORM consultation_private.keys(p,ARRAY['contractVersion','expectedActorId','clientToken','command'],ARRAY['contractVersion','expectedActorId','clientToken','command']);
 IF p->>'contractVersion' IS DISTINCT FROM 'consultation-ticket-request.v1' OR p->>'expectedActorId' IS DISTINCT FROM actor::text THEN
  RAISE EXCEPTION 'prepared actor mismatch' USING ERRCODE='42501';END IF;
 c:=consultation_ticket_private.command(p->'command');k:=c->>'kind';token:=consultation_private.txt(p->'clientToken',200);
 IF c IS DISTINCT FROM p->'command' OR token IS DISTINCT FROM p->>'clientToken' THEN RAISE EXCEPTION 'noncanonical material fields' USING ERRCODE='22023';END IF;
 r:=consultation_ticket_private.prepared_access((c->>'relationshipId')::uuid);
 IF NOT consultation_private.access(r,true,false) THEN RAISE EXCEPTION 'active consent required' USING ERRCODE='42501';END IF;
 IF k IN('open','member_followup') THEN
  IF actor<>r.client_id THEN RAISE EXCEPTION 'member action required' USING ERRCODE='42501';END IF;
 ELSE
  IF actor<>r.advisor_id OR NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner) THEN
   RAISE EXCEPTION 'owner advisor action required' USING ERRCODE='42501';END IF;
 END IF;
 cap:=consultation_ticket_private.capability(r.id,actor);
 IF cap->>'state'<>'owned_fixture' THEN RAISE EXCEPTION 'service right not connected' USING ERRCODE='PT503';END IF;
 fingerprint:=encode(sha256(convert_to(p_body,'UTF8')),'hex');
 SELECT * INTO saved FROM consultation_ticket_private.prepared_intents WHERE actor_id=actor AND client_token=token;
 IF saved.id IS NOT NULL THEN
  IF saved.request_body<>p_body OR saved.body_sha256<>fingerprint OR saved.relationship_id<>r.id THEN
   RAISE EXCEPTION 'same token changed exact body' USING ERRCODE='PT409';END IF;
  RETURN consultation_ticket_private.prepared_receipt(saved,true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_ticket_request'),hashtext(c->>'requestId'));
 IF k='open' THEN
  IF EXISTS(SELECT FROM consultation_ticket_private.requests WHERE request_id=(c->>'requestId')::uuid) THEN
   RAISE EXCEPTION 'request already exists' USING ERRCODE='PT409';END IF;
 ELSE
  IF NOT EXISTS(SELECT FROM consultation_ticket_private.requests WHERE request_id=(c->>'requestId')::uuid AND relationship_id=r.id) THEN
   RAISE EXCEPTION 'request unavailable' USING ERRCODE='P0002';END IF;
  SELECT * INTO last_event FROM consultation_ticket_private.events WHERE request_id=(c->>'requestId')::uuid ORDER BY version DESC LIMIT 1;
  IF last_event.id IS NULL OR last_event.version<>(c->>'baseVersion')::integer OR last_event.version>=500 OR last_event.command->>'kind'='close' THEN
   RAISE EXCEPTION 'prepared CAS changed' USING ERRCODE='PT409';END IF;
 END IF;
 IF k='link_recommendation' OR (k='open' AND c->'recommendation'<>'null'::jsonb) THEN
  SELECT * INTO reference FROM public.consultation_sessions WHERE id=(c->'recommendation'->>'sessionId')::uuid;
  IF reference.id IS NULL OR reference.relationship_id<>r.id OR reference.version<>(c->'recommendation'->>'version')::integer
   OR reference.content_hash<>c->'recommendation'->>'contentHash' OR consultation_private.state(reference.id) NOT IN('published','withdrawn')
   OR NOT EXISTS(SELECT FROM public.consultation_publications WHERE session_id=reference.id) THEN
   RAISE EXCEPTION 'exact published reference required' USING ERRCODE='PT409';END IF;
 END IF;
 -- Serialization bound only. No shortened list or business entitlement is inferred.
 IF (SELECT count(*) FROM consultation_ticket_private.prepared_intents WHERE actor_id=actor AND relationship_id=r.id)>=500 THEN
  RAISE EXCEPTION 'complete prepared list capacity reached' USING ERRCODE='PT409';END IF;
 written_at:=clock_timestamp();
 IF written_at<r.created_at OR (last_event.id IS NOT NULL AND written_at<last_event.created_at) THEN
  RAISE EXCEPTION 'clock ordering unavailable' USING ERRCODE='PT409';END IF;
 INSERT INTO consultation_ticket_private.prepared_intents(actor_id,relationship_id,request_id,client_token,request_body,body_sha256,kind,base_version,created_at,fixture_run_id)
 VALUES(actor,r.id,(c->>'requestId')::uuid,token,p_body,fingerprint,k,(c->>'baseVersion')::integer,written_at,cap->>'runId') RETURNING * INTO saved;
 RETURN consultation_ticket_private.prepared_receipt(saved,false);
END $$;
CREATE FUNCTION consultation_ticket_private.prepared_load(p_relationship uuid,p_preparation uuid,p_token text,p_list boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.consultation_relationships;item consultation_ticket_private.prepared_intents;items jsonb;data jsonb;counted integer;
 selected_id uuid;selected_actor uuid;selected_relation uuid;
BEGIN
 r:=consultation_ticket_private.prepared_access(p_relationship);
 -- Read authorization precedes every lookup/return. No write-provider call here.
 IF p_list THEN
  SELECT count(*) INTO counted FROM consultation_ticket_private.prepared_intents WHERE actor_id=auth.uid() AND relationship_id=r.id;
  IF counted>500 THEN RAISE EXCEPTION 'complete prepared list unavailable' USING ERRCODE='PT409';END IF;
  SELECT coalesce(jsonb_agg(consultation_ticket_private.prepared_metadata(t) ORDER BY t.created_at,t.id),'[]') INTO items
   FROM consultation_ticket_private.prepared_intents t WHERE t.actor_id=auth.uid() AND t.relationship_id=r.id;
  RETURN jsonb_build_object('contractVersion','consultation-ticket-attempt-list.v1','actorId',auth.uid(),'relationshipId',r.id,'attempts',items);
 END IF;
 IF num_nonnulls(p_preparation,p_token)<>1 OR (p_token IS NOT NULL AND (length(p_token) NOT BETWEEN 1 AND 200 OR p_token<>btrim(p_token))) THEN
  RAISE EXCEPTION 'exactly one correlation required' USING ERRCODE='22023';END IF;
 IF p_preparation IS NOT NULL THEN SELECT id,actor_id,relationship_id INTO selected_id,selected_actor,selected_relation FROM consultation_ticket_private.prepared_intents WHERE id=p_preparation;
 ELSE SELECT id,actor_id,relationship_id INTO selected_id,selected_actor,selected_relation FROM consultation_ticket_private.prepared_intents WHERE actor_id=auth.uid() AND client_token=p_token;END IF;
 IF selected_id IS NOT NULL THEN
  IF selected_actor<>auth.uid() THEN RAISE EXCEPTION 'prepared actor denied' USING ERRCODE='42501';END IF;
  IF selected_relation<>r.id THEN RAISE EXCEPTION 'prepared relation changed' USING ERRCODE='PT409';END IF;
  -- Fetch body only after correlation ownership and the exact relation match.
  SELECT * INTO item FROM consultation_ticket_private.prepared_intents WHERE id=selected_id AND actor_id=auth.uid() AND relationship_id=r.id;
  data:=consultation_ticket_private.prepared_receipt(item,false)-'reused';
  data:=data||jsonb_build_object('contractVersion','consultation-ticket-prepared.v1','body',item.request_body);
 END IF;
 RETURN jsonb_build_object('contractVersion','consultation-ticket-attempt-lookup.v1','actorId',auth.uid(),'relationshipId',r.id,
  'preparationId',p_preparation,'clientToken',p_token,'state',CASE WHEN item.id IS NULL THEN 'confirmed_absent' ELSE 'found' END,'prepared',data);
END $$;
CREATE FUNCTION public.prepare_consultation_ticket_attempt(p_body text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.prepare(p_body); $$;
CREATE FUNCTION public.lookup_consultation_ticket_attempt(p_relationship uuid,p_preparation uuid,p_client_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.prepared_load(p_relationship,p_preparation,p_client_token,false); $$;
CREATE FUNCTION public.load_consultation_ticket_attempts(p_relationship uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.prepared_load(p_relationship,NULL,NULL,true); $$;
REVOKE ALL ON FUNCTION consultation_ticket_private.prepared_access(uuid),consultation_ticket_private.prepared_metadata(consultation_ticket_private.prepared_intents),consultation_ticket_private.prepared_receipt(consultation_ticket_private.prepared_intents,boolean),consultation_ticket_private.prepare(text),consultation_ticket_private.prepared_load(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_consultation_ticket_attempt(text),public.lookup_consultation_ticket_attempt(uuid,uuid,text),public.load_consultation_ticket_attempts(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_consultation_ticket_attempt(text),public.lookup_consultation_ticket_attempt(uuid,uuid,text),public.load_consultation_ticket_attempts(uuid) TO authenticated;
COMMIT;
