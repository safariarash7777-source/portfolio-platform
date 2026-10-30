-- Disposable native-test schema only, copied from the existing START-A lab's
-- empty risk prerequisites. It creates no assessment, price, model or right.
CREATE TABLE public.risk_assessments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
 total_score integer NOT NULL,risk_category text NOT NULL,answers_json jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.risk_revalidations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
 expired_at timestamptz NOT NULL DEFAULT now(),reason text,created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_revalidations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.risk_assessments,public.risk_revalidations FROM PUBLIC,anon,authenticated,service_role;
