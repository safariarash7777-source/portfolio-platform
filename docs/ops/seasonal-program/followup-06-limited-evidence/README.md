# FOLLOWUP06 — پذیرش محدود ترکیب تازه، محیط ساختگی

این پرونده متعلق به PR186 آزمایشی و جدا از baseline2605 و گزارش مستقل18PASS/2FAIL است. **runtime/build نهایی `a49e37cecc7922d6d80c174910301e24a1841aee`**، origin **http://127.0.0.1:3299** و شناسهٔ محیط **`followup06-limited-native-local`** هستند. بررسی اولیه روی `d941b0b47520449e097dcdb0f31eef77e93cdd3c` بود و دو خطای Authهویت/وضعیت را آشکار کرد؛ شواهد آن به نسخهٔ اصلاح‌شده تعمیم داده نمی‌شوند. این نشانی فقط روی همین دستگاه در دسترس است. فایل app-manifest.json مرجع نسخهٔ واقعاً buildشده است؛ provenance.json تطبیق application/schema/dependency با سرشاخهٔ بعدیِ اسناد/CI را ثبت می‌کند. Preview خودکار یا Production مقصد این آزمون نیستند.

ورودی‌های ثابت:184@51ad615،179@ca27b94،180@bb4f2f3،181@a95aa0c،182@e5740be،183@8723c55. SHAهای کامل و حضور در ancestry در provenance.json ثبت‌اند. Node24.19.0 محلی، Next15.5.25؛ CI از Node22/DB16 استفاده می‌کند. lock/dependency تغییر نکرد. محاسبات مالی، رضایت مشاور و UUID حساب از بسته‌های قبلی حفظ شدند.

## محیط و نصب

چهار container قبلیِ **همین sandbox ساختگی**، با label `codex.task=followup06-accept` و دو volume اختصاصی، دوباره استفاده شدند؛ هیچ restore/reset یا ساخت حساب تکراری انجام نشد. PostgreSQL17.11، GoTrue2.197.0، PostgREST14.17 و Storage1.11.2 واقعی‌اند. DB پورت عمومی ندارد؛ سرویس‌ها و proxy فقط loopback‌اند. [زنجیرهٔ قبلی16SQL](../followup-06-auth-storage-evidence/environment.json)، [تأیید پیشین native](../followup-06-auth-storage-evidence/environment-verification.json) و [نصب افزایشی تازه](migration.json): پیش‌نیازها، phase32→34→35→36→37→38 و migrations04/08، سپس180 `20261001083215_auth_private_identity_versions.sql` باSHA256 `7969634e0b0d564f97e5a43eae823441182fbb42aa1a2d1728d81b142bf08251`.

پس از نصب180، Auth6کاربر، Storage4object و identity0نسخه حفظ شدند. دو TABLE خصوصی RLS دارند؛ client به schemaخصوصی و writerEXECUTE مجوز ندارد؛ readRPC فقط پروفایل همانAuthUUID را می‌خواند. استفاده از نام/شماره/کدملی واقعی یا نشست ساختگی انجام نشد. کلید writer فقط private server env است؛ در bundle، گزارش و مخزن مقدار آن نیست.

[اصلاح آماده‌سازی محیط](environment-recovery.json): هنگام بازگشت Docker، Auth پیش از آماده‌شدن PostgreSQL باSQLSTATE57P03 متوقف شد؛ ابتدا DBready تأیید و **همان container** راه افتاد، health200. هیچ حساب/تنظیم/داده حذف یا عوض نشد. migration نصب شده بود ولی cache موجود PostgREST تازه نشده بود؛ readRPC404 و appidentity503 در تلاش مستقل ثبت شد. پس از پایان آزمون و revoke موقت، فقط `NOTIFY pgrst, 'reload schema'` روی DBاختصاصی اجرا شد؛ nativeOpenAPI200 و writerPath حاضر شدند. migration دوباره اجرا نشد. ابزار guarded install-identity.mjs اکنون پس از نصب همین notification را دارد و نصب تکراری را رد می‌کند. پاسخ catalog یا صفحهٔ login به‌تنهایی شاهد پذیرش نیست.

## اجرای ایمن

اطلاعات شش حساب واقعی ساختگی فقط در `C:/Users/Asus/.codex/private/followup06-auth-storage/reviewer-credentials.json` و کلیدهای خودِ همین محیط در همان پوشهٔ ACLمحافظت‌شده‌اند. اطلاعات ورود از همان مسیر محلی امن تحویل می‌شود؛ رمز/توکن وارد چت یا تصویر نشود. روی دستگاه دیگر این کلیدها/volumeها حاضر فرض نشوند؛ URL محلی هم Previewعمومی نیست.

app.mjs و gateway.mjs از root همین checkout اجرا می‌شوند. resource-guard.cjs خروجی شبکهٔ برنامه را به loopback محدود و CPU/heap build را کنترل می‌کند. کلیدهای Liara، BrsApi و relay واقعی در runtime حاضر نیستند. تنظیم CSP به origin محلی و backendهمان `/supabase` وابسته است؛ CORS مبدأ دیگر را403 می‌کند. مسیر بازگشت login همان مقصد محلی را از UI و Auth واقعی طی می‌کند. هیچ `sql/test` bootstrap یا policy permissive برای پذیرش native نصب نشده است.

اختلال فقط از فایل خصوصی `limited-fault.json` با `{ "auth": true }` یا `{ "storage": true }` اعمال می‌شود؛ `{}` بازیابی است. proxy درخواست واقعی برنامه به upstream را503 می‌کند؛ container مشترک یا Production متوقف نمی‌شود. هر harness باید درfinally fault راپاک و grantموقت را ازAPIمحصول revoke کند. این شاهد خطای transport sandbox است، نه خاموش‌کردن Production.

## حدود نتیجه

بازبین `/root/limited_independent` سازندهٔ ترکیب نیست و جلسات را با UI/nativeAuth دریافت می‌کند؛ agentreview جای تأیید انسانی پژوهش/فهم ترازنامه نیست. attemptها و نقص آماده‌سازی اولیه حذف نمی‌شوند. گزارش نهایی مستقل در independent.md/json، با تاریخ/SHA/نقش/HTTP/تعداد یا digest داده است.

AUTH_MOBILE_ENABLED فقط در همین برنامه برای مصرف GETهویت نصب‌شده فعال است؛ حساب‌های موجود phoneVerifiedfalse و officialMatchpending دارند. SMSprovider و emailprovider این ترکیب آماده نیستند، signupخاموش است و خطا صادقانه نمایش می‌یابد. نوشتن موفق هویت بدون phoneproof پذیرفته اعلام نمی‌شود؛ email-onlyPOST باید رد شود. ورود email/password و دادهٔ مالی مستقل از این مرحله باقی می‌مانند.

feed/read-state تازهٔ NEXT06، NEXT09، پذیرش شخصی مالک روی URLاصلی، providerهای موبایل/ایمیل، identitywriteبااثبات‌واقعی‌تلفن، دو چرخهٔ زندهٔ بازار/سهمیه، سرویس مالی واقعیFX، گیت انسانی DEV07 و173 همچنان **OPEN** هستند. wrapper `/admin/fx` اگر آزموده شود فقط مجوز/پوستهٔ sandbox است، نه عملکرد iframe/Python یا پذیرش مالی واقعی. هیچ ادغام، Production، migrationمشترک، خرید، بکاپ یا بازیابی در این ادامه انجام نشده است.
