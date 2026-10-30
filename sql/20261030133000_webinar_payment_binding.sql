-- CANDIDATE ONLY. Install through the existing reviewed backup/restore gate.
-- No legacy backfill, price/service policy, entitlement or provider operation.
BEGIN;

CREATE SCHEMA webinar_payment_private;
REVOKE ALL ON SCHEMA webinar_payment_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE webinar_payment_private.gates (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  issuance_enabled boolean NOT NULL DEFAULT false,
  settlement_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO webinar_payment_private.gates DEFAULT VALUES;
ALTER TABLE webinar_payment_private.gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE webinar_payment_private.gates FORCE ROW LEVEL SECURITY;

-- Identity/provenance only, never a second money ledger. No cascade on deletion.
CREATE TABLE webinar_payment_private.registration_issuances (
  registration_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  webinar_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  provenance text NOT NULL DEFAULT 'register-webinar.v1' CHECK (provenance = 'register-webinar.v1')
);
ALTER TABLE webinar_payment_private.registration_issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE webinar_payment_private.registration_issuances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA webinar_payment_private FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION webinar_payment_private.immutable_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'registration issuance is immutable';
END $$;
CREATE TRIGGER registration_issuances_immutable BEFORE UPDATE OR DELETE
  ON webinar_payment_private.registration_issuances FOR EACH ROW
  EXECUTE FUNCTION webinar_payment_private.immutable_issuance();

ALTER TABLE public.payments
  ADD COLUMN purpose_code text,
  ADD COLUMN bound_registration_id uuid,
  ADD COLUMN bound_webinar_id uuid,
  ADD COLUMN intent_key uuid,
  ADD COLUMN provider_request_state text;
ALTER TABLE public.payments ADD CONSTRAINT webinar_payment_binding_shape CHECK (
  (purpose_code IS NULL AND bound_registration_id IS NULL AND bound_webinar_id IS NULL
    AND intent_key IS NULL AND provider_request_state IS NULL)
  OR
  (purpose_code IS NOT NULL AND purpose_code = 'webinar.v1' AND bound_registration_id IS NOT NULL AND bound_webinar_id IS NOT NULL
    AND intent_key IS NOT NULL AND amount > 0 AND invite_link IS NULL
    AND ((status IN ('pending','failed') AND ref_id IS NULL AND verified_at IS NULL)
      OR (status='paid' AND ref_id IS NOT NULL AND ref_id ~ '^[1-9][0-9]*$' AND verified_at IS NOT NULL))
    AND provider_request_state IS NOT NULL AND provider_request_state IN ('prepared','claimed','attached')
    AND ((provider_request_state IN ('prepared','claimed') AND authority IS NULL AND status = 'pending')
      OR (provider_request_state = 'attached' AND authority IS NOT NULL
        AND char_length(authority) BETWEEN 1 AND 256 AND authority COLLATE "C" !~ '[^A-Za-z0-9_-]')))
);
CREATE UNIQUE INDEX webinar_payment_intent_unique ON public.payments(user_id, purpose_code, intent_key)
  WHERE purpose_code = 'webinar.v1';
-- A lost request ACK cannot be bypassed with a fresh client intent/charge.
CREATE UNIQUE INDEX webinar_payment_registration_unique ON public.payments(bound_registration_id)
  WHERE purpose_code = 'webinar.v1';

DROP POLICY IF EXISTS wr_user_insert ON public.webinar_registrations;
-- RLS/row triggers do not protect TRUNCATE under a permissive legacy grant profile.
REVOKE TRUNCATE ON public.payments, public.webinar_registrations FROM PUBLIC, anon, authenticated, service_role;
-- Existing admin policy and session-bound register_for_webinar remain unchanged.
-- Direct INSERT closure does not establish provenance of any pre-existing row.

CREATE FUNCTION webinar_payment_private.read_binding(p_authority text, p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.payments%ROWTYPE; r public.webinar_registrations%ROWTYPE;
        i webinar_payment_private.registration_issuances%ROWTYPE;
        g webinar_payment_private.gates%ROWTYPE; v_state text := 'unresolved';
BEGIN
  SELECT * INTO g FROM webinar_payment_private.gates WHERE singleton;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF (p_authority IS NULL) = (p_payment_id IS NULL) THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.payments
    WHERE (p_authority IS NOT NULL AND authority = p_authority)
       OR (p_payment_id IS NOT NULL AND id = p_payment_id);
  IF NOT FOUND OR p.purpose_code IS DISTINCT FROM 'webinar.v1' THEN RETURN NULL; END IF;
  SELECT * INTO i FROM webinar_payment_private.registration_issuances WHERE registration_id = p.bound_registration_id;
  IF NOT FOUND OR i.user_id IS DISTINCT FROM p.user_id OR i.webinar_id IS DISTINCT FROM p.bound_webinar_id THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.webinar_registrations WHERE id = p.bound_registration_id;
  IF FOUND AND r.user_id = p.user_id AND r.webinar_id = p.bound_webinar_id AND r.payment_id = p.id THEN
    v_state := r.payment_status;
  END IF;
  RETURN jsonb_build_object('contractVersion','webinar-payment-binding.v1','state','bound',
    'purpose',p.purpose_code,'registrationProvenance',i.provenance,
    'paymentId',p.id,'userId',p.user_id,'registrationId',p.bound_registration_id,'webinarId',p.bound_webinar_id,
    'intentKey',p.intent_key,'amountToman',p.amount,'createdAt',p.created_at,
    'authority',p.authority,'providerState',p.provider_request_state,'status',p.status,
    'refId',p.ref_id,'verifiedAt',p.verified_at,'registrationState',v_state,
    'issuanceEnabled',coalesce(g.issuance_enabled,false),'settlementEnabled',coalesce(g.settlement_enabled,false));
END $$;

CREATE FUNCTION webinar_payment_private.register_bound(p_webinar_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_registration uuid; v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authentication required'; END IF;
  IF NOT coalesce((SELECT issuance_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='webinar payment issuance disabled';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webinar-registration:' || p_webinar_id::text || ':' || v_user::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.webinar_registrations WHERE user_id=v_user AND webinar_id=p_webinar_id)
    AND EXISTS(SELECT 1 FROM public.payments WHERE user_id=v_user AND bound_webinar_id=p_webinar_id AND purpose_code='webinar.v1') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='prior webinar payment requires reconciliation';
  END IF;
  v_result := public.register_for_webinar(p_webinar_id);
  IF (v_result->>'already_registered')::boolean IS DISTINCT FROM false THEN
    -- Read a genuine prior issuance; never create/renew a marker on replay.
    RETURN v_result || jsonb_build_object('binding_provenance',CASE WHEN EXISTS(
      SELECT 1 FROM webinar_payment_private.registration_issuances i
      WHERE i.registration_id=(v_result->>'registration_id')::uuid AND i.user_id=v_user AND i.webinar_id=p_webinar_id
    ) THEN 'register-webinar.v1' ELSE 'unproven' END);
  END IF;
  v_registration := (v_result->>'registration_id')::uuid;
  INSERT INTO webinar_payment_private.registration_issuances(registration_id,user_id,webinar_id)
    VALUES(v_registration,v_user,p_webinar_id);
  RETURN v_result || jsonb_build_object('binding_provenance','register-webinar.v1');
END $$;

CREATE FUNCTION webinar_payment_private.registration_state(p_webinar_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); w public.webinars%ROWTYPE; r public.webinar_registrations%ROWTYPE;
  p public.payments%ROWTYPE; g webinar_payment_private.gates%ROWTYPE; b jsonb;
  v_state text := 'absent'; v_provenance text := 'none'; v_mode text := 'legacy'; v_payment jsonb := NULL;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authentication required'; END IF;
  SELECT * INTO w FROM public.webinars WHERE id=p_webinar_id AND status IN ('published','live','ended');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM webinar_payment_private.gates WHERE singleton;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.webinar_registrations WHERE user_id=v_user AND webinar_id=p_webinar_id;
  IF FOUND THEN
    v_state := 'registered'; v_provenance := 'unproven';
    IF EXISTS(SELECT 1 FROM webinar_payment_private.registration_issuances i
      WHERE i.registration_id=r.id AND i.user_id=v_user AND i.webinar_id=p_webinar_id) THEN v_provenance := 'register-webinar.v1'; END IF;
    SELECT * INTO p FROM public.payments WHERE bound_registration_id=r.id AND user_id=v_user AND purpose_code='webinar.v1';
  ELSE
    -- An unresolved prior intent is not permission to create a fresh registration/charge.
    SELECT * INTO p FROM public.payments WHERE bound_webinar_id=p_webinar_id AND user_id=v_user AND purpose_code='webinar.v1' ORDER BY created_at,id LIMIT 1;
    IF FOUND THEN v_state := 'unresolved'; END IF;
  END IF;
  IF p.id IS NOT NULL THEN
    b := webinar_payment_private.read_binding(NULL,p.id);
    IF b IS NULL THEN RETURN NULL; END IF;
    v_payment := jsonb_build_object('intentKey',p.intent_key,'stage',p.provider_request_state,'status',p.status,
      'authority',p.authority,'amountToman',p.amount,'unit','toman','createdAt',p.created_at,'refId',p.ref_id,'verifiedAt',p.verified_at);
    IF b->>'registrationState'='unresolved' THEN v_state := 'unresolved'; END IF;
    v_provenance := 'register-webinar.v1';
  END IF;
  IF p.id IS NOT NULL OR (g.issuance_enabled AND w.price_toman>0) THEN v_mode := 'bound'; END IF;
  RETURN jsonb_build_object('contractVersion','webinar-registration.v1','webinarId',w.id,'state',v_state,
    'registrationId',coalesce(r.id,p.bound_registration_id),'paymentStatus',CASE WHEN v_state='registered' THEN r.payment_status ELSE NULL END,
    'mode',v_mode,'provenance',v_provenance,'paymentEnabled',g.issuance_enabled AND v_state='registered'
      AND v_provenance='register-webinar.v1' AND r.payment_status='pending' AND (p.id IS NOT NULL OR w.price_toman>0),
    'payment',v_payment);
END $$;

CREATE FUNCTION webinar_payment_private.prepare(p_registration_id uuid, p_intent_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); r public.webinar_registrations%ROWTYPE;
        w public.webinars%ROWTYPE; p public.payments%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authentication required'; END IF;
  IF p_intent_key IS NULL OR NOT coalesce((SELECT issuance_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='webinar payment issuance disabled or invalid intent';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webinar-payment:' || p_registration_id::text,0));
  SELECT * INTO r FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR r.user_id IS DISTINCT FROM v_user THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='registration unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM webinar_payment_private.registration_issuances i
    WHERE i.registration_id=r.id AND i.user_id=r.user_id AND i.webinar_id=r.webinar_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='registration provenance unproven';
  END IF;
  SELECT * INTO p FROM public.payments WHERE bound_registration_id=r.id AND purpose_code='webinar.v1' FOR UPDATE;
  IF FOUND THEN
    IF p.user_id IS DISTINCT FROM v_user OR p.intent_key IS DISTINCT FROM p_intent_key THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='existing registration intent conflict';
    END IF;
    RETURN webinar_payment_private.read_binding(NULL,p.id);
  END IF;
  IF r.payment_status <> 'pending' OR r.payment_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='registration not payable';
  END IF;
  -- Snapshot amount inside issuance; callbacks never read the current price.
  SELECT * INTO w FROM public.webinars WHERE id=r.webinar_id FOR SHARE;
  IF NOT FOUND OR w.price_toman <= 0 OR NOT w.registration_open OR w.status NOT IN ('published','live') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='webinar not payable';
  END IF;
  INSERT INTO public.payments(user_id,amount,purpose_code,bound_registration_id,bound_webinar_id,intent_key,provider_request_state)
    VALUES(v_user,w.price_toman,'webinar.v1',r.id,r.webinar_id,p_intent_key,'prepared') RETURNING * INTO p;
  UPDATE public.webinar_registrations SET payment_id=p.id WHERE id=r.id;
  RETURN webinar_payment_private.read_binding(NULL,p.id);
END $$;

CREATE OR REPLACE FUNCTION public.payments_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='payment history is immutable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.purpose_code IS DISTINCT FROM OLD.purpose_code
    OR NEW.bound_registration_id IS DISTINCT FROM OLD.bound_registration_id
    OR NEW.bound_webinar_id IS DISTINCT FROM OLD.bound_webinar_id OR NEW.intent_key IS DISTINCT FROM OLD.intent_key THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='payment identity is immutable';
  END IF;
  IF OLD.purpose_code='webinar.v1' AND NEW.status='pending' THEN
    IF NOT coalesce((SELECT issuance_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='webinar payment issuance disabled';
    END IF;
    IF (to_jsonb(NEW)-ARRAY['authority','provider_request_state']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['authority','provider_request_state']) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='invalid authority attachment';
    END IF;
    IF OLD.provider_request_state='prepared' AND NEW.provider_request_state='claimed' AND NEW.authority IS NULL AND OLD.authority IS NULL THEN RETURN NEW; END IF;
    IF OLD.provider_request_state='claimed' AND NEW.provider_request_state='attached' AND OLD.authority IS NULL AND NEW.authority IS NOT NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='invalid request transition';
  END IF;
  IF NEW.status NOT IN ('paid','failed') OR NEW.authority IS DISTINCT FROM OLD.authority
    OR NEW.provider_request_state IS DISTINCT FROM OLD.provider_request_state THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='invalid payment transition';
  END IF;
  IF OLD.purpose_code='webinar.v1' THEN
    IF OLD.provider_request_state <> 'attached' OR NOT coalesce((SELECT settlement_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='webinar payment settlement disabled';
    END IF;
    IF NEW.invite_link IS NOT NULL OR (NEW.status='paid' AND (NEW.ref_id IS NULL OR NEW.ref_id !~ '^[1-9][0-9]*$' OR NEW.verified_at IS NULL)) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='invalid webinar settlement receipt';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION webinar_payment_private.guard_payment_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.purpose_code='webinar.v1' THEN
    IF NOT coalesce((SELECT issuance_enabled FROM webinar_payment_private.gates WHERE singleton),false)
      OR NEW.status <> 'pending' OR NEW.authority IS NOT NULL OR NEW.provider_request_state <> 'prepared'
      OR NEW.ref_id IS NOT NULL OR NEW.verified_at IS NOT NULL OR NOT EXISTS(
        SELECT 1 FROM webinar_payment_private.registration_issuances i JOIN public.webinar_registrations r ON r.id=i.registration_id
        WHERE i.registration_id=NEW.bound_registration_id AND i.user_id=NEW.user_id AND i.webinar_id=NEW.bound_webinar_id
          AND r.user_id=i.user_id AND r.webinar_id=i.webinar_id AND r.payment_status='pending' AND r.payment_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='invalid bound payment issuance';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER webinar_payment_insert_guard BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION webinar_payment_private.guard_payment_insert();

CREATE FUNCTION webinar_payment_private.guard_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.payments%ROWTYPE; v_bound boolean;
BEGIN
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM webinar_payment_private.registration_issuances WHERE registration_id=NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='issued registration identity cannot be recreated';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT EXISTS(SELECT 1 FROM public.payments WHERE bound_registration_id=OLD.id AND purpose_code='webinar.v1') INTO v_bound;
    IF v_bound AND OLD.payment_status IN ('free','refunded') AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='terminal bound registration cannot be reset';
    END IF;
    IF v_bound AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.webinar_id IS DISTINCT FROM OLD.webinar_id
      OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='bound registration identity is immutable';
    END IF;
  END IF;
  IF NEW.payment_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.payment_id IS DISTINCT FROM OLD.payment_id) THEN
    SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id;
    IF p.purpose_code IS DISTINCT FROM 'webinar.v1' OR p.bound_registration_id IS DISTINCT FROM NEW.id
      OR p.bound_webinar_id IS DISTINCT FROM NEW.webinar_id OR p.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='payment purpose does not match registration';
    END IF;
  END IF;
  IF NEW.payment_status='paid' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'paid') THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid registration must follow pending settlement';
    END IF;
    IF OLD.payment_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='terminal registration cannot be revived';
    END IF;
    SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id;
    IF p.purpose_code IS DISTINCT FROM 'webinar.v1' OR p.status IS DISTINCT FROM 'paid' OR p.bound_registration_id IS DISTINCT FROM NEW.id
      OR p.bound_webinar_id IS DISTINCT FROM NEW.webinar_id OR p.user_id IS DISTINCT FROM NEW.user_id
      OR NOT EXISTS(SELECT 1 FROM webinar_payment_private.registration_issuances i WHERE i.registration_id=NEW.id AND i.user_id=NEW.user_id AND i.webinar_id=NEW.webinar_id)
      OR NOT coalesce((SELECT settlement_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='paid registration requires trusted settlement';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER webinar_registration_binding_guard BEFORE INSERT OR UPDATE ON public.webinar_registrations
  FOR EACH ROW EXECUTE FUNCTION webinar_payment_private.guard_registration();

CREATE FUNCTION webinar_payment_private.claim_request(p_payment_id uuid,p_registration_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.payments%ROWTYPE; v_claimed boolean := false;
BEGIN
  IF NOT coalesce((SELECT issuance_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webinar-payment:' || p_registration_id::text,0));
  PERFORM 1 FROM public.webinar_registrations WHERE id=p_registration_id AND user_id=p_user_id AND payment_id=p_payment_id AND payment_status='pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF p.purpose_code IS DISTINCT FROM 'webinar.v1' OR p.user_id IS DISTINCT FROM p_user_id OR p.bound_registration_id IS DISTINCT FROM p_registration_id
    OR webinar_payment_private.read_binding(NULL,p.id) IS NULL THEN RETURN NULL; END IF;
  IF p.status='pending' AND p.provider_request_state='prepared' THEN
    UPDATE public.payments SET provider_request_state='claimed' WHERE id=p.id; v_claimed := true;
  END IF;
  RETURN jsonb_build_object('contractVersion','webinar-payment-claim.v1','paymentId',p.id,'claimedNow',v_claimed);
END $$;

CREATE FUNCTION webinar_payment_private.attach(p_payment_id uuid,p_registration_id uuid,p_user_id uuid,p_authority text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.payments%ROWTYPE;
BEGIN
  IF p_authority IS NULL OR char_length(p_authority) NOT BETWEEN 1 AND 256 OR p_authority COLLATE "C" ~ '[^A-Za-z0-9_-]'
    OR NOT coalesce((SELECT issuance_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webinar-payment:' || p_registration_id::text,0));
  PERFORM 1 FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  SELECT * INTO p FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF p.purpose_code IS DISTINCT FROM 'webinar.v1' OR p.bound_registration_id IS DISTINCT FROM p_registration_id OR p.user_id IS DISTINCT FROM p_user_id
    OR webinar_payment_private.read_binding(NULL,p.id) IS NULL THEN RETURN NULL; END IF;
  IF p.authority=p_authority AND p.provider_request_state='attached' THEN RETURN webinar_payment_private.read_binding(NULL,p.id); END IF;
  IF p.status <> 'pending' OR p.provider_request_state <> 'claimed' OR p.authority IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='authority attachment conflict';
  END IF;
  UPDATE public.payments SET authority=p_authority,provider_request_state='attached' WHERE id=p.id;
  RETURN webinar_payment_private.read_binding(NULL,p.id);
END $$;

CREATE FUNCTION webinar_payment_private.settle(p_payment_id uuid,p_authority text,p_outcome text,p_ref_id text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.payments%ROWTYPE; v_registration uuid;
BEGIN
  IF NOT coalesce((SELECT settlement_enabled FROM webinar_payment_private.gates WHERE singleton),false) THEN RETURN NULL; END IF;
  SELECT bound_registration_id INTO v_registration FROM public.payments WHERE id=p_payment_id AND purpose_code='webinar.v1';
  IF v_registration IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('webinar-payment:' || v_registration::text,0));
  PERFORM 1 FROM public.webinar_registrations WHERE id=v_registration FOR UPDATE;
  SELECT * INTO p FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF p.purpose_code IS DISTINCT FROM 'webinar.v1' OR p.authority IS DISTINCT FROM p_authority OR p_amount IS DISTINCT FROM p.amount
    OR p.provider_request_state IS DISTINCT FROM 'attached' OR webinar_payment_private.read_binding(NULL,p.id) IS NULL THEN RETURN NULL; END IF;
  IF p_outcome='verified' AND p_ref_id IS NOT NULL AND p_ref_id ~ '^[1-9][0-9]*$' THEN
    IF p.status='paid' AND p.ref_id IS DISTINCT FROM p_ref_id THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt conflict'; END IF;
    IF p.status='failed' THEN RETURN webinar_payment_private.read_binding(NULL,p.id); END IF;
    PERFORM public.verify_payment(p_authority,p_ref_id,p.amount,NULL);
    -- Money remains paid if service is missing/refunded/rebound; never revive it.
    UPDATE public.webinar_registrations SET payment_status='paid'
      WHERE id=p.bound_registration_id AND webinar_id=p.bound_webinar_id AND user_id=p.user_id
        AND payment_id=p.id AND payment_status='pending';
  ELSIF p_outcome='rejected' AND p_ref_id IS NULL THEN
    PERFORM public.fail_payment(p_authority);
  ELSE RETURN NULL;
  END IF;
  RETURN webinar_payment_private.read_binding(NULL,p.id);
END $$;

-- Typed public wrappers have fixed private targets and explicit callers.
CREATE FUNCTION public.register_for_webinar_bound_v1(p_webinar_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.register_bound(p_webinar_id) $$;
CREATE FUNCTION public.prepare_webinar_payment(p_registration_id uuid,p_intent_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.prepare(p_registration_id,p_intent_key) $$;
CREATE FUNCTION public.read_webinar_registration_state(p_webinar_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.registration_state(p_webinar_id) $$;
CREATE FUNCTION public.read_webinar_payment_binding(p_authority text DEFAULT NULL,p_payment_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.read_binding(p_authority,p_payment_id) $$;
CREATE FUNCTION public.claim_webinar_payment_request(p_payment_id uuid,p_registration_id uuid,p_user_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.claim_request(p_payment_id,p_registration_id,p_user_id) $$;
CREATE FUNCTION public.attach_webinar_authority(p_payment_id uuid,p_registration_id uuid,p_user_id uuid,p_authority text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.attach(p_payment_id,p_registration_id,p_user_id,p_authority) $$;
CREATE FUNCTION public.settle_webinar_payment(p_payment_id uuid,p_authority text,p_outcome text,p_ref_id text,p_amount integer) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT webinar_payment_private.settle(p_payment_id,p_authority,p_outcome,p_ref_id,p_amount) $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA webinar_payment_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_for_webinar_bound_v1(uuid), public.prepare_webinar_payment(uuid,uuid),
  public.read_webinar_registration_state(uuid),
  public.read_webinar_payment_binding(text,uuid), public.claim_webinar_payment_request(uuid,uuid,uuid),
  public.attach_webinar_authority(uuid,uuid,uuid,text), public.settle_webinar_payment(uuid,text,text,text,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_for_webinar_bound_v1(uuid), public.prepare_webinar_payment(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_webinar_registration_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_webinar_payment_binding(text,uuid), public.claim_webinar_payment_request(uuid,uuid,uuid),
  public.attach_webinar_authority(uuid,uuid,uuid,text), public.settle_webinar_payment(uuid,text,text,text,integer) TO service_role;
-- No public setter/activation, legacy create_payment grant or backfill.
NOTIFY pgrst, 'reload schema';
COMMIT;
