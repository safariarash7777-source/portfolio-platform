-- ═══════════════════════════════════════════════════════════════════════════
-- inventory.sql — اثرِ انگشتِ قطعیِ یک دیتابیس
-- ═══════════════════════════════════════════════════════════════════════════
--
-- خروجی: خطوطِ `section|key|value`، مرتب‌شده و تکرارپذیر.
-- روی **مبدأ** و **مقصدِ بازگردانی** اجرا می‌شود و دو خروجی با
-- `scripts/backup/compare.mjs` دوطرفه مقایسه می‌شوند.
--
-- ── چرا شمارشِ کلی کافی نبود ────────────────────────────────────────────────
--
-- نسخهٔ قبل فقط تعداد می‌شمرد: «۴۱ جدول، ۹۰ policy». از دست دادنِ یک policy و
-- اضافه‌شدنِ یکی دیگر از این فیلتر رد می‌شد. عوض‌شدنِ **تعریفِ** یک تابع یا
-- تریگر بدونِ تغییرِ تعداد هم رد می‌شد. یعنی نشانگری که نمی‌توانست فرقِ «سالم»
-- و «نمی‌بینم» را بگوید.
--
-- اینجا هر شیء **هویت و تعریفِ** خودش را دارد. تعریف‌های بلند با md5 فشرده
-- می‌شوند: کوتاه می‌ماند ولی به هر تغییرِ یک‌کاراکتری حساس است.
--
-- ── دامنه ──────────────────────────────────────────────────────────────────
--
-- • **ساختار** فقط `public`. اسکیماهای `auth` و `storage` مدیریت‌شده‌اند و
--   Supabase CLI آن‌ها را از dumpِ schema بیرون می‌گذارد؛ مقایسهٔ ساختاری‌شان
--   همیشه قرمز می‌شد، بدونِ آنکه چیزی دربارهٔ بکاپ بگوید.
-- • **شمارشِ ردیف** شاملِ `public`، `auth` و `storage` — چون dumpِ data دادهٔ
--   مدیریت‌شده مثلِ `auth.users` را **دارد**.
-- • استثناها صریح‌اند و در خروجی هم ثبت می‌شوند تا در manifest دیده شوند.

\pset tuples_only on
\pset format unaligned
\pset pager off

-- ── ۰) استثناهای ثبت‌شده ────────────────────────────────────────────────────
-- طبقِ راهنمای جاری Supabase این دو از dumpِ data کنار گذاشته می‌شوند، پس
-- انتظارِ وجودشان در مقصد نداریم.
WITH excluded(name) AS (
  VALUES ('storage.buckets_vectors'), ('storage.vector_indexes')
)
SELECT format('exclusion|%s|documented', name) FROM excluded ORDER BY 1;

-- ── ۱) شمارشِ دقیقِ ردیف‌ها، پویا ───────────────────────────────────────────
-- ⚠️ `reltuples` تخمین است و برای این کار بی‌ارزش. اینجا هر جدول واقعاً
-- شمرده می‌شود (`query_to_xml` تنها راهِ شمارشِ پویا در یک کوئریِ واحد است).
SELECT format('rowcount|%s.%s|%s', n.nspname, c.relname,
         (xpath('/row/c/text()',
            query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                         false, true, '')))[1]::text::bigint)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'auth', 'storage')
  AND format('%s.%s', n.nspname, c.relname)
      NOT IN ('storage.buckets_vectors', 'storage.vector_indexes')
  -- بخش‌های یک جدولِ پارتیشن‌شده جدا شمرده نمی‌شوند؛ والد آن‌ها را پوشش می‌دهد.
  AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
ORDER BY 1;

-- ── ۲) جدول‌ها ──────────────────────────────────────────────────────────────
SELECT format('table|%s.%s|%s', n.nspname, c.relname, c.relkind)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY 1;

-- ── ۳) ستون‌ها: نوع، nullability، پیش‌فرض، identity، generated ──────────────
SELECT format('column|%s.%s.%s|%s;notnull=%s;default=%s;identity=%s;generated=%s',
         n.nspname, c.relname, a.attname,
         format_type(a.atttypid, a.atttypmod),
         a.attnotnull,
         coalesce(md5(pg_get_expr(d.adbin, d.adrelid)), '-'),
         coalesce(nullif(a.attidentity, ''), '-'),
         coalesce(nullif(a.attgenerated, ''), '-'))
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1;

-- ── ۴) قیدها ────────────────────────────────────────────────────────────────
SELECT format('constraint|%s.%s.%s|%s',
         n.nspname, c.relname, con.conname, md5(pg_get_constraintdef(con.oid)))
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1;

-- ── ۵) RLS — هم enabled و هم forced ─────────────────────────────────────────
SELECT format('rls|%s.%s|enabled=%s;forced=%s',
         n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY 1;

-- ── ۶) policyها: نام، دستور، نقش‌ها، USING و WITH CHECK ─────────────────────
SELECT format('policy|%s.%s.%s|cmd=%s;permissive=%s;roles=%s;using=%s;check=%s',
         n.nspname, c.relname, p.polname,
         p.polcmd, p.polpermissive,
         coalesce((SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
                     FROM pg_roles r WHERE r.oid = ANY (p.polroles)), 'PUBLIC'),
         coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-'),
         coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-'))
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1;

-- ── ۷) ایندکس‌ها با تعریفِ کامل ─────────────────────────────────────────────
SELECT format('index|%s.%s|%s', schemaname, indexname, md5(indexdef))
FROM pg_indexes WHERE schemaname = 'public'
ORDER BY 1;

-- ── ۸) sequenceها ───────────────────────────────────────────────────────────
SELECT format('sequence|%s.%s|-', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S'
ORDER BY 1;

-- ── ۹) viewها و materialized viewها ─────────────────────────────────────────
SELECT format('view|%s.%s|%s', schemaname, viewname, md5(definition))
FROM pg_views WHERE schemaname = 'public'
ORDER BY 1;

SELECT format('matview|%s.%s|%s', schemaname, matviewname, md5(definition))
FROM pg_matviews WHERE schemaname = 'public'
ORDER BY 1;

-- ── ۱۰) توابع — بدونِ توابعِ متعلق به افزونه‌ها ──────────────────────────────
-- افزونه‌ها با نسخهٔ خودشان می‌آیند و جزوِ بکاپِ ما نیستند؛ گنجاندنشان یعنی
-- نویزی که هر ارتقای افزونه را شبیهِ خرابیِ بکاپ نشان می‌دهد.
SELECT format('function|%s.%s(%s)|%s',
         n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
         md5(pg_get_functiondef(p.oid)))
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
     WHERE d.objid = p.oid AND d.deptype = 'e'
  )
ORDER BY 1;

-- ── ۱۱) تریگرها — با scopeِ درست ────────────────────────────────────────────
-- ⚠️ نسخهٔ قبل `count(*) FROM pg_trigger WHERE NOT tgisinternal` بود که
-- **همهٔ اسکیماها** را می‌شمرد، برخلافِ بقیهٔ سنجه‌ها که فقط public بودند.
-- روی مبدأِ مدیریت‌شده تریگرهای auth/storage هم شمرده می‌شدند و مقصدِ ساده
-- آن‌ها را نداشت — یک اختلافِ همیشگی که ربطی به سلامتِ بکاپ نداشت.
SELECT format('trigger|%s.%s.%s|%s',
         n.nspname, c.relname, t.tgname, md5(pg_get_triggerdef(t.oid)))
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY 1;

-- ── ۱۲) امتیازها ────────────────────────────────────────────────────────────
-- مدلِ امنیتی بخشی از بکاپ است. بازگردانیِ ردیف‌ها بدونِ امتیازها یعنی
-- دیتابیسی که کار می‌کند ولی محافظت نمی‌شود — و `B-044` نشان داد این حالت
-- واقعاً پیش می‌آید.
SELECT format('grant_table|%s.%s|%s|%s',
         table_schema, table_name, grantee, privilege_type)
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
ORDER BY 1;

SELECT format('grant_routine|%s.%s|%s|%s',
         routine_schema, routine_name, grantee, privilege_type)
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
ORDER BY 1;

SELECT format('grant_sequence|%s.%s|%s|%s',
         object_schema, object_name, grantee, privilege_type)
FROM information_schema.role_usage_grants
WHERE object_schema = 'public'
ORDER BY 1;
