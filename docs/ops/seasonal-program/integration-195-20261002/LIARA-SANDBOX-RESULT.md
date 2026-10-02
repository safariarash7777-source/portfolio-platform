# پذیرش محیط ایزولهٔ لیارا — PR195

۲۰۲۶-۱۰-۰۲؛ **DEV-07 پذیرفته نشد؛ مانع دقیق، تأیید انسانی مستقل سناریوی۵ است. sandbox آماده، ۱۳سناریوی مستقلPASS، صفرFAIL و یکBLOCKED؛ ۴۰بررسی مقدماتیAuth/مالی جدا موفق‌اند.**

## نسخه و محیط جاری

- برنامه: `31c44ab635b672b589b7833bcbc78b41d36f1e75`، PR195؛ tree `b891e09732872b16768317b506bfb9910cb0fdbf`.
- محیط: `portfolio-accept195` روی سرور لیارا؛ [ورود واقعی](https://62.60.191.24:8443/login?next=%2Fdashboard)، [ورود پژوهش](https://62.60.191.24:8443/login?next=%2Fadmin%2Fresearch).
- source واقعی۶۲۹ فایل app/components/lib/SQL و تنظیم build با blobهای Git همینSHA برابر است؛ صفر اختلاف. [رسید](SOURCE-VERIFICATION.json). فایل generated `.next` وnext-env دامنهٔ این مقایسه نیستند.
- Node22 image باdigest `sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`؛ build همان195 موفق. source خواندنی، cache جدا نوشتنی. هیچ patch محصول برای این استقرار ایجاد نشد.
- Preview قدیمیVercel وlocalhost191/168 صرفاً سابقه‌اند؛ شاهد این محیط به آن‌ها نسبت داده نمی‌شود.

## نصب و جداسازی

[LIARA-ENVIRONMENT.json](LIARA-ENVIRONMENT.json) receipt محیط، catalog/RLS، حساب‌ها و حفظ هفت container قبلی را نگه می‌دارد. مسیر `/opt/portfolio-accept195`، شبکه‌ها/volumeها/containerهای `portfolio-accept195-*` مجزا هستند؛ DB port عمومی ندارد. DB تازه ساخته شد، شمار اولیهauth.users صفر بود؛ هیچ restore یا دادهٔ واقعی استفاده نشد.

۱۸ migration به ترتیب باhash canonicalGit نصب شدند: پیش‌نیازهای profiles/portfolio، phase32→34→35→36→37→38 وseasonal/publication/identity/feed. [plan با۱۸هش](SANDBOX-MIGRATION-PLAN.json)، receipt هرمرحله درenvironment.steps.۱۴فایلWindowsCRLF باGitLF پایان‌خط متفاوت و محتوای یکسان داشتند؛ هش قدیم وGitblob حفظ‌اند. catalognativeStorage شامل۱۰جدول است. برای نمودار مالی، **پیش‌نیاز موجود `sql/terminal_t0.sql` ازهمین195** جدا باهش ثابت نصب شد؛ [plan](MARKET-SCHEMA-PLAN.json) وreceipt درfinancial.schema. این قابلیت/migration محصول تازه نیست.

در بازبینی مستقل، کمبود SELECT برای symbol_history عمومی وportfolio_versions نسخه‌دار در PostgreSQL تازه مشاهده شد. مجوز خواندن حداقلی طبق سیاست موجود نصب شد: symbol_history برایanon/authenticated/service_role؛ portfolio_versions فقطauthenticated/service_role وanon همچنان فاقدgrant. [رسید قبل/بعد](NATIVE-PRIVILEGE-REPAIR.json) RLS یکسان، صفرمجوز نوشتن اضافه و صفرتغییرsource نشان می‌دهد؛ بازآزمایی مستقل سناریوهای۳و۱۴ پس ازrepair موفق و تمامgrantهای fault به‌طور مستقل بازگردانده و تأیید شدند. installer بسته نیز برای نصب بعدی اصلاح شد؛ محیط مجدداً نصب یاseed نشد.

چهار حساب واقعیnativeGoTrue ایجاد شد: A وB باprofileuser، مشاور ومدیر باprofileadmin. مشاور درconsultation_advisors طبقphase35 باlabelساختگی وenabled=true ثبت شد؛ رابطه/رضایت seed نشده و ازUI مشتری باید ساخته شود. admin بودن به‌تنهایی دسترسی بهدارایی مشتری نمی‌دهد.

اطلاعات ورود فقط در فایل root-only سرور و نسخهٔ ACLمحدود این دستگاه نگهداری می‌شود: `C:/Users/Asus/.codex/private/accept195-liara/reviewer.json`. رمز، کلیدserver، JWT/cookie،HAR و تصویرcredential درگزارش یاGit نیست. برای بازبین رویهمین دستگاه ازهمین فایل خصوصی استفاده شود؛ انتقال به فرد بیرون فقط ازمسیر امن اپراتور انجام شود.

## شاهد مرورگر

| آزمون | نسخه/داده | نتیجه | شاهد |
|---|---|---|---|
|UIlogin،nativeJWTصدور،UUID/role،بازگشتnext،reload|195؛ چهارحساب ساختگی|PASS|همهtokenHTTP200،getUser200 وUUIDصحیح،profileHTTP200؛ مشتری/مشاورdashboard وadmin/desk|
|native refresh،خروجUI ووروددوباره|195؛ realUI-issuedrefresh token|PASS|refresh200 باهمانUUID،logout204 وprotectedredirectlogin،relogin200؛ renewalزمانی خودکارSDK جداNOT_TESTED|
|CSP/TLS/شبکه/منطقه زمانی|195؛ A/adviser/adminTehran،BLos_Angeles|PASS|TLSعادی،CSPشاملoriginجدید،externalRequestsBlocked=0،pageErrors=[]؛ [۳۲checkنهایی](BROWSER-FINAL-SUMMARY.json)|
|سالانه grosscurrent/priorناموجود|195؛ دوsymbolصریحSYNTHETIC|PASS|categoryناخالصحذف،عملیاتی/خالص وچهارbarمحفوظ؛tooltipواقعی بدونعددناخالصجعلی|
|فصلیgrossگمشده|195؛ هشتcodalreportساختگی|PASS|SVGgross به۱/۲segmentجدا M…Z محدود، Cbridgeصفر؛ net/operatingسهC وچهارquarterمحفوظ|
|financialhydration/tooltip/isolation|195؛ هیچissuer/providerواقعی|PASS|pageErrors/externalrequestصفر؛ [۸check](BROWSER-FINANCIAL.json)، تصاویرسالانه درهمینپوشه|
|۱۴سناریوی مستقلDEV07|همین195 وsandboxتازه|۱۳PASS،۰FAIL،۱BLOCKED|[جدول کامل نقش/انتظار/HTTP/DB/زمان](dev07-independent/independent.md)، [شاهدfreeze](dev07-independent/freeze.json)؛ سناریوی۵ انسانی باز|
|تأیید انسانی پژوهش|انسان مستقل،UI واقعی|BLOCKED|عامل نمی‌تواندبه‌جایانسان قضاوت/امضاکند؛ workbookنسخه۱ و صفرreview آماده،handoffدقیق ثبت شده|

۳۲شاهدAuth+۸شاهدUIمالی=۴۰PASS روی همینSHA. این عدد جدول۱۴ را جایگزین نمی‌کند. تشخیصات اولیهٔ ابزار دربارهcountپیشازhydration،target/admin،callbackclickپیشازnetworkidle وselectorwrapperRecharts درJSONهایPRELIMINARY/DIAGNOSTICS محفوظ‌اند؛ مسیرهای نهایی رویهمانsource دوباره آزموده شدند. خطای cacheخواندنی مربوط بهنصبsandbox بود وbindجدا رفع شد. هیچFAILمحصول ازآن selectorها اعلام نمی‌شود.

## CI

[CI36988719285](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36988719285) و[seasonal36988718928](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36988718928) رویSHA31c44ab،success، دراین مرحله دوباره باAPIتأییدشدند. کدPR195 تغییرنکرده،CIآن تکرارنشد. PRP00مستندات/تحویل درصورتایجاد،SHAوCIجدا دارد وآنSHAنسخهٔبرنامهٔاینsandboxنامیده نمی‌شود.

## حدود و اقدام بعدی

تنظیمSiteURL/URIallowlist/API_EXTERNAL_URL،originbrowser/server،CSP/CORS فقط همینsandbox هستند. [گواهیIPمعتبر](https://62.60.191.24:8443/sandbox-health)، mountفقط‌خواندنی؛ default_sni طبق[مستندCaddy](https://caddyserver.com/docs/caddyfile/options#default-sni) برایclientبدونSNI. گواهی leaf فعلی تا **۶اکتبر۲۰۲۶ ساعت۲۳:۳۸UTC** معتبر است؛ هرپذیرش بعد ازآن نیازگواهی معتبر همانendpointدارد. TLSbypass انجامنشد. [AuthAPIURL](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1) شامل/auth/v1 است. فعلاً signupعمومی/SMS/provider/SMTP واقعی فعالنیستند؛ mailconfirmحسابfixtureازnativeadminAPI بود، نه شاهدتحویلایمیل.

rootفقطN10/feed195 و محیط را بررسی کرد؛ fullDEV07باoriginalindependentreviewer جدا تمام وfreezeشد:۱۳PASS/۰FAIL/۱BLOCKED. گیت پژوهش/فهم مالی انسانی حفظ می‌شود. CIسبز یاlogin200 شاهدapprovalیاProduction نیست. **هیچmerge،Productiondeploy،خرید،DNS،بکاپ/restore،تغییرDBبازیابی‌شده یاworkaroundNEXT09/preview199 انجامنشد.** همهجدول‌هایجدید وfixtureفقطsandboxهستند. پذیرشنهایی و اسناد وضعیت فقط مطابق گزارش مستقل تازه به‌روز می‌شوند.

## جمع‌بندی نسخه، نقص و اقدام بعدی

نسخهٔ درخواست اولیه168@`1978bf562078336f21a7397d01acd8786b020f27` و headفعلی168@`15eebc97ca650dde5f2687e36d9d98d193d0d543` بانسخهٔ مستقر195@31c44ab متفاوت‌اند؛ GitHub دوباره خوانده شد،168باز/draft/ادغام‌نشده است. این مأموریت پس از انتخابsandbox پیشنهادی، زنجیرهٔ اصلاح168 را در195 آزمود. شواهد این نوبت به1978/15eebc9 یاPreviewقدیمی نسبت داده نمی‌شوند. کد محصول195 تغییر نکرده وCI نهایی برنامه همانSHA سبز است.

کمبود registry مشاور، cacheنوشتنیNext وgrantهای خواندنnativePostgres اصلاح‌های نصب sandbox بودند؛ منبع برنامه وRLS تغییر نکردند. شاهد اولیهFAILهای ابزار/ACL حفظ و مسیر متأثر مستقل دوباره اجرا شد. نقص باز محصول دراین۱۴ ثبت نشد؛ گیت انسانی باز است، نهPASS مصنوعی. [آخرینreceiptمحیط](LIARA-ENVIRONMENT-FINAL.json) در14:19:29UTC چهارnativeuser،۱۸migration وIDهای هرهفتcontainerقبلی بدونتغییر را تأیید می‌کند. PRهای200/202/203/205/207 وminiapp6 دربرنامهٔ اینsandbox نصب نشده‌اند؛ شواهد مستقل آن‌ها درmanifest به‌صورت جدا نگهداری می‌شوند.

**اقدام بعدی مشخص:** انسان مستقل باcredentialفایلخصوصی رویهمین دستگاه، [کاربرگ نسخهٔ۱ آماده](https://62.60.191.24:8443/admin/research?workbook=ffeecd79-5532-48fe-8122-59d19e49a062) را درUI واقعی بررسی کند. UUIDنسخه `c4b9c716-609f-43ed-a655-33f3c5d2088d`، reviewrows=0؛ source/unit/date، تفسیر، شاهد مخالف و سناریوها را بخواند و اگرمناسب دید «تأیید داخلی نسخهٔ۱» را خودش انجام دهد. هویت/زمان/UUID/تصمیم بایدثبت شود و سپس سناریوی۵ باهمینSHA بازخوانی گردد. شرح کامل وURLورود باnext در[تحویل انسانی](dev07-independent/independent.md) است. تا آنزمان وضعیت نهایی **DEV-07 پذیرفته نشد؛ موانع دقیق و اقدام بعدی ثبت شد** باقی می‌ماند.
