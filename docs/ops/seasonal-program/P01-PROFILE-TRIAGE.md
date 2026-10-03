# P01 — علت پیام پروفایل خصوصی در دموی8444

بررسی فقط‌خواندنی: 2026-10-03، 08:52:35–08:57:11UTC، معادل12:22:35–12:27:11تهران. محیط `portfolio-demo844` / `https://62.60.191.24:8444`، SHA زندهٔ کانتینر برنامه **`cfa4e211dc1c1dd50141eadd0f2a884151f78e06`**. این بررسی Production، Native219/8445 یا ورود شخصی مالک نیست.

## نتیجه قطعی در حد شاهد

**GET `/api/auth/identity` در برنامهٔ فعلی503 با متن «مسیر موبایلی فعال نشده است» برمی‌گرداند.** شاهد مستقل با درخواست داخلی HTTP به خود برنامه در08:56:31UTC /12:26:31تهران ثبت شد؛ درخواست بدون credential بود و هیچ مقدار پروفایل خوانده یا صادر نشد. این پاسخ پیش از `getUser` و RPC اتفاق می‌افتد؛ در نتیجه نشست موفقِ خانه/سبد نمی‌تواند این guard را عبور دهد.

این نتیجه با مشاهدهٔ اعلام‌شدهٔ مجری اصلی از خانه عضو و متن کارت سازگار است؛ پاسخ شبکهٔ همان تب شخصی در اختیار P01 نبود و request-id مرورگر به این درخواست داخلی نسبت داده نمی‌شود. P01 در این بررسی UI را شخصاً مشاهده نکرد.

## زنجیرهٔ کد → وضعیت → متن

| مرحله | شاهد رویcfa | اثر |
|---|---|---|
| کارت `components/member/ProfileStatus.tsx` | state=unavailable پیام «وضعیت پروفایل اکنون قابل بررسی نیست؛ این خطا به معنی ناقص‌بودن اطلاعات شما نیست» را نشان می‌دهد | پیام مشاهده‌شده وضعیت داده شخص را اثبات نمی‌کند |
| `lib/member/profile.ts` | GET `/api/auth/identity`، same-origin/no-store؛404→not_connected؛401→sign_in_required؛ سایرnon-2xx→unavailable |503 به همان پیام عمومی تبدیل می‌شود |
| `app/api/auth/identity/route.ts` | نخستین خط GET: `if(!mobileEnabled()) return ...503` | guard پیش از نشست، RLS/RPC و decrypt اجرا می‌شود |
| `lib/auth/mobile-server.ts` | enabled فقط وقتی `AUTH_MOBILE_ENABLED==='true'` | مسیر خواندن پروفایل با فعال‌سازی مسیر موبایل گره خورده است |
| محیط برنامه | `AUTH_MOBILE_ENABLED` درDockerConfig تنظیم نشده؛ درخواست زنده پیام همانguard را برگرداند | غیرفعال‌بودن مسیر اکنون با پاسخ واقعی هم تأیید شد |
| کلیدهای هویت | حضور `AUTH_IDENTITY_KEY_VERSION`، `AUTH_IDENTITY_ENCRYPTION_KEY`، `AUTH_IDENTITY_HMAC_KEY` درDockerConfig=false | وابستگی آماده‌سازی ذخیره/decrypt؛ علت اولیه503 فعلی نیست |
| catalog فقط‌خواندنی `portfolio-demo844-db` | identity_private.profile_versions، national_id_registry، auth_read_private_identity و auth_save_private_identity همگی حاضر | «migration غایب» علت503 فعلی نیست؛ حضورcatalog آزمون RLS یا decrypt نیست |

وقتی guard بسته است، سرور نه ناقص‌بودن پروفایل، نه رد مجوز، نه خرابیRPC و نه خطای هویت را بررسی کرده است. خانه/منابع/سبد از APIهای دیگری بارگذاری می‌شوند؛ موفقیت آنها دلیل فعال‌بودن identity API نیست. providerSMS یا خریدSMS برای توضیح503 لازم نیست.

## تطبیق با مالک محیط و حدود رفع

نسخه با گزارش جاریP00 در `docs/ops/seasonal-program/p00-demo844-20261002/CURRENT.md` و SOURCE_SHA کانتینر تطبیق شد؛ اینcfa همان نمونهٔ قبلی و مستقل ازNative219 است. تنظیم/سرویس/کوکی/schema نمونه حین این ممیزی تغییر نکرد. این تطبیق از artifact عمومی P00 و read-onlymetadata است؛ دستور یا پیام تازه‌ای به چتP00 ارسال نشد.

رفع پیشنهادی برای بستهٔ بعد، با مالکAuth وP00:

1. قابلیت خواندن پروفایل را مستقل از روشن‌کردن کل مسیرOTP/SMS طراحی کنید، یا تا آماده‌بودن آن، کارت حالت صریح «پروفایل خصوصی در این محیط فعال نیست» بگیرد. روشن‌کردن AUTH_MOBILE_ENABLED صرفاً برای حذف پیام، همه پیش‌نیازهای مسیر موبایل را فراهم نمی‌کند.
2. برای profile service فعال، key-version و کلیدهای رمزنگاری/HMAC فقط درمحیط امن server-only آماده شوند؛ کلید نسخه‌های قدیمی حفظ شود. پروفایل null می‌تواند بدونdecrypt پاسخ داده شود؛ غیبت کلید را علت قطعی خواندن یک پروفایل null ننامید. ذخیره/decrypt رکورد واقعی بدون material معتبر پذیرفته نیست.
3. پیش از هر نصب جدید، checksum/مجوزهای RPC وRLS موجود تطبیق داده شوند؛ جدول/تابع حاضر است و مهاجرت دوبارهٔ کور لازم نیست. سپس صفررکورد→incomplete200، رکوردساختگی→recorded200، غیرعضو/حسابدیگر، auth401، اختلال503 و قرارداد schema آزموده شوند.

در این ممیزی هیچ کد اجرایی، env، migration، account، role، fault، provider، Production یا sandbox تغییر نکرد. فعال‌سازیSMS، auto-confirm، credential تازه یا grant راه‌حل این خطای کارت نیست. ورود مالک اصلی همچنان پذیرش مستقلی دارد؛ وجود profile.role=admin به معنی loginaccepted نیست.

## شواهد غیرحساس و محدودیت ابزار

- [پاسخHTTP داخلی وSHA زنده](./P01-PROFILE-TRIAGE-20261003-HTTP.json):503/mobile_disabled؛ credentialsSupplied=false.
- [وضعیت تنظیمات، فقط حضور کلیدها](./P01-PROFILE-TRIAGE-20261003.json).
- [catalog فقط‌خواندنی](./P01-PROFILE-TRIAGE-20261003-CATALOG.json): چهار object حاضر؛ بدون رکورد شخصی.

probeهای اولیه باNodefetch نتیجهUNKNOWN دادند و HTTPstatus محسوب نشدند؛ probe نهایی باNodehttp داخل همان کانتینر503 را ثبت کرد. هیچ endpoint عمومی جایگزین، tunnel، تغییرproxy/TLS یا مرورگر دیگر برای عبور از محدودیت مرورگر استفاده نشد. درخواست داخلی diagnostic، مشاهدهUI یا ورود واقعی نیست. rawlog، HAR، cookie/token، UUID، ایمیل، password/hash، nationalId، ciphertext و کلید صادر نشدند.

ابزار: PowerShell، SSH مجاز، Dockerinspect whitelist، Nodehttp داخلی، PostgreSQL catalog درtransaction READ ONLY و Git source inspection. مهارتSupabase برای canonicalAuth/privateprofile/RLS به‌کاررفته؛ آزمون احراز هویت، ارسال فرم یا build سنگین اجرا نشد. فایل جدید این ممیزی تنها خروجی مشترکP01 است؛ سایر فایل‌های ممیزی و فایل‌های اجرایی مالکان دیگر ویرایش نشدند.

