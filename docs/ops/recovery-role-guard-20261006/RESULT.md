# P01-ROLE-01 / P01-GRANT-02 — اصلاح محدود و تحویل نصب

تاریخ: ۶ اکتبر۲۰۲۶. **اصلاح در شاخهٔ ایزوله ساخته و آزموده شده؛ روی DB اصلی نصب نشده است.** مبنا `3833cba1f2e16daacb85617e040df44726afd13e`، شاخه `codex/p01-role-guard-20261006`؛ main مشاهده‌شده `51fd0661d48d791ce8758a87828a81ce72cac6df`. P01 مالک Auth و P00 مالک نصب/manifest/انتشار است. هیچ schema یا مدل هویت موازی، تغییر UUID/حساب/نقش واقعی، پرداخت، دعوت، پیام یا migration phase37 ایجاد نشد.

## نتیجهٔ اصلاح

`profiles_self_insert` و `profiles_self_update` اکنون role=user را برای مسیر خود فرد کنترل می‌کنند. policy مدیر حفظ شده است. guard قبل از INSERT/UPDATE(role)، تغییر حساس نقش را فقط برای مدیر معتبر جاری، service_role مجاز یا maintenance SQL بدون request claims می‌پذیرد. **current_user به‌تنهایی معیار نیست**: SECURITY DEFINER RPC متعلق به owner که کاربر عادی صدا می‌زند نیز باید رد شود. تابع guard از نوع INVOKER، با search_path مشخص و بدون EXECUTE عمومی است؛ کوکی/JWT/Auth فعلی تغییر نکرده است.

برای payments وentitlements تنها دفاع بخش۱phase23 روی همین دو جدول استفاده شده: REVOKEامتیازهای TRUNCATE/TRIGGER/REFERENCES برای PUBLIC/anon/authenticated/service_role. امتیازهای SELECT/INSERT/UPDATE/DELETE، RPCها، RLS و guardهای موجود حفظ شده‌اند. کلphase23 اجرا نمی‌شود. [مبنای PostgreSQL17 درباره استثنای TRUNCATE در RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## فایل‌های دقیق و ترتیب

| ترتیب | فایل | SHA256 |
|---|---|---|
| فقط‌خواندنی پیش/پس نصب | `sql/recovery_member_access_preflight_20261006.sql` | `0C48FCE8E4A5FF25DD7C191E01FE784323670B73EE5B5475C8CC5518985D85E0` |
| ۱ — محافظ نقش | `sql/recovery_profile_role_guard_20261006.sql` | `367A5ED0EA31E6A06E6AC01BFE2E75D572C1F812670BCD86C4FFCCA74E03293D` |
| ۲ — سخت‌سازی ledger | `sql/recovery_member_ledger_grants_20261006.sql` | `D3CE34B5AC665D3434522BDD48A521B5D579BE6327350617A3887D461E7F4EC5` |
| بازگشت اضطراریِ fail-closed | `sql/recovery_profile_writes_freeze_20261006.sql` | `4657F57BFF5D95827A2E2E2152808D06ED893A6A35500562D1235F5F62E90E9C` |

فایل‌های نصب transaction مستقل، lock_timeout۵ثانیه و statement_timeout۳۰ثانیه دارند؛ پیش‌شرط خطا می‌دهد و failure میانهٔ نصب rollback می‌شود. اجرای دوباره در آزمون پذیرفته شد. فایل freeze مسیر عادی نصب نیست. نام‌ها مستقل از phaseهای رزروشده‌اند و خودکار وارد ترتیب migrations نشده‌اند؛ P00 همان فایل/SHAها را صریح انتخاب کند.

SHA256های جدول برای bytes ذخیره‌شدهٔ Git باLF هستند؛ checkoutویندوز ممکن استCRLF بدهد. برای تطبیق دقیق، blobهمانref را بدون تبدیل متنی استخراج وhash کند؛ اختلاف صرفاًEOL را با تغییر محتوایSQL یکی نگیرد. نصب ازSQLدقیق همینref انجام شود.

## شاهد و آزمون

[snapshot مجوزهای واقعی](preflight-catalog.json): 08:55:30 UTC /12:25:30 تهران؛ کاتالوگ و ACLجدول/ستون، policy، trigger وdigest تعریف RPCها؛ بدون ردیف خصوصی/UUID/لینک/credential. هر پنج container اصلی healthy و شمار proofهای باقی‌مانده۰ بود. این snapshot، backupداده یا پذیرش login نیست؛ sourceهمچنان policyنقش قدیمی را دارد.

بررسی مستقل mode رویsource: PG17.6، in_recovery=false وdefault_transaction_read_only=off؛ مقدارtransaction_read_only=on در probe به‌دلیل BEGIN READ ONLY همان بررسی است. آن را freeze عمومی DB یا منع قطعی نصب نمی‌نامیم. mode وcatalog دوباره در زمان نصب بررسی شوند.

[۵۷ بررسی PostgreSQL موفق](postgres-regression.json)، با تصویر **ازقبلcached** postgres17-alpine/PG17.11، imageID `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`؛ network=none، بدون پورت، حافظه۳۸۴MiB وCPU۰٫۵، DB/container یک‌بارمصرف. حذف فقط target تازهٔ متعلق به harness انجام شد؛ source DB/Auth/Storage/FX یا proof منتخبP00 تغییر نکردند. این نسخه با PG17.6 اصلی یکی نیست؛ پذیرش exact-runtime روی restore مطابق بند نصب باقی است.

- قبلِ اصلاح، selfUPDATEadmin وselfINSERTadmin روی دادهٔ مصنوعی واقعاً موفق شدند؛ TRUNCATE در transaction آزمایشی وROLLBACK پذیرفته شد. پس آزمون وجود شکاف را نیز اثبات می‌کند.
- پسِ اصلاح، INSERT/UPDATE مستقیم نقشadmin، RPCdefiner برای خود/فرددیگر وactorنامعلوم رد شدند. ویرایش مجاز پروفایل، ایجادroleuser، مدیر موجود و مسیرservice مجاز حفظ شدند.
- دو عضو با ردیف‌های **غیرخالی** payment/entitlement: خواندن خود موفق، خواندن صریحA توسطB وanon رد؛ مدیر مجاز هر دو را خواند. B پس از تلاش تغییر نقش همچنان admin=false است.
- RPCهای واقعی phase5/11/30 در DB ایزوله: fn_user_access وکد اتصال موجود کار کردند، create_payment وverify برایuser رد شدند، service create/verify/fail کار کردند، اعطا/ابطال مجاز مدیر حفظ شد. دعوت یا پیام واقعی ارسال نشد.
- فایل سخت‌سازی برای هر۳role وهر۲ledger، TRUNCATE را رد و DMLدیگر/شمارش رکوردها را حفظ کرد. خطای عمدی میانهٔ هر فایل، atomicبودن تغییر policy/ACL را آزمود.
- بازگشت application با guard باقی‌مانده، نوشتن قدیمیِ roleadmin را همچنان رد کرد. freeze جدول وcolumngrantهای legacy را بست؛ خواندن خود، نقش مدیر و ویرایشservice حفظ و UUIDهای اصلیِ fixture ثابت ماندند.

**۳۸ بررسی Node موفق،۰fail/۰skip**: regressionورود/returnTo/middleware،۲caseنقش برایadmin/fx و۶caseGET/POST/PATCH واقعی routeentitlements با SDKdouble. B403 وadmin با ورودی ناقص400 گرفت؛ هیچwrite رخ نداد. این‌ها آزمون handler واقعی با SDKdouble هستند؛ **HTTP GoTrue→PostgREST با actorواقعی یا Nativeمالک نیستند**. DBآزمون‌ها claimهای مصنوعی SQL در محیط ایزوله دارند، نه JWT دستی و نه نشست main.

typecheck و lintمحدود PASS؛ SQLvalidator۴۸فایل،۰مردود؛ livePostgres گرامر فایل‌های اجرایی را نیز مصرف کرد؛ secret scan۰یافته وdiffcheckPASS. CIگیت مستقل Python وNode در همان jobایزولهٔ موجود افزوده شده است؛ نتیجهٔ CI تازه از SHAنهایی PR خوانده شود، موفقیت CI3833 به این تغییر منتقل نمی‌شود. buildمحلی سنگین یا استقرار انجام نشد.

چند تلاش اول harness روی bootstrapتصویرSupabase به آماده‌سازی/مجوزSET ROLE برخورد کردند و به‌عنوان پذیرش شمرده نشدند؛ تصویرcachedایزولهٔ PostgreSQL وsnapshotواقعی policyها استفاده شد. source اصلی تغییری نکرد. نسخهٔ نهایی۵۷check، فایل‌های دقیق بالا را مصرف کرده است.

## نصب توسط P00، بدون وابستگی به ورود شخصی/Vercel

1. main/head/مالکیت را تازه تطبیق و writerهای هم‌پوشان را هماهنگ کند؛ snapshotpreflight تازه را در مسیر خصوصی امن نگه دارد و با snapshotبالا مقایسه کند. اگر policy/RPC/role/inheritedACL جدید یا اختلاف schema هست، کور نصب نکند.
2. backupداده/roles/schema مناسبِ زمان نصب با checksum و امکانrestore مستقل لازم است. backup۳اکتبر سابقه است؛ ادعای حفاظت خودکار writeهای بعدی یا فایلStorage نیست. backupتازه و نگهداری امن با هماهنگ‌کننده؛ credential در argv/چت/PR نیاید.
3. فایل‌های دقیق نقش وledger را ابتدا روی **restoreجدید PG17.6 با schemaواقعی** بررسی کند؛ proofقدیمی پس از نصب پنجschema وfreeze، baselineخام نیست و بی‌هماهنگی resetنشود. پیش/پس UUIDها، نقش مدیر، محتوا/count وACL/RLS/RPCها مقایسه شوند.
4. فایل۱ سپس۲ را با operatorمجازی که snapshotشناخته‌شده را دارد نصب و receipt version/hash/transaction را ثبت کند؛ این نصب محدود Auth به انتظار رمز مالک یاenvVercel وابسته نیست. به main هیچfixture/exploit/selfroleupdate/adminساختگی وارد نشود.
5. پسsnapshot وschema-cache را طبق runtime موجود تطبیق دهد؛ در محیط ایزوله با GoTrue/PostgREST واقعی، خودعضو وB-denial مستقیمHTTP را تکمیل کند. ورود واقعی مالک پسboot وrefresh/خروج/ورود رویURLاصلی همچنان گیت جدا است؛ ساخت SQLguard به معنی عبور آن نیست.

## بازگشت بدون بازکردن شکاف

بازگشت عادی، فقط coderollback به نسخهٔ بررسی‌شدهٔ application است؛ **guard نقش، policyاصلاح‌شده و REVOKEهای امن DB باقی بمانند**. UUID/پروفایل/پرونده/ledger حذف یا restoreقدیمی روی writeتازه نشوند. سیاست‌های selfINSERT/selfUPDATE قدیمی و ACLTRUNCATE ازsnapshot به‌عنوان down اجرا نشوند.

در regressionنوشتن، فایلfreeze تنها INSERT/UPDATE/DELETE مستقیمprofiles برایanon/authenticated را، همراهcolumngrantها، متوقف می‌کند؛ SELECT،service وguard باقی می‌مانند. این حالت موقت است و ویرایش پروفایل اعضا/ادمین ازنشست را عمداً می‌بندد؛ forwardfix و بازآزمایی مجاز برای رفع freeze لازم است. guard/RPCامن نباید برای رفع سریع خطا برداشته شود. اگر inheritedACL مانعfreeze شد، خطای صریح داده و وضعیت guardحفظ می‌شود؛ اپراتور مسیرprivilege را بررسی کند.

مراحل CLI/نصب بیرونی را P00 با نشست امن موجود اجرا می‌کند؛ sourcepatch و SQL برای بررسی اکنون آماده‌اند. نقش موجود مدیر و legacyemail حفظ شده‌اند. ابزار/مهارت: Supabase، Supabase Postgres best practices، Git، bundledPython/Node،SSH موجود،Docker/psql فقط رویtargetایزوله وsourcecatalogREAD ONLY؛ هیچ سرویس/SDK مالی یا providerSMS مصرف نشد.
