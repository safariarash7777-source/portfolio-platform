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
REVOKE ALL ON public.leads FROM anon;

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
