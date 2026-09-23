-- post-restore.sql — فقط روی **مقصدِ خودمیزبان** اجرا می‌شود، هرگز روی Production.
--
-- کارهای pg_cronِ Production (اندازه‌گیریِ ۲۰۲۶-۰۹-۲۳: `telegram-sync-30m` و
-- `instagram-sync-30m`) با `net.http_get` آدرسِ `*.supabase.co/functions/v1/...`
-- را صدا می‌زنند. روی سرورِ ایرانی:
--   • آن آدرس همان پروژهٔ ابریِ محدودشده (402) است؛
--   • Edge Functionها روی این استک خاموش‌اند (docker-compose.portfolio.yml)؛
--   • و خودِ توابع api.telegram.org / اینستاگرام را صدا می‌زنند که از سرورِ
--     ایرانی در دسترس نیست. همگام‌سازیِ تلگرام روی Vercel cron می‌ماند.
-- پس این کارها غیرفعال می‌شوند و نامشان در خروجی ثبت می‌شود. اگر pg_cron یا
-- جدولِ `cron.job` نباشد، کاری انجام نمی‌شود و این هم صریح گفته می‌شود.

DO $post$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'post-restore: pg_cron is not installed here; nothing to disable';
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid, jobname FROM cron.job
    WHERE command ~* '[a-z0-9-]+\.supabase\.(co|in)'
    ORDER BY jobid
  LOOP
    PERFORM cron.unschedule(r.jobid);
    n := n + 1;
    RAISE NOTICE 'post-restore: disabled cron job % (%) - it targets the cloud project', r.jobid, coalesce(r.jobname, '-');
  END LOOP;

  IF EXISTS (SELECT 1 FROM cron.job WHERE command ~* '[a-z0-9-]+\.supabase\.(co|in)') THEN
    RAISE EXCEPTION 'post-restore: a cron job still targets the cloud project';
  END IF;

  RAISE NOTICE 'post-restore: % cloud-targeting cron job(s) disabled; % job(s) remain', n,
    (SELECT count(*) FROM cron.job);
END
$post$;
