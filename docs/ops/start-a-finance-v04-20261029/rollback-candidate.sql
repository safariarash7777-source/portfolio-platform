-- START-A v0.4 CANDIDATE ONLY. Not installed on any operational database.
-- Generated from the unchanged consultation baseline; only two private bodies and a status constraint differ.
-- No financial writes, role/grant/policy changes, or history updates. Review deployment compatibility before installation.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
LOCK TABLE public.consultation_actions IN ACCESS EXCLUSIVE MODE;

DO $guard$
DECLARE allowed text[]; command_oid oid := to_regprocedure('consultation_private.command(jsonb)'); execute_oid oid := to_regprocedure('consultation_private.execute(jsonb)');
BEGIN
 IF command_oid IS NULL OR execute_oid IS NULL OR to_regclass('public.consultation_actions') IS NULL THEN RAISE EXCEPTION 'consultation prerequisite missing' USING ERRCODE='PT409'; END IF;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=command_oid) <> '20701b814f94276bc90f8cad51f16174'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=execute_oid) <> 'b97a210cd7e6064ffaa52c703b6d972a'
 OR EXISTS(SELECT FROM pg_proc WHERE oid IN(command_oid,execute_oid) AND (prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=""']))
 THEN RAISE EXCEPTION 'consultation kernel changed; stop and review compatible candidate' USING ERRCODE='PT409'; END IF;
 SELECT array_agg(m[1] ORDER BY m[1]) INTO allowed FROM pg_constraint c CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([^'']*)''', 'g') m
 WHERE c.conrelid='public.consultation_actions'::regclass AND c.conname='consultation_actions_status_check' AND c.contype='c' AND c.convalidated;
 IF allowed IS DISTINCT FROM ARRAY['acknowledged','doing','done','not_done','partial','question','viewed']::text[] THEN RAISE EXCEPTION 'feedback status constraint changed' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT FROM public.consultation_actions WHERE status IN ('partial','not_done')) THEN RAISE EXCEPTION 'new feedback history exists; preserve compatible reader and history' USING ERRCODE='PT409'; END IF;
END $guard$;

ALTER TABLE public.consultation_actions DROP CONSTRAINT consultation_actions_status_check;
ALTER TABLE public.consultation_actions ADD CONSTRAINT consultation_actions_status_check CHECK(status IN ('viewed','acknowledged','doing','done','question'));
CREATE OR REPLACE FUNCTION consultation_private.command(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;b bigint;result jsonb;status text;message text;fingerprint text;
BEGIN
 k:=consultation_private.txt(p->'kind',10);
 IF k='grant' THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','advisorId','clientLabel'],ARRAY['kind','advisorId','clientLabel']);
  RETURN jsonb_build_object('kind',k,'advisorId',consultation_private.uid(p->'advisorId'),'clientLabel',consultation_private.txt(p->'clientLabel',120));
 END IF;
 result:=jsonb_build_object('kind',k,'relationshipId',consultation_private.uid(p->'relationshipId'));
 IF k='revoke' THEN PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId'],ARRAY['kind','relationshipId']);RETURN result;
 ELSIF k='save' THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionKey','baseVersion','body','privateNote'],ARRAY['kind','relationshipId','sessionKey','baseVersion','body','privateNote']);
  b:=consultation_private.amount(p->'baseVersion');IF b IS NULL OR b>2147483646 THEN RAISE EXCEPTION 'invalid base' USING ERRCODE='22023';END IF;
  RETURN result||jsonb_build_object('sessionKey',consultation_private.uid(p->'sessionKey'),'baseVersion',b,'body',consultation_private.body(p->'body'),'privateNote',consultation_private.txt(p->'privateNote',10000,true));
 ELSIF k IN ('submit','approve','publish','withdraw') THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionId','contentHash','note'],ARRAY['kind','relationshipId','sessionId','contentHash','note']);
  fingerprint:=consultation_private.txt(p->'contentHash',64);IF fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid hash' USING ERRCODE='22023';END IF;
  RETURN result||jsonb_build_object('sessionId',consultation_private.uid(p->'sessionId'),'contentHash',fingerprint,'note',consultation_private.txt(p->'note',2000,true));
 ELSIF k='feedback' THEN
  PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionId','actionKey','baseVersion','status','text'],ARRAY['kind','relationshipId','sessionId','actionKey','baseVersion','status','text']);
  b:=consultation_private.amount(p->'baseVersion');status:=consultation_private.txt(p->'status',12);message:=consultation_private.txt(p->'text',2000,true);
  IF b IS NULL OR b>2147483646 OR status NOT IN ('viewed','acknowledged','doing','done','question') OR (status='question' AND message IS NULL) THEN RAISE EXCEPTION 'invalid feedback' USING ERRCODE='22023';END IF;
  RETURN result||jsonb_build_object('sessionId',consultation_private.uid(p->'sessionId'),'actionKey',consultation_private.uid(p->'actionKey',true),'baseVersion',b,'status',status,'text',message);
 END IF;
 RAISE EXCEPTION 'unknown command' USING ERRCODE='22023';
END $$;
CREATE OR REPLACE FUNCTION consultation_private.execute(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();c jsonb;k text;token text;fingerprint text;prior_receipt public.consultation_command_receipts;r public.consultation_relationships;s public.consultation_sessions;prior integer;result_id uuid;result_version integer:=1;result jsonb;state text;approval uuid;action jsonb;key uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 PERFORM consultation_private.keys(p,ARRAY['contractVersion','expectedActorId','clientToken','command'],ARRAY['contractVersion','expectedActorId','clientToken','command']);
 IF p->>'contractVersion' IS DISTINCT FROM 'consultation-request.v1' OR octet_length(p::text)>150000 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 IF consultation_private.uid(p->'expectedActorId')<>actor THEN RAISE EXCEPTION 'actor changed' USING ERRCODE='42501';END IF;
 token:=consultation_private.txt(p->'clientToken',200);c:=consultation_private.command(p->'command');k:=c->>'kind';
 PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(actor::text));
 IF k='grant' THEN
  PERFORM pg_advisory_xact_lock(hashtext('consultation_consent'),hashtext(actor::text||':'||(c->>'advisorId')));
  IF actor=(c->>'advisorId')::uuid OR NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=(c->>'advisorId')::uuid AND enabled AND is_owner) THEN RAISE EXCEPTION 'advisor unavailable' USING ERRCODE='42501';END IF;
 ELSE
  IF k='revoke' THEN
   SELECT * INTO r FROM public.consultation_relationships WHERE id=(c->>'relationshipId')::uuid;
   IF r.id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('consultation_consent'),hashtext(r.client_id::text||':'||r.advisor_id::text));END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(c->>'relationshipId'));
  SELECT * INTO r FROM public.consultation_relationships WHERE id=(c->>'relationshipId')::uuid;
  IF r.id IS NULL OR NOT consultation_private.access(r,k<>'revoke',k IN ('save','submit','approve','publish','withdraw')) THEN RAISE EXCEPTION 'relationship forbidden' USING ERRCODE='42501';END IF;
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('actor',actor,'command',c)::text,'UTF8')),'hex');
 SELECT * INTO prior_receipt FROM public.consultation_command_receipts WHERE actor_id=actor AND client_token=token;
 IF FOUND THEN
  IF prior_receipt.content_hash<>fingerprint THEN RAISE EXCEPTION 'token conflict' USING ERRCODE='PT409';END IF;
  RETURN prior_receipt.receipt||jsonb_build_object('reused',true);
 END IF;
 IF k='grant' THEN
  SELECT * INTO r FROM public.consultation_relationships WHERE client_id=actor AND advisor_id=(c->>'advisorId')::uuid AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=consultation_relationships.id);
  IF r.id IS NOT NULL AND r.client_label<>c->>'clientLabel' THEN RAISE EXCEPTION 'existing consent label differs' USING ERRCODE='PT409';END IF;
  IF r.id IS NULL THEN INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) VALUES(actor,(c->>'advisorId')::uuid,c->>'clientLabel') RETURNING * INTO r;END IF;result_id:=r.id;
 ELSIF k='revoke' THEN
  INSERT INTO public.consultation_revocations(relationship_id,actor_id) VALUES(r.id,actor) ON CONFLICT DO NOTHING;result_id:=r.id;
 ELSIF k='save' THEN
  SELECT coalesce(max(version),0) INTO prior FROM public.consultation_sessions WHERE relationship_id=r.id AND session_key=(c->>'sessionKey')::uuid;
  IF prior<>(c->>'baseVersion')::integer THEN RAISE EXCEPTION 'draft version changed' USING ERRCODE='PT409';END IF;
  PERFORM consultation_private.basis_current(r.client_id,c->'body'->'basis');PERFORM consultation_private.research_current(c->'body'->'researchVersionIds');
  result_version:=prior+1;
  INSERT INTO public.consultation_sessions(relationship_id,session_key,version,body,content_hash,actor_id) VALUES(r.id,(c->>'sessionKey')::uuid,result_version,c->'body',encode(sha256(convert_to((c->'body')::text,'UTF8')),'hex'),actor) RETURNING id INTO result_id;
  INSERT INTO public.consultation_private_notes(session_id,note) VALUES(result_id,c->>'privateNote');
 ELSE
  SELECT * INTO s FROM public.consultation_sessions WHERE id=(c->>'sessionId')::uuid AND relationship_id=r.id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'version forbidden' USING ERRCODE='42501';END IF;
  state:=consultation_private.state(s.id);result_version:=s.version;
  IF k='feedback' THEN
   IF NOT EXISTS(SELECT FROM public.consultation_publications WHERE session_id=s.id) OR state='withdrawn' THEN RAISE EXCEPTION 'publication unavailable' USING ERRCODE='42501';END IF;
   key:=(c->>'actionKey')::uuid;
   IF key IS NOT NULL THEN SELECT value INTO action FROM jsonb_array_elements(s.body->'actions') WHERE value->>'actionKey'=key::text;IF action IS NULL THEN RAISE EXCEPTION 'unknown action' USING ERRCODE='22023';END IF;END IF;
   IF c->>'status' IN ('doing','done') THEN
    IF action IS NULL OR (action->>'responsible'='member' AND actor<>r.client_id) OR (action->>'responsible'='advisor' AND actor<>r.advisor_id) THEN RAISE EXCEPTION 'action actor forbidden' USING ERRCODE='42501';END IF;
   ELSIF actor<>r.client_id THEN RAISE EXCEPTION 'member feedback only' USING ERRCODE='42501';END IF;
   SELECT coalesce(max(version),0) INTO prior FROM public.consultation_actions WHERE session_id=s.id AND action_key IS NOT DISTINCT FROM key;
   IF prior<>(c->>'baseVersion')::integer THEN RAISE EXCEPTION 'feedback version changed' USING ERRCODE='PT409';END IF;result_version:=prior+1;
   INSERT INTO public.consultation_actions(session_id,action_key,version,status,text,actor_id) VALUES(s.id,key,result_version,c->>'status',c->>'text',actor) RETURNING id INTO result_id;
  ELSE
   IF s.content_hash<>c->>'contentHash' OR (k<>'withdraw' AND EXISTS(SELECT FROM public.consultation_sessions WHERE relationship_id=r.id AND session_key=s.session_key AND version>s.version)) THEN RAISE EXCEPTION 'recommendation changed' USING ERRCODE='PT409';END IF;
   IF (k='submit' AND state<>'draft') OR (k='approve' AND state<>'submitted') OR (k='publish' AND state<>'approved') OR (k='withdraw' AND state NOT IN ('submitted','approved','published')) THEN RAISE EXCEPTION 'workflow state changed' USING ERRCODE='PT409';END IF;
   IF k='approve' AND NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner) THEN RAISE EXCEPTION 'owner approval required' USING ERRCODE='42501';END IF;
   IF k IN ('approve','publish') THEN
    PERFORM consultation_private.basis_current(r.client_id,s.body->'basis');PERFORM consultation_private.research_current(s.body->'researchVersionIds');
    IF (s.body->>'reviewOn')::date<(now() AT TIME ZONE 'Asia/Tehran')::date THEN RAISE EXCEPTION 'review overdue' USING ERRCODE='22023';END IF;
   END IF;
   IF k='publish' THEN
    SELECT e.id INTO approval FROM public.consultation_events e JOIN public.consultation_advisors a ON a.user_id=e.actor_id AND a.enabled AND a.is_owner WHERE e.session_id=s.id AND e.kind='approve';
    IF approval IS NULL THEN RAISE EXCEPTION 'owner approval unavailable' USING ERRCODE='42501';END IF;
    INSERT INTO public.consultation_publications(session_id,approval_id,actor_id) VALUES(s.id,approval,actor);
   END IF;
   INSERT INTO public.consultation_events(session_id,kind,actor_id,note) VALUES(s.id,k,actor,c->>'note') RETURNING id INTO result_id;
  END IF;
 END IF;
 result:=jsonb_build_object('contractVersion','consultation-write.v1','actorId',actor,'clientToken',token,'command',c,'id',result_id,'version',result_version,'reused',false,'canonicalContentHash',fingerprint);
 INSERT INTO public.consultation_command_receipts(actor_id,client_token,content_hash,receipt) VALUES(actor,token,fingerprint,result);
 RETURN result;
END $$;
COMMIT;
