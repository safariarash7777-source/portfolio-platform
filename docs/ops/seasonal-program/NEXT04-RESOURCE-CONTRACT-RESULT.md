# NEXT04 — اصلاح محدود F06-AS-01/02

تاریخ:2026-10-01، تهران. وضعیت: اصلاح ایزوله آمادهٔ بازبینی مستقل؛ پذیرش FOLLOWUP06 یا Production از آزمون نویسنده استنتاج نمی‌شود. شاخه `codex/next04-resource-contract-20261001` وابسته به PR175، base `bb7c2f9f89ea48929b6fd13a9dc9b16d58efa8a6`؛ **SHA کد `77b7b7c56fe984d5fbe6591248765f4d90e8880e`**. main مشاهده‌شده51fd066؛ محیط و شاخه بازبین2605a0f تغییر نکردند.

گزارش FOLLOWUP-06-RESULT و independent.md با18PASS/2FAIL خوانده شدند. اصلاح فقط handlerهای فهرست/دانلود، helper ارزیابی و آزمون‌هاست؛ هیچ migration، تغییر RLS، grant جدید، service-role fallback، مدل حساب یا policy تجاری اضافه نشد.

## قرارداد مدیر؛ تصمیم تازه لازم نیست

NEXT-01 بخش۵: نقش مدیر فقط برای اعمال مدیریتی مصوب مجوز دارد. NEXT-04-RESULT بخش «مجوز و حفاظت منابع» صریح است: **«admin برای خواندن دادهٔ عملیات مجاز است اما خودکار عضو آموزشی همهٔ دوره‌ها نیست.»** بنابراین منابع آموزشی همین evaluator موجود seasonal_module_access با cohort/module دقیق را لازم دارند؛ مدیر بدون grant همان دوره حق دانلود آموزشی ندارد. read policy مدیریت course_resources حفظ شد و دادهٔ عملیات همچنان قابل خواندن مدیر است. اعطای مجوز دانلود صرفاً برای سبزشدن آزمون انجام نشد.

## رفتار نهایی

| حالت | فهرست آموزشی | دانلود | علت |
|---|---|---|---|
| مهمان / AuthSessionMissingError واقعی SDK |401|401|نیاز ورود، بدون query خصوصی |
| اختلال Auth واقعی |503|503|با401/عدم عضویت یکی نیست |
| مدیر بدون grant آموزشی |200، آرایه خالی|403|مجوز metadata عملیاتی جای module-grant نیست |
| عضو همان cohort/module |200، فقط منابع مجاز|200، TTL60|همان RLS و evaluator canonical |
| دوره دیگر، revoked، expired، cancelled، nonmember |200، خالی|403|بازه/scope مستقل؛ signer فراخوانی نمی‌شود |
| RPC/Storage unavailable |503|503|پیام عمومی؛ خطای SDK/path افشا نمی‌شود |
| Storage permission401/403 |—|403|مجوز به‌صورت outage گزارش نمی‌شود |

فهرست برای هر module موجود یک بار evaluator را در همان درخواست می‌خواند؛ cache بین کاربران/درخواست‌ها ندارد. دانلود پیش از join/signer نیز همین تصمیم را بررسی می‌کند. URL/provider/path خام در فهرست نیست. فایل گمشده/خطای عمومی400Storage به403 قطعی تبدیل نشده؛400 native می‌تواند object ناموجود یا RLS نامرئی باشد. دانلود مدیر پیش از signer با403 روشن متوقف می‌شود. signed capability قبلی تاTTL60 ممکن است معتبر بماند؛ لغو فوری آن وعده نیست.

## آزمون و حد شاهد

- typecheck، lint باصفرwarning و production build: PASS؛39صفحهstatic؛ Next15.5.25، Node24.19. اصلاح اولیه نام متغیر module در harness فقط lint بود و اصلاح شد؛ suppression اضافه نشد.
- هفت regression روی **کد واقعی دو handler**: PASS؛ SDK missing session، Auth error، admin metadata بدونgrant، عضو مجاز/عدم افشای path، RLSنامرئی، خرابی evaluator و تفکیک permission/provider. پنج آزمون seasonal موجود نیز PASS. `test:seasonal` هر دو را اجرا می‌کند؛ dependency/lock تغییر نکرد.
- [۹ بررسی SDK/HTTP واقعی](./resource-contract-evidence/real-sdk.json): GoTrue2.197.0، PostgREST14.17 وStorage1.11.2 موجودِ sandbox کاملاًمصنوعی FOLLOWUP06 فقط مصرف شدند؛ guest401، نقش‌های A/B/expired/cancelled/nonmember/admin، Bفایل36بایتی باdigest دقیق وTTL60، مدیر هر دوcohort فهرست0/دانلود403 وStoragenative همچنانردشده. هیچ policy/table/fixture/grant بازبین تغییر نکرد؛ فقط login واقعی fixture وsignoutlocal همان نشست‌ها.
- قطع فقط مسیرSDK آزمایش به loopback بسته باعث Auth/Storage503 شد؛ سرویس مشترک متوقف نشد. نخستین اجرای harness fault را قبل از آماده‌شدن نشست فعال کرده بود؛ [تلاش اولیه](./resource-contract-evidence/real-sdk-before-fault-harness-fix.json) حفظ، تصحیح ابزار و شاهد تازه جدا هستند.
- این harness client درخواست را تزریق می‌کند ولی auth/query/storage همگی SDK واقعی و JWT صادرشدهٔGoTrue هستند. **شاهد browser login یا cookie adapter تازه Next نیست**؛ نشست جعلی/userJWT ساخته نشد. بازبین مستقل باید patch ثابت را در checkout و build تازهٔ مجاز خودش با مرورگر بازآزمایی کند. برنامه3299/شاخه2605a0f او دست‌نخورده است و هنوز همان FAILهای قبلی را دارد.
- migration: NONE؛ Production/محیطshared/restore/خرید: NONE. secret scan بعد ازstaging در همین شاخه اجرا می‌شود. داده واقعی مشتری و secret در شواهد نیست.

ابزار/مهارت: Git و checkout مستقل، Supabase canonical SDK/RLS، TypeScript/ESLint/Next، Node test/VM transpilation، HTTPloopback و SDK بر سرویسnativeمصنوعی؛ systematic-debugging و verification-before-completion. هیچ اطلاعات ورود خصوصی یا tokenURL در گزارش ثبت نشد.

## تحویل و بازگشت

[PR184](https://github.com/safariarash7777-source/portfolio-platform/pull/184)، draft وابسته175؛ head ایجادPR `d70b383932a3a17a492cee90d8090422f6c5f3f9`، کد ثابت77b7b7c. secret scan:741فایل،0یافته. مسئول FOLLOWUP06 patch77b7b7c را با حفظ بسته‌های دیگر در checkout **جدیدِ خودش** ترکیب کند؛ baseline مستقل18/2 را حذف/بازنویسی نکند. انتظار بازآزمایی مدیر، **list0/download403** است، نه افزودن grantadmin برایdownload200. حالت عضو B باید200 و hash صحیح بماند؛ مهمان401، Auth/Storageقطع503، عدم افشای مسیر/توکن و حفاظت فایلnative بررسی شود.

بازگشت اپ با revert همین patch؛ هیچ DBdown یا حذف حساب/پرونده وجود ندارد. مستندات مرکزی را مجری مدیریت به‌روز می‌کند؛ این بسته شاخه یا محیط بازبین را تغییر نداد.

## تحویل‌های Auth، CI همان head و Preview

در بازبینی همین روز، PR179head=`ca27b94a44f9a37785df059574a754e170880aac` و PR180head=`bb4f2f3e53859bbecb0ec942975ffb06fd2d2828`، CI Gate/Typecheck-Lint-Tests-Build/Database-RLS/Dependencies/Secret-SQL همگیsuccess؛ isolated-db180 نیزsuccess و SupabasePreview هر دوskipped بودند. نتایج به همین SHAها تعلق دارند؛ head تازه PR184 را سبز اعلام نمی‌کنیم.

دوPreview خودکار179/180 در شاهد11:16UTC بهcloudقدیمی اشاره داشتند؛ سایتProduction درشاهدقبلیLiaraبود. راه رسیدن بهPreviewصحیح: زوج `NEXT_PUBLIC_LIARA_API_URL` و `NEXT_PUBLIC_LIARA_ANON_KEY` به **همانbranchPreview** با مقدار امن محیط موردتوافق، سپسrebuild؛ مقصدserver/service-role وcallbackدقیق جدا تطبیق، سپسbundle/login دوباره مشاهده شود. mobile/emailfragment/signup/identitywriter واقعی پیش‌فرضخاموشبمانند. صرفstatusREADY اتصالصحیح را اثبات نمی‌کند. نصبmigration مشترک یا تغییرGoTrueProduction برای اینکار انجام نشود؛ SMTP/OTP کامل180 فقطsandbox محلی مستقل پذیرفته شده‌اند.

دسترسی موجودVercelconnector برایenvwrite ابزار ندارد؛ دراینsession نهVercelCLIاحراز‌شده، نهVERCEL_TOKEN/OIDC موجود و نهauthfileCLI مشاهده شد. بنابراینenv بیرونی/rebuild سفارشی اجرا نشد و دسترسی جدید/کلید درچت خواسته نشد. اپراتور دارایدسترسیproject اینscopeمحدود را اعمال کند؛ ورودمالکProductionتااستقرارمجازبازاست. Preview عمومی دارایکلیدwriter/featureفعال بهDBواقعی وصل نشود. بازبینی معتبر فعلی محلی8800(01) و8792(07)، با داده مصنوعی است. این مانع مستقل از اصلاح منابع/نمونه فونت است.

## تکمیل محدود: نبود نشست در /api/me/cohorts

در ادامهٔ گزارش NEXT06، SDK `AuthSessionMissingError` در همین handler پیش از اصلاح به503 تبدیل می‌شد. regression روی کد handler این شکست را ثبت کرد (expected401/actual503؛ هفت آزمون منابع همچنانPASS). همان classifier استفاده‌شدهٔ منابع در handler فهرست دوره‌ها مصرف شد؛ query، payload، محاسبهٔ standing وRLS تغییری ندارند.

پس از اصلاح: هشت regression handler PASS، شاهد native SDK/HTTP در real-sdk.json اکنون11بررسیPASS دارد: guest/cohorts401 و قطع واقعی مسیر SDK/cohorts503. SDK نشست صادرشدهٔGoTrue همان fixture را مصرف کرده؛ این بررسی هنوز شاهد cookie/browser Next نیست. در harness، standing برای این آزمون Auth به stub ثابت تبدیل شده و سنجش محاسبهٔ زمان به آزمون‌های seasonal موجود تعلق دارد. Typecheck/lint و build39صفحه دوبارهPASS؛ migration/RLS/انتشارNONE. هیچ publication-server، adapter list/read یا migration/test متعلق به feed عضو ویرایش نشد.

برای پذیرش مستقل همان PR184 شامل این تکمیل است؛ guest سه مسیر خصوصی باید401 و اختلال واقعیAuth باید503 بماند. انتظار مدیر منابع همان list0/download403 است.
