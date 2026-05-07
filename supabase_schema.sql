-- ──────────────────────────────────────────────────────────────
-- 1. Drop old table
-- ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.risk_profiles CASCADE;

-- ──────────────────────────────────────────────────────────────
-- 2. Tables
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text,
  national_id  text,
  phone        text,
  email        text,
  role         text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_score   int NOT NULL,
  risk_category text NOT NULL,
  answers_json  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_user_created
  ON public.risk_assessments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocations jsonb NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolios_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 3. is_admin() helper
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. Auto-create profile on signup
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────
-- 5. RLS
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('profiles','risk_assessments','portfolios','waitlist')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- profiles
CREATE POLICY "profiles_self_read"    ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_self_insert"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_self_update"  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE USING (public.is_admin());

-- risk_assessments
CREATE POLICY "ra_self_read"   ON public.risk_assessments FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "ra_self_insert" ON public.risk_assessments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- portfolios
CREATE POLICY "pf_self_read"    ON public.portfolios FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "pf_admin_write"  ON public.portfolios FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "pf_admin_update" ON public.portfolios FOR UPDATE USING (public.is_admin());
CREATE POLICY "pf_admin_delete" ON public.portfolios FOR DELETE USING (public.is_admin());

-- waitlist
CREATE POLICY "wl_public_insert" ON public.waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "wl_admin_read"    ON public.waitlist FOR SELECT USING (public.is_admin());

-- ──────────────────────────────────────────────────────────────
-- 6. Grant admin to founder
-- ──────────────────────────────────────────────────────────────
UPDATE public.profiles SET role = 'admin', updated_at = now()
WHERE email = 'safariarash7777@gmail.com';

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'safariarash7777@gmail.com';

-- Verify:
SELECT id, email, role FROM public.profiles WHERE email = 'safariarash7777@gmail.com';
