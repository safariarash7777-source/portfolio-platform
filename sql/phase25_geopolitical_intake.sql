-- ═══════════════════════════════════════════════════════════════════════════════
-- فاز ۲۵ — ورودیِ دستیِ رویدادهای سیاسی/ژئوپلیتیک (v1)
-- ADDITIVE · idempotent. به هیچ جدول یا دادهٔ موجودی دست نمی‌زند.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ── چرا دستی، و نه خودکار ───────────────────────────────────────────────────
--
-- قاعدهٔ `S1` در `.claude/skills/iran-market-data` منابع مجاز را به BrsApi و
-- فایل‌های عمومیِ کدال/TSETMC محدود می‌کند و اسکرپ را ممنوع. برای رویدادِ
-- سیاسی **هیچ منبعِ مجازی وجود ندارد**. پس یا منبعی رسمی مستند و تأیید شود،
-- یا ورود دستی باشد. تا آن زمان، هر «فیدِ خودکارِ سیاسی» ادعای بی‌پشتوانه است.
--
-- ── تفکیکی که این جدول تحمیل می‌کند ─────────────────────────────────────────
--
-- `fact_summary` و `interpretation` دو ستونِ **جدا** هستند. یک ستونِ واحد
-- ناگزیر این دو را قاطی می‌کرد و بعد تحلیل روی حدس بنا می‌شد بدونِ اینکه کسی
-- بتواند تشخیص بدهد کجا واقعیت تمام و تفسیر شروع شده.
--
-- ── خصوصی به‌صورتِ پیش‌فرض ──────────────────────────────────────────────────
--
-- `visibility` پیش‌فرضِ `private` دارد و RLS فقط ادمین را می‌بیند. هیچ ردیفی
-- بدونِ اقدامِ صریح عمومی نمی‌شود، و انتشارِ خودکار وجود ندارد.
--
-- پیش‌نیاز: `profiles` · `is_admin()` · `audit_log`.

CREATE TABLE IF NOT EXISTS public.geopolitical_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  title            text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 300),

  -- منبعِ اولیه و قابلِ استناد. بدونِ لینک، رویداد ثبت نمی‌شود.
  source_url       text NOT NULL CHECK (source_url ~ '^https?://'),
  source_name      text,

  -- زمانِ **مشاهده/انتشارِ خودِ رویداد**، نه زمانِ ثبت در سامانه. این دو یکی
  -- نیستند و قاطی‌کردنشان تحلیلِ look-ahead می‌سازد.
  observed_at      timestamptz NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),

  -- ── واقعیت در برابر تفسیر ────────────────────────────────────────────────
  fact_summary     text NOT NULL CHECK (length(trim(fact_summary)) >= 10),
  interpretation   text,

  -- بازارها/دارایی‌های متأثر و مسیرِ اثر — هر دو الزامی، چون رویدادی که
  -- مسیرِ اثرش نوشته نشده باشد قابلِ استفاده در موتور نیست.
  affected_markets text[] NOT NULL CHECK (cardinality(affected_markets) > 0),
  impact_path      text NOT NULL CHECK (length(trim(impact_path)) >= 10),

  confidence       text NOT NULL DEFAULT 'low'
                     CHECK (confidence IN ('low', 'medium', 'high')),
  review_state     text NOT NULL DEFAULT 'draft'
                     CHECK (review_state IN ('draft', 'reviewed', 'rejected')),
  visibility       text NOT NULL DEFAULT 'private'
                     CHECK (visibility IN ('private', 'internal', 'public')),

  created_by       uuid REFERENCES public.profiles(id),
  reviewed_by      uuid REFERENCES public.profiles(id),
  reviewed_at      timestamptz,

  -- انتشارِ عمومی فقط پس از بازبینی. این قید در خودِ جدول است تا با تغییرِ
  -- کدِ برنامه دور زده نشود.
  CONSTRAINT geopolitical_public_requires_review
    CHECK (visibility <> 'public' OR review_state = 'reviewed')
);

CREATE INDEX IF NOT EXISTS idx_geopolitical_observed
  ON public.geopolitical_events(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_geopolitical_review
  ON public.geopolitical_events(review_state, visibility);

-- ── RLS: صریح، نه با تکیه بر پیش‌فرض ────────────────────────────────────────
ALTER TABLE public.geopolitical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geopolitical_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geo_admin_all" ON public.geopolitical_events;
CREATE POLICY "geo_admin_all" ON public.geopolitical_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- کاربرِ واردشده فقط ردیفِ **بازبینی‌شده و عمومی** را می‌بیند. پیش‌نویس و
-- ردشده هرگز از این جدول بیرون نمی‌روند.
DROP POLICY IF EXISTS "geo_public_read" ON public.geopolitical_events;
CREATE POLICY "geo_public_read" ON public.geopolitical_events
  FOR SELECT USING (visibility = 'public' AND review_state = 'reviewed');

-- ── امتیازها: صریح، نه با تکیه بر ALTER DEFAULT PRIVILEGES ─────────────────
-- ⚠️ درسِ `B-044`: روی Supabase، جدولِ تازه ممکن است از پیش‌فرض‌های تاریخیِ
-- سخاوتمندانه امتیاز بگیرد — از جمله TRUNCATE برای `anon` که RLS جلویش را
-- **نمی‌گیرد**. پس همه‌چیز اول گرفته و بعد به‌اندازه داده می‌شود.
REVOKE ALL ON TABLE public.geopolitical_events FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.geopolitical_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.geopolitical_events TO service_role;

-- ── تأییدِ خودکارِ پس از اجرا ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND c.relname='geopolitical_events'
                    AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'تأیید شکست خورد: RLS روی geopolitical_events فعال/اجباری نیست.';
  END IF;

  IF has_table_privilege('anon', 'public.geopolitical_events', 'SELECT')
     OR has_table_privilege('anon', 'public.geopolitical_events', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.geopolitical_events', 'DELETE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: anon هنوز به رویدادهای سیاسی دسترسی دارد.';
  END IF;

  IF has_table_privilege('authenticated', 'public.geopolitical_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.geopolitical_events', 'TRUNCATE') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: کاربرِ عادی می‌تواند رویداد را حذف کند.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'geopolitical_public_requires_review') THEN
    RAISE EXCEPTION 'تأیید شکست خورد: قیدِ «انتشار فقط پس از بازبینی» وجود ندارد.';
  END IF;
END $$;

COMMENT ON TABLE public.geopolitical_events IS
  'ورودیِ دستیِ رویدادهای سیاسی/ژئوپلیتیک. هیچ منبعِ خودکاری ندارد (قاعدهٔ S1). خصوصی به‌صورتِ پیش‌فرض؛ انتشار فقط پس از بازبینیِ انسانی.';
COMMENT ON COLUMN public.geopolitical_events.fact_summary IS
  'فقط واقعیتِ قابلِ استناد. تفسیر در ستونِ جداگانه می‌رود.';
COMMENT ON COLUMN public.geopolitical_events.observed_at IS
  'زمانِ خودِ رویداد، نه زمانِ ثبت. قاطی‌کردنِ این دو تحلیلِ look-ahead می‌سازد.';
