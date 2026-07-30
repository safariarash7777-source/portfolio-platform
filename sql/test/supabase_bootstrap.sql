-- =============================================================================
-- شبیه‌سازیِ محیطِ Supabase روی یک Postgresِ محلی — فقط برای **تست**.
--
-- چرا لازم است: تمرینِ stagingِ `G2-006` نتوانست هاپِ آخر را اثبات کند، چون
-- شبکهٔ محیطِ اجرا `*.supabase.co` را می‌بندد (`B-030`). ولی چیزی که آنجا
-- می‌خواستیم بسنجیم — رفتارِ واقعیِ RLS و گرنت‌ها روی `public.leads` — بدونِ
-- هیچ شبکه‌ای هم قابلِ سنجش است، اگر نقش‌ها را درست بازتولید کنیم.
--
-- ⚠️ این فایل **هرگز روی Production یا Staging اجرا نمی‌شود.** فقط
-- `lib/leads/leads.integration.test.ts` آن را روی یک Postgresِ یک‌بارمصرف اجرا
-- می‌کند.
--
-- ── این فایل «پروفایلِ امتیاز» را تعیین نمی‌کند ───────────────────────────────
-- اینجا فقط نقش‌ها، اسکیمای `auth` و پیش‌نیازِ `profiles` ساخته می‌شود.
-- **امتیازهای پایه** در یکی از دو فایلِ جداگانه اعمال می‌شوند و تست migration را
-- مقابلِ **هر دو** اجرا می‌کند:
--
--   • `profile_legacy_default_privileges.sql` — پروفایلِ بدترین‌حالت
--   • `profile_explicit_grants.sql`           — پروفایلِ سخت‌گیرانه
--
-- چرا این تفکیک مهم است (اصلاحِ `P2-G2-010`): نسخهٔ اولِ این فایل می‌گفت دارد
-- «پیش‌فرضِ Supabase» را بازتولید می‌کند. آن ادعا **بیش از شواهد** بود. آنچه
-- واقعاً می‌دانیم این است: روی **پروژهٔ stagingِ خودمان** (`oqjcvkzyvhqnphopedpn`،
-- ساخته‌شده ۲۰۲۶-۰۷-۳۰) پس از اجرای `phase8b_leads.sql` اندازه‌گیری کردیم و
-- دیدیم `authenticated` این امتیازها را داشت:
--
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- این یک **مشاهدهٔ نقطه‌ای روی یک پروژهٔ مشخص در یک تاریخِ مشخص** است، نه قانونی
-- ابدی دربارهٔ هر پروژهٔ Supabase. Supabase می‌تواند پیش‌فرض‌ها را عوض کند و
-- پروژه‌های تازه ممکن است سخت‌گیرانه‌تر باشند. برای همین migration باید مقابلِ
-- هر دو پروفایل درست کار کند، و تست هر دو را می‌سنجد.
-- =============================================================================

-- ── ۱) نقش‌ها ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- در Supabase این نقش BYPASSRLS دارد؛ همان‌جا هم سیاست‌ها را دور می‌زند.
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── ۲) اسکیمای auth و توابعش ────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- در Supabase این‌ها از claimsِ JWT خوانده می‌شوند. تست با
-- `set_config('request.jwt.claims', …)` همان نقش/کاربر را جعل می‌کند.
--
-- توجه: وقتی claim ست نشده، `current_setting(…, true)` رشتهٔ خالی می‌دهد نه
-- NULL؛ کستِ مستقیمِ آن به json خطا می‌دهد. پس اول `nullif` روی خودِ رشته.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', ''),
    current_user
  );
$$;

-- ── ۳) پیش‌نیازِ phase8b: جدولِ profiles ─────────────────────────────────────
-- عیناً از `sql/archive/supabase_schema.sql` (همان تعریفی که Production دارد).
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

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- کاربر باید ردیفِ خودش را ببیند، وگرنه زیرپرس‌وجوی سیاستِ ادمین روی leads
-- همیشه false می‌شود و ادمین بی‌صدا قفل می‌ماند. این همان تله‌ای است که در
-- staging هم بالقوه وجود داشت.
DROP POLICY IF EXISTS "own profile readable" ON public.profiles;
CREATE POLICY "own profile readable" ON public.profiles
  FOR SELECT USING (id = auth.uid());

GRANT SELECT ON public.profiles TO authenticated;
