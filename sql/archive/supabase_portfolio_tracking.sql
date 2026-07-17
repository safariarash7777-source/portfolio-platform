-- ════════════════════════════════════════════════════════════════
-- Portfolio tracking — ADDITIVE migration (does not touch existing tables).
-- Adds live holdings, transactions, and daily value snapshots for the
-- dashboard's portfolio charts. Money is stored as bigint Toman.
-- Reuses the existing public.is_admin() helper. Run after supabase_schema.sql.
-- ════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.holdings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol         text NOT NULL,                 -- e.g. فولاد
  name           text NOT NULL,                 -- فولاد مبارکه اصفهان
  asset_class    text NOT NULL DEFAULT 'سهام',  -- سهام / صندوق درآمد ثابت / طلا / ارز دیجیتال / نقد …
  qty            numeric NOT NULL DEFAULT 0,
  avg_price      bigint  NOT NULL DEFAULT 0,     -- Toman
  current_price  bigint  NOT NULL DEFAULT 0,     -- Toman
  day_change_pct numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON public.holdings(user_id);

CREATE TABLE IF NOT EXISTS public.transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('خرید','فروش','واریز','برداشت')),
  instrument  text,
  amount      bigint NOT NULL,                   -- Toman
  status      text NOT NULL DEFAULT 'انجام‌شده',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of   date NOT NULL,
  value   bigint NOT NULL,                        -- total Toman that day
  PRIMARY KEY (user_id, as_of)
);

-- ── RLS: owner full access, admin full access ──────────────────
ALTER TABLE public.holdings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('holdings','transactions','portfolio_snapshots')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- holdings
CREATE POLICY "hold_self_read"   ON public.holdings FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "hold_owner_write" ON public.holdings FOR ALL    USING (auth.uid() = user_id OR public.is_admin())
                                                               WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- transactions
CREATE POLICY "tx_self_read"   ON public.transactions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "tx_owner_write" ON public.transactions FOR ALL    USING (auth.uid() = user_id OR public.is_admin())
                                                                 WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- portfolio_snapshots
CREATE POLICY "snap_self_read"   ON public.portfolio_snapshots FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "snap_owner_write" ON public.portfolio_snapshots FOR ALL    USING (auth.uid() = user_id OR public.is_admin())
                                                                          WITH CHECK (auth.uid() = user_id OR public.is_admin());
