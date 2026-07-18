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

-- ── ۱) تاریخچهٔ گواهی سپردهٔ کالایی ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ime_certificate_history (
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
CREATE TABLE IF NOT EXISTS public.ime_physical_trades (
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
  UNIQUE (trade_jdate, symbol_code, producer, price_close_rial, volume_contract)
);

CREATE INDEX IF NOT EXISTS ime_physical_trades_producer_idx
  ON public.ime_physical_trades (producer, trade_jdate);
CREATE INDEX IF NOT EXISTS ime_physical_trades_jdate_idx
  ON public.ime_physical_trades (trade_jdate);

-- ── ۳) append-only: منع UPDATE و DELETE (الگوی phase17) ─────────────────────
CREATE OR REPLACE FUNCTION public.reject_mutation_ime()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS ime_cert_history_append_only ON public.ime_certificate_history;
CREATE TRIGGER ime_cert_history_append_only
  BEFORE UPDATE OR DELETE ON public.ime_certificate_history
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation_ime();

DROP TRIGGER IF EXISTS ime_physical_trades_append_only ON public.ime_physical_trades;
CREATE TRIGGER ime_physical_trades_append_only
  BEFORE UPDATE OR DELETE ON public.ime_physical_trades
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation_ime();

-- ── ۴) RLS: خواندن عمومی، درج فقط service_role ──────────────────────────────
ALTER TABLE public.ime_certificate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ime_physical_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ime_cert_public_read" ON public.ime_certificate_history;
CREATE POLICY "ime_cert_public_read" ON public.ime_certificate_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ime_physical_public_read" ON public.ime_physical_trades;
CREATE POLICY "ime_physical_public_read" ON public.ime_physical_trades
  FOR SELECT USING (true);

-- (درج: service_role از RLS عبور می‌کند — هیچ policy درج برای anon/authenticated
--  تعریف نمی‌شود، پس فقط رله می‌تواند بنویسد.)

COMMIT;

-- ── راستی‌آزمایی پس از اجرا (فقط SELECT — کامنت) ────────────────────────────
-- SELECT count(*) FROM public.ime_certificate_history;
-- SELECT count(*) FROM public.ime_physical_trades;
-- SELECT tgname FROM pg_trigger WHERE tgrelid IN
--   ('public.ime_certificate_history'::regclass, 'public.ime_physical_trades'::regclass);
