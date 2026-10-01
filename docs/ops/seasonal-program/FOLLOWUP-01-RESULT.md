# FOLLOWUP-01 — ورود مالک و مقصد محیط‌ها

تاریخ: 2026-10-01، تهران. وضعیت: **اصلاح مستقل آمادهٔ بازبینی؛ AUTH-00 در Production هنوز پذیرفته نشده است.** PR و head نهایی در رکورد تحویل پایین ثبت می‌شوند. کد آزموده‌شده: `c9ce9e92975d31486518bbb5bd70aec73d6b6ee9`. پایه دقیق `main=51fd0661d48d791ce8758a87828a81ce72cac6df`؛ branch `codex/followup-owner-login-20261001`. هیچ merge، تغییر رمز/حساب/نقش، migration یا استقرار Production انجام نشد.

## یافتهٔ مؤثر

در بازهٔ 09:46–09:52 UTC، معادل 13:16–13:22 تهران، روی Production فعلی:

- GoTrue ابتدا یک `/token` با400 و سپس درخواست‌های `/token` و `/user` با200 ثبت کرد. برای تنها پروفایل مدیر، **۸ رویداد login و۸ نشست تازه** بین09:46:56 و09:47:17 UTC ثبت شد؛ نه UUID و نه ایمیل/رمز/hash استخراج یا منتشر نشد.
- Vercel در09:47:14 UTC، `GET /dashboard` را با **504 در edge-middleware** و توقف به‌علت عدم پاسخ اولیه ظرف25ثانیه ثبت کرد. deployment همان `dpl_9suSBhTKxEgEefXoUDr2o6FfmZ56` و SHA51fd066 است.
- گزارش تازهٔ مالک از طریق هماهنگ‌کننده،13:17:50 تهران: روی `https://portfolio-platform-fawn.vercel.app/login?next=%2Fdashboard` «خطا نمیگه ولی وارد نمیشه». تلاش قبلی روی local3210 محیط مصنوعی بود و شاهد Production محسوب نمی‌شود.

**نتیجه قطعی محدود:** ورود مدیر در Auth در همین بازه واقعاً موفق بوده و درخواست داشبورد واقعاً در middleware متوقف شده است. بنابراین «همهٔ تلاش‌ها رمز غلط بوده‌اند» با شاهد سازگار نیست. اتصال تک‌درخواست مرورگر به این لاگ به‌وسیله request-id/HAR پاک‌سازی‌شده هنوز نداریم؛ جزئیات شبکهٔ موجب انتظار Edge و موفقیت cookie/getUser/role در همان مرورگر اثبات نشده‌اند. کوتاه‌کردن timeout را رفع قطعی علت شبکه نمی‌نامیم.

شواهد: [حادثهٔ Auth و شمارش مدیر](./followup-auth-evidence/production-incident.json)، [runtime/deployment ورسل](./followup-auth-evidence/production-runtime.json). ابزار CUA در این چت هیچ تب قابل‌دسترسی از مرورگر شخصی مالک نشان نداد؛ رمز را دوباره وارد یا تلاش او را بازپخش نکردیم.

## بررسی مقصد و هویت

| بررسی | شاهد 2026-10-01 | حد ادعا |
|---|---|---|
| سایت اصلی | alias Production READY، SHA51fd066 | با Preview یا localhost یکی نیست |
| bundle واقعی login | مبدأ Liara `https://62.60.191.24/liara-preview`؛ URL قدیمی Supabase در10bundle مشاهده نشد | فرض URL قدیمی برای این bundle تأیید نشد؛ همه Previewها ممیزی نشده‌اند |
| CSP، TLS، CORS | TLS با اعتبارسنجی عادی؛ CSP مبدأ Liara؛ OPTIONS مبدأ اصلی204 و مبدأ نامرتبط401 | موفقیت authenticated SSR را اثبات نمی‌کند |
| health | با anon عمومی همان bundle200 و GoTruev2.197.0؛ بدونapikey401 | 401 بدونapikey خرابی Auth نیست |
| مبدأ Auth server | SiteURL سایت اصلی؛ API_EXTERNAL_URL مسیرLiara/auth/v1؛ تنظیم build نگاشت Liara را دارد | مبدأ fetch همان درخواست Edge از trace مستقلی تأیید نشده |
| مدیر موجود | provider فعلیemail، UUID حاضر، profile متصل، roleadmin، emailconfirmed، banfalse، passwordpresent، phoneunconfirmed | وجود hash اعتبار رمز تایپ‌شده یا روش تاریخی Google را ثابت نمی‌کند |
| Auth/REST | مقایسهٔ فقط‌خواندنی: shared signing secret برابر است | مقدار یا fingerprint کلید منتشر نشد |
| SMTP/SMS | SMTP تنظیم نشده؛ hook/secretSMS تنظیم نشده | علت signInWithPassword حساب موجود تلقی نشد |
| API قدیمی cloud | HTTP402 در گزارش قبلی بازار | تاریخ/منبع قبلی حفظ شد؛ بازآزمایی امروز انجام نشد |

[probe عمومی](./followup-auth-evidence/public-probe.json)، [status مدیر](./followup-auth-evidence/owner-status.txt)، [تنظیمات پاک‌سازی‌شدهٔ Liara](./followup-auth-evidence/liara-status.json). Google/Gmail password با رمز سایت متفاوت است؛ هیچ تغییر credential بدون مرحلهٔ شخصی مالک انجام نشده است.

## اصلاح مستقل روی main

فقط middleware، صفحه ورود و regression مرتبط تغییر کردند؛ اسکریپت آزمون ایزوله نیز اضافه شد. قواعد نقش و entitlements همان main باقی ماندند؛ ستون یا policy دورهٔ NEXT04 به این patch منتقل نشد.

1. middleware از Edge به **Node.js** می‌رود؛ Next15.5.25 موجود این runtime را به‌صورت پایدار پشتیبانی می‌کند. این انتخاب، candidate رفع اختلاف runtime/اتصال است و نیازمند شاهد همان محیط ورسل پس از استقرار مجاز است. [مستند نسخه15](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware).
2. کل بررسی Auth/refresh/role حداکثر8ثانیه فرصت دارد؛ درخواست بالادست abort می‌شود و مسیر خصوصی باز نمی‌شود. مقصد login خطای صریح `auth_unavailable` و next مجاز را دارد.
3. کوکی تازه/منقضی SDK روی همه redirectها حفظ می‌شود. از دست رفتن این کوکی در baseline جداگانه بازتولید شد؛ آن را علت قطعی حادثهٔ مالک اعلام نمی‌کنیم.
4. بعد از signIn موفق، ورود ناوبری کامل انجام می‌دهد تا شکست صفحهٔ محافظت‌شده پشت transition بی‌پیام پنهان نماند. خطای بررسی نشست به کاربر نمی‌گوید رمز را تغییر دهد؛ فرم خطای credential را جدا نمایش می‌دهد.

## آزمون مستقل

| محیط/آزمون | نتیجه |
|---|---|
| typecheck/lint/build رویmain+patch | PASS؛ Next15.5.25، Node24.19.0؛38صفحه static |
| test:core همین پایه | 1094PASS،0FAIL؛ موتور مالی تغییر نکرد |
| regression middleware/login |10PASS؛ anonymous next، refreshed/expired cookies، deadline، عدم مجوز خصوصی |
| production build محلی با GoTrue واقعی و حساب synthetic user | ورود از فرم مرورگر، dashboard200، reload، خروج/ورودSDK با همانUUID، رد `/admin/fx` بهdashboard: PASS |
| قطع مسیر واقعی SDK/getUser در proxy محلی | بدون stub کردن getUser؛307 بهlogin خطادار در8033ms؛ دسترسی خصوصی نداد: PASS |
| تصاویر | [خطای retry در390](./followup-auth-evidence/owner-retry-390.png)؛ هیچ credential در تصویر نیست |
| مالک روی URL اصلی باcandidate | **BLOCKED: candidate هنوز مستقر نشده؛ cookie/role/refresh/خروج/ورود واقعی مالک با نسخه تازه بررسی نشده** |
| admin/fx،12تب،fullscreen،download،iframe تأخیر/خطا | پذیرش مدیر **BLOCKED**؛ candidate ارز و iframe فعلی Production یکی فرض نشدند؛ این بسته کد FX را تغییر نداد |

[شاهد build/مرورگر](./followup-auth-evidence/owner-sandbox.json). داده و حساب آزمایش مصنوعی‌اند، سرویس Auth و نشست واقعی. sandbox فقط profiles و رکوردهای آزمون لازم دارد؛ ممیزی کامل دارایی/مشاوره DEV07 یا پذیرش انسانی آن تکرار نشده است. server محلی `http://127.0.0.1:8800/login` برای بازبینی است و حساب اصلی مالک در آن وجود ندارد. ساخت این محیط به providerSMS یا خرید وابسته نیست؛ fixture محلی آمادهٔ FOLLOWUP07 استفاده شده است.

## نسخه و مالکیت

پیش از ویرایش main51fd066 و1683462f01 بررسی شدند. بازبینی نهایی: main51fd066، PR168 اکنون `15eebc97ca650dde5f2687e36d9d98d193d0d543`؛ تغییر آن ادغام main و مستندات مستقل DEV07 بود. #173=`7f915e3`،174=`95cfa34`،175=`bb7c2f9`،176=`d697635`،177=`27e59ad` همچنان مشاهده شدند. patch فوری عمداً رویmain است و به موج دوم/phase37 یا migration هویت وابسته نیست. کد Auth یک مالک دارد؛ پوسته و refresh جدول‌های بازار در این بسته ویرایش نشدند. اسناد مرکزی متعلق به مدیریت‌اند.

مهارت‌های به‌کاررفته: Supabase برای canonical Auth/RLS و منبع نسخه نصب‌شده؛ agent-browser برای Chromium واقعی؛ Next.js برای runtime؛ systematic-debugging برای فرضیه/شاهد مستقل؛ verification-before-completion برای آزمون تازه و جداسازی ساخته/مستقر/پذیرفته. ابزار: Git، Node/TypeScript/ESLint/Next، Docker/GoTrue/Postgres محلی، SSH/psql فقط‌خواندنی مجاز، Vercel connector و probe عمومی. secret scan پس از staging0یافته داشت. کلید مدیریتی، SMTP و Google علت عمومی فرض نشدند.

## بازگشت و اقدام بعدی

migration: **NONE**. Production mutation/deployment: **NONE**. بازگشت اپ: بازاستقرار SHA51fd066/برگرداندن commit اپ؛ DB و حساب/رمز/ایمیل/سوابق دست‌نخورده می‌مانند.

مسئول انتشار پس از بازبینی باید candidate مستقل را ابتدا با مقصد Liara صحیح روی محیط مجاز ورسل آزموده و runtimeNode و deadline را از شاهد همان deployment بررسی کند. سپس، با مجوز استقرار، یک تلاش شخصی مالک روی **سایت اصلی**: ورود→نقشadmin→refresh→خروج→ورود؛ یک حساب نامرتبط نیز رد شود. نیاز از مالک فقط همین اقدام و زمان/متن خطا یا request-id غیرحساس است؛ رمز/OTP/HARخام خواسته نشود. تا آن پذیرش، AUTH-00 باز است.

بازیابی اگر واقعاً لازم شد: مالک خودش credential را تعیین کند. Production فعلی SMTP ندارد؛ ساخت SMTPمحلی FOLLOWUP07 به معنی آماده‌بودن recovery روی سایت اصلی نیست. دامنه/فرستنده/secretSMTP امن و چرخهٔ واقعی ارسال و مصرف لینک پیش‌نیازند؛ ایمیل legacy حذف نشود.

## رکورد تحویل

PR و head نهایی پس از push در این بخش درج می‌شوند؛ کد `c9ce9e9` و همه شواهد تاریخ‌دار بالا مستقل از head مستندات هستند. CI و Preview خودکار جدا از آزمون محلی و Production گزارش می‌شوند.
