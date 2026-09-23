-- post-restore.sql — فقط روی **مقصدِ خودمیزبان** اجرا می‌شود، هرگز روی Production.
--
-- **فقط گزارش می‌دهد؛ هیچ کاری را حذف، غیرفعال یا کند نمی‌کند.**
--
-- کارهای pg_cronِ Production (اندازه‌گیریِ ۲۰۲۶-۰۹-۲۳: `telegram-sync-30m` و
-- `instagram-sync-30m`، هر ۳۰ دقیقه) با `net.http_get` آدرسِ
-- `*.supabase.co/functions/v1/...` را صدا می‌زنند. پس از بازگردانی روی سرورِ
-- جدید همان آدرسِ ابری را صدا می‌زنند — که تا وقتی پروژهٔ ابری محدود است ۴۰۲
-- می‌دهد، دقیقاً مثلِ امروز. تصمیم دربارهٔ مقصدِ تازهٔ این کارها (بندِ «حفظِ
-- قابلیت‌ها» در docs/ops/LIARA-SELFHOST-MIGRATION.md) با مالک است؛ این فایل
-- فقط آن‌ها را **نام می‌برد** تا بی‌صدا فراموش نشوند.

DO $post$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'post-restore: pg_cron is not installed here; no scheduled jobs to report';
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid, jobname, schedule, active,
           substring(command from '([a-z0-9-]+\.supabase\.(co|in)/[^ ''")]*)') AS target
    FROM cron.job
    WHERE command ~* '[a-z0-9-]+\.supabase\.(co|in)'
    ORDER BY jobid
  LOOP
    n := n + 1;
    RAISE NOTICE 'post-restore: cron job % (%) [%] active=% still targets the cloud project: % - left UNCHANGED, owner decision needed',
      r.jobid, coalesce(r.jobname, '-'), r.schedule, r.active, coalesce(r.target, '?');
  END LOOP;

  RAISE NOTICE 'post-restore: % job(s) target the cloud project; % job(s) in total; nothing was changed', n,
    (SELECT count(*) FROM cron.job);
END
$post$;
