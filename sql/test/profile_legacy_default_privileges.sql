-- =============================================================================
-- پروفایلِ امتیازِ **بدترین‌حالت (Legacy)** — فقط تست.
--
-- این همان چیزی است که روی **پروژهٔ stagingِ خودمان** (`oqjcvkzyvhqnphopedpn`)
-- در ۲۰۲۶-۰۷-۳۰ اندازه‌گیری شد: بلافاصله پس از `CREATE TABLE public.leads`،
-- نقشِ `authenticated` این امتیازها را داشت بدونِ آنکه migration چیزی به آن
-- داده باشد:
--
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- منشأش `ALTER DEFAULT PRIVILEGES` روی اسکیمای `public` است. این فایل همان را
-- بازتولید می‌کند تا migration در بدترین شرایط سنجیده شود.
--
-- ⚠️ **ادعای این فایل محدود است:** «این پیکربندی روی پروژهٔ stagingِ ما دیده
-- شد»، نه «هر پروژهٔ Supabase تا ابد همین است». Supabase پیش‌فرض‌ها را عوض
-- می‌کند؛ برای همین پروفایلِ دومی هم داریم.
--
-- چرا این پروفایل حیاتی است: بدونِ آن، جدولِ تازه هیچ امتیازِ اضافه‌ای نمی‌گیرد،
-- `REVOKE`های migration چیزی برای پس‌گرفتن ندارند و کلِ تستِ گرنت **پوچ** می‌شود.
-- =============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
