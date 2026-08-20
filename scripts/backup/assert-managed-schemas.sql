-- مقصدِ بازگردانی باید اسکیماهای مدیریت‌شده را **از قبل** داشته باشد.
--
-- dumpِ schema این‌ها را ندارد (Supabase CLI کنارشان می‌گذارد) ولی dumpِ data
-- دادهٔ داخلشان — مثلِ `auth.users` — را دارد. روی یک Postgresِ ساده این
-- جدول‌ها وجود ندارند، پس بازگردانی یا می‌شکند یا شکستش دیده نمی‌شود.
--
-- خطای این فایل کلِ اسکریپت را متوقف می‌کند: مقصدِ غیروفادار یعنی آزمونِ
-- بازگردانی چیزی را اثبات نمی‌کند.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(s, ', ')
    INTO v_missing
    FROM unnest(ARRAY['auth', 'storage']) s
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.schemata WHERE schema_name = s
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'restore target is not faithful: missing managed schema(s): %', v_missing;
  END IF;
END $$;
