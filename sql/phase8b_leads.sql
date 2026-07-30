-- =============================================================================
-- Phase 8b — جدولِ `public.leads` (منبعِ حقیقتِ لید، ADR-003)
--
-- وضعیت: NOT_APPLIED / READY_FOR_STAGING — رجوع به docs/MIGRATION-LEDGER.md
-- نویسندهٔ تنها: route handlerِ `app/api/leads/webhook/route.ts` با service-role.
--
-- این فایل **بازنویسیِ** نسخهٔ قبلیِ همین مسیر است، نه یک طرحِ رقیب؛ نسخهٔ قبلی
-- هرگز اجرا نشد، پس جایگزینی‌اش drift تولید نمی‌کند.
--
-- خواصِ این migration:
--   • idempotent — اجرای دوباره بی‌اثر است (IF NOT EXISTS / DROP … IF EXISTS).
--   • غیرمخرب — هیچ DROP TABLE، هیچ DROP COLUMN، هیچ تغییرِ نامِ شیٔ دیگری.
--   • قابلِ اجرا روی جدولی که با نسخهٔ قبلیِ phase8b ساخته شده باشد (ستون‌ها و
--     قیدها شرطی افزوده می‌شوند).
--   • هیچ مقدارِ Secret در این فایل نیست و نباید افزوده شود.
--
-- ترتیبِ اجرا: مستقل — پیش‌نیازش فقط وجودِ `public.profiles` است.
-- =============================================================================

BEGIN;

-- ── ۱) جدول ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source            TEXT        NOT NULL DEFAULT 'miniapp',
  name              TEXT        NOT NULL,
  phone             TEXT,
  topic             TEXT,
  message           TEXT,
  preferred_date    TEXT,
  preferred_time    TEXT,
  telegram_username TEXT,
  telegram_id       TEXT,
  -- چرخهٔ حیات فقط سمتِ سرور تعیین می‌شود؛ payloadِ وبهوک آن را نمی‌فرستد.
  status            TEXT        NOT NULL DEFAULT 'new',
  -- یادداشتِ داخلیِ ادمین (CRM)؛ وبهوک هرگز آن را نمی‌نویسد.
  notes             TEXT
);

COMMENT ON TABLE public.leads IS
  'لیدهای مشاوره (منبعِ حقیقت، ADR-003). نویسنده: /api/leads/webhook با service-role. دادهٔ شخصی — فقط ادمین می‌خوانَد.';

-- ستون‌های افزوده‌شده نسبت به نسخهٔ اولیهٔ phase8b، برای جدولِ از پیش موجود.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_date    TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_time    TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS telegram_id       TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes             TEXT;

-- ── ۲) قیدها ────────────────────────────────────────────────────────────────
-- سقفِ طول‌ها عیناً با `LEAD_LIMITS` در `lib/leads/webhook.ts` یکی است. اگر یکی
-- را عوض کردی، آن یکی را هم عوض کن؛ تستِ `lib/leads/webhook.test.ts` سقف‌ها را
-- می‌خوانَد ولی نمی‌تواند این فایل را بخوانَد.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
      CHECK (status IN ('new', 'contacted', 'converted', 'archived'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_name_len_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_name_len_check
      CHECK (char_length(name) BETWEEN 1 AND 200);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_field_len_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_field_len_check
      CHECK (
        char_length(source)                       <= 32
        AND char_length(COALESCE(phone, ''))             <= 32
        AND char_length(COALESCE(topic, ''))             <= 64
        AND char_length(COALESCE(message, ''))           <= 4000
        AND char_length(COALESCE(preferred_date, ''))    <= 32
        AND char_length(COALESCE(preferred_time, ''))    <= 32
        AND char_length(COALESCE(telegram_username, '')) <= 64
        AND char_length(COALESCE(telegram_id, ''))       <= 64
      );
  END IF;
END $$;

-- ── ۳) updated_at ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leads_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_updated_at ON public.leads;
CREATE TRIGGER trg_leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_set_updated_at();

-- ── ۴) ایندکس‌ها ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_created  ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON public.leads (status);
-- پشتیبانِ بررسیِ «تکراری در پنجرهٔ اخیر» در وبهوک (phone + created_at).
CREATE INDEX IF NOT EXISTS idx_leads_phone_created
  ON public.leads (phone, created_at DESC) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_telegram_id
  ON public.leads (telegram_id) WHERE telegram_id IS NOT NULL;

-- عمداً هیچ UNIQUE برای dedup گذاشته نشده: یک قیدِ یکتای دائمی، درخواستِ مجددِ
-- مشروعِ همان شخص را برای همیشه رد می‌کند. تکراری در لایهٔ اپلیکیشن و در یک
-- پنجرهٔ ۱۰ دقیقه‌ای تشخیص داده می‌شود (DUPLICATE_WINDOW_MS). معاوضهٔ آگاهانه:
-- «لیدِ تکراری» آزاردهنده است، «لیدِ ازدست‌رفته» فاجعه.

-- ── ۵) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- نکته: نقشِ `service_role` در Supabase دارای BYPASSRLS است و مستقل از این
-- سیاست‌ها می‌نویسد؛ سیاستِ زیر برای صراحتِ نیت نگه داشته شده است.
DROP POLICY IF EXISTS "Service role full access on leads" ON public.leads;
CREATE POLICY "Service role full access on leads" ON public.leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin can manage leads" ON public.leads;
CREATE POLICY "Admin can manage leads" ON public.leads
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- هیچ سیاستی برای anon یا کاربرِ عادی وجود ندارد → دادهٔ شخصیِ لید خوانده نمی‌شود.

-- ── ۶) گرنت‌ها — کمینه‌ترین امتیاز ──────────────────────────────────────────
-- ⚠️ درسِ تمرینِ staging (`G2-006`، ۱۴۰۵/۰۵/۰۸): نسخهٔ قبلیِ این فایل فقط
-- `REVOKE ALL … FROM anon` داشت. اندازه‌گیریِ واقعی روی **پروژهٔ stagingِ خودمان**
-- (`oqjcvkzyvhqnphopedpn`) نشان داد که کافی نیست — بلافاصله پس از ساختِ جدول:
--
--   authenticated → DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- منشأش `ALTER DEFAULT PRIVILEGES` روی اسکیمای `public` بود. ⚠️ دقتِ ادعا:
-- این یک **مشاهدهٔ نقطه‌ای روی یک پروژهٔ مشخص در یک تاریخِ مشخص** است، نه قانونی
-- ابدی دربارهٔ هر پروژهٔ Supabase؛ پیش‌فرض‌ها می‌توانند عوض شوند. برای همین
-- `lib/leads/leads.integration.test.ts` این migration را مقابلِ **دو** پروفایل
-- اجرا می‌کند (بدترین‌حالتِ مشاهده‌شده و محیطِ سخت‌گیرانه) و انتظار دارد نتیجهٔ
-- نهایی در هر دو یکسان باشد.
--
-- چرا این فقط «نظافت» نیست: **RLS روی `TRUNCATE` اعمال نمی‌شود.** سیاست‌های
-- بالا ردیف‌ها را برای کاربرِ عادی صفر می‌کنند، ولی `TRUNCATE` از کنارِ RLS
-- رد می‌شود. یعنی هر کاربرِ لاگین‌کردهٔ معمولی — نه ادمین — امتیازِ پاک‌کردنِ
-- کلِ جدولِ لید را داشت. محرمانگی برقرار بود، یکپارچگی نه.
--
-- Security Advisor این را نگرفت (فقط `rls_enabled_no_policy` را می‌بیند)؛
-- پس گرنت‌ها باید جدا از RLS بررسی شوند.
REVOKE ALL ON public.leads FROM PUBLIC;
REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.leads FROM authenticated;

-- نویسندهٔ لید فقط سرور است (`/api/leads/webhook` با service-role).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO service_role;

-- ادمین از نشستِ کاربر می‌خوانَد، پس نقشِ `authenticated` به امتیازِ جدولی نیاز
-- دارد تا سیاستِ «Admin can manage leads» زنده بماند؛ ولی فقط خواندن و
-- به‌روزرسانی (چرخهٔ حیات/یادداشتِ CRM). درج و حذف و **TRUNCATE** داده نمی‌شود.
-- ردیف‌ها همچنان با RLS به ادمین محدودند — این گرنت به‌تنهایی چیزی را باز نمی‌کند.
GRANT SELECT, UPDATE ON public.leads TO authenticated;

-- تابعِ تریگر نیازی به EXECUTEِ عمومی ندارد؛ مجوزِ آن هنگامِ ساختِ تریگر بررسی
-- می‌شود، نه در هر شلیک. پیش از این `anon` هم می‌توانست صدایش بزند.
--
-- ⚠️ فقط `FROM PUBLIC` کافی نیست: Supabase علاوه بر PUBLIC، مستقیماً هم به
-- `anon`/`authenticated` گرنت می‌دهد. اندازه‌گیریِ staging پس از REVOKE از PUBLIC
-- هنوز `has_function_privilege('anon', …) = true` می‌داد. هر سه باید صریح باشند.
REVOKE ALL ON FUNCTION public.leads_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.leads_set_updated_at() FROM authenticated;

COMMIT;

-- =============================================================================
-- پرس‌وجوهای راستی‌آزمایی (بعد از اجرا، دستی — بخشی از این migration نیستند)
-- =============================================================================
-- ۱) جدول ساخته شد؟
--    SELECT to_regclass('public.leads');                        -- انتظار: public.leads
-- ۲) RLS روشن است؟
--    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.leads'::regclass;  -- t
-- ۳) سیاست‌ها؟
--    SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname='public' AND tablename='leads';          -- انتظار: ۲ ردیف
-- ۴) ایندکس‌ها؟
--    SELECT indexname FROM pg_indexes
--     WHERE schemaname='public' AND tablename='leads';          -- انتظار: PK + ۴ ایندکس
-- ۵) قیدها؟
--    SELECT conname FROM pg_constraint WHERE conrelid='public.leads'::regclass;
-- ۶) تریگرِ updated_at؟
--    SELECT tgname FROM pg_trigger
--     WHERE tgrelid='public.leads'::regclass AND NOT tgisinternal;
-- ۷) anon واقعاً دسترسی ندارد؟
--    SELECT has_table_privilege('anon','public.leads','SELECT');  -- f
-- ۸) کاربرِ عادی امتیازِ خطرناک ندارد؟ (RLS جلوی TRUNCATE را نمی‌گیرد)
--    SELECT has_table_privilege('authenticated','public.leads','TRUNCATE'); -- f
--    SELECT has_table_privilege('authenticated','public.leads','INSERT');   -- f
--    SELECT has_table_privilege('authenticated','public.leads','DELETE');   -- f
--    SELECT has_table_privilege('authenticated','public.leads','SELECT');   -- t (با RLS محدود)
--
-- =============================================================================
-- برگشت (Rollback / Reversal)
-- =============================================================================
-- اگر جدول تازه ساخته شده و **خالی** است، برگشتِ کامل بی‌خطر است:
--
--   BEGIN;
--   DROP TRIGGER  IF EXISTS trg_leads_set_updated_at ON public.leads;
--   DROP FUNCTION IF EXISTS public.leads_set_updated_at();
--   DROP TABLE    IF EXISTS public.leads;
--   COMMIT;
--
-- اگر جدول **دادهٔ واقعی** دارد: `DROP TABLE` نزن — لیدِ واقعی از بین می‌رود.
-- در آن حالت فقط مسیر را ببند (سکرتِ وبهوک را از محیط بردار) و جدول را
-- دست‌نخورده نگه دار؛ داده‌ای که نگه داشته شود بی‌ضرر است.
-- =============================================================================
