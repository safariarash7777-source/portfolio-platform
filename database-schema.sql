-- =============================================================
-- Portfolio Platform – PostgreSQL Schema
-- Run this in the Supabase SQL Editor (or any psql client).
-- =============================================================

-- ---------------------------------------------------------------
-- 1. waitlist
--    Referenced by: app/api/waitlist/route.ts
--    Inserts: { email }
--    Unique constraint required – route.ts checks code "23505".
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index used implicitly by the UNIQUE constraint; explicit one for
-- fast look-ups when checking duplicates server-side.
CREATE INDEX IF NOT EXISTS waitlist_email_idx ON public.waitlist (email);

-- Row Level Security
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) may join the waitlist.
CREATE POLICY "allow_public_insert_waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated service-role callers may read the list.
CREATE POLICY "allow_service_select_waitlist"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'service_role');


-- ---------------------------------------------------------------
-- 2. risk_profiles
--    Stores results from the RiskProfileQuiz (15-question assessment).
--    Fields mirror the quiz question keys and computed outputs.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_profiles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Optional: link to a waitlist email so results can be emailed later.
  email      TEXT,

  -- ── Raw quiz answers (one column per question field) ──────────
  age_range                TEXT,   -- under_30 | 30_45 | 45_60 | over_60
  investment_goal          TEXT,   -- long_term_growth | passive_income | inflation_hedge | capital_preservation
  time_horizon             TEXT,   -- over_10y | 5_10y | 2_5y | under_2y
  monthly_investment       TEXT,   -- over_30pct | 20_30pct | 10_20pct | under_10pct
  portfolio_size           TEXT,   -- over_500m | 100_500m | 10_100m | under_10m
  market_downturn_reaction TEXT,   -- buy_more | wait | worried_wait | sell
  drawdown_tolerance       TEXT,   -- over_40pct | 20_40pct | 10_20pct | under_10pct
  income_source            TEXT,   -- entrepreneur | freelancer | employee | retired
  emergency_fund           TEXT,   -- yes_over_6m | yes_6m | yes_less_6m | no
  investment_experience    TEXT,   -- expert | advanced | intermediate | beginner
  preferred_assets         TEXT,   -- growth_stocks | blue_chips | mixed_funds | bonds_deposits
  capital_preservation     TEXT,   -- not_important | less_important | important | very_important
  expected_annual_return   TEXT,   -- over_50pct | 30_50pct | 15_30pct | under_15pct
  review_frequency         TEXT,   -- daily | weekly | monthly | quarterly
  self_risk_rating         TEXT,   -- very_high | high | medium | low

  -- ── Computed outputs ──────────────────────────────────────────
  -- Score range: 15 (all conservative) – 60 (all aggressive).
  risk_score    INTEGER NOT NULL CHECK (risk_score BETWEEN 15 AND 60),

  -- Human-readable category derived from score bands:
  --   15-25 → conservative | 26-36 → moderate
  --   37-47 → growth       | 48-60 → aggressive
  risk_category TEXT NOT NULL
    CHECK (risk_category IN ('conservative', 'moderate', 'growth', 'aggressive'))
);

-- Row Level Security
ALTER TABLE public.risk_profiles ENABLE ROW LEVEL SECURITY;

-- Visitors may submit their own profile.
CREATE POLICY "allow_public_insert_risk_profiles"
  ON public.risk_profiles
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only service-role callers may read stored profiles.
CREATE POLICY "allow_service_select_risk_profiles"
  ON public.risk_profiles
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'service_role');
