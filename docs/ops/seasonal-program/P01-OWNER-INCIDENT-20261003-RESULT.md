# FOLLOWUP-01 — بازآزمایی فوری ورود مالک، 2026-10-03

وضعیت: **مقصد اشتباه و وجود حساب صحیح مشخص شد؛ ورود شخصی مالک در سایت اصلی هنوز آزموده نشده است.** هیچ تغییر Production، credential، حساب، نقش، migration یا استقرار انجام نشد. تحویل قبلی بازسازی نشد؛ این سند مکمل FOLLOWUP-01-RESULT است.

## اقدام عملی و نتیجه

نشانی ورود اصلی: **https://portfolio-platform-fawn.vercel.app/login?next=%2Fdashboard**. نشانی `https://62.60.191.24:8443/login?next=%2Fdashboard` محیط مصنوعی accept195 است؛ حساب مالک در آن وجود ندارد. محیط اصلی از همان origin فرانت Vercel به بک‌اند `https://62.60.191.24/liara-preview` متصل می‌شود؛ نام مسیر liara-preview به‌تنهایی معیار محیط نیست.

ایمیل ابتدا با املای اشتباه دریافت شد و سپس اصلاح شد. نتیجه صفرِ بررسی اول فقط مربوط به همان ورودی اول است؛ به حساب صحیح تعمیم ندارد. بررسی فقط‌خواندنی ایمیل اصلاح‌شده در 08:40:09 UTC، برابر 12:10:09 تهران:

| وضعیت | بک‌اند اصلی | sandbox8443 |
|---|---|---|
| حساب منطبق با ورودی اصلاح‌شده | دقیقاً یک حساب | صفر |
| UUID موجود و profile با همان کلید متصل | بله | قابل بررسی نیست |
| نقش profile | admin | قابل بررسی نیست |
| provider email / Google | email حاضر؛ Google در metadata/identities فعلی یافت نشد | قابل بررسی نیست |
| confirmation ایمیل | تأییدشده | قابل بررسی نیست |
| منع ورود فعال | خیر، بازآزمایی مستقل در 08:40:55 UTC | قابل بررسی نیست |
| داشتن password | بله، فقط وضعیت وجود | قابل بررسی نیست |
| اعتبار رمز واردشده / سابقه تاریخی Google | UNKNOWN / اثبات نشده | قابل بررسی نیست |

وجود password اثبات درست‌بودن رمز واردشده نیست؛ رمز سایت با رمز Google/Gmail یکی فرض نمی‌شود. هیچ مقدار UUID، ایمیل، hash، رمز، session، cookie، token یا OTP در خروجی ذخیره نشد. ثبت banActive=null در خروجی اول ناشی از predicate SQL nullable است؛ خروجی مستقل BACKEND با coalesce وضعیت anyActiveBan=false را روشن می‌کند.

مانع قطعی تلاش گزارش‌شده در8443، استفاده از محیط فاقد حساب اصلی است. علت احتمالی هر شکست تازه روی سایت اصلی باید از همان تلاش و زمان آن بررسی شود؛ در این بررسی هنوز شاهد تلاش تازه مالک روی origin اصلی نداریم. ساخت حساب، grant جدید یا تغییر رمز برای رفع اختلاف محیط توجیه ندارد.

## نسخه و محیط

| جزء | شاهد تازه | حد ادعا |
|---|---|---|
| main و Production Vercel | `51fd0661d48d791ce8758a87828a81ce72cac6df`؛ alias READY، target production | PRهای تازه روی سایت اصلی نصب نشده‌اند |
| deployment | `dpl_9suSBhTKxEgEefXoUDr2o6FfmZ56` | همان deployment ثبت‌شده در حادثه تاریخی01اکتبر |
| login و bundle عمومی، 08:28:40 UTC /11:58:40 تهران | login200؛ TLS عادی؛ دهbundle بهLiara اشاره دارند؛ cloud قدیمی درآن‌ها یافت نشد | پاسخ200 ورود authenticated را اثبات نمی‌کند |
| Auth اصلی، 08:40:55 UTC /12:10:55 تهران | GoTrue2.197.0؛ running؛ SiteURL اصلی؛ API_EXTERNAL_URL مسیرLiara/auth/v1 | مسیر تک‌درخواست SSR تازه trace نشده |
| تنظیمات Auth | email=true، signup disabled=true، autoconfirm=false؛ SMTP تنظیم نشده | SMTP علت password login حساب موجود فرض نمی‌شود؛ recovery واقعی آماده نیست |
| Vercel runtime errors | برای /dashboard، /login، /auth/callback در پنجره1h، ابزار عدم وجود error cluster برگرداند | زمان تلاش مالک رویProduction نداریم؛ عدم cluster گواه سلامت کامل نیست |
| accept195/8443 | گزارش فعلی مالک runtime:31c44ab، DB مصنوعی؛ lookup مستقل حساب صحیح صفر | شاهد Production یا مجوز انتقال حساب واقعی نیست |

تنظیمات server Auth و مبدأ bundle هر دو به بک‌اند Liara اصلی اشاره دارند. health/CORS تاریخی01اکتبر دوباره آزمون پذیرش امروز نامیده نشدند. cookie/getUser/refresh و نقش در مرورگر شخصی مالک هنوز UNKNOWN هستند. حساب صحیح در DB دارای admin است؛ این با دریافت موفق نقش در SSR یکسان نیست.

## اصلاح موجود و آزمون‌ها

[PR179](https://github.com/safariarash7777-source/portfolio-platform/pull/179) همچنان Draft/Open و unmerged است؛ head تازه `ca27b94a44f9a37785df059574a754e170880aac`، base51fd066. CI شماره36854599890 برای همین head completed/success گزارش شد. تفاوت runtime نسبت بهmain محدود به صفحهlogin، middleware و regression است؛ migration/package یا موتور مالی تغییر ندارد.

اصلاح موجود، runtimeNode برای middleware، deadline8ثانیه، حفظ cookie درredirect، تفکیک auth_unavailable و ناوبری کامل مرورگر پس ازlogin دارد. آزمون مصنوعی و مرورگر GoTrue واقعی قبلی در FOLLOWUP-01-RESULT ثبت شده و تکرار نشد. این CI و آزمون‌ها پذیرش Production امروز یا حل قطعی شبکهEdge نیستند. حادثه تاریخی01اکتبر شامل Auth موفق و dashboard504 بود؛ به تلاش امروز روی8443 نسبت داده نمی‌شود.

برای incident مالک، ادغام کل PR219 یا انتقال migration موبایل/عضویت لازم نیست. candidate فوری همانPR179 با مقصد Liara صحیح است؛ قبل از انتشار مجاز، بازبینی deployment و تنظیمات مقصد لازم است. این تسک صرفاً ساخت/بازبینی ایزوله را مجاز کرده است و Production منتشر نشد.

## پذیرش و گام بعد

نشانی اصلی برای بازشدن در پنل Codex ارسال شد؛ پاسخ ابزار queued بود و مشاهدهٔ مرورگر محسوب نمی‌شود. از مالک فقط تلاش شخصی در همان نشانی با ایمیل ثبت‌شده و رمز سایت، زمان تهران و نتیجه/متن خطا خواسته شد؛ credential خواسته نشد. سؤال قدیمی دارای نتیجه املای اشتباه با یافته اصلاح‌شده این سند جایگزین می‌شود.

| پذیرش امروز | وضعیت |
|---|---|
| وجود حساب صحیح، UUID/profile/admin، confirmation و ban | PASS فقط‌خواندنی |
| تطبیق origin فرانت/bundle/Auth | PASS در حد metadata عمومی و تنظیمات whitelist |
| ورود مالک → نقش درست → refresh → خروج/ورود در اصلی | PENDING: تلاش شخصی و زمان/نتیجه لازم است |
| رد حساب نامرتبط در Production | NOT_RUN امروز؛ آزمون مصنوعی قبلی قابل جایگزینی نیست |
| رمز معتبر/خطای Auth/خطای شبکه/redirectloop در تلاش جدید | UNKNOWN؛ هنوز تلاش اصلی تازه مستند نشده |
| migration و استقرار | NONE / NOT_PERFORMED |

اگر سایت اصلی با حساب صحیح همچنان متوقف شد، بازه زمانی همان تلاش با Auth و Vercel به صورت status-only تطبیق داده شود؛ سپس candidate موجودPR179 روی محیط مجاز بررسی/منتشر شود. اگر خطای credential ثابت شد، credential مرحله شخصی مالک است؛ recovery تا آماده‌شدن SMTP واقعی راه‌حل فعال تلقی نشود. ایمیل legacy و UUID/سوابق حفظ می‌شوند.

FOLLOWUP-07 جدا می‌ماند: پیاده‌سازی ایزوله قبلی تکرار نشد؛ SMS/provider/template و OTP واقعی→SSR هنوز پذیرش نشده‌اند. خرید، ارسال واقعی و activationتولید انجام نشدند. رفع ورود فعلی وابسته به خریدSMS نیست.

## شواهد و ابزار

- [ورودی اول، superseded فقط برای املای اصلاح‌شده](./P01-OWNER-INCIDENT-20261003-ACCOUNT.json)
- [حساب اصلاح‌شده، بدون شناسه و credential](./P01-OWNER-INCIDENT-20261003-CORRECTED-ACCOUNT.json)
- [bundle و TLS عمومی](./P01-OWNER-INCIDENT-20261003-PUBLIC.json)
- [وضعیت ban و whitelist تنظیمات backend](./P01-OWNER-INCIDENT-20261003-BACKEND.json)
- [Production metadata و CI](./P01-OWNER-INCIDENT-20261003-DEPLOYMENT.json)

مالک فایل‌های تازه: P01، branch مستندات `codex/p01-demo65-triage-20261002`؛ checkout مشترک product-direction، اسناد مرکزی و فایل‌های runtime سایر مالکان ویرایش نشدند. مهارت‌های Supabase و Next.js خوانده‌شده در این چرخه؛ ابزار Git/GitHub، Vercel connector، PowerShell، SSH/Docker/psql فقط‌خواندنی و Codex open panel. SQL در transaction READ ONLY و خروجی فقط boolean/enum بود؛ Docker ENV صرفاً whitelist شد. build سنگین محلی یا آزمون credential امروز انجام نشد.
