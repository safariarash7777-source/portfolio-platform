# NEXT06 — امتداد feed08 و read-state

تاریخ: 2026-10-01، Asia/Tehran. وضعیت امتداد feed/read-state: پذیرش فنی PASS، PR مستقل Draft/Open و آمادهٔ بازبینی؛ مرز زیر قبل از تغییر runtime ثبت شد. مأموریت مدیریت، فقط بستن feed/read-state است؛ Auth180، اعلان09، سیاست سه‌ماه، bot و ارسال بیرونی در دامنه نیستند. پذیرش کامل NEXT06 همچنان تابع گیت‌های جداگانه است.

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

قراردادهای04/08 و گزارش181 خوانده شدند. Supabase CLI کش‌شده رسمی2.117.0، `migration new --help` و نسخه بررسی شد؛ تغییر SDK/وابستگی لازم نیست. مستندات [RPC و امنیت function](https://supabase.com/docs/guides/database/functions) و [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) بازخوانی شدند. changelog رسمی در ابزار محلی خوانده شد؛ نتیجه در checkpoint زیر است. مرور React پس از تغییر TSX انجام شد: اثرها وابستگی محدود دارند، درخواست قبلی با unmount/cursor/cohort تغییر لغو و پاسخ قدیمی نادیده گرفته می‌شود، کلید نسخه ثابت است، detail پس از دریافت مجاز دکمه را فعال می‌کند، خواندن خودکار یا دادهٔ خصوصی در browser storage اضافه نشده است. آزمون واقعی GoTrue/PostgREST مستقل با fixture مصنوعی، جای پذیرش180/09 نیست.

## checkpoint بازیابی 2026-10-01

بازیابی پس از پیام مدیریتی۱۸:۳۵UTC: head181 و173 بدون تغییر؛ worktree جدید همهٔ تغییرات ناتمام را حفظ کرده است. build تولیدی، lint و typecheck اولیه موفق؛ 7 آزمون HTTP/client موفق و14/16 آزمون SQL موفق بودند. دو شکست از fixture ناسازگار با provenance تغییرناپذیر مجوز04 بودند، نه از پذیرش feed: اصلاح شامل revoke با note معتبر، مجوزهای مستقل منقضی/ماژول نامجاز و لغو audited با seasonal_operations است؛ اجرای دوباره هنوز لازم است.

Docker API در اولین بررسی موقتاً قطع بود؛ بعد از بازگشت daemon، همهٔ کانتینرهای در حال اجرا Exited255 مشاهده شدند. کانتینر و volumeهای feed06 موجود بودند و دوباره ساخته نشدند؛ فقط سه کانتینر feed06-db/auth/rest خود این بسته start شدند. محیط‌های173/181 تغییر داده یا start نشدند؛ این توقف بیرونی در شواهد محیط لحاظ می‌شود. پردازش Next3520 و gateway3540 این بسته باید از build موجود ادامه یابند. GoTrue واقعی 3 حساب مصنوعی را ساخته و22 انتشار مجازA،1B،1عمومی و draft/ready/withdraw/returned از قرارداد08 seed شده‌اند؛ تکرار seed ممنوع است.

changelog رسمی و تغییرات مرتبط خوانده شدند: explicit grants برای API جدید، path /auth/v1 در issuer/gateway، و breakingهای PG17.11. migration از ltree/PGP/btree_gist/custom operator استفاده نمی‌کند؛ sandbox تصویر ثابت PG17.6.1.167 دارد و ارتقای آن خارج از این مأموریت است. آزمون دو privilege profile و SECURITY INVOKER عمومی/definer خصوصی با search_path خالی در کد آمده‌اند. بررسی advisor و پذیرش واقعی browser/HTTP در حال اجرا، هنوز PASS اعلام نشده‌اند.

## نتیجهٔ نهایی فنی

[PR185](https://github.com/safariarash7777-source/portfolio-platform/pull/185)، branch `codex/next06-publication-feed-20261001`، پایهٔ pin‌شدهٔ مستقل `codex/next06-feed-review-base-20261001`=`a95aa0c1b45e91a8e23ca89014cb3b13d41f2201`. commit کد و runtime=`eb94b97f50a1b628af4f84554f7a1ce06780910e`؛ تغییر پس از آن فقط گزارش/شواهد است. baseline مهاجرت04/08 و تمام فایل‌های runtime با head181 تطبیق دارند؛ head و وضعیت Git worktreeهای181 و173 بدون تغییر/clean مشاهده شدند. base pin مستقل از حرکت احتمالی آیندهٔ branch181 است.

دادهٔ ساختگی محیط `feed06`: سه حساب واقعی GoTrue (A/B/admin موجود در profiles)، دو دورهٔ فعال جدا و دورهٔ منقضی برای A؛22 انتشار A و1 انتشار B،1 محتوای عمومی، draft/ready/withdraw/returned مجزا. هیچ Storage/grant/account/publication مدل تازه‌ای ساخته نشده است؛ fixture پیش‌نمایش UI فقط پاسخ خالی برچسب‌دار دارد و مدرک Auth یا انتشار نیست. feed برای دادهٔ واقعی از HTTP و canonical RPC موجود استفاده می‌کند. برنامهٔ تولیدی محلی روی Next3520 و gateway3540، Auth و REST در network داخلی مستقل؛ credential و session در گزارش یا Git نیست. سپس نسخهٔ دومِ آخرین انتشار A ایجاد، نسخهٔ اول حفظ و grantA از command رسمی04 لغو شد؛ پایان آزمون A از feed منع و B همچنان مجاز است.

| پذیرش | شاهد و نتیجه |
|---|---|
| فقط current/published/still-approved همان cohort | 16 آزمون واقعی SQL در legacy/explicit grants؛ draft،ready،withdraw،returned،کاربر B،admin بدون grant،عمومی در feed خصوصی و نسخه قدیمی رد؛31 سناریوی HTTP واقعی baseline PASS |
| detail context و mark پس از canonical detail | مسیر scoped detail مجاز200، فاقدمجوز403 و نسخهٔ پنهان404؛GET رسید نمی‌سازد. دکمهٔ صریح «خواندم» در مرورگر پس از متن/منابع؛تصویر `read-receipt.png` |
| uid/version، replay و concurrent | actor/time در body پذیرفته نمی‌شود؛دو ثبت هم‌زمان یک رسید و زمان نخست یکسان.4 سناریوی version واقعی: replay زمان نخست،نسخه دوم unread،نسخه اول404 و receipt نسخه اول محفوظ |
| keyset پایدار | زمان کامل PostgreSQL +UUID؛limit20/حداکثر50؛دو صفحه واقعی20+2 بدون تکرار؛تای timestamp و تفاوت یک میکروثانیه در SQL؛cursorscope/shape/limit نامعتبر400 |
| لغو/انقضا/cancel/module | همه در SQL دو پروفایل PASS؛4 سناریوی revoke با GoTrue/command رسمی04: list،detail وmark درخواست بعد403،B مستقل200؛رابط فهرست قدیمی را پاک می‌کند و پیام رد مجوز دارد |
|503 در برابر empty/deny| دو سناریوی HTTP واقعی با توقف فقط REST خود feed06؛503 بدون data. screenshot خطای سرویس متن روشن دارد، موفق خالی با503 یکی نیست. REST خود بسته در finally برگردانده شد |
|metadata خصوصی| DTO فهرست،detail scoped وreceipt allowlist؛actor/workbook/privateNote/content کامل در feed/cursor نیست؛رسید private/RLS FORCE بدون SELECT/INSERT/UPDATE/DELETE/TRUNCATE مستقیم حتی service_role؛مسیر عمومی قدیمی حفظ شد |
|مرورگر و فرم| فهرست→متن/منابع→خواندم→خانه/read؛صفحه دوم،نسخه دوم unread،refresh فرم نیازسنجی را حفظ کرد؛پس از refresh عضویت،لغو نشان داده شد؛عرض390 بدون overflow؛تصاویر در `docs/assets/member-feed` |

آزمون محلی: 23/23 feed (7 HTTP/client +16 SQL)،1262/1262 core،5/5 seasonal،بدون fail/cancel/skip؛lint با صفر warning،typecheck و build تولیدی دقیق commit کد PASS؛SQL policy validation50فایل/0مردود و secret scan887فایل/0یافته. در CI،16 آزمون جدید وارد test:db شده و حداقل آزمون از336 به352 افزایش یافته است. runtime از build اولیهٔ قبل از commit دوباره روی commit کد ساخته شد و41 سناریوی HTTP واقعی (31baseline+2outage+4version+4revoke) با manifest دقیق همان commit پاس و ثبت شدند.

Advisor CLI `db advisors --db-url` روی DB موجود feed06، از transport موقت loopback→nc داخل همان کانتینر، اجرا شد؛schema/role/network تغییر نکرد و transport بسته شد. [خروجی](../../assets/member-feed/advisors.json):107 WARN در ساختارهای پایه،0ERROR و هیچ یافته‌ای مربوط به receipt/helperهای این امتداد. هیچ اصلاح نامرتبط یا ادعای «پاک‌بودن تمام schema پایه» انجام نمی‌شود. قواعد schema-private،search_path خالی،RLS/grant/append-only با آزمون مستقیم هم بررسی شدند.

CI commit کد: [CI پنج job موفق](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36910821901) و [Seasonal membership sandbox موفق](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36910822027). head آخرِ گزارش/شواهد با commit جدا منتشر می‌شود و وضعیت همان head در PR و گزارش تحویل نهایی بررسی می‌شود؛ فایل حاضر عمداً SHA خودش را ادعا نمی‌کند.

## محدودیت‌ها و گیت‌های باز

cursor یک snapshot منجمد نیست؛ لغو مجوز یا برگشت تأیید بین دو صفحه ممکن است محتوا را حذف کند و هر درخواست دوباره مجازبودن را بررسی می‌کند. «خوانده‌شده» اعلام صریح کاربر است و به معنی فهم انسانی یا تأیید محتوای آموزشی نیست؛ فقط وضعیت همین نسخه است و شمارندهٔ unread کل/اعلان09 ساخته نشده است. replay پس از لغو یا تغییر اعتبار رد می‌شود، حتی اگر رسید پیشین وجود داشته باشد.

پذیرش کامل NEXT06 شامل نصب و پذیرش پروفایل Auth180،اتصال اعلان09،تصمیم D-034،و پذیرش انسانی ترازنامه173/DEV07/پذیرش10 در این امتداد بسته نشده است. advisor107warning ساختار پایه و وقفهٔ بیرونی Docker در checkpoint فوق محدودیت شواهد محیط‌اند. migration فقط در sandbox مستقل و DBهای آزمایشی/CI اجرا شده؛هیچ shared migration،Production،merge،bot یا پیام واقعی انجام نشد.
