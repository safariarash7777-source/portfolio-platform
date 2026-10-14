-- PROPOSAL ONLY: not a migration, not installed, and not production acceptance.
-- Base: official main 72e2b3e32d8a80fa9544105f0e439012d9c48738.
-- Verified on disposable PostgreSQL 17 fixtures, not installed production SQL.
-- Reuses webinars, webinar_registrations and the canonical payments ledger.
-- No global entitlement/role/auth changes and no fixed price or duration.
-- All legacy registrations stay access_qualified=false until deliberate review.
-- Before installation: inspect existing ACL/policies/functions; test in isolated
-- PostgreSQL with phase5/8/11/15/30, rollback and cross-role/concurrent requests.
-- The application must fail closed before contacting a provider if RPCs are absent.
-- A requesting/unknown attempt is never reset or retried automatically.
-- A ready attempt survives observer uncertainty after an already committed attach.
-- A cached ready URL is released only while the current payment policy is open.
-- A ready ledger that is no longer pending keeps its authority/history but its
-- URL is withheld; a verified rejection never authorizes a financial retry.
-- If the manager closes while the provider is responding, attach preserves the
-- known authority atomically but returns payment_url=NULL, never a new request.
-- Financial verification may settle after disable/cancel/expiry; access still denies.
-- Deletion of registrations with attempts is restricted: cancel, preserve history.
-- Capped paid webinars remain blocked pending an explicit reservation/release
-- policy. Free capacity retains the source paid/free count, serialized by lock.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.webinars
  ALTER COLUMN price_toman DROP DEFAULT,
  ADD COLUMN access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN access_starts_at timestamptz,
  ADD COLUMN access_ends_at timestamptz,
  ADD CONSTRAINT webinars_exact_price CHECK (price_toman >= 0),
  ADD CONSTRAINT webinars_exact_access_window CHECK (
    NOT access_enabled OR (
      access_starts_at IS NOT NULL AND access_ends_at IS NOT NULL
      AND isfinite(access_starts_at) AND isfinite(access_ends_at)
      AND access_starts_at < access_ends_at
    )
  );
ALTER TABLE public.webinar_registrations
  ADD COLUMN access_qualified boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT webinar_registration_qualification CHECK (
    NOT access_qualified OR payment_status IN ('paid','free')
  );

-- Event scheduling is separate from the explicit access window. Once any
-- registration exists, financial amount/window are fixed; access can be disabled.
CREATE FUNCTION public.m2_webinar_policy_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $m2$
BEGIN
  IF (NEW.price_toman IS DISTINCT FROM OLD.price_toman
      OR NEW.access_starts_at IS DISTINCT FROM OLD.access_starts_at
      OR NEW.access_ends_at IS DISTINCT FROM OLD.access_ends_at)
    AND EXISTS (SELECT 1 FROM public.webinar_registrations WHERE webinar_id=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registered webinar amount/window are immutable';
  END IF;
  RETURN NEW;
END;
$m2$;
CREATE TRIGGER m2_webinar_policy_guard BEFORE UPDATE ON public.webinars
  FOR EACH ROW EXECUTE FUNCTION public.m2_webinar_policy_guard();

CREATE TABLE public.webinar_payment_attempts (
  registration_id uuid PRIMARY KEY REFERENCES public.webinar_registrations(id) ON DELETE RESTRICT,
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  state text NOT NULL CHECK (state IN ('requesting','unknown','ready')),
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  authority text UNIQUE,
  payment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webinar_attempt_ready CHECK (
    (state IN ('requesting','unknown') AND payment_id IS NULL AND authority IS NULL AND payment_url IS NULL)
    OR (state='ready' AND payment_id IS NOT NULL AND authority IS NOT NULL AND payment_url IS NOT NULL)
  )
);
ALTER TABLE public.webinar_payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webinar_payment_attempts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.webinar_payment_attempts TO service_role;

CREATE FUNCTION public.m2_webinar_attempt_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $m2$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment attempt history cannot be deleted';
  END IF;
  IF NEW.registration_id IS DISTINCT FROM OLD.registration_id
    OR NEW.webinar_id IS DISTINCT FROM OLD.webinar_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.state='ready' OR (OLD.state='unknown' AND NEW.state NOT IN ('unknown','ready'))
    OR (OLD.state='requesting' AND NEW.state NOT IN ('unknown','ready')) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment attempt binding/state is immutable';
  END IF;
  RETURN NEW;
END;
$m2$;
CREATE TRIGGER m2_webinar_attempt_guard BEFORE UPDATE OR DELETE ON public.webinar_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.m2_webinar_attempt_guard();

-- RLS previously exposed platform_url in every public webinar row and permitted
-- members to INSERT their own registration with a fabricated paid/free status.
-- Keep existing admin policies; public metadata and user writes use scoped RPCs.
DROP POLICY IF EXISTS webinars_public_read ON public.webinars;
DROP POLICY IF EXISTS wr_user_insert ON public.webinar_registrations;

CREATE FUNCTION public.list_public_webinars()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $m2$
  SELECT coalesce(jsonb_agg(metadata ORDER BY starts_at DESC), '[]'::jsonb)
  FROM (
    SELECT w.starts_at, jsonb_build_object(
      'id',w.id,'title',w.title,'description',w.description,'starts_at',w.starts_at,
      'ends_at',w.ends_at,'registration_open',w.registration_open,'max_capacity',w.max_capacity,
      'price_toman',w.price_toman,'platform',w.platform,'status',w.status,'created_at',w.created_at,
      'access_enabled',w.access_enabled,'access_starts_at',w.access_starts_at,'access_ends_at',w.access_ends_at,
      'registered_count',(SELECT count(*) FROM public.webinar_registrations r
        WHERE r.webinar_id=w.id AND r.payment_status IN ('paid','free'))
    ) AS metadata FROM public.webinars w WHERE w.status IN ('published','live','ended')
  ) AS public_metadata;
$m2$;

CREATE OR REPLACE FUNCTION public.register_for_webinar(p_webinar_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  owner_id uuid := auth.uid();
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  registered_count bigint;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated registration required';
  END IF;
  -- Shared lock order: webinar -> registration -> attempt -> payment.
  SELECT * INTO w FROM public.webinars WHERE id=p_webinar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='webinar missing'; END IF;
  IF w.price_toman>0 AND w.max_capacity IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='paid capacity reservation policy is not configured';
  END IF;
  SELECT * INTO reg FROM public.webinar_registrations
    WHERE webinar_id=w.id AND user_id=owner_id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('registration_id',reg.id,'webinar_id',w.id,
      'payment_status',reg.payment_status,'needs_payment',reg.payment_status='pending' AND w.price_toman>0,
      'already_registered',true);
  END IF;
  IF NOT w.access_enabled OR w.access_starts_at IS NULL OR w.access_ends_at IS NULL
    OR NOT isfinite(w.access_starts_at) OR NOT isfinite(w.access_ends_at)
    OR w.access_ends_at<=w.access_starts_at THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='webinar access policy is not configured';
  END IF;
  IF NOT w.registration_open OR w.status NOT IN ('published','live') THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='webinar registration is closed';
  END IF;
  IF w.price_toman IS NULL OR w.price_toman<0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='webinar price is not configured';
  END IF;
  -- Retain source paid/free capacity count. Only free capped registration may
  -- reach this block; paid cap needs a separate explicit reservation policy.
  IF w.max_capacity IS NOT NULL THEN
    SELECT count(*) INTO registered_count FROM public.webinar_registrations
      WHERE webinar_id=w.id AND payment_status IN ('paid','free');
    IF registered_count>=w.max_capacity THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='webinar capacity reached';
    END IF;
  END IF;
  INSERT INTO public.webinar_registrations(webinar_id,user_id,payment_status,access_qualified)
    VALUES(w.id,owner_id,CASE WHEN w.price_toman=0 THEN 'free' ELSE 'pending' END,w.price_toman=0)
    RETURNING * INTO reg;
  INSERT INTO public.audit_log(actor_id,action,entity,target_user_id,after)
    VALUES(owner_id,'webinar.register','webinar',owner_id,
      jsonb_build_object('webinar_id',w.id,'registration_id',reg.id,'payment_status',reg.payment_status));
  RETURN jsonb_build_object('registration_id',reg.id,'webinar_id',w.id,
    'payment_status',reg.payment_status,'needs_payment',w.price_toman>0,'already_registered',false);
END;
$m2$;

CREATE FUNCTION public.webinar_access(p_webinar_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  owner_id uuid := auth.uid();
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  pay public.payments%ROWTYPE;
  attempt public.webinar_payment_attempts%ROWTYPE;
BEGIN
  IF owner_id IS NULL THEN RETURN jsonb_build_object('allowed',false,'reason','authentication_required'); END IF;
  SELECT * INTO w FROM public.webinars WHERE id=p_webinar_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,'reason','webinar_missing'); END IF;
  IF NOT w.access_enabled OR w.status NOT IN ('published','live','ended')
    OR w.access_starts_at IS NULL OR w.access_ends_at IS NULL
    OR NOT isfinite(w.access_starts_at) OR NOT isfinite(w.access_ends_at)
    OR w.access_starts_at>=w.access_ends_at
    OR now()<w.access_starts_at OR now()>=w.access_ends_at THEN
    RETURN jsonb_build_object('allowed',false,'reason','access_closed');
  END IF;
  SELECT * INTO reg FROM public.webinar_registrations WHERE webinar_id=w.id AND user_id=owner_id;
  IF NOT FOUND OR NOT reg.access_qualified THEN
    RETURN jsonb_build_object('allowed',false,'reason','registration_not_qualified');
  END IF;
  IF reg.payment_status='free' THEN
    IF w.price_toman<>0 OR reg.payment_id IS NOT NULL THEN
      RETURN jsonb_build_object('allowed',false,'reason','free_registration_invalid');
    END IF;
  ELSIF reg.payment_status='paid' THEN
    SELECT * INTO pay FROM public.payments WHERE id=reg.payment_id;
    IF NOT FOUND OR pay.user_id IS DISTINCT FROM owner_id OR pay.amount IS DISTINCT FROM w.price_toman
      OR pay.amount<=0 OR pay.status<>'paid' OR pay.authority IS NULL
      OR pay.authority !~ '^[A-Za-z0-9_-]{1,200}$' OR pay.ref_id IS NULL
      OR pay.ref_id !~ '^[1-9][0-9]{0,15}$' OR pay.verified_at IS NULL THEN
      RETURN jsonb_build_object('allowed',false,'reason','payment_binding_invalid');
    END IF;
    IF pay.ref_id::numeric>9007199254740991 THEN
      RETURN jsonb_build_object('allowed',false,'reason','payment_reference_invalid');
    END IF;
    SELECT * INTO attempt FROM public.webinar_payment_attempts WHERE registration_id=reg.id;
    IF NOT FOUND OR attempt.state<>'ready' OR attempt.webinar_id IS DISTINCT FROM w.id
      OR attempt.user_id IS DISTINCT FROM owner_id OR attempt.payment_id IS DISTINCT FROM pay.id
      OR attempt.authority IS DISTINCT FROM pay.authority OR attempt.amount IS DISTINCT FROM pay.amount THEN
      RETURN jsonb_build_object('allowed',false,'reason','payment_attempt_invalid');
    END IF;
  ELSE
    RETURN jsonb_build_object('allowed',false,'reason','registration_unpaid');
  END IF;
  IF nullif(btrim(w.platform_url),'') IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','webinar_resource_not_configured');
  END IF;
  RETURN jsonb_build_object('allowed',true,'webinar_id',w.id,'user_id',owner_id,
    'platform_url',w.platform_url,'access_starts_at',w.access_starts_at,'access_ends_at',w.access_ends_at);
END;
$m2$;

CREATE FUNCTION public.prepare_webinar_payment(p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  owner_id uuid := auth.uid();
  webinar_id uuid;
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  attempt public.webinar_payment_attempts%ROWTYPE;
  pay public.payments%ROWTYPE;
  release_allowed boolean := false;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated payment required'; END IF;
  SELECT r.webinar_id INTO webinar_id FROM public.webinar_registrations r
    WHERE r.id=p_registration_id AND r.user_id=owner_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='registration missing'; END IF;
  SELECT * INTO w FROM public.webinars WHERE id=webinar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='webinar missing'; END IF;
  SELECT * INTO reg FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR reg.webinar_id IS DISTINCT FROM w.id OR reg.user_id IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration binding mismatch';
  END IF;
  IF w.price_toman>0 AND w.max_capacity IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='paid capacity reservation policy is not configured';
  END IF;
  IF reg.payment_status<>'pending' OR reg.access_qualified OR w.price_toman<=0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration does not need a new payment';
  END IF;
  -- Apply the current gate before every prior attempt/resume, not only before
  -- first reservation. Payment before access_starts_at is allowed explicitly;
  -- expiry uses wall clock after locks, not a stale transaction start timestamp.
  IF NOT w.access_enabled OR w.access_starts_at IS NULL OR w.access_ends_at IS NULL
    OR NOT isfinite(w.access_starts_at) OR NOT isfinite(w.access_ends_at)
    OR w.access_starts_at>=w.access_ends_at OR clock_timestamp()>=w.access_ends_at
    OR NOT w.registration_open OR w.status NOT IN ('published','live') THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='webinar payment policy is closed';
  END IF;
  SELECT * INTO attempt FROM public.webinar_payment_attempts WHERE registration_id=reg.id FOR UPDATE;
  IF FOUND THEN
    IF attempt.webinar_id IS DISTINCT FROM w.id OR attempt.user_id IS DISTINCT FROM owner_id
      OR attempt.amount IS DISTINCT FROM w.price_toman OR reg.payment_id IS DISTINCT FROM attempt.payment_id THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment attempt binding mismatch';
    END IF;
    IF attempt.state='ready' THEN
      SELECT * INTO pay FROM public.payments WHERE id=attempt.payment_id FOR UPDATE;
      IF NOT FOUND OR pay.user_id IS DISTINCT FROM owner_id OR pay.amount IS DISTINCT FROM attempt.amount
        OR pay.authority IS DISTINCT FROM attempt.authority OR reg.payment_id IS DISTINCT FROM pay.id
        OR pay.status NOT IN ('pending','paid','failed') THEN
        RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='ready payment ledger binding mismatch';
      END IF;
      -- A failed payment cannot be retried by exposing its old StartPay URL.
      -- Keep the durable attempt/history; separately reviewed recovery is needed.
      -- Recheck expiry after waiting on the ledger lock before URL release.
      release_allowed := pay.status='pending' AND clock_timestamp()<w.access_ends_at;
      RETURN jsonb_build_object('state','ready','started',false,'registration_id',reg.id,
        'webinar_id',w.id,'user_id',owner_id,'amount',attempt.amount,'title',w.title,
        'payment_id',pay.id,'authority',attempt.authority,
        'payment_url',CASE WHEN release_allowed THEN attempt.payment_url ELSE NULL END,
        'release_allowed',release_allowed);
    END IF;
    RETURN jsonb_build_object('state',attempt.state,'started',false,'registration_id',reg.id,
      'webinar_id',w.id,'user_id',owner_id,'amount',attempt.amount,'title',w.title,
      'payment_id',attempt.payment_id,'authority',attempt.authority,'payment_url',attempt.payment_url);
  END IF;
  IF reg.payment_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='legacy payment requires reconciliation';
  END IF;
  INSERT INTO public.webinar_payment_attempts(registration_id,webinar_id,user_id,amount,state)
    VALUES(reg.id,w.id,owner_id,w.price_toman,'requesting');
  RETURN jsonb_build_object('state','requesting','started',true,'registration_id',reg.id,
    'webinar_id',w.id,'user_id',owner_id,'amount',w.price_toman,'title',w.title);
END;
$m2$;

CREATE FUNCTION public.attach_webinar_payment(
  p_registration_id uuid,p_authority text,p_payment_url text,p_amount integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  webinar_id uuid;
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  attempt public.webinar_payment_attempts%ROWTYPE;
  pay public.payments%ROWTYPE;
  release_allowed boolean := false;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'
      IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted payment attachment only';
  END IF;
  IF p_authority IS NULL OR p_authority !~ '^[A-Za-z0-9_-]{1,200}$'
    OR p_amount IS NULL OR p_amount<=0 OR p_payment_url IS NULL
    OR p_payment_url NOT IN ('https://payment.zarinpal.com/pg/StartPay/'||p_authority,
                            'https://sandbox.zarinpal.com/pg/StartPay/'||p_authority) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment attachment';
  END IF;
  SELECT r.webinar_id INTO webinar_id FROM public.webinar_registrations r WHERE r.id=p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='registration missing'; END IF;
  SELECT * INTO w FROM public.webinars WHERE id=webinar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='webinar missing'; END IF;
  SELECT * INTO reg FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR reg.webinar_id IS DISTINCT FROM w.id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration binding mismatch';
  END IF;
  SELECT * INTO attempt FROM public.webinar_payment_attempts WHERE registration_id=reg.id FOR UPDATE;
  IF NOT FOUND OR attempt.user_id IS DISTINCT FROM reg.user_id OR attempt.webinar_id IS DISTINCT FROM w.id
    OR attempt.amount IS DISTINCT FROM p_amount OR w.price_toman IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment attempt binding mismatch';
  END IF;
  IF attempt.state='ready' THEN
    SELECT * INTO pay FROM public.payments WHERE id=attempt.payment_id FOR UPDATE;
    IF NOT FOUND OR reg.payment_id IS DISTINCT FROM pay.id OR pay.user_id IS DISTINCT FROM reg.user_id
      OR pay.amount IS DISTINCT FROM p_amount OR pay.authority IS DISTINCT FROM p_authority
      OR attempt.authority IS DISTINCT FROM p_authority OR attempt.payment_url IS DISTINCT FROM p_payment_url THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='attached payment replay mismatch';
    END IF;
  ELSE
    IF reg.payment_status<>'pending' OR reg.access_qualified OR reg.payment_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration cannot attach payment';
    END IF;
    INSERT INTO public.payments(user_id,amount,authority,status)
      VALUES(reg.user_id,p_amount,p_authority,'pending') RETURNING * INTO pay;
    UPDATE public.webinar_registrations SET payment_id=pay.id WHERE id=reg.id;
    UPDATE public.webinar_payment_attempts SET state='ready',payment_id=pay.id,
      authority=p_authority,payment_url=p_payment_url,updated_at=now() WHERE registration_id=reg.id;
    INSERT INTO public.audit_log(actor_id,action,entity,target_user_id,after)
      VALUES(reg.user_id,'webinar.payment_attached','webinar_registration',reg.user_id,
        jsonb_build_object('registration_id',reg.id,'webinar_id',w.id,'payment_id',pay.id,'authority',p_authority));
  END IF;
  -- Persist the provider's known authority even if manager policy changed while
  -- the request was outside the DB. Only URL release is withheld; no orphan,
  -- financial cancellation, reset of ready state or automatic replacement charge.
  release_allowed := coalesce(w.access_enabled AND w.registration_open
    AND w.status IN ('published','live') AND w.max_capacity IS NULL
    AND w.access_starts_at IS NOT NULL AND w.access_ends_at IS NOT NULL
    AND isfinite(w.access_starts_at) AND isfinite(w.access_ends_at)
    AND w.access_starts_at<w.access_ends_at AND clock_timestamp()<w.access_ends_at
    AND reg.payment_status='pending' AND NOT reg.access_qualified AND pay.status='pending',false);
  RETURN jsonb_build_object('state','ready','started',false,'registration_id',reg.id,
    'webinar_id',w.id,'user_id',reg.user_id,'amount',p_amount,'title',w.title,
    'payment_id',pay.id,'authority',p_authority,
    'payment_url',CASE WHEN release_allowed THEN p_payment_url ELSE NULL END,
    'release_allowed',release_allowed);
END;
$m2$;

CREATE FUNCTION public.mark_webinar_payment_unknown(p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  webinar_id uuid;
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  attempt public.webinar_payment_attempts%ROWTYPE;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'
      IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted payment observation only';
  END IF;
  SELECT r.webinar_id INTO webinar_id FROM public.webinar_registrations r WHERE r.id=p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='registration missing'; END IF;
  SELECT * INTO w FROM public.webinars WHERE id=webinar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='webinar missing'; END IF;
  SELECT * INTO reg FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR reg.webinar_id IS DISTINCT FROM w.id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration binding mismatch';
  END IF;
  SELECT * INTO attempt FROM public.webinar_payment_attempts WHERE registration_id=reg.id FOR UPDATE;
  IF NOT FOUND OR attempt.webinar_id IS DISTINCT FROM w.id OR attempt.user_id IS DISTINCT FROM reg.user_id
    OR attempt.amount IS DISTINCT FROM w.price_toman THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment attempt missing or mismatched';
  END IF;
  IF attempt.state='requesting' THEN
    UPDATE public.webinar_payment_attempts SET state='unknown',updated_at=now() WHERE registration_id=reg.id;
    attempt.state := 'unknown';
  END IF;
  -- ready is deliberately preserved after an uncertain HTTP observer/attach return.
  RETURN jsonb_build_object('state',attempt.state,'started',false,'registration_id',reg.id,
    'webinar_id',w.id,'user_id',reg.user_id,'amount',attempt.amount,'title',w.title,
    'payment_id',attempt.payment_id,'authority',attempt.authority,'payment_url',attempt.payment_url);
END;
$m2$;

CREATE FUNCTION public.read_webinar_payment_context(p_authority text,p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE context jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'
      IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted payment context only';
  END IF;
  SELECT jsonb_build_object('registration_id',r.id,'webinar_id',w.id,'user_id',r.user_id,
    'payment_id',p.id,'amount',p.amount,'authority',p.authority,'payment_status',p.status,
    'registration_payment_status',r.payment_status,'ref_id',p.ref_id,
    'verified_at',date_trunc('milliseconds',p.verified_at),
    'access_qualified',r.access_qualified,'access_enabled',w.access_enabled,
    'access_starts_at',w.access_starts_at,'access_ends_at',w.access_ends_at)
    INTO context FROM public.webinar_registrations r
    JOIN public.webinars w ON w.id=r.webinar_id
    JOIN public.webinar_payment_attempts a ON a.registration_id=r.id
    JOIN public.payments p ON p.id=r.payment_id
    WHERE r.id=p_registration_id AND p.authority=p_authority AND a.state='ready'
      AND a.webinar_id=w.id AND a.user_id=r.user_id AND a.payment_id=p.id
      AND a.authority=p.authority AND a.amount=p.amount AND p.user_id=r.user_id
      AND p.amount=w.price_toman AND p.amount>0
      AND ((p.status IN ('pending','failed') AND r.payment_status='pending' AND NOT r.access_qualified)
        OR (p.status='paid' AND r.payment_status='paid' AND r.access_qualified));
  IF context IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='bound ready webinar payment missing';
  END IF;
  RETURN context;
END;
$m2$;

CREATE FUNCTION public.settle_webinar_payment(
  p_authority text,p_registration_id uuid,p_payment_id uuid,p_amount integer,p_ref_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  webinar_id uuid;
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  attempt public.webinar_payment_attempts%ROWTYPE;
  pay public.payments%ROWTYPE;
  verified_owner uuid;
  receipt jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'
      IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted webinar settlement only';
  END IF;
  IF p_authority IS NULL OR p_authority !~ '^[A-Za-z0-9_-]{1,200}$'
    OR p_payment_id IS NULL OR p_registration_id IS NULL OR p_amount IS NULL OR p_amount<=0
    OR p_ref_id IS NULL OR p_ref_id !~ '^[1-9][0-9]{0,15}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid verified payment proof';
  END IF;
  IF p_ref_id::numeric>9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid verified payment reference';
  END IF;
  SELECT r.webinar_id INTO webinar_id FROM public.webinar_registrations r WHERE r.id=p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='registration missing'; END IF;
  SELECT * INTO w FROM public.webinars WHERE id=webinar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='webinar missing'; END IF;
  SELECT * INTO reg FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR reg.webinar_id IS DISTINCT FROM w.id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration binding mismatch';
  END IF;
  SELECT * INTO attempt FROM public.webinar_payment_attempts WHERE registration_id=reg.id FOR UPDATE;
  IF NOT FOUND OR attempt.state<>'ready' OR attempt.webinar_id IS DISTINCT FROM w.id
    OR attempt.user_id IS DISTINCT FROM reg.user_id OR attempt.payment_id IS DISTINCT FROM p_payment_id
    OR attempt.authority IS DISTINCT FROM p_authority OR attempt.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='ready attempt binding mismatch';
  END IF;
  SELECT * INTO pay FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR reg.payment_id IS DISTINCT FROM pay.id OR pay.user_id IS DISTINCT FROM reg.user_id
    OR pay.authority IS DISTINCT FROM p_authority OR pay.amount IS DISTINCT FROM p_amount
    OR w.price_toman IS DISTINCT FROM p_amount OR pay.status NOT IN ('pending','paid')
    OR reg.payment_status NOT IN ('pending','paid') OR w.access_starts_at IS NULL OR w.access_ends_at IS NULL
    OR NOT isfinite(w.access_starts_at) OR NOT isfinite(w.access_ends_at)
    OR w.access_starts_at>=w.access_ends_at THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment settlement binding mismatch';
  END IF;
  IF pay.status='paid' THEN
    IF pay.ref_id IS DISTINCT FROM p_ref_id OR pay.verified_at IS NULL
      OR reg.payment_status<>'paid' OR NOT reg.access_qualified THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='settled payment replay mismatch';
    END IF;
    -- Exact replay does not write, regrant, revive, or send any external message.
    RETURN public.read_webinar_payment_context(p_authority,reg.id)
      || jsonb_build_object('settled',true,'reused',true);
  END IF;
  IF reg.payment_status<>'pending' OR reg.access_qualified THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration settlement state mismatch';
  END IF;
  -- The trusted server supplies only outcome=verified with code 100/101 and ref.
  -- This DB transaction does not call a provider. Financial fact is recorded even
  -- after cancellation/disable/expiry; webinar_access separately denies access.
  verified_owner := public.verify_payment(p_authority,p_ref_id,p_amount,NULL);
  IF verified_owner IS DISTINCT FROM reg.user_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='canonical ledger owner mismatch';
  END IF;
  UPDATE public.webinar_registrations SET payment_status='paid',access_qualified=true WHERE id=reg.id;
  INSERT INTO public.audit_log(actor_id,action,entity,target_user_id,after)
    VALUES(reg.user_id,'webinar.payment_settled','webinar_registration',reg.user_id,
      jsonb_build_object('registration_id',reg.id,'webinar_id',w.id,'payment_id',pay.id,
        'authority',p_authority,'ref_id',p_ref_id,'amount',p_amount));
  receipt := public.read_webinar_payment_context(p_authority,reg.id);
  IF receipt->>'payment_status'<>'paid' OR receipt->>'registration_payment_status'<>'paid'
    OR receipt->>'ref_id' IS DISTINCT FROM p_ref_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='atomic settlement receipt mismatch';
  END IF;
  RETURN receipt || jsonb_build_object('settled',true,'reused',false);
END;
$m2$;

CREATE FUNCTION public.reject_webinar_payment(
  p_authority text,p_registration_id uuid,p_payment_id uuid,p_amount integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $m2$
DECLARE
  webinar_id uuid;
  w public.webinars%ROWTYPE;
  reg public.webinar_registrations%ROWTYPE;
  attempt public.webinar_payment_attempts%ROWTYPE;
  pay public.payments%ROWTYPE;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'
      IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted verified rejection only';
  END IF;
  IF p_authority IS NULL OR p_authority !~ '^[A-Za-z0-9_-]{1,200}$'
    OR p_payment_id IS NULL OR p_registration_id IS NULL OR p_amount IS NULL OR p_amount<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment rejection binding';
  END IF;
  SELECT r.webinar_id INTO webinar_id FROM public.webinar_registrations r WHERE r.id=p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='registration missing'; END IF;
  SELECT * INTO w FROM public.webinars WHERE id=webinar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='webinar missing'; END IF;
  SELECT * INTO reg FROM public.webinar_registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR reg.webinar_id IS DISTINCT FROM w.id THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='registration binding mismatch';
  END IF;
  SELECT * INTO attempt FROM public.webinar_payment_attempts WHERE registration_id=reg.id FOR UPDATE;
  IF NOT FOUND OR attempt.state<>'ready' OR attempt.webinar_id IS DISTINCT FROM w.id
    OR attempt.user_id IS DISTINCT FROM reg.user_id OR attempt.payment_id IS DISTINCT FROM p_payment_id
    OR attempt.authority IS DISTINCT FROM p_authority OR attempt.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='ready attempt binding mismatch';
  END IF;
  SELECT * INTO pay FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR reg.payment_id IS DISTINCT FROM pay.id OR pay.user_id IS DISTINCT FROM reg.user_id
    OR pay.authority IS DISTINCT FROM p_authority OR pay.amount IS DISTINCT FROM p_amount
    OR w.price_toman IS DISTINCT FROM p_amount OR reg.payment_status<>'pending'
    OR reg.access_qualified OR pay.status NOT IN ('pending','failed') THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='payment rejection binding/state mismatch';
  END IF;
  -- A query Status=NOK, HTTP/body error or unknown verifier response must never
  -- enter this RPC. Only a validated outcome=rejected authorizes the transition.
  IF pay.status='pending' THEN PERFORM public.fail_payment(p_authority); END IF;
  RETURN public.read_webinar_payment_context(p_authority,reg.id)
    || jsonb_build_object('rejected',true,'settled',false);
END;
$m2$;

-- Explicit least-privilege EXECUTE; no default PUBLIC exposure of definer RPCs.
REVOKE ALL ON FUNCTION public.list_public_webinars() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_public_webinars() TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.register_for_webinar(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_for_webinar(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.webinar_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.webinar_access(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_webinar_payment(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_webinar_payment(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.attach_webinar_payment(uuid,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.attach_webinar_payment(uuid,text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.mark_webinar_payment_unknown(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_webinar_payment_unknown(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.read_webinar_payment_context(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_webinar_payment_context(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.settle_webinar_payment(text,uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.settle_webinar_payment(text,uuid,uuid,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.reject_webinar_payment(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reject_webinar_payment(text,uuid,uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.m2_webinar_policy_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.m2_webinar_attempt_guard() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

-- Rollback is not DELETE/reset/regrant of old unsafe policies. Disable runtime
-- webinar payment routes and access first; preserve ledger/registrations/attempts.
-- Recover exact function/policy/ACL snapshots and review a separate rollback plan.
-- Required isolated acceptance: direct member INSERT denied; public Data API URL
-- denied; admin metadata allowed; free/paid flow; relogin exact owner/webinar only;
-- simultaneous prepare gives started=true once; unknown never auto-retries; attach
-- replay; settlement replay same ref no writes; mismatched ref/binding rejected;
-- cached ready URL blocked after disable/cancel/expiry/registration close; manager
-- closes during provider request: known authority retained, URL withheld, no retry;
-- rejected ledger followed by payment POST: same authority retained, no URL or
-- new provider request; public count matches source paid/free occupied capacity;
-- statement failure rolls back payment+registration+audit together; cancel/disable
-- denies access but may still record an already verified financial payment.
