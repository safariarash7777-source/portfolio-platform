-- DEV07-F01: application base-version conflicts are HTTP 409, not transient serialization failures.
-- Requires phase32 -> phase34 -> phase35 -> phase36. Preserve locks, RLS and status-only behavior.
-- Apply last after rerunning those migrations. NOT_APPLIED to production.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_member_holdings(
  p_positions    jsonb,
  p_note         text DEFAULT NULL,
  p_client_token text DEFAULT NULL,
  p_base_version integer DEFAULT NULL
)
RETURNS TABLE (version_id uuid, version integer, position_count integer, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $record$
DECLARE
  v_user     uuid := auth.uid();
  v_token    text := nullif(btrim(coalesce(p_client_token, '')), '');
  v_existing public.member_holding_versions%ROWTYPE;
  v_next     integer;
  v_id       uuid;
  v_count    integer;
  v_hash     text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: ثبت دارایی نیاز به ورود دارد.';
  END IF;

  IF p_positions IS NULL OR jsonb_typeof(p_positions) <> 'array' OR jsonb_array_length(p_positions) = 0 THEN
    RAISE EXCEPTION 'حداقل یک قلم دارایی لازم است.';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_positions) e WHERE (e->>'qty')::numeric <= 0 OR (e->>'qty')::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'invalid quantity' USING ERRCODE='22023';
  END IF;

  -- ⚠️ قفلِ هم‌زمانی. بدونِ آن، دو درخواستِ موازی هر دو `max(version)` یکسان
  -- می‌خوانند و یکی با نقضِ یکتایی می‌ترکد. قفل روی **همین کاربر** است، پس
  -- کاربرهای دیگر معطل نمی‌شوند.
  PERFORM pg_advisory_xact_lock(hashtext('member_holdings'), hashtext(v_user::text));

  -- ⚠️ اثرِ انگشت **ساختاری** است، نه چسباندنِ رشته‌ها با جداکننده.
  --
  -- نسخهٔ قبل خطوط را با `~` به هم می‌چسباند و همان را هش می‌کرد. آن روش
  -- برخوردِ واقعی داشت: با نمادِ ثابت،
  --   asset_class='gold~1', qty=2, unit='u'
  -- و
  --   asset_class='gold',   qty=1, unit='2~u'
  -- دقیقاً یک رشتهٔ یکسان می‌سازند. یعنی دو محتوای متفاوت یک اثرِ انگشت
  -- می‌گرفتند و «ثبتِ تکراری» اشتباه تشخیص داده می‌شد.
  --
  -- حالا هر قلم یک `jsonb` با کلیدهای مشخص است و مرزِ مقادیر را خودِ
  -- ساختار نگه می‌دارد، نه یک کاراکترِ جداکننده. مقادیر با **نوعِ مقصد**
  -- نرمال می‌شوند (`numeric` و `date` و `bigint`) تا «۱۰» و «10.0» یکی
  -- شمرده شوند. یادداشت هم بخشی از محتواست و لحاظ می‌شود.
  SELECT md5(
           jsonb_build_object(
             'note', coalesce(nullif(btrim(coalesce(p_note, '')), ''), ''),
             'positions', coalesce(jsonb_agg(item ORDER BY item->>'k'), '[]'::jsonb)
           )::text
         ) INTO v_hash
    FROM (
      SELECT jsonb_build_object(
               'k', btrim(e->>'position_key'),
               's', coalesce(nullif(btrim(coalesce(e->>'symbol','')), ''), ''),
               'm', coalesce(nullif(btrim(coalesce(e->>'manual_label','')), ''), ''),
               'c', btrim(e->>'asset_class'),
               -- ⚠️ `trim_scale` لازم است: در Postgres مقدارِ `numeric` صفرهای
               -- انتهایی را نگه می‌دارد، پس `10` و `10.0` دو متنِ متفاوت
               -- می‌سازند و یک محتوا دو اثرِ انگشت می‌گیرد.
               'q', trim_scale((e->>'qty')::numeric),
               'u', btrim(e->>'unit'),
               'b', coalesce((nullif(btrim(coalesce(e->>'cost_basis','')), ''))::bigint, -1),
               'd', (e->>'as_of')::date
             ) AS item
        FROM jsonb_array_elements(p_positions) AS e
    ) AS items;

  -- ثبتِ دوباره با همان توکن **و همان محتوا** = همان نسخه، نه نسخهٔ تازه.
  -- همان توکن با محتوای متفاوت = خطای روشن، نه موفقیتِ دروغین.
  IF v_token IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.member_holding_versions
     WHERE user_id = v_user AND client_token = v_token;
    IF FOUND THEN
      IF v_existing.content_hash IS DISTINCT FROM v_hash THEN
        RAISE EXCEPTION 'این ثبت قبلاً با محتوای متفاوتی انجام شده است. صفحه را تازه کنید و دوباره ثبت کنید.';
      END IF;
      SELECT count(*) INTO v_count FROM public.member_holding_positions
       WHERE member_holding_positions.version_id = v_existing.id;
      RETURN QUERY SELECT v_existing.id, v_existing.version, v_count, true;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(max(v.version), 0) + 1 INTO v_next
    FROM public.member_holding_versions v WHERE v.user_id = v_user;

  IF p_base_version IS NOT NULL AND p_base_version <> v_next - 1 THEN
    RAISE EXCEPTION 'stale holdings version' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.member_holding_versions (user_id, version, client_token, content_hash, note)
  VALUES (v_user, v_next, v_token, v_hash, nullif(btrim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.member_holding_positions
    (version_id, position_key, symbol, manual_label, asset_class, qty, unit, cost_basis, as_of)
  SELECT
    v_id,
    btrim(e->>'position_key'),
    nullif(btrim(coalesce(e->>'symbol', '')), ''),
    nullif(btrim(coalesce(e->>'manual_label', '')), ''),
    btrim(e->>'asset_class'),
    (e->>'qty')::numeric,
    btrim(e->>'unit'),
    nullif(btrim(coalesce(e->>'cost_basis', '')), '')::bigint,
    (e->>'as_of')::date
  FROM jsonb_array_elements(p_positions) AS e;

  SELECT count(*) INTO v_count FROM public.member_holding_positions
   WHERE member_holding_positions.version_id = v_id;

  RETURN QUERY SELECT v_id, v_next, v_count, false;
END
$record$;

CREATE OR REPLACE FUNCTION public.save_consultation_session(p_relation uuid, p_session_key uuid, p_base integer, p_body jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE next_version integer; result uuid; h uuid; research uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
 IF NOT consultation_private.can_access(p_relation,true) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF p_session_key IS NULL OR p_base IS NULL OR p_base < 0 THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(version),0)+1 INTO next_version FROM public.consultation_sessions WHERE relationship_id=p_relation AND session_key=p_session_key;
 IF next_version<>p_base+1 THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='PT409'; END IF;
 h=nullif(p_body->>'holding_version_id','')::uuid; research=nullif(p_body->>'research_version_id','')::uuid;
 IF h IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.member_holding_versions v JOIN public.consultation_relationships r ON r.client_id=v.user_id WHERE r.id=p_relation AND v.id=h) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF research IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.research_workbook_versions w WHERE w.id=research
   AND NOT EXISTS (SELECT 1 FROM public.research_workbook_versions newer WHERE newer.workbook_id=w.workbook_id AND newer.version>w.version)
   AND (SELECT r.decision FROM public.research_workbook_reviews r WHERE r.version_id=w.id ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1)='approved_internal'
 ) THEN RAISE EXCEPTION 'research not approved' USING ERRCODE='22023'; END IF;
 INSERT INTO public.consultation_sessions(relationship_id,session_key,version,occurs_at,topic,goal,client_summary,holding_version_id,research_version_id,actor_id)
 VALUES(p_relation,p_session_key,next_version,(p_body->>'occurs_at')::timestamptz,btrim(p_body->>'topic'),btrim(p_body->>'goal'),btrim(p_body->>'client_summary'),h,research,auth.uid()) RETURNING id INTO result;
 INSERT INTO public.consultation_private_notes(session_id,note) VALUES(result,coalesce(p_body->>'private_note',''));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.publish_consultation_session(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.consultation_sessions;
BEGIN
 SELECT * INTO s FROM public.consultation_sessions WHERE id=p_session;
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(s.relationship_id::text));
 IF NOT consultation_private.can_access(s.relationship_id,true) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.consultation_sessions newer WHERE newer.relationship_id=s.relationship_id AND newer.session_key=s.session_key AND newer.version>s.version) THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.consultation_publications(session_id,actor_id) VALUES(s.id,auth.uid()) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION public.save_consultation_action(p_relation uuid,p_action_key uuid,p_base integer,p_body jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE prior public.consultation_actions; result uuid; s public.consultation_sessions; responsible uuid; is_advisor boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('consultation_relation'),hashtext(p_relation::text));
 IF NOT consultation_private.can_access(p_relation) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
 IF p_action_key IS NULL OR p_base IS NULL OR p_base < 0 THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM public.consultation_actions WHERE relationship_id=p_relation AND action_key=p_action_key ORDER BY version DESC LIMIT 1;
 IF coalesce(prior.version,0)<>p_base THEN RAISE EXCEPTION 'stale consultation version' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR coalesce(p_body->>'status','') NOT IN ('open','doing','done') THEN RAISE EXCEPTION 'invalid consultation input' USING ERRCODE='22023'; END IF;
 is_advisor=consultation_private.can_access(p_relation,true);
 IF NOT is_advisor OR NOT (p_body ?| ARRAY['title','session_id','responsible_id','due_on']) THEN
  IF prior.id IS NULL OR (NOT is_advisor AND prior.responsible_id<>auth.uid()) OR NOT consultation_private.published(prior.session_id) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.consultation_actions(relationship_id,session_id,action_key,version,title,responsible_id,due_on,status,actor_id)
  VALUES(p_relation,prior.session_id,p_action_key,p_base+1,prior.title,prior.responsible_id,prior.due_on,p_body->>'status',auth.uid()) RETURNING id INTO result;
 ELSE
  SELECT * INTO s FROM public.consultation_sessions WHERE id=(p_body->>'session_id')::uuid AND relationship_id=p_relation;
  IF s.id IS NULL OR NOT consultation_private.published(s.id) THEN RAISE EXCEPTION 'session not published' USING ERRCODE='22023'; END IF;
  responsible=(p_body->>'responsible_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.consultation_relationships WHERE id=p_relation AND responsible IN(client_id,advisor_id)) THEN RAISE EXCEPTION 'consultation forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.consultation_actions(relationship_id,session_id,action_key,version,title,responsible_id,due_on,status,actor_id)
  VALUES(p_relation,s.id,p_action_key,p_base+1,btrim(p_body->>'title'),responsible,(p_body->>'due_on')::date,p_body->>'status',auth.uid()) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.record_member_holdings(jsonb,text,text,integer),public.save_consultation_session(uuid,uuid,integer,jsonb),public.publish_consultation_session(uuid),public.save_consultation_action(uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_member_holdings(jsonb,text,text,integer),public.save_consultation_session(uuid,uuid,integer,jsonb),public.publish_consultation_session(uuid),public.save_consultation_action(uuid,uuid,integer,jsonb) TO authenticated;
COMMIT;
