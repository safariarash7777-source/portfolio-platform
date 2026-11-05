-- Companion candidate only. Apply atomically with r2; no primary authorization.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
LOCK TABLE public.consultation_actions IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.command(jsonb)')) IS DISTINCT FROM '20701b814f94276bc90f8cad51f16174'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.execute(jsonb)')) IS DISTINCT FROM 'e65e1a32348c961f2b409a4f6593c05f'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('consultation_private.load(uuid,date,date)')) IS DISTINCT FROM 'e3b2b74277cc66c024a772e48382cfb1'
 THEN RAISE EXCEPTION 'rollout prerequisite drift' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT FROM consultation_private.feedback_rollout WHERE enabled) OR EXISTS(SELECT FROM public.consultation_actions WHERE status IN ('partial','not_done')) THEN RAISE EXCEPTION 'preserve compatible reader, gate and history' USING ERRCODE='PT409';END IF;
END $guard$;
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
   IF c->>'status' IN ('doing','done','partial','not_done') THEN
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
CREATE OR REPLACE FUNCTION consultation_private.load(p_relation uuid,p_start_on date,p_end_on date) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();r public.consultation_relationships;actor_json jsonb;advisors jsonb;relations jsonb;selected jsonb:=null;dossier jsonb:=null;basis jsonb;h public.member_holding_versions;c public.member_cash_flow_versions;g public.member_goals_versions;holdings jsonb:=null;cashflow jsonb:=null;goals jsonb:=null;sessions jsonb:='[]';notes jsonb:='[]';events jsonb:='[]';actions jsonb:='[]';session_ids uuid[]:='{}';is_advisor boolean;start_day date;end_day date;counted integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';END IF;
 IF (p_start_on IS NULL)<>(p_end_on IS NULL) THEN RAISE EXCEPTION 'period pair required' USING ERRCODE='22023';END IF;
 start_day:=coalesce(p_start_on,date_trunc('month',now() AT TIME ZONE 'Asia/Tehran')::date);end_day:=coalesce(p_end_on,(start_day+interval '1 month'-interval '1 day')::date);
 PERFORM consultation_private.period(jsonb_build_object('startOn',start_day,'endOn',end_day));
 actor_json:=jsonb_build_object('id',actor,'isAdvisor',EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled),'isOwner',EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=actor AND enabled AND is_owner));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',user_id,'displayName',display_name,'isOwner',is_owner) ORDER BY user_id),'[]') INTO advisors FROM public.consultation_advisors WHERE enabled AND is_owner;
 SELECT count(*) INTO counted FROM public.consultation_relationships x WHERE consultation_private.access(x);
 IF counted>100 THEN RAISE EXCEPTION 'relationship read bound exceeded' USING ERRCODE='54000';END IF;
 SELECT coalesce(jsonb_agg(consultation_private.relation_json(x) ORDER BY created_at DESC,id),'[]') INTO relations FROM public.consultation_relationships x WHERE consultation_private.access(x);
 IF p_relation IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
  SELECT * INTO r FROM public.consultation_relationships WHERE id=p_relation;
  IF r.id IS NULL OR NOT consultation_private.access(r) THEN RAISE EXCEPTION 'relationship forbidden' USING ERRCODE='42501';END IF;
  selected:=consultation_private.relation_json(r);is_advisor:=r.advisor_id=actor;
  -- Serialize the chosen financial versions with the same canonical write locks.
  PERFORM pg_advisory_xact_lock(hashtext('member_holdings'),hashtext(r.client_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('cash_flow_period:'||r.client_id::text),hashtext(start_day::text||':'||end_day::text));
  PERFORM pg_advisory_xact_lock(hashtext('member_goals'),hashtext(r.client_id::text));
  SELECT * INTO h FROM public.member_holding_versions WHERE user_id=r.client_id ORDER BY version DESC LIMIT 1;
  SELECT * INTO c FROM public.member_cash_flow_versions WHERE user_id=r.client_id AND period_start=start_day AND period_end=end_day ORDER BY version DESC LIMIT 1;
  SELECT * INTO g FROM public.member_goals_versions WHERE user_id=r.client_id ORDER BY version DESC LIMIT 1;
  basis:=jsonb_build_object('holdingsVersionId',h.id,'cashFlowPeriod',jsonb_build_object('startOn',start_day,'endOn',end_day),'cashFlowVersionId',c.id,'goalsVersionId',g.id);
  IF h.id IS NOT NULL THEN
   IF (SELECT count(*) FROM public.member_holding_positions WHERE version_id=h.id)>500 OR (SELECT count(*) FROM public.member_debt_positions WHERE version_id=h.id)>500 THEN RAISE EXCEPTION 'financial read bound exceeded' USING ERRCODE='54000';END IF;
   holdings:=jsonb_build_object('id',h.id,'version',h.version,
    'positions',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',position_key,'title',coalesce(title,manual_label,symbol,position_key),'quantity',qty::text,'unit',unit,'ownershipPercent',ownership_pct::text,'declaredValueToman',declared_value,'source',valuation_source,'asOf',coalesce(valuation_as_of,as_of)) ORDER BY position_key),'[]') FROM public.member_holding_positions WHERE version_id=h.id),
    'debts',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',debt_key,'title',title,'balanceToman',balance_toman,'balanceAsOf',balance_as_of,'nextInstallmentToman',next_installment_toman,'nextDueOn',next_due_on) ORDER BY debt_key),'[]') FROM public.member_debt_positions WHERE version_id=h.id));
  END IF;
  IF c.id IS NOT NULL THEN
   IF (SELECT count(*) FROM public.member_cash_flow_entries WHERE version_id=c.id)<>c.entry_count OR c.entry_count>500 THEN RAISE EXCEPTION 'cashflow incomplete' USING ERRCODE='54000';END IF;
   cashflow:=jsonb_build_object('id',c.id,'version',c.version,'payload',jsonb_build_object('contractVersion',1,'period',basis->'cashFlowPeriod','accountDefinitions',c.account_definitions,'scopeAccountKeys',c.scope_account_keys,'opening',c.opening,'coverage',c.coverage,'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('entryKey',e.entry_key,'basis',e.basis,'kind',e.kind,'amountToman',e.amount_toman,'occurredOn',e.occurred_on,'source',e.source,'category',e.category,'note',e.note)||CASE WHEN e.kind='transfer' THEN jsonb_build_object('fromAccountKey',e.from_account_key,'toAccountKey',e.to_account_key) ELSE jsonb_build_object('accountKey',e.account_key) END ORDER BY e.entry_key),'[]') FROM public.member_cash_flow_entries e WHERE e.version_id=c.id)));
  END IF;
  IF g.id IS NOT NULL THEN goals:=jsonb_build_object('id',g.id,'version',g.version,'payload',g.payload);END IF;
  dossier:=jsonb_build_object('basis',basis,'holdings',holdings,'cashFlow',cashflow,'goals',goals);
  SELECT count(*),array_agg(s.id) INTO counted,session_ids FROM public.consultation_sessions s WHERE relationship_id=r.id AND (is_advisor OR EXISTS(SELECT FROM public.consultation_publications p WHERE p.session_id=s.id));
  IF counted>100 THEN RAISE EXCEPTION 'session read bound exceeded' USING ERRCODE='54000';END IF;session_ids:=coalesce(session_ids,'{}');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'relationshipId',relationship_id,'sessionKey',session_key,'version',version,'createdAt',created_at,'actorId',actor_id,'contentHash',content_hash,'body',body,'state',consultation_private.state(s.id),'approval',(SELECT jsonb_build_object('actorId',e.actor_id,'createdAt',e.created_at) FROM public.consultation_events e WHERE e.session_id=s.id AND kind='approve')) ORDER BY created_at DESC,s.id),'[]') INTO sessions FROM public.consultation_sessions s WHERE s.id=ANY(session_ids);
  IF is_advisor THEN SELECT coalesce(jsonb_agg(jsonb_build_object('sessionId',session_id,'note',note) ORDER BY session_id),'[]') INTO notes FROM public.consultation_private_notes WHERE session_id=ANY(session_ids);END IF;
  SELECT count(*) INTO counted FROM public.consultation_events WHERE session_id=ANY(session_ids) AND (is_advisor OR kind IN ('publish','withdraw'));IF counted>400 THEN RAISE EXCEPTION 'event read bound exceeded' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'kind',kind,'actorId',actor_id,'createdAt',created_at,'note',CASE WHEN is_advisor THEN note ELSE null END) ORDER BY event_no),'[]') INTO events FROM public.consultation_events WHERE session_id=ANY(session_ids) AND (is_advisor OR kind IN ('publish','withdraw'));
  SELECT count(*) INTO counted FROM public.consultation_actions WHERE session_id=ANY(session_ids);IF counted>500 THEN RAISE EXCEPTION 'feedback read bound exceeded' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'actionKey',action_key,'version',version,'status',status,'text',text,'actorId',actor_id,'createdAt',created_at) ORDER BY created_at,id),'[]') INTO actions FROM public.consultation_actions WHERE session_id=ANY(session_ids);
 END IF;
 RETURN jsonb_build_object('contractVersion','consultation-read.v1','actor',actor_json,'advisors',advisors,'relationships',relations,'selected',selected,'dossier',dossier,'sessions',sessions,'notes',notes,'events',events,'actions',actions);
END $$;
DROP TABLE consultation_private.feedback_rollout;
COMMIT;
