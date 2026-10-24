-- Additive published clarification history. Requires the reviewed consultation v1 baseline.
-- No user, registry, financial data, environment or deployment changes. Fail on collision.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.consultation_reply_versions') IS NOT NULL OR to_regclass('public.consultation_reply_receipts') IS NOT NULL
 OR to_regprocedure('public.command_consultation_reply(jsonb)') IS NOT NULL OR to_regprocedure('public.load_consultation_replies(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'reply installer collision' USING ERRCODE='55000';END IF;
 IF to_regclass('public.consultation_actions') IS NULL OR to_regprocedure('consultation_private.basis_current(uuid,jsonb)') IS NULL
 OR to_regprocedure('consultation_private.research_current(jsonb)') IS NULL OR to_regprocedure('consultation_private.reject_mutation()') IS NULL
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'reply prerequisites missing' USING ERRCODE='55000';END IF;
END $$;
CREATE TABLE public.consultation_reply_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES public.consultation_actions(id),
 version integer NOT NULL CHECK(version>0), text text NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),
 actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), UNIQUE(question_id,version)
);
CREATE TABLE public.consultation_reply_receipts(
 actor_id uuid NOT NULL REFERENCES auth.users(id), client_token text NOT NULL CHECK(length(client_token) BETWEEN 1 AND 200),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,client_token)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['consultation_reply_versions','consultation_reply_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION consultation_private.reject_mutation()',t);
  EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION consultation_private.reject_mutation()',t);
 END LOOP;
END $$;

CREATE FUNCTION consultation_private.reply_command(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b bigint; BEGIN
 PERFORM consultation_private.keys(p,ARRAY['kind','relationshipId','sessionId','questionId','baseVersion','text','purpose'],ARRAY['kind','relationshipId','sessionId','questionId','baseVersion','text','purpose']);
 IF p->>'kind' IS DISTINCT FROM 'publish_reply' OR p->>'purpose' IS DISTINCT FROM 'clarification' THEN RAISE EXCEPTION 'invalid reply purpose' USING ERRCODE='22023';END IF;
 b:=consultation_private.amount(p->'baseVersion');IF b IS NULL OR b>2147483646 THEN RAISE EXCEPTION 'invalid reply base version' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('kind','publish_reply','purpose','clarification','relationshipId',consultation_private.uid(p->'relationshipId'),'sessionId',consultation_private.uid(p->'sessionId'),'questionId',consultation_private.uid(p->'questionId'),'baseVersion',b,'text',consultation_private.txt(p->'text',2000));
END $$;

-- Caller has the shared relationship lock and has verified relationship/session linkage.
-- A read can expose stale history; fresh writes must reject every non-null reason.
CREATE FUNCTION consultation_private.reply_read_only(r public.consultation_relationships,s public.consultation_sessions) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM public.consultation_revocations WHERE relationship_id=r.id) THEN RETURN 'revoked';END IF;
 IF NOT EXISTS(SELECT FROM public.consultation_publications WHERE session_id=s.id) THEN RETURN 'unpublished';END IF;
 IF consultation_private.state(s.id)<>'published' THEN RETURN 'withdrawn';END IF;
 IF EXISTS(SELECT FROM public.consultation_sessions WHERE relationship_id=r.id AND session_key=s.session_key AND version>s.version) THEN RETURN 'superseded';END IF;
 IF (s.body->>'reviewOn')::date<(now() AT TIME ZONE 'Asia/Tehran')::date THEN RETURN 'expired';END IF;
 IF auth.uid()<>r.advisor_id OR NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=auth.uid() AND enabled AND is_owner) THEN RETURN 'not_owner';END IF;
 BEGIN PERFORM consultation_private.basis_current(r.client_id,s.body->'basis');EXCEPTION WHEN SQLSTATE 'PT409' THEN RETURN 'basis_changed';END;
 BEGIN PERFORM consultation_private.research_current(s.body->'researchVersionIds');EXCEPTION WHEN SQLSTATE '22023' THEN RETURN 'research_changed';END;
 RETURN NULL;
END $$;

CREATE FUNCTION consultation_private.execute_reply(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();c jsonb;token text;fingerprint text;r public.consultation_relationships;s public.consultation_sessions;q public.consultation_actions;
 prior_receipt public.consultation_reply_receipts;prior integer;result_id uuid;result jsonb;reason text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 PERFORM consultation_private.keys(p_request,ARRAY['contractVersion','expectedActorId','clientToken','command'],ARRAY['contractVersion','expectedActorId','clientToken','command']);
 IF p_request->>'contractVersion' IS DISTINCT FROM 'consultation-reply-request.v1' THEN RAISE EXCEPTION 'invalid reply contract' USING ERRCODE='22023';END IF;
 IF consultation_private.uid(p_request->'expectedActorId')<>actor THEN RAISE EXCEPTION 'reply actor changed' USING ERRCODE='42501';END IF;
 c:=consultation_private.reply_command(p_request->'command');token:=consultation_private.txt(p_request->'clientToken',200);
 PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(actor::text));
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(c->>'relationshipId'));
 SELECT * INTO r FROM public.consultation_relationships WHERE id=(c->>'relationshipId')::uuid;
 IF r.id IS NULL OR NOT consultation_private.access(r,true,true) THEN RAISE EXCEPTION 'reply relationship forbidden' USING ERRCODE='42501';END IF;
 -- Share-lock serializes concurrent owner disable/demotion through COMMIT.
 PERFORM 1 FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'reply owner required' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.consultation_sessions WHERE id=(c->>'sessionId')::uuid AND relationship_id=r.id;
 SELECT * INTO q FROM public.consultation_actions WHERE id=(c->>'questionId')::uuid AND session_id=s.id AND status='question' AND actor_id=r.client_id;
 IF s.id IS NULL OR q.id IS NULL THEN RAISE EXCEPTION 'reply question linkage forbidden' USING ERRCODE='42501';END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('actor',actor,'command',c)::text,'UTF8')),'hex');
 SELECT * INTO prior_receipt FROM public.consultation_reply_receipts WHERE actor_id=actor AND client_token=token;
 IF prior_receipt.actor_id IS NOT NULL THEN
  IF prior_receipt.content_hash<>fingerprint THEN RAISE EXCEPTION 'reply token changed' USING ERRCODE='PT409';END IF;
  RETURN prior_receipt.receipt||jsonb_build_object('reused',true);
 END IF;
 reason:=consultation_private.reply_read_only(r,s);
 IF reason IS NOT NULL THEN RAISE EXCEPTION 'recommendation is read only' USING ERRCODE='PT409';END IF;
 IF (SELECT count(*) FROM public.consultation_reply_versions v JOIN public.consultation_actions a ON a.id=v.question_id WHERE a.session_id=s.id)>=200 THEN RAISE EXCEPTION 'reply history bound exceeded' USING ERRCODE='PT409';END IF;
 SELECT coalesce(max(version),0) INTO prior FROM public.consultation_reply_versions WHERE question_id=q.id;
 IF prior<>(c->>'baseVersion')::integer THEN RAISE EXCEPTION 'reply version changed' USING ERRCODE='PT409';END IF;
 INSERT INTO public.consultation_reply_versions(question_id,version,text,actor_id,content_hash) VALUES(q.id,prior+1,c->>'text',actor,fingerprint) RETURNING id INTO result_id;
 result:=jsonb_build_object('contractVersion','consultation-reply-write.v1','actorId',actor,'clientToken',token,'command',c,'id',result_id,'version',prior+1,'reused',false,'canonicalContentHash',fingerprint);
 INSERT INTO public.consultation_reply_receipts(actor_id,client_token,content_hash,receipt) VALUES(actor,token,fingerprint,result);
 RETURN result;
END $$;

CREATE FUNCTION consultation_private.load_replies(p_relationship uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();r public.consultation_relationships;s public.consultation_sessions;reason text;items jsonb;counted integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 IF p_relationship IS NULL OR p_session IS NULL THEN RAISE EXCEPTION 'reply selection required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relationship::text));
 SELECT * INTO r FROM public.consultation_relationships WHERE id=p_relationship;
 IF r.id IS NULL OR NOT consultation_private.access(r) THEN RAISE EXCEPTION 'reply relationship forbidden' USING ERRCODE='42501';END IF;
 IF actor=r.advisor_id THEN
  PERFORM 1 FROM public.consultation_advisors WHERE user_id=actor AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reply advisor disabled' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO s FROM public.consultation_sessions WHERE id=p_session AND relationship_id=r.id;
 IF s.id IS NULL OR (actor=r.client_id AND NOT EXISTS(SELECT FROM public.consultation_publications WHERE session_id=s.id)) THEN RAISE EXCEPTION 'reply session forbidden' USING ERRCODE='42501';END IF;
 reason:=consultation_private.reply_read_only(r,s);
 SELECT count(*) INTO counted FROM public.consultation_reply_versions v JOIN public.consultation_actions a ON a.id=v.question_id WHERE a.session_id=s.id;
 IF counted>200 THEN RAISE EXCEPTION 'reply read bound exceeded' USING ERRCODE='54000';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'questionId',v.question_id,'sessionId',a.session_id,'version',v.version,'text',v.text,'actorId',v.actor_id,'createdAt',v.created_at,'contentHash',v.content_hash) ORDER BY v.created_at,v.id),'[]') INTO items
 FROM public.consultation_reply_versions v JOIN public.consultation_actions a ON a.id=v.question_id WHERE a.session_id=s.id;
 RETURN jsonb_build_object('contractVersion','consultation-reply-read.v1','actorId',actor,'relationshipId',r.id,'sessionId',s.id,'canReply',reason IS NULL,'readOnlyReason',reason,'replies',items);
END $$;

CREATE FUNCTION public.command_consultation_reply(p_request jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT consultation_private.execute_reply(p_request); $$;
CREATE FUNCTION public.load_consultation_replies(p_relationship uuid,p_session uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT consultation_private.load_replies(p_relationship,p_session); $$;
REVOKE ALL ON FUNCTION consultation_private.reply_command(jsonb),consultation_private.reply_read_only(public.consultation_relationships,public.consultation_sessions),consultation_private.execute_reply(jsonb),consultation_private.load_replies(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.command_consultation_reply(jsonb),public.load_consultation_replies(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_consultation_reply(jsonb),public.load_consultation_replies(uuid,uuid) TO authenticated;
COMMIT;
