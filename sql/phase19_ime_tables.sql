-- ============================================================================
-- phase19 — جدول‌های بورس کالا (IME): تاریخچهٔ گواهی سپرده + معاملات فیزیکی
-- اجرا: کلود (الگوی phase14/phase17) — یک تراکنش کامل.
--
-- منبع داده: رلهٔ arsadata (BrsApi IME/Certificate.php و IME/Physical.php)
--   - ime_certificate_history: یک ردیف به‌ازای هر (روز، کد قرارداد) — append پایان‌روز.
--     قیمت‌ها تومان (رله ریال→تومان کرده)، ارزش معاملات تومان.
--   - ime_physical_trades: یک ردیف به‌ازای هر معاملهٔ فیزیکی — اعداد خام ریال
--     (ستون‌ها صریح‌اند: *_rial؛ value_krial یعنی «هزار ریال» مطابق مستند BrsApi).
--
-- قواعد پروژه: append-only (تریگر منع UPDATE/DELETE)، RLS با خواندن عمومی،
--   درج فقط با service_role (کلاینت anon حق INSERT ندارد).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Installation-only: never reinterpret or alter existing history objects.
-- A second installation deliberately fails; run read-only verification instead.
DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'phase19 requires PostgreSQL 15+ for null-equal deduplication';
  END IF;
  IF to_regclass('public.ime_certificate_history') IS NOT NULL
     OR to_regclass('public.ime_physical_trades') IS NOT NULL
     OR to_regprocedure('public.reject_mutation_ime()') IS NOT NULL THEN
    RAISE EXCEPTION 'phase19 expects absent IME history tables and guard; inspect existing objects';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3 THEN
    RAISE EXCEPTION 'phase19 requires existing Supabase API roles';
  END IF;
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'phase19 requires the existing service_role BYPASSRLS contract';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')
      AND NOT has_schema_privilege(rolname, 'public', 'USAGE')) THEN
    RAISE EXCEPTION 'phase19 requires existing public schema USAGE for API roles';
  END IF;
END $$;

-- ── ۱) تاریخچهٔ گواهی سپردهٔ کالایی ─────────────────────────────────────────
CREATE TABLE public.ime_certificate_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_date     date NOT NULL,            -- روز تهران (میلادی)
  contract_code  text NOT NULL,            -- مثل CD1GOB0001
  commodity      text,                     -- نام کالا (شمش طلا، سکه، زعفران…)
  title          text,                     -- شرح قرارداد
  close_toman    double precision,         -- قیمت پایانی (تومان)
  last_toman     double precision,         -- آخرین قیمت (تومان)
  high_toman     double precision,
  low_toman      double precision,
  change_percent double precision,
  trade_count    double precision,
  volume         double precision,
  value_toman    double precision,         -- ارزش معاملات (تومان)
  source         text NOT NULL DEFAULT 'brsapi_ime_cert',
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_date, contract_code)
);

-- ── ۲) معاملات فیزیکی بورس کالا ─────────────────────────────────────────────
CREATE TABLE public.ime_physical_trades (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_jdate      text NOT NULL,          -- تاریخ معامله، جلالی خط‌تیره‌دار (1405-04-25)
  fetch_date       date,                   -- روز دریافت توسط رله (میلادی)
  symbol_code      text NOT NULL,          -- کد نماد کالا در IME
  commodity_name   text,
  market_hall      text,                   -- تالار
  producer         text,                   -- تولیدکننده
  supplier         text,                   -- عرضه‌کننده
  type_contract    text,                   -- نوع قرارداد (نقدی/سلف/نسیه)
  unit             text,
  currency         text,
  price_base_rial  double precision,       -- قیمت پایهٔ عرضه (ریال)
  volume_contract  double precision,       -- حجم معامله‌شده
  volume_offer     double precision,       -- حجم عرضه
  demand           double precision,       -- تقاضا
  price_min_rial   double precision,
  price_max_rial   double precision,
  price_close_rial double precision,       -- قیمت پایانی (ریال)
  price_wavg_rial  double precision,       -- میانگین موزون (ریال)
  value_krial      double precision,       -- ارزش معاملات (هزار ریال — خام مستند)
  source           text NOT NULL DEFAULT 'brsapi_ime_physical',
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- کلید یکتای عمل‌گرایانه: یک روز ممکن است چند معاملهٔ یک نماد با قیمت/حجم
  -- متفاوت داشته باشد؛ این ترکیب ردیف تکراریِ واقعی را می‌گیرد و معاملات
  -- مستقل را نگه می‌دارد (همان on_conflict که رله استفاده می‌کند).
  -- Missing values must not make identical retries distinct (PostgreSQL 15+).
  -- The existing relay ON CONFLICT column tuple remains valid.
  UNIQUE NULLS NOT DISTINCT (trade_jdate, symbol_code, producer, price_close_rial, volume_contract)
);

CREATE INDEX ime_physical_trades_producer_idx
  ON public.ime_physical_trades (producer, trade_jdate);
CREATE INDEX ime_physical_trades_jdate_idx
  ON public.ime_physical_trades (trade_jdate);

-- ── ۳) append-only: منع UPDATE و DELETE (الگوی phase17) ─────────────────────
CREATE FUNCTION public.reject_mutation_ime()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END $$;

CREATE TRIGGER ime_cert_history_append_only
  BEFORE UPDATE OR DELETE ON public.ime_certificate_history
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation_ime();

CREATE TRIGGER ime_physical_trades_append_only
  BEFORE UPDATE OR DELETE ON public.ime_physical_trades
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation_ime();

-- Row triggers do not fire for TRUNCATE. Guard owner-driven mistakes too.
CREATE TRIGGER ime_cert_history_no_truncate
  BEFORE TRUNCATE ON public.ime_certificate_history
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation_ime();
CREATE TRIGGER ime_physical_trades_no_truncate
  BEFORE TRUNCATE ON public.ime_physical_trades
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation_ime();

-- ── ۴) RLS: خواندن عمومی، درج فقط service_role ──────────────────────────────
ALTER TABLE public.ime_certificate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ime_physical_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ime_cert_public_read" ON public.ime_certificate_history
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "ime_physical_public_read" ON public.ime_physical_trades
  FOR SELECT TO anon, authenticated USING (true);

-- (درج: service_role از RLS عبور می‌کند — هیچ policy درج برای anon/authenticated
--  تعریف نمی‌شود، پس فقط رله می‌تواند بنویسد.)

-- Explicit ACLs work with both legacy and restricted default privileges.
REVOKE ALL ON public.ime_certificate_history, public.ime_physical_trades
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ime_certificate_history, public.ime_physical_trades
  TO anon, authenticated;
GRANT SELECT, INSERT ON public.ime_certificate_history, public.ime_physical_trades
  TO service_role;
REVOKE ALL ON SEQUENCE public.ime_certificate_history_id_seq,
  public.ime_physical_trades_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.ime_certificate_history_id_seq,
  public.ime_physical_trades_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.reject_mutation_ime()
  FROM PUBLIC, anon, authenticated, service_role;

-- Delivered after commit, so PostgREST cannot observe a partial installation.
NOTIFY pgrst, 'reload schema';
COMMIT;

-- ── راستی‌آزمایی پس از اجرا (فقط SELECT — کامنت) ────────────────────────────
-- SELECT count(*) FROM public.ime_certificate_history;
-- SELECT count(*) FROM public.ime_physical_trades;
-- SELECT tgname FROM pg_trigger WHERE tgrelid IN
--   ('public.ime_certificate_history'::regclass, 'public.ime_physical_trades'::regclass);
