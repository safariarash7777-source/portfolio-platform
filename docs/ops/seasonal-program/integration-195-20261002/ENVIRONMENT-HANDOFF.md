# اجرای مرحلهٔ آماده‌سازی محیط195 — 2026-10-02

## وضعیت جاری؛ جایگزین مانع انتخاب مقصد در سابقهٔ زیر

آرش «انجام بده پیشنهاد خودت را» گفت؛ **sandbox مستقل لیارا انتخاب و اجرای آن مجاز شد.** سرور موجود باحدود۶GiB حافظهٔ قابل استفاده و۵۴GiB دیسک آزاد، دسترسیSSH برقرار وپورت۸۴۴۳ آزاد بررسی شد. مسیر تازه `/opt/portfolio-accept195` وcontainer/network/volumeهای `portfolio-accept195-*` ایجاد شدند؛ هیچ اتصال بهDBواقعی یاrestore وجود ندارد.

source دقیق195@31c44ab ازGitHub رویسرور دریافت شد. nativeGoTrue/Storage/REST رویDB تازه؛ initialAuthUsers=0، storageNativeTables=10، هر۱۸migration باhashGitcanonicalLF نصب شد.۱۴ورودیWindowsCRLF hashمتفاوت و محتوای یکسان داشتند؛ plan هش قدیم وblobGit را هم نگه می‌دارد. اولین خطای readiness ازسرور موقتinitdb با readinessTCP رفع شد؛ خطایchecksum فقط اختلاف پایان‌خط بود و محتوایSQL تغییر نکرد.

[HTTPSsandbox](https://62.60.191.24:8443/sandbox-health) باTLSعادی،200 وSHA31c44ab پاسخ داد. default_sni درCaddy اختصاصی برایclientبدونSNIIP تنظیم شد؛ [مستند رسمیCaddy](https://caddyserver.com/docs/caddyfile/options#default-sni). فقطگواهیleaf موجود باmountخواندنی؛ proxyمشترک تغییرنکرد. انقضایگواهی۲۰۲۶-۱۰-۰۶ ۲۳:۳۸UTC است. AuthAPI_EXTERNAL_URL شامل `/supabase/auth/v1` مطابق[تغییر رسمیAuth](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1) است.

**وضعیت: backend آماده؛ build و ورود واقعی در جریان؛ پذیرش اعلام نشده.** بستهP00 در[baseline](../../../product-plan-v0.1/P00-BASELINE.md) ثبت شده. گزارش/جدول زیر سابقهٔ بررسیPreviewقدیمی است؛ مانع انتخاب مقصد دیگر جاری نیست و هیچنتیجهٔ ورود ازآن استنتاج نمی‌شود.

## پیشنهاد برای انتخاب مقصد — هنوز تصمیم مالک نیست

پیشنهاد FOLLOWUP06 در پاسخ به درخواست نظر آرش: **sandbox جدا در لیارا**، با DB خالی، Auth/REST/Storage مستقل و فقط داده ساختگی. نسخهٔ ثابت195 به همین محیط متصل و ورود واقعی، نقش، refresh، خروج/ورود و مسیرهای متأثر بررسی شوند. این انتخاب به محیط عملیاتی فعلی نزدیک‌تر است و می‌تواند اختلاف‌های اتصال و Auth همان بستر را آشکار کند؛ این بخش استدلال فنی است، نه شاهد حل مشکل فعلی.

پشتیبانی Docker در [مستندات رسمی لیارا](https://docs.liara.ir/paas/docker/getting-started/) بررسی شد. وجود ظرفیت آزاد، دسترسی اپراتور و هزینهٔ این حساب هنوز تأیید نشده‌اند؛ ابتدا آن‌ها بررسی و کوچک‌ترین منابع مستقل تعیین شوند. Supabase تازه گزینهٔ جایگزین در صورت مانع واقعی لیارا باقی می‌ماند. درخواست نظر به معنی انتخاب مقصد، خرید یا مجوز تغییر Production ثبت نمی‌شود؛ پاسخ انتخاب محیط هنوز لازم است.

درخواست تازهٔ آرش «انجام بده» برای پیش‌برد مرحلهٔ پذیرش محیط دریافت شد. آماده‌سازی و بررسی فقط روی نسخه195@`31c44ab635b672b589b7833bcbc78b41d36f1e75` انجام شد؛ Production، داده واقعی و پذیرشNEXT09 خارج دامنه‌اند.

## نتیجهٔ واقعی

| بررسی | نتیجه | شاهد و محدودیت |
|---|---|---|
| frontend HTTPS همان SHA |PASS محدود|کانکتور Vercel، پروژهportfolio-platform، deployment `dpl_9L7pQAVXx4JAb3uFLwnLGuXhqk7C`، READY، target=null وSHA31c44ab؛ Production نیست|
|صفحهٔ ورود عمومی|PASS محدود|[Preview](https://portfolio-platform-jhcvi11hp-safariarash7777-4463s-projects.vercel.app/login?next=%2Fdashboard) با200؛ ورود حساب آزموده نشد|
|مقصد browser bundle|FAIL برای پذیرش sandbox|۱۰ asset عمومی خوانده شد؛ مقصد `https://uooeygybrniptzdxuzhj.supabase.co` است، نه backend ساختگی جدید|
|CSP|FAIL برای مقصد sandbox آینده|connect-src فعلی self وwildcardSupabase است؛ مقصدHTTPS sandbox لیارا هنوز نصب/اثبات نشده. TLS درخواست عمومی عادی بود؛ bypass انجام نشد|
|مقصد backend server|UNKNOWN|bundle تنها تنظیمbrowser را نشان می‌دهد؛ مقدار secret یاenv server استخراج نشد|
|backend مستقل آماده|BLOCKED|سازمانVercel فقط یک پروژهٔ portfolio-platform دارد؛ connectorSupabase فقط پروژه قدیمی `lqfcyihuthdoqybwptxh` را فهرست کرد، اثبات sandbox ساختگی ندارد و مقصدuooey را مدیریت نمی‌کند. هیچ‌کدام مقصدSQL/ساخت حساب قرار نگرفتند|
|sandbox بومی191|BLOCKED برای استفاده فعلی|dockerps فقطfeed06-db را نشان داد؛ GoTrue/PostgREST/Storage قدیمی191 اجرا نیستند. presence فایل خصوصی یاmanifest قدیمی، سلامت سرویس فعلی نیست|
|زنجیرهschema آماده|PASS آماده‌سازی،NOT_APPLIED|هش هر۱۸ فایل واقعی195 با دفتر191 برابر؛[plan](SANDBOX-MIGRATION-PLAN.json). phase32→34→35→36→37→38 وmigrationهای04/08/identity/feed با پیش‌نیازهای قبلی؛ هیچSQL اجرا نشد|
|ورود واقعی وbrowserپذیرش|BLOCKED|تا backend مستقل وbuild override مخصوص آن فراهم نشود، credential آزمایشی بهbackend فعلی فرستاده نمی‌شود|

[ENVIRONMENT-PREFLIGHT.json](ENVIRONMENT-PREFLIGHT.json) درخواست‌های عمومی 2026-10-02T10:50:19.518Z تا10:50:25.385Z را ثبت می‌کند. [اسکریپت بازتولید](preview-preflight.mjs) فقطlogin/asset عمومی می‌خواند؛ هیچcookie، token، کلید، AuthAPI، signup یاDB request اجرا نمی‌کند. ابزارVercel وpublicfetch منبعmetadata هستند؛۲ بررسیconsumer/CIپیشین دوباره اجرا نشده‌اند.

## اقدام اجرایی پس از تعیین مقصد مستقل

1. **مقصد را تعیین کنید:** sandbox جدا درلیارا، یا پروژهٔ Supabase تازه در سازمان `safariarash7777-4463's projects` (`vercel_icfg_Iz9jYipt7ZDnBg0oZrfjbLZ9`). سؤال انتخاب مقصد دررابط ثبت شده و پاسخ هنوز دریافت نشده است. فقطدرصورت انتخابSupabase، ابزار `get_cost` انتخابسازمان را با عبارت «Always ask the user» و `create_project` انتخابorganization را الزامی می‌کند؛ هزینه باید پیش ازساخت بهمالک اعلام و تأیید شود. دراین نوبت هزینه فرض، خرید، پروژه/branch ایجاد یاquota مصرف نشد.
2. **برای لیارا:** یکbackend خالی مستقل شاملPostgres/Auth/REST/Storage باnamespace وHTTPS origin جدا تخصیص یابد؛ آنbackend ازبکاپ واقعی بازیابی نشود. عنوان پروژه، مالک وorigin غیرمحرمانه ثبت وsecretها فقط درsecret manager/فایل ACL خارجمخزن تحویل شوند. route/env سرویسProduction یاCaddy مشترک را بدونبستهٔ مجاز تغییر ندهید. برایSupabaseتازه نیز پروژهٔ خالی مستقل وorigin آن لازم است.
3. **schema:** nativeAuth/Storage بایدواقعاً نصب باشند؛[زنجیره۱۸ فایل آماده](SANDBOX-MIGRATION-PLAN.json) فقط برهمانbackend ساختگی اعمال ونتیجه هرمرحله باhash/catalog/RLS/grant ثبت شود. اینplan نصب قبلی191 را تکرار نکرده وبه معنی نصب مقصد جدید نیست. شکست یکمرحله اجازه ادامه مخفیانه یاتغییر هدف بهDBواقعی نمی‌دهد.
4. **Previewمختص195:** تنظیمات فقطscope همانbranch195/محیطپذیرش را بگیرند؛ تنظیمات کلیPreviewهای سایرمالکان یاProduction تغییر نکنند. برایلیارا، زوج `NEXT_PUBLIC_LIARA_API_URL` و `NEXT_PUBLIC_LIARA_ANON_KEY` بایدباهم باشند؛ helper همان31c44ab فقطHTTPS بدونcredential/query وanonJWT معتبر را قبول می‌کند. server/client بایدبههمانbackend برسند؛ `SUPABASE_SERVICE_ROLE_KEY` اگرمسیرهای داخلی بهآننیازدارند صرفاًserver همانsandbox باشد. TLS/CSP/CORS وSiteURL/callbackباoriginFront همانپذیرش تطبیق یابند. قالب مقادیرprivate درچت یاگزارش نیاید.
5. **rebuild/redeploy:** همانSHA31c44ab باoverrideایزوله rebuild شود؛ applicationSHA،deploymentID وorigin تازه ثبت وbundle وCSP دوباره باbackend مقصد تطبیق داده شوند. URLفعلی تااینمرحله فقطسابقهٔ ساخته/متصل‌نبودن است، مقصدپذیرشآماده نیست. HTTP200login گیتورودرا نمی‌بندد.
6. **حساب وپذیرش:** سهحساب باAuth بومی واقعی واطلاعاتساختگی مشتریA،B ومشاور/نقشطبققرارداد ساخته شوند؛ رابطهٔمشاوره ازرضایتA درمحصول ایجادشود. ورودهراکانت ازUI، نقش،refresh،خروج/ورود،بازگشتnext وUIمسیرهایnullمتأثر ثبتشود؛ اطلاعاتورود فقطامن. صاحباصلاح بازبینپذیرشخودش نباشد. هیچJWTتزریقی،UI200 یاCIسبز جایاینشواهد نیست.

مسئول فعلی FOLLOWUP06 آماده‌سازی را ثبت کرده است؛ انتخابمقصدبامالک، تخصیصbackend/HTTPS وscopePreview بااپراتورمحیط، تطبیقAuth بامالکAuth واجرایپذیرش با بازبینمستقل است. آماده‌سازی frontend/migrationplan به‌پایان رسیده؛ **ادامهٔ ساختbackend وورود BLOCKED بهتعیینمقصد مستقل است**. مرزpolicyNEXT09 رعایت شد؛ سرورردشده/مسیرجایگزین اجرا نشد.

هیچcommit/push،merge،Production،بکاپ/بازیابی،مهاجرت مشترک، حسابواقعی یاsecret تغییر نکرد. فایل‌هایاینمرحله درcheckoutمدیریت محلی ذخیرهشدند.
