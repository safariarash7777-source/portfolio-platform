-- Synthetic "production" for the acceptance run. No real data.
\set ON_ERROR_STOP 1
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE ROLE synthetic_reader NOLOGIN;
GRANT synthetic_reader TO postgres;

SET ROLE postgres;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.notes (
  id bigserial PRIMARY KEY,
  owner uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  amount numeric(12,2) DEFAULT 0,
  tags text[] DEFAULT '{}',
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY notes_owner ON public.notes FOR ALL TO authenticated USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
REVOKE ALL ON public.notes FROM anon;
GRANT SELECT, INSERT ON public.notes TO authenticated;
GRANT SELECT ON public.profiles TO authenticated, anon, synthetic_reader;
CREATE FUNCTION public.note_count(u uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public AS $$ SELECT count(*) FROM public.notes WHERE owner = u $$;
REVOKE EXECUTE ON FUNCTION public.note_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_count(uuid) TO authenticated;
CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.created_at := coalesce(NEW.created_at, now()); RETURN NEW; END $$;
CREATE TRIGGER notes_touch BEFORE INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch();
CREATE VIEW public.note_summary WITH (security_invoker = true) AS
  SELECT owner, count(*) AS n FROM public.notes GROUP BY owner;
GRANT SELECT ON public.note_summary TO authenticated;
CREATE INDEX notes_owner_idx ON public.notes(owner);

INSERT INTO public.profiles (id, display_name)
  SELECT id, 'کاربر آزمایشی ' || row_number() OVER (ORDER BY email) FROM auth.users;
INSERT INTO public.notes (owner, body, amount, tags, meta)
  SELECT u.id,
         'یادداشتِ مصنوعی ' || g || ' — «نقل‌قول»، tab' || chr(9) || 'end; quote '' and backslash \',
         (g * 1.25)::numeric(12,2), ARRAY['t' || (g % 5), 'ریال'], jsonb_build_object('g', g, 'fa', 'آزمون')
  FROM auth.users u CROSS JOIN generate_series(1, 250) g;
RESET ROLE;

SELECT cron.schedule('synthetic-noop', '*/5 * * * *', 'SELECT 1');
INSERT INTO storage.buckets (id, name, public) VALUES ('synthetic-bucket', 'synthetic-bucket', false);
