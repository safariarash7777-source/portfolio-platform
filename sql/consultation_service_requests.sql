-- Additive, explicit binding of a legacy purchase/grant to an actual consultation item.
-- Existing entitlements keep their original duration and revocation rules.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('consultation_private.holdings_basis(uuid,uuid)') IS NULL
    OR to_regprocedure('consultation_private.basis_current(uuid,uuid,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'request-pinned consultation workflow required' USING ERRCODE='55000'; END IF;
END $$;
-- On an existing installation, operations must supply reviewed purchase records
-- in these two temporary tables on THIS connection before running the file.
-- A completely empty destination can install without a review packet.
LOCK TABLE public.entitlements,public.consultation_relationships,public.consultation_revocations IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE IF NOT EXISTS consultation_entitlement_review (
  entitlement_id uuid PRIMARY KEY, item_code text, item_title text,
  request_limit integer, previously_used integer, evidence_ref text NOT NULL,
  CHECK (length(trim(evidence_ref)) > 0),
  CHECK ((item_code IS NULL AND item_title IS NULL AND request_limit IS NULL AND previously_used IS NULL)
    OR (item_code IS NOT NULL AND item_title IS NOT NULL AND request_limit IS NOT NULL
    AND previously_used IS NOT NULL AND previously_used BETWEEN 0 AND request_limit))
) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS consultation_relationship_review (
  relationship_id uuid PRIMARY KEY, entitlement_id uuid, evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0)
) ON COMMIT DROP;
DO $$ BEGIN
 IF EXISTS (SELECT FROM public.entitlements e WHERE e.kind='consulting' AND e.revoked_at IS NULL AND e.expires_at>now()
   AND NOT EXISTS(SELECT FROM pg_temp.consultation_entitlement_review m WHERE m.entitlement_id=e.id))
 THEN RAISE EXCEPTION 'review existing consulting purchases before enabling service access' USING ERRCODE='55000'; END IF;
 IF EXISTS (SELECT FROM public.consultation_relationships r WHERE NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id)
   AND NOT EXISTS(SELECT FROM pg_temp.consultation_relationship_review m WHERE m.relationship_id=r.id))
 THEN RAISE EXCEPTION 'review existing consent relationships before enabling service access' USING ERRCODE='55000'; END IF;
 IF EXISTS (SELECT FROM pg_temp.consultation_entitlement_review m LEFT JOIN public.entitlements e ON e.id=m.entitlement_id
   WHERE e.id IS NULL OR e.kind<>'consulting' OR nullif(trim(m.evidence_ref),'') IS NULL)
 OR EXISTS (SELECT FROM pg_temp.consultation_relationship_review m LEFT JOIN public.consultation_relationships r ON r.id=m.relationship_id
   LEFT JOIN public.entitlements e ON e.id=m.entitlement_id LEFT JOIN pg_temp.consultation_entitlement_review a ON a.entitlement_id=e.id
   WHERE r.id IS NULL OR nullif(trim(m.evidence_ref),'') IS NULL OR
   (m.entitlement_id IS NOT NULL AND (a.item_code IS NULL OR e.user_id IS DISTINCT FROM r.client_id)))
 THEN RAISE EXCEPTION 'unverified purchase or consent binding' USING ERRCODE='55000'; END IF;
END $$;
CREATE TABLE consultation_private.service_items (
  code text PRIMARY KEY CHECK (length(trim(code)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160)
);
CREATE TABLE consultation_private.service_rights (
  entitlement_id uuid PRIMARY KEY REFERENCES public.entitlements(id),
  item_code text NOT NULL REFERENCES consultation_private.service_items(code),
  request_limit integer NOT NULL CHECK (request_limit > 0),
  previously_used integer NOT NULL DEFAULT 0 CHECK (previously_used BETWEEN 0 AND request_limit)
);
CREATE TABLE consultation_private.service_requests (
  relationship_id uuid PRIMARY KEY REFERENCES public.consultation_relationships(id),
  entitlement_id uuid NOT NULL REFERENCES consultation_private.service_rights(entitlement_id),
  holdings_version_id uuid NOT NULL REFERENCES public.member_holding_versions(id),
  client_token uuid NOT NULL,
  UNIQUE(entitlement_id,client_token)
);
CREATE INDEX consultation_service_request_counts ON consultation_private.service_requests(entitlement_id);
REVOKE ALL ON consultation_private.service_items,consultation_private.service_rights,consultation_private.service_requests
 FROM PUBLIC,anon,authenticated,service_role;

-- Keep the reviewed provenance, including explicit decisions that a legacy
-- membership was a different service. Never rewrite or delete purchased rights.
CREATE TABLE consultation_private.entitlement_review_history AS SELECT * FROM pg_temp.consultation_entitlement_review;
CREATE TABLE consultation_private.relationship_review_history (
  relationship_id uuid PRIMARY KEY REFERENCES public.consultation_relationships(id),
  entitlement_id uuid REFERENCES consultation_private.service_rights(entitlement_id),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0)
);
REVOKE ALL ON consultation_private.entitlement_review_history,consultation_private.relationship_review_history FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO consultation_private.service_items SELECT DISTINCT item_code,item_title FROM pg_temp.consultation_entitlement_review WHERE item_code IS NOT NULL;
INSERT INTO consultation_private.service_rights SELECT entitlement_id,item_code,request_limit,previously_used FROM pg_temp.consultation_entitlement_review WHERE item_code IS NOT NULL;
INSERT INTO consultation_private.relationship_review_history SELECT relationship_id,entitlement_id,evidence_ref FROM pg_temp.consultation_relationship_review;

CREATE FUNCTION consultation_private.current_service(p_relation uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM (
 SELECT relationship_id,entitlement_id FROM consultation_private.service_requests WHERE relationship_id=p_relation
 UNION ALL
 SELECT relationship_id,entitlement_id FROM consultation_private.relationship_review_history WHERE relationship_id=p_relation
 ) q
 JOIN public.entitlements e ON e.id=q.entitlement_id JOIN public.consultation_relationships r ON r.id=q.relationship_id
 WHERE r.id=p_relation AND e.user_id=r.client_id AND e.kind='consulting' AND e.revoked_at IS NULL
 AND now()>=e.starts_at AND now()<e.expires_at);
$$;

-- A service request pins the member's holdings/debts version. A later
-- portfolio edit must not change the case, and a mismatched pin must never
-- silently substitute a newer version. Legacy consent paths stay unchanged.
CREATE OR REPLACE FUNCTION consultation_private.holdings_basis(client uuid,p_relation uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE pinned uuid;
BEGIN
 SELECT q.holdings_version_id INTO pinned FROM consultation_private.service_requests q WHERE q.relationship_id=p_relation;
 IF FOUND THEN
  IF NOT EXISTS(SELECT FROM public.member_holding_versions h JOIN public.consultation_relationships r
    ON r.client_id=h.user_id WHERE r.id=p_relation AND h.id=pinned AND h.user_id=client)
  THEN RAISE EXCEPTION 'financial basis unavailable' USING ERRCODE='42501'; END IF;
  RETURN pinned;
 END IF;
 RETURN (SELECT id FROM public.member_holding_versions WHERE user_id=client ORDER BY version DESC LIMIT 1);
END $$;

-- Current paid service and active explicit consent are both required for advisor access.
-- Members retain their own published history and the ability to revoke consent after expiry.
CREATE OR REPLACE FUNCTION consultation_private.access(r public.consultation_relationships,active boolean DEFAULT false,advisor_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (
  (r.client_id=auth.uid() AND NOT advisor_only AND (NOT active OR
     (consultation_private.current_service(r.id) AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id))))
  OR (r.advisor_id=auth.uid() AND consultation_private.current_service(r.id)
    AND NOT EXISTS(SELECT FROM public.consultation_revocations v WHERE v.relationship_id=r.id)
    AND EXISTS(SELECT FROM public.consultation_advisors a WHERE a.user_id=r.advisor_id AND a.enabled)));
$$;

CREATE FUNCTION public.open_consultation_service_request(p_actor uuid,p_entitlement uuid,p_token uuid,p_subject text,p_consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE actor uuid:=auth.uid(); e public.entitlements; allowed integer; prior uuid; basis_id uuid; advisor uuid; relation uuid;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'actor changed' USING ERRCODE='42501'; END IF;
 IF p_consent IS DISTINCT FROM true OR p_token IS NULL OR p_subject IS NULL OR length(trim(p_subject)) NOT BETWEEN 1 AND 120
 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM public.entitlements WHERE id=p_entitlement AND user_id=actor AND kind='consulting' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'service unavailable' USING ERRCODE='42501'; END IF;
 SELECT q.relationship_id INTO prior FROM consultation_private.service_requests q WHERE q.entitlement_id=e.id AND client_token=p_token;
 IF FOUND THEN
   IF NOT EXISTS(SELECT FROM public.consultation_relationships WHERE id=prior AND client_id=actor AND client_label=trim(p_subject))
   THEN RAISE EXCEPTION 'attempt differs' USING ERRCODE='PT409'; END IF;
   RETURN prior;
 END IF;
 SELECT request_limit-previously_used INTO allowed FROM consultation_private.service_rights WHERE entitlement_id=e.id FOR SHARE;
 IF NOT FOUND OR e.revoked_at IS NOT NULL OR now()<e.starts_at OR now()>=e.expires_at
 THEN RAISE EXCEPTION 'service unavailable' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM consultation_private.service_requests WHERE entitlement_id=e.id)>=allowed
 THEN RAISE EXCEPTION 'quota used' USING ERRCODE='PT409'; END IF;
 SELECT user_id INTO advisor FROM public.consultation_advisors WHERE enabled AND is_owner FOR SHARE;
 IF NOT FOUND OR advisor=actor THEN RAISE EXCEPTION 'advisor unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(actor::text));
 SELECT id INTO basis_id FROM public.member_holding_versions WHERE user_id=actor ORDER BY version DESC LIMIT 1;
 IF basis_id IS NULL THEN RAISE EXCEPTION 'financial file required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.consultation_relationships(client_id,advisor_id,client_label) VALUES(actor,advisor,trim(p_subject)) RETURNING id INTO relation;
 INSERT INTO consultation_private.service_requests VALUES(relation,e.id,basis_id,p_token);
 RETURN relation;
END $$;

CREATE FUNCTION public.read_consultation_services(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); offers jsonb; files jsonb;
BEGIN
 IF actor IS NULL OR actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'actor changed' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',i.title,'starts',e.starts_at,'ends',e.expires_at,
   'remaining',greatest(0,s.request_limit-s.previously_used-(SELECT count(*) FROM consultation_private.service_requests WHERE entitlement_id=e.id))) ORDER BY e.expires_at,e.id),'[]')
 INTO offers FROM consultation_private.service_rights s JOIN public.entitlements e ON e.id=s.entitlement_id
 JOIN consultation_private.service_items i ON i.code=s.item_code
 WHERE e.user_id=actor AND e.kind='consulting' AND e.revoked_at IS NULL AND now()>=e.starts_at AND now()<e.expires_at;
 SELECT coalesce(jsonb_agg(jsonb_build_object('relation',r.id,'subject',r.client_label,'title',i.title,'created',r.created_at,
  'token',CASE WHEN r.client_id=actor THEN q.client_token END,'basisId',h.id,'basisVersion',h.version,'active',consultation_private.current_service(r.id)
  AND NOT EXISTS(SELECT FROM public.consultation_revocations WHERE relationship_id=r.id)) ORDER BY r.created_at DESC,r.id),'[]')
 INTO files FROM consultation_private.service_requests q JOIN public.consultation_relationships r ON r.id=q.relationship_id
 JOIN consultation_private.service_rights s ON s.entitlement_id=q.entitlement_id JOIN consultation_private.service_items i ON i.code=s.item_code
 JOIN public.member_holding_versions h ON h.id=q.holdings_version_id AND h.user_id=r.client_id WHERE consultation_private.access(r);
 RETURN jsonb_build_object('actor',actor,'offers',offers,'requests',files);
END $$;

CREATE OR REPLACE FUNCTION public.command_consultation(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_request->'command'->>'kind'='grant' THEN RAISE EXCEPTION 'select an entitled service and consent' USING ERRCODE='42501'; END IF;
 -- A reviewed legacy relationship supports its existing cases. Opening a
 -- fresh case always uses the explicit request flow and consumes a quota slot.
 IF p_request->'command'->>'kind'='save' AND p_request->'command'->>'baseVersion'='0' THEN
   PERFORM pg_advisory_xact_lock(hashtext('consultation_actor'),hashtext(auth.uid()::text));
   PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_request->'command'->>'relationshipId'));
   IF NOT EXISTS(SELECT FROM consultation_private.service_requests q JOIN public.consultation_relationships r ON r.id=q.relationship_id
                  WHERE r.id=(p_request->'command'->>'relationshipId')::uuid AND consultation_private.access(r,true,true))
   THEN RAISE EXCEPTION 'new case requires a service request' USING ERRCODE='42501'; END IF;
   IF EXISTS(SELECT FROM public.consultation_sessions WHERE relationship_id=(p_request->'command'->>'relationshipId')::uuid
        AND session_key<>(p_request->'command'->>'sessionKey')::uuid)
   THEN RAISE EXCEPTION 'request already has a recommendation; revise that version' USING ERRCODE='PT409'; END IF;
 END IF;
 RETURN consultation_private.execute(p_request);
END $$;

REVOKE ALL ON FUNCTION consultation_private.current_service(uuid),public.read_consultation_services(uuid),
 public.open_consultation_service_request(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_consultation_services(uuid),public.open_consultation_service_request(uuid,uuid,uuid,text,boolean) TO authenticated;
COMMIT;
