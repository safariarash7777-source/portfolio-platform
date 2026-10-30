-- Review candidate only. Not an installation instruction or service-right rollout.
-- Requires the existing consultation workflow; does not alter it, balances or consent.
-- A formal migration must be generated with the existing Supabase CLI after review.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF to_regprocedure('public.load_consultation(uuid,date,date)') IS NULL
 OR to_regprocedure('consultation_private.access(public.consultation_relationships,boolean,boolean)') IS NULL
 OR to_regprocedure('consultation_private.keys(jsonb,text[],text[])') IS NULL THEN
  RAISE EXCEPTION 'reviewed consultation prerequisite missing';
 END IF;
 IF to_regnamespace('consultation_ticket_private') IS NOT NULL THEN
  RAISE EXCEPTION 'ticket schema already exists; compare/read back, never overwrite';
 END IF;
END $$;
CREATE SCHEMA consultation_ticket_private;
REVOKE ALL ON SCHEMA consultation_ticket_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE consultation_ticket_private.requests(
 request_id uuid PRIMARY KEY,
 relationship_id uuid NOT NULL REFERENCES public.consultation_relationships(id),
 opened_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL
);
CREATE TABLE consultation_ticket_private.events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES consultation_ticket_private.requests(request_id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 500),
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 UNIQUE(request_id,version)
);
CREATE TABLE consultation_ticket_private.receipts(
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 request_id uuid NOT NULL REFERENCES consultation_ticket_private.requests(request_id),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,
 PRIMARY KEY(actor_id,client_token)
);
CREATE INDEX consultation_ticket_relationship ON consultation_ticket_private.requests(relationship_id,created_at,request_id);
ALTER TABLE consultation_ticket_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_ticket_private.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_ticket_private.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA consultation_ticket_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ticket_requests_immutable BEFORE UPDATE OR DELETE ON consultation_ticket_private.requests FOR EACH ROW EXECUTE FUNCTION consultation_private.reject_mutation();
CREATE TRIGGER ticket_events_immutable BEFORE UPDATE OR DELETE ON consultation_ticket_private.events FOR EACH ROW EXECUTE FUNCTION consultation_private.reject_mutation();
CREATE TRIGGER ticket_receipts_immutable BEFORE UPDATE OR DELETE ON consultation_ticket_private.receipts FOR EACH ROW EXECUTE FUNCTION consultation_private.reject_mutation();

-- The product has NO connected service-right provider. No role, entitlement row,
-- JWT metadata, request field, GUC, environment flag or client value can enable it.
-- The separately reviewed test fixture may replace this function ONLY in its own
-- disposable, run/actor-bound DB. That fixture is not part of this SQL candidate.
CREATE FUNCTION consultation_ticket_private.permission(p_relationship uuid,p_actor uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('state','not_connected','runId',NULL);
$$;
CREATE FUNCTION consultation_ticket_private.capability(p_relationship uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=consultation_ticket_private.permission(p_relationship,p_actor);
 PERFORM consultation_private.keys(result,ARRAY['state','runId'],ARRAY['state','runId']);
 IF result=jsonb_build_object('state','not_connected','runId',NULL) THEN RETURN result;END IF;
 -- A label for the isolated fixture, never a real purchased service right.
 IF result->>'state'='owned_fixture' AND jsonb_typeof(result->'runId')='string'
 AND length(result->>'runId') BETWEEN 1 AND 200 THEN RETURN result;END IF;
 RAISE EXCEPTION 'service-right provider unavailable' USING ERRCODE='PT503';
END $$;
CREATE FUNCTION consultation_ticket_private.recommendation(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v bigint;h text;
BEGIN
 PERFORM consultation_private.keys(p,ARRAY['sessionId','version','contentHash'],ARRAY['sessionId','version','contentHash']);
 v:=consultation_private.amount(p->'version');h:=consultation_private.txt(p->'contentHash',64);
 IF v NOT BETWEEN 1 AND 2147483647 OR h !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid reference' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('sessionId',consultation_private.uid(p->'sessionId'),'version',v,'contentHash',h);
END $$;
CREATE FUNCTION consultation_ticket_private.command(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;extra text[];b bigint;result jsonb;
BEGIN
 k:=p->>'kind';
 extra:=CASE k WHEN 'open' THEN ARRAY['subject','text','recommendation'] WHEN 'member_followup' THEN ARRAY['text']
 WHEN 'advisor_clarification' THEN ARRAY['text'] WHEN 'link_recommendation' THEN ARRAY['recommendation'] WHEN 'close' THEN ARRAY['reason'] ELSE NULL END;
 IF extra IS NULL THEN RAISE EXCEPTION 'invalid ticket kind' USING ERRCODE='22023';END IF;
 PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','requestId','baseVersion']||extra,ARRAY['kind','relationshipId','requestId','baseVersion']||extra);
 b:=consultation_private.amount(p->'baseVersion');
 IF b>2147483646 OR (k='open' AND b<>0) OR (k<>'open' AND b=0) THEN RAISE EXCEPTION 'invalid ticket base' USING ERRCODE='22023';END IF;
 result:=jsonb_build_object('kind',k,'relationshipId',consultation_private.uid(p->'relationshipId'),'requestId',consultation_private.uid(p->'requestId'),'baseVersion',b);
 IF k='open' THEN RETURN result||jsonb_build_object('subject',consultation_private.txt(p->'subject',200),'text',consultation_private.txt(p->'text',2000),
  'recommendation',CASE WHEN p->'recommendation'='null'::jsonb THEN NULL ELSE consultation_ticket_private.recommendation(p->'recommendation') END);END IF;
 IF k IN('member_followup','advisor_clarification') THEN RETURN result||jsonb_build_object('text',consultation_private.txt(p->'text',2000));END IF;
 IF k='link_recommendation' THEN RETURN result||jsonb_build_object('recommendation',consultation_ticket_private.recommendation(p->'recommendation'));END IF;
 RETURN result||jsonb_build_object('reason',consultation_private.txt(p->'reason',2000));
END $$;
CREATE FUNCTION consultation_ticket_private.authorized(p_relationship uuid) RETURNS public.consultation_relationships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.consultation_relationships;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 -- Same relation lock as the existing consent/revocation writer. It lasts through
 -- serialization, not only a pre-write application check.
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relationship::text));
 SELECT * INTO r FROM public.consultation_relationships WHERE id=p_relationship;
 IF r.id IS NULL OR NOT consultation_private.access(r,false,false) THEN RAISE EXCEPTION 'ticket access denied' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;
CREATE FUNCTION consultation_ticket_private.history(r public.consultation_relationships,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE items jsonb;counted integer;
BEGIN
 IF NOT EXISTS(SELECT FROM consultation_ticket_private.requests t WHERE t.request_id=p_request AND t.relationship_id=r.id) THEN
  RAISE EXCEPTION 'ticket unavailable' USING ERRCODE='P0002';END IF;
 SELECT count(*) INTO counted FROM consultation_ticket_private.events WHERE request_id=p_request;
 -- Serialization bound, not a business quota. Never return a shortened history.
 IF counted NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'complete ticket history unavailable' USING ERRCODE='PT409';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',e.id,'actorId',e.actor_id,'version',e.version,'createdAt',e.created_at,
 'command',e.command,'contentHash',e.content_hash) ORDER BY e.version) INTO items
 FROM consultation_ticket_private.events e WHERE e.request_id=p_request;
 RETURN jsonb_build_object('contractVersion','consultation-ticket-read.v1','actorId',auth.uid(),'relationshipId',r.id,
 'requestId',p_request,'writeAvailability','service_entitlement_not_connected','history',jsonb_build_object('state','ready','events',items));
END $$;
CREATE FUNCTION consultation_ticket_private.load(p_relationship uuid,p_request uuid,p_token text,p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.consultation_relationships;cap jsonb;data jsonb;resource jsonb;attempt jsonb;counted integer;saved consultation_ticket_private.receipts;
BEGIN
 r:=consultation_ticket_private.authorized(p_relationship);
 cap:=consultation_ticket_private.capability(r.id,auth.uid());
 IF p_mode='inbox' THEN
  SELECT count(*) INTO counted FROM consultation_ticket_private.requests WHERE relationship_id=r.id;
  IF counted>500 THEN RAISE EXCEPTION 'complete inbox unavailable; no truncation' USING ERRCODE='PT409';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',t.request_id,'subject',first_event.command->>'subject',
   'version',last_event.version,'state',CASE WHEN last_event.command->>'kind'='close' THEN 'closed' ELSE 'open' END,'updatedAt',last_event.created_at)
   ORDER BY t.created_at,t.request_id),'[]'::jsonb) INTO data FROM consultation_ticket_private.requests t
  JOIN consultation_ticket_private.events first_event ON first_event.request_id=t.request_id AND first_event.version=1
  JOIN LATERAL(SELECT e.version,e.command,e.created_at FROM consultation_ticket_private.events e WHERE e.request_id=t.request_id ORDER BY version DESC LIMIT 1) last_event ON true
  WHERE t.relationship_id=r.id;
  data:=jsonb_build_object('actorId',auth.uid(),'relationshipId',r.id,'requests',data);
 ELSIF p_mode='read' THEN data:=consultation_ticket_private.history(r,p_request);
 ELSIF p_mode='lookup' THEN
  IF p_request IS NULL OR p_token IS NULL OR length(p_token) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid lookup' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT FROM consultation_ticket_private.requests WHERE request_id=p_request AND relationship_id=r.id) THEN
   resource:=jsonb_build_object('state','found','data',consultation_ticket_private.history(r,p_request));
  ELSE resource:=jsonb_build_object('state','confirmed_absent','data',NULL);END IF;
  SELECT * INTO saved FROM consultation_ticket_private.receipts WHERE actor_id=auth.uid() AND client_token=p_token;
  IF saved.actor_id IS NOT NULL THEN
   -- A reused token for another relation/request must not disclose its private command.
   IF saved.request_id<>p_request OR NOT EXISTS(SELECT FROM consultation_ticket_private.requests WHERE request_id=saved.request_id AND relationship_id=r.id) THEN
    RAISE EXCEPTION 'lookup correlation changed' USING ERRCODE='PT409';END IF;
   attempt:=jsonb_build_object('state','found','receipt',saved.receipt);
  ELSE attempt:=jsonb_build_object('state','confirmed_absent','receipt',NULL);END IF;
  data:=jsonb_build_object('contractVersion','consultation-ticket-lookup.v1','actorId',auth.uid(),'relationshipId',r.id,'requestId',p_request,
   'clientToken',p_token,'authority','not_connected','request',resource,'attempt',attempt);
 ELSE RAISE EXCEPTION 'invalid ticket read mode' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('contractVersion','consultation-ticket-storage.v1','mode',p_mode,'capability',cap,'data',data);
END $$;
CREATE FUNCTION consultation_ticket_private.execute(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();r public.consultation_relationships;c jsonb;k text;token text;fingerprint text;
 prior_receipt consultation_ticket_private.receipts;ticket consultation_ticket_private.requests;last_event consultation_ticket_private.events;
 reference public.consultation_sessions;cap jsonb;event_id uuid;next_version integer;result jsonb;written_at timestamptz;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 PERFORM consultation_private.keys(p,ARRAY['contractVersion','expectedActorId','clientToken','command'],ARRAY['contractVersion','expectedActorId','clientToken','command']);
 IF p->>'contractVersion' IS DISTINCT FROM 'consultation-ticket-request.v1' OR consultation_private.uid(p->'expectedActorId')<>actor THEN
  RAISE EXCEPTION 'ticket actor mismatch' USING ERRCODE='42501';END IF;
 IF octet_length(convert_to(p::text,'UTF8'))>20000 THEN RAISE EXCEPTION 'ticket body bound' USING ERRCODE='22023';END IF;
 c:=consultation_ticket_private.command(p->'command');k:=c->>'kind';token:=consultation_private.txt(p->'clientToken',200);
 -- Existing actor + relation lock order is preserved across both APIs.
 PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(actor::text));
 r:=consultation_ticket_private.authorized((c->>'relationshipId')::uuid);
 IF NOT consultation_private.access(r,true,false) THEN RAISE EXCEPTION 'active consent required' USING ERRCODE='42501';END IF;
 IF k IN('open','member_followup') THEN
  IF actor<>r.client_id THEN RAISE EXCEPTION 'member action required' USING ERRCODE='42501';END IF;
 ELSE
  IF actor<>r.advisor_id OR NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner) THEN
   RAISE EXCEPTION 'owner advisor action required' USING ERRCODE='42501';END IF;
 END IF;
 cap:=consultation_ticket_private.capability(r.id,actor);
 IF cap->>'state'<>'owned_fixture' THEN RAISE EXCEPTION 'service entitlement not connected' USING ERRCODE='PT503';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_ticket_request'),hashtext(c->>'requestId'));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('actor',actor,'command',c)::text,'UTF8')),'hex');
 SELECT * INTO prior_receipt FROM consultation_ticket_private.receipts WHERE actor_id=actor AND client_token=token;
 IF prior_receipt.actor_id IS NOT NULL THEN
  IF prior_receipt.content_hash<>fingerprint THEN RAISE EXCEPTION 'ticket token conflict' USING ERRCODE='PT409';END IF;
  RETURN prior_receipt.receipt||jsonb_build_object('reused',true);
 END IF;
 SELECT * INTO ticket FROM consultation_ticket_private.requests WHERE request_id=(c->>'requestId')::uuid;
 IF k='open' THEN
  IF ticket.request_id IS NOT NULL THEN RAISE EXCEPTION 'request already exists' USING ERRCODE='PT409';END IF;
  next_version:=1;
 ELSE
  IF ticket.request_id IS NULL OR ticket.relationship_id<>r.id THEN RAISE EXCEPTION 'request unavailable' USING ERRCODE='P0002';END IF;
  SELECT * INTO last_event FROM consultation_ticket_private.events WHERE request_id=ticket.request_id ORDER BY version DESC LIMIT 1;
  IF last_event.id IS NULL OR last_event.version<>(c->>'baseVersion')::integer OR last_event.version>=500 OR last_event.command->>'kind'='close' THEN
   RAISE EXCEPTION 'ticket history or base changed' USING ERRCODE='PT409';END IF;
  next_version:=last_event.version+1;
 END IF;
 IF k='link_recommendation' OR (k='open' AND c->'recommendation'<>'null'::jsonb) THEN
  SELECT * INTO reference FROM public.consultation_sessions WHERE id=(c->'recommendation'->>'sessionId')::uuid;
  IF reference.id IS NULL OR reference.relationship_id<>r.id OR reference.version<>(c->'recommendation'->>'version')::integer
   OR reference.content_hash<>c->'recommendation'->>'contentHash'
   OR consultation_private.state(reference.id) NOT IN('published','withdrawn')
   OR NOT EXISTS(SELECT FROM public.consultation_publications WHERE session_id=reference.id) THEN
   RAISE EXCEPTION 'exact published recommendation required' USING ERRCODE='PT409';END IF;
 END IF;
 written_at:=clock_timestamp();
 IF written_at<r.created_at OR (last_event.id IS NOT NULL AND written_at<last_event.created_at) THEN
  RAISE EXCEPTION 'clock ordering unavailable' USING ERRCODE='PT409';END IF;
 IF k='open' THEN INSERT INTO consultation_ticket_private.requests(request_id,relationship_id,opened_by,created_at)
  VALUES((c->>'requestId')::uuid,r.id,actor,written_at);END IF;
 INSERT INTO consultation_ticket_private.events(request_id,actor_id,version,command,content_hash,created_at)
 VALUES((c->>'requestId')::uuid,actor,next_version,c,fingerprint,written_at) RETURNING id INTO event_id;
 result:=jsonb_build_object('contractVersion','consultation-ticket-write.v1','actorId',actor,'clientToken',token,'command',c,
  'id',event_id,'version',next_version,'reused',false,'canonicalContentHash',fingerprint);
 INSERT INTO consultation_ticket_private.receipts(actor_id,client_token,request_id,content_hash,receipt)
 VALUES(actor,token,(c->>'requestId')::uuid,fingerprint,result);
 RETURN result;
END $$;

-- Thin, session-bound wrappers need definer privilege solely for default-denied
-- private tables. Every path calls auth.uid + relation authorization internally.
CREATE FUNCTION public.load_consultation_ticket_inbox(p_relationship uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.load(p_relationship,NULL,NULL,'inbox'); $$;
CREATE FUNCTION public.load_consultation_ticket(p_relationship uuid,p_request uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.load(p_relationship,p_request,NULL,'read'); $$;
CREATE FUNCTION public.lookup_consultation_ticket(p_relationship uuid,p_request uuid,p_client_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.load(p_relationship,p_request,p_client_token,'lookup'); $$;
CREATE FUNCTION public.command_consultation_ticket(p_request jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='3s'
 AS $$ SELECT consultation_ticket_private.execute(p_request); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA consultation_ticket_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.load_consultation_ticket_inbox(uuid),public.load_consultation_ticket(uuid,uuid),public.lookup_consultation_ticket(uuid,uuid,text),public.command_consultation_ticket(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.load_consultation_ticket_inbox(uuid),public.load_consultation_ticket(uuid,uuid),public.lookup_consultation_ticket(uuid,uuid,text),public.command_consultation_ticket(jsonb) TO authenticated;
COMMIT;
