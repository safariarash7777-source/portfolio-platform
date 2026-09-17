-- =============================================================================
-- پیش‌شرطِ آزمونِ سبد (`#140`) — بازسازیِ شکلِ واقعیِ Production
--
-- ⚠️ این فایل «یک اسکیمای تمیز» نیست؛ عمداً همان چیزی است که روی پروژهٔ واقعی
-- اندازه گرفته شد (فقط‌خواندنی، ۱۴۰۵/۰۶/۲۵). اگر سخت‌گیرانه‌ترش کنی، تست‌ها
-- به دلیلِ اشتباه سبز می‌شوند — دقیقاً همان تله‌ای که در `#139` افتاد.
--
-- منابع اندازه‌گیری: information_schema.columns · pg_constraint · pg_policies ·
-- pg_default_acl · role_table_grants.
-- =============================================================================

-- ── گاردِ افزایشی — عیناً همان تعریفِ Production ────────────────────────────
-- (خوانده‌شده از `pg_get_functiondef` روی پروژهٔ واقعی؛ دست‌کاری نشده.)
CREATE OR REPLACE FUNCTION public.deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $deny$
BEGIN
  RAISE EXCEPTION 'این جدول فقط افزایشی (append-only) است؛ ویرایش یا حذف مجاز نیست.';
END $deny$;

-- ── `signals` — تنها وابستگیِ بیرونیِ phase20 غیر از `profiles` ──────────────
-- phase20 در `intel_analysis_signals` به این جدول FK می‌زند. روی Production
-- وجود دارد (۱۴ ستون)؛ اینجا همان شکل بازسازی می‌شود تا phase20 **یکپارچه**
-- اجرا شود، نه با استخراجِ بخشی.
CREATE TABLE IF NOT EXISTS public.signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint NOT NULL,
  draft_id     uuid,
  symbol       text NOT NULL,
  direction    text NOT NULL,
  entry_price  numeric,
  entry_date   date NOT NULL DEFAULT CURRENT_DATE,
  horizon      text,
  reasons      jsonb NOT NULL DEFAULT '[]'::jsonb,
  scores       jsonb,
  approved_by  uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  prev_hash    text NOT NULL,
  record_hash  text NOT NULL
);

-- ── سبدِ عضو: هدف و واقعی، همان‌طور که امروز هستند ──────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  allocations jsonb NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portfolio_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  version     integer NOT NULL,
  allocations jsonb NOT NULL,
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

-- ⚠️ `holdings` عمداً **بدونِ** یکتاییِ (user_id, symbol) ساخته می‌شود، چون
-- Production هم ندارد (فقط `PRIMARY KEY (id)`). ثبتِ دوبارهٔ یک نماد امروز
-- ردیفِ تکراری می‌سازد؛ تستِ ایده‌مپوتنسی باید این را ببیند، نه یک نسخهٔ
-- تمیزشدهٔ خیالی.
CREATE TABLE IF NOT EXISTS public.holdings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  symbol         text NOT NULL,
  name           text NOT NULL,
  asset_class    text NOT NULL DEFAULT 'سهام',
  qty            numeric NOT NULL DEFAULT 0,
  avg_price      bigint NOT NULL DEFAULT 0,
  current_price  bigint NOT NULL DEFAULT 0,
  day_change_pct numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  type        text NOT NULL CHECK (type IN ('خرید','فروش','واریز','برداشت')),
  instrument  text,
  amount      bigint NOT NULL,
  status      text NOT NULL DEFAULT 'انجام‌شده',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- ── سیاست‌ها، عیناً مثل Production ──────────────────────────────────────────
ALTER TABLE public.portfolios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pf_self_read ON public.portfolios;
CREATE POLICY pf_self_read ON public.portfolios FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- ⚠️ `portfolio_versions` روی Production **فقط** سیاستِ خواندن دارد. هیچ
-- سیاستِ INSERT/UPDATE/DELETE ندارد، یعنی امروز تنها از راهِ service-role
-- نوشته می‌شود. این را «فراموش‌شده» فرض نکن — واقعیتِ سنجیده‌شده است.
DROP POLICY IF EXISTS pv_self_read ON public.portfolio_versions;
CREATE POLICY pv_self_read ON public.portfolio_versions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- ⚠️ `FOR ALL` یعنی عضو می‌تواند داراییِ خودش را **UPDATE و DELETE** کند و
-- هیچ گاردِ append-only هم نیست. همین نبودِ تاریخچه است که `#140` می‌خواهد حل
-- شود؛ پس اینجا باید عیناً بازسازی شود تا تست بتواند تفاوت را نشان دهد.
DROP POLICY IF EXISTS hold_self_read ON public.holdings;
CREATE POLICY hold_self_read ON public.holdings FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS hold_owner_write ON public.holdings;
CREATE POLICY hold_owner_write ON public.holdings FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS tx_self_read ON public.transactions;
CREATE POLICY tx_self_read ON public.transactions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS tx_owner_write ON public.transactions;
CREATE POLICY tx_owner_write ON public.transactions FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ── ACLِ فراخ — همان چیزی که جدولِ تازه را باز به دنیا می‌دهد ───────────────
-- اندازه‌گیریِ `pg_default_acl` روی پروژهٔ واقعی: anon=arwdDxtm،
-- authenticated=arwdDxtm، service_role=arwdDxtm برای schema `public`.
-- بدونِ بازسازیِ این، هر آزمونِ «عضو نمی‌تواند بنویسد» با «permission denied»
-- سبز می‌شود در حالی که در Production تنها RLS گیت است.
GRANT ALL ON public.portfolios         TO anon, authenticated, service_role;
GRANT ALL ON public.portfolio_versions TO anon, authenticated, service_role;
GRANT ALL ON public.holdings           TO anon, authenticated, service_role;
GRANT ALL ON public.transactions       TO anon, authenticated, service_role;
GRANT ALL ON public.signals            TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
