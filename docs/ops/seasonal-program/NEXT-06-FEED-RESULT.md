# NEXT06 — امتداد feed08 و read-state

تاریخ شروع: 2026-10-01، Asia/Tehran. وضعیت: در حال اجرا؛ مرز زیر قبل از تغییر runtime ثبت شد. مأموریت مدیریت، فقط بستن feed/read-state است؛ Auth180، اعلان09، سیاست سه‌ماه، bot و ارسال بیرونی در دامنه نیستند.

## پایهٔ ثابت و مالکیت

worktree `portfolio-next06-publication-feed`، branch `codex/next06-publication-feed-20261001`، base ثابت PR181=`a95aa0c1b45e91a8e23ca89014cb3b13d41f2201`. PR181، worktree آن و محیط173 محفوظ‌اند. کنترل Git worktree و فایل‌ها، checkout یا امتداد feed دیگری نشان نداد. واگذاری backend این امتداد از مدیریت دریافت شد؛ اطلاع‌رسانی به مالک قبلی08/فرانت طبق دستور با مدیریت است، هیچ پیام بیرونی از این بسته ارسال نمی‌شود.

مالکیت دقیق این امتداد:

- `lib/intelligence/publication-server.ts`: adapter عضو با همان createClient/getUser، بدون تغییر admin/overview.
- `lib/intelligence/publication-feed-http.ts` و `publication-feed.ts`: GET/POST HTTP، DTO allowlist، cursor ثابت، خطا؛ قرارداد publication.v1 حفظ می‌شود.
- `app/api/cohorts/[id]/publications/route.ts` و `app/api/publications/[id]/read/route.ts`: list و mark-read.
- `app/api/publications/[id]/route.ts`: افزودن context cohort اختیاری؛ مسیر عمومی قبلی همان قرارداد canonical را دارد.
- `components/admin/PublicationRead.tsx` و `app/publications/[id]/page.tsx`: فقط اتصال context دوره و دکمهٔ صریح خواندم پس از دریافت detail مجاز؛ انتشار/صفحات ادمین دیگر در اختیار08 می‌مانند.
- `components/member/PublicationFeed.tsx`، اتصال آن در `MemberHome.tsx` و adapter/fixture موجود `lib/member/*`: فهرست، read/unread، pagination، deny/empty/error/retry؛ بدون اعلان جایگزین09.
- migration تولیدشده با CLI2.117.0: `supabase/migrations/20261001121858_member_publication_feed_reads.sql`. جدول خصوصی read-receipt و RPCهای list/scoped-detail/mark، index لازم روی جدول موجود؛ جدول/نسخه/فرمان انتشار موجود دوباره ساخته نمی‌شود. نام فایل و مرز مالکیت پیش از اولین تغییر runtime ثبت شد.
- `lib/intelligence/publication-feed.test.ts` و `publication-feed.integration.test.ts`، scriptهای مربوط package.json و گیت اجرای همان آزمون DB در `.github/workflows/ci.yml` در صورت نیاز. آزمون دیگران/کانتینرهای مشترک تغییر نمی‌کنند.
- همین گزارش و `docs/assets/member-feed/*`: شواهد پاک‌سازی‌شدهٔ محیط مستقل؛ اسناد مرکزی و گزارش قبلی181 بازنویسی نمی‌شوند.

## تطبیق و قرارداد اجرایی

canonical `read_research_publication(version)` در migration08، published فعلی، workbook هنوز approved و module-access فعلی را بررسی و body را allowlist می‌کند. feed و mark از همین reader استفاده می‌کنند؛ شرط امنیتی موازی برای انتشار ساخته نمی‌شود. فهرست داخلی `list_research_publications` admin است؛ `announcement_deliveries`/`mark_announcement_seen` FK و معناى اعلان دارند و برای version انتشار قابل reuse نیستند. بنابراین receipt حداقلی با `(auth.uid, existing version_id)` و نخستین زمان خواندن لازم است، بدون event اعلان/اعطای دسترسی/حساب.

feed فقط محتوای audience=cohort همان دوره و مجوز resources همان دوره را شامل می‌شود؛ عمومی‌های سایت مسیر قبلی خود را دارند. detail لینک‌شده context همان cohort را نگه می‌دارد؛ مجوز دورهٔ دیگر، context منقضی را باز نمی‌کند. cursor keyset بر published command timestamp کامل + version UUID و scope cohort است؛ cursor مجوز یا snapshot اعطای دسترسی نیست، هر درخواست دوباره کنترل می‌شود. limit پیش‌فرض20 و حداکثر50. read-receipt فقط پس از کنترل scoped canonical detail و برای uid نشست؛ duplicate همان timestamp نخست را می‌دهد، ولی حتی replay پس از revoke/withdraw/returned رد می‌شود. نسخهٔ جدید key جدا و خوانده‌نشده است.

SQL جدید فقط در sandbox مستقل اجرا می‌شود. جدول reads در schema خصوصی، RLS/FORCE، حداقل grant و search_path ثابت؛ metadata داخلی/actor/private notes/اطلاعات مالی در DTO/cursor نیست. 401 نشست،403 مجوز cohort،404 نسخه غیرقابل دسترس،400 cursor/input و503 سرویس جدا؛ deny با خالی موفق اشتباه نمی‌شود. منابع و ارقام خصوصی به مدل زبانی ارسال نمی‌شوند.

## منابع و ابزار

قراردادهای04/08 و گزارش181 خوانده شدند. Supabase CLI کش‌شده رسمی2.117.0، `migration new --help` و نسخه بررسی شد؛ تغییر SDK/وابستگی لازم نیست. مستندات [RPC و امنیت function](https://supabase.com/docs/guides/database/functions) و [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) بازخوانی شدند. changelog از markdown رسمی در ابزار محلی خوانده و نتیجهٔ مربوط ثبت خواهد شد. Server/Client و React از مهارت‌های قبلاً خوانده‌شده رعایت می‌شوند. آزمون واقعی GoTrue/PostgREST مستقل با fixture مصنوعی، جای پذیرش180/09 نیست.

## checkpoint بازیابی 2026-10-01

بازیابی پس از پیام مدیریتی۱۸:۳۵UTC: head181 و173 بدون تغییر؛ worktree جدید همهٔ تغییرات ناتمام را حفظ کرده است. build تولیدی، lint و typecheck اولیه موفق؛ 7 آزمون HTTP/client موفق و14/16 آزمون SQL موفق بودند. دو شکست از fixture ناسازگار با provenance تغییرناپذیر مجوز04 بودند، نه از پذیرش feed: اصلاح شامل revoke با note معتبر، مجوزهای مستقل منقضی/ماژول نامجاز و لغو audited با seasonal_operations است؛ اجرای دوباره هنوز لازم است.

Docker API در اولین بررسی موقتاً قطع بود؛ بعد از بازگشت daemon، همهٔ کانتینرهای در حال اجرا Exited255 مشاهده شدند. کانتینر و volumeهای feed06 موجود بودند و دوباره ساخته نشدند؛ فقط سه کانتینر feed06-db/auth/rest خود این بسته start شدند. محیط‌های173/181 تغییر داده یا start نشدند؛ این توقف بیرونی در شواهد محیط لحاظ می‌شود. پردازش Next3520 و gateway3540 این بسته باید از build موجود ادامه یابند. GoTrue واقعی 3 حساب مصنوعی را ساخته و22 انتشار مجازA،1B،1عمومی و draft/ready/withdraw/returned از قرارداد08 seed شده‌اند؛ تکرار seed ممنوع است.

changelog رسمی و تغییرات مرتبط خوانده شدند: explicit grants برای API جدید، path /auth/v1 در issuer/gateway، و breakingهای PG17.11. migration از ltree/PGP/btree_gist/custom operator استفاده نمی‌کند؛ sandbox تصویر ثابت PG17.6.1.167 دارد و ارتقای آن خارج از این مأموریت است. آزمون دو privilege profile و SECURITY INVOKER عمومی/definer خصوصی با search_path خالی در کد آمده‌اند. بررسی advisor و پذیرش واقعی browser/HTTP در حال اجرا، هنوز PASS اعلام نشده‌اند.
