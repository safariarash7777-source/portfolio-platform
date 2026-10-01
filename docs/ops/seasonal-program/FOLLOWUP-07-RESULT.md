# FOLLOWUP-07 — زیرساخت موبایل، پروفایل خصوصی و ایمیل

تاریخ: 2026-10-01. وضعیت: **ساخته و آزموده در محیط ایزوله؛ فعال‌سازی واقعی و پذیرش Production باز است.** دامنهٔ تازه DD-033 اعمال شد: مدارک، خرید، شارژ، ارسال پیامک مشتری و تغییر DNS دنبال نشد. ورود ایمیل/رمز موجود و UUID حفظ شدند.

کد آزموده‌شده: `05d5ae63f424c556656de2fd267e7ab0d32a4407`، branch `codex/followup-auth-20261001`؛ پایه `codex/wave-02-review-20260930@7cb030c140ce143f03c549125c5e647fea22f44c`. این پایه main نیست. اصلاح فوری FOLLOWUP-01 روی main یک PR مستقل دارد و به این migration وابسته نیست. PR در رکورد تحویل پایین ثبت می‌شود.

## وضعیت مستقل کانال‌ها

| جزء | ساخته | آزمون این بسته | پیکربندی واقعی | فعال در Production |
|---|---|---|---|---|
| ورود ایمیل/رمز | حفظ؛ اصلاح ناوبری و کوکی | SSR، refresh، خروج/ورود GoTrue مصنوعی | email فعال؛ مدیر confirmed و password موجود | نسخه قدیمی51fd066؛ patch مستقر نیست |
| موبایل OTP/رمز اختیاری | BFF، فرم و canonical SDK | OTP تصادفی، انقضا/replay و مرورگر | phone/hook/secret آماده نیست | خیر |
| اتصال شماره | phone_change به همان UUID | حفظ ایمیل/profile/رکورد؛ رد تعارض | شماره مالک تأیید نشده | خیر |
| کاوه‌نگار | adapter، امضا، ledger هزینه/تلاش | mock صریح؛ قطع، replay، restart، هزینه | پنل طبق ثبت مرکزی باز؛ قالب ثبت/تأیید نشده | هیچ ارسال واقعی |
| پروفایل خصوصی | رمزنگاری/HMAC، نسخه، RLS/RPC | SQL واقعی روی DB مصنوعی؛ مجوز DB/API | migration و writer نصب نشده | خیر |
| ایمیل تراکنشی | قالب فارسی، SMTP GoTrue، fragment/BFF | دریافت محلی → لینک → SSR → رمز جدید | SMTP واقعی تنظیم نشده؛ فرستنده نامعین | خیر |
| سلامت کانال‌ها | API ادمین و کارت /admin/health | رد anon/user؛ type/lint/build | readiness اعلامی، نه probe ارسال | نسخه جدید مستقر نیست |
| هویت رسمی/MFA قوی | ساخته نشده | verified رسمی جعل نشده | قرارداد مستقل لازم | همیشه pending |

## نسخه، محیط و مالکیت

README، CLAUDE، COMMAND-CENTER، AUTH-MOBILE-IMPLEMENTATION، WAVE-02 و خروجی‌های01/02/03 و مدل‌های موجود پیش از ساخت بررسی شدند. main اولیه و نهایی `51fd0661d48d791ce8758a87828a81ce72cac6df` است. PR168 از3462f01 به `15eebc97ca650dde5f2687e36d9d98d193d0d543` رسیده؛ تغییر تازه مربوط به ادغام main و مستندات مستقل بود. سر173=`7f915e3`،174=`95cfa34`،175=`bb7c2f9`،176=`d697635`،177=`27e59ad` نیز تطبیق شد.

Auth یک مالک دارد. پوسته، جدول بازار، صفحه عملیاتی NEXT06 و اسناد مرکزی بازنویسی نشدند؛ تنها کارت کانال به صفحه سلامت موجود اضافه شد. معیار entitlements پایه موج دوم حفظ شده؛ patch فوری01 معیار همان main را دارد. دو patch را بدون تطبیق middleware روی هم cherry-pick نکنید.

GoTrue واقعی Liara: `v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`؛ همان image در sandbox. Node24.19 و Next15.5.25. سایت اصلی `https://portfolio-platform-fawn.vercel.app` روی51fd066 است؛ backend مشاهده‌شده `https://62.60.191.24/liara-preview`. ده bundle ورود واقعی به Liara اشاره داشتند. Preview خودکار بدون بررسی override شاهد آزمون نیست. [مقصد عمومی](./followup-auth-evidence/public-probe.json)، [وضعیت فقط‌خواندنی Liara](./followup-auth-evidence/liara-status.json).

ورود مالک جدا بررسی شد: هشت login/session موفق مدیر در Auth و /dashboard504 در middleware ورسل در همان بازه؛ request-id مرورگر نداریم. جزئیات علت انتظار Edge هنوز معلوم نیست. [حادثه](./followup-auth-evidence/production-incident.json)، [runtime](./followup-auth-evidence/production-runtime.json). اصلاح مستقل01 آماده است؛ SMTP/SMS علت ورود password حساب موجود فرض نشدند.

## قرارداد و پروفایل

[AUTH-API-CONTRACT-v1](./AUTH-API-CONTRACT-v1.md) قرارداد قابل مصرف NEXT05/06/09 است: mobile، identity، status، session، email و admin/auth-health. account همان auth.users.id، نقش از profiles.role، session از SDK رسمی SSR است. شماره/ایمیل تایپ‌شده یا CSV مالکیت حساب دیگر را ثابت نمی‌کند. اتصال شماره نیازمند نشست قبلی و OTP واقعی phone_change است؛ تعارض شماره/هویت به بررسی جدا می‌رود. عضویت، رضایت مشاور و پرونده از این فرم استنتاج نمی‌شوند. پایان عضویت هیچ داده شخصی را حذف نمی‌کند.

پروفایل جدید نام، نام‌خانوادگی، کدملی معتبر از نظر قالب، رضایت و baseVersion دارد. AES-256-GCM با AAD شامل UUID/version و HMAC جدا؛ نسخه append با row lock و کنترل نسخه هم‌زمان. reader فقط خود فرد از auth.uid؛ writer مورد اعتماد سمت سرور. کدملی در JWT جدید، log یا LLM نیست. checksum صرفاً قالب است؛ identityMatch و phoneNationalIdMatch همیشه pending. رمز اختیاری/جدید به OTP/recovery معتبر در پنج دقیقه اخیر وابسته است؛ password-only اثبات تازه نیست. OTP ثابت، auto-confirm، userJWT دست‌ساز یا حساب/admin مصنوعی نساختیم.

حدود باقی‌مانده: plaintext قدیمی و signup قدیمی که کدملی در metadata می‌گذاشت بازنویسی نشده‌اند؛ signup Production تا اصلاح جدا بسته بماند. خواندن کلیدهای قبلی encrypt برای rotation وجود دارد؛ HMAC reindex/rotation ساخته نشده. MFA قوی مدیر، SIM recycling، بازیابی مالکیت، شماره مشترک و مدارک خارجی گیت جدا هستند؛ AUTH01…04 تمام‌شده اعلام نمی‌شوند.

## سرویس و راه‌اندازی

[راهنمای SMS](../../../services/auth-sms/README.md) و [راهنمای ایمیل](../../../services/auth-email/README.md) نام متغیرها، نصب، مبدأهای دقیق، بودجه و بازگشت را دارند. API key کاوه‌نگار تنها در سرویس SMS؛ secret امضای hook، کنترل خصوصی، fingerprint ledger و کلیدهای identity تنها سمت سرور. SMTP_PASS در GoTrue؛ هیچ مقدار secret در گزارش/Git/کلاینت نیست. mock با NODE_ENV=production یا بدون flag/sink محلی رد می‌شود.

قالب پیشنهادی arashlogin و %token با [مستند رسمی](https://kavenegar.com/rest.html) تطبیق دارد: «آرش صفری / کد ورود شما: %token / این کد را در اختیار دیگران قرار ندهید.» این شاهد تأیید قالب نیست. ثبت مرکزی2026-10-01 می‌گوید مالک وارد پنل شده، trial هفت‌روزه و موجودی۵۰٬۰۰۰ریال دارد؛ احراز حساب انجام نشده، قالب آماده اما به علت پرسش مجوز ثبت نشده است. ما پنل را مستقلاً ندیدیم. طبق DD-033 خرید/مدارک/ارسال مشتری ادامه نیافت. بودجه تجاری حدس زده نشد؛ سه سقف count/budget/cost باید صریح انتخاب شوند. رسید provider به معنی تحویل یا ورود موفق نیست.

SQLite پایدار پیش از ارسال اتمیک هزینه/count رزرو می‌کند؛ امضا ±۳۰۰ثانیه، target از sms.phone، replay موفق بدون ارسال، شکست مبهم بدون retry و با رزرو محفوظ. محدودیت phone/device/IP، فاصله۶۰ثانیه و circuit شکست/هزینه؛ قیمت provider ریال. بودجه روزانه در UTC reset می‌شود. volume و fingerprint key باید پایدار باشند؛ replica واحد و منع دور زدن ingress گیت rollout هستند.

نقص نسخه197: بدون header معتبر، native verify limiter اجرا نمی‌شود. baseline مصنوعی۴۰ کد غلط بدون429 داشت. gateway اصلاح‌شده header ورودی را overwrite می‌کند؛ با cap30، درخواست31 حتی با header جعلی429 شد. [قبل](./followup-auth-evidence/native-rate-limit.json)، [بعد](./followup-auth-evidence/native-rate-limit-fixed.json)، [کد نصب‌شده](https://github.com/supabase/auth/blob/v2.197.0/internal/api/middleware.go). Production header تنظیم نیست؛ brute-force یا تغییر آن اجرا نشد. BFF به‌تنهایی raw Auth را حفاظت نمی‌کند؛ پورت خام خصوصی و native OTP/password/refresh limits لازم‌اند.

ایمیل روی GoTrue کنونی است. لینک TokenHash در fragment /auth/email-link قرار می‌گیرد، فوراً پاک و در POST مصرف می‌شود. hash معمولی و pkce_ آزموده شدند؛ confirmation فقط مقصد محلی مجاز، recovery همیشه /reset-password. PKCE callback قبلی حفظ شد؛ query آن در ingress/APM باید redact شود. بازیابی برای known/missing/SMTP قطع پاسخ یکسان «درخواست» می‌دهد. SMTP محلی دریافت واقعی دارد، ولی ارسال خارجی نیست. فرستنده/provider نامعین؛ TLS، SPF/DKIM/DMARC، callback دقیق و چرخه خارجی پیش از فعال‌سازی لازم‌اند. [مستند SMTP](https://supabase.com/docs/guides/auth/auth-smtp). health اعلام تنظیمات/وجود secret است، نه probe ارسال واقعی.

## آزمون و شاهد

| آزمون | نتیجه |
|---|---|
| typecheck/lint/build کد05d5ae6 | PASS؛47صفحه static؛ بدون provider تولید |
| test:auth-mobile |26PASS: هفت SMS و نوزده قرارداد Auth/UI |
| test:core و test:public |1231PASS و60PASS؛ موتور مالی تغییر نکرد؛ suite کامل DB مالی تکرار نشد |
| GoTrue/API/DB مصنوعی |[11PASS](./followup-auth-evidence/sandbox-check.json): hook → OTP → SSR، نسخه، رمز، مجوز و refresh |
| مرزها |[5PASS](./followup-auth-evidence/sandbox-boundaries.json): همان UUID/رکورد، collision، expiry، قطع provider، منع private write/read/truncate/verified |
| SMTP محلی |[8PASS](./followup-auth-evidence/email-sandbox.json): لینک/SSR، replay/tamper/expiry/send429، reset/logout/login، قطع مستقل |
| Chromium موبایل |[390/1440 PASS](./followup-auth-evidence/browser.json): ورودی خطا حفظ، focus، لمس44، بدون overflow، roleuser |
| Chromium ایمیل |[390 PASS](./followup-auth-evidence/email-browser.json): fragment پاک، مقصد مجاز، forgot/reset و ورود همان UUID |
| SQL |49فایل validator،0FAIL؛ migration جدید واقعاً در DB مصنوعی اجرا شد |
| secret scan | پس از staging:897فایل،0یافته؛ inbox/MIME/credentials فقط ignored .task با ACL کاربر |
| واقعی مالک/provider/SMTP خارجی/adminvisual | BLOCKED: candidate مستقر نشده و config واقعی آماده نیست |

fixture حساب user عادی مصنوعی است؛ userJWT فقط GoTrue صادر می‌کند. expiry و outage فقط محلی‌اند. نخستین email test برای pkce_hash شکست داشت؛ [شاهد اولیه](./followup-auth-evidence/email-sandbox-before-pkce-fix.json) حفظ شد. CSP برای test ضعیف نشد. تصویر [پروفایل390](./followup-auth-evidence/private-profile-empty-390.png)، [1440](./followup-auth-evidence/private-profile-empty-1440.png)، [خطای OTP](./followup-auth-evidence/mobile-invalid-390.png)، [بازیابی](./followup-auth-evidence/email-recovery-390.png) بدون credential است. مرورگر admin و12تبFX مالک مشاهده نشد؛ admin مصنوعی نساختیم.

بازبینی محلی: `http://127.0.0.1:8792/login/mobile` با برچسب mock؛ حساب واقعی مالک در آن نیست. بازتولید: scripts/testing/auth-sandbox.mjs سپس auth-sandbox-check.mjs، auth-sandbox-boundaries.mjs، auth-email-check.mjs و auth-browser-check/auth-email-browser-check. OTP آزمایش در inbox خصوصی است و در گزارش نیست. Docker فقط loopback و network/volume اختصاصی؛ داده DEV07/shared دستکاری نشد.

## migration و بازگشت

فایل `supabase/migrations/20261001083215_auth_private_identity_versions.sql`؛ SHA256 `7969634E0B0D564F97E5A43EAE823441182FBB42AA1A2D1728D81B142BF08251`. timestamp جدید با phase37 برخورد ندارد. schema خصوصی افزایشی به UUID موجود وصل است؛ user/grant موازی، حذف جدول شناخته‌شده یا بازنویسی حساب وجود ندارد. **shared/Production اجرا نشد.** نصب به review، backup و کلید writer امن وابسته است؛ تست Auth DB مصنوعی جای تأیید سازگاری کل DB مرحله37 نیست.

بازگشت: mobile/fragment flags و hook خاموش؛ templates/SMTP به تنظیم بررسی‌شده قبلی؛ email/password و PKCE باقی بمانند. اپ به base مجاز بازگردد. UUID، داده شخصی، نسخه هویت و کلید encrypt حذف نشوند؛ down مخرب یا restore قدیمی روی write جدید نداریم. بازگشت01 هیچ تغییر DB ندارد.

## ابزار و اقدام بعدی

مهارت‌های واقعاً استفاده‌شده: Supabase برای canonical SDK/RLS/hook؛ Next.js برای App Router/runtime؛ agent-browser برای Chromium؛ email برای SMTP/callback؛ systematic-debugging و verification-before-completion برای شاهد و آزمون تازه. ابزار Git، Node/TS/ESLint/Next، Docker/Postgres/GoTrue/PostgREST، SupabaseCLI برای نام migration، SSH/psql فقط‌خواندنی، Vercel connector، web primary docs و SQL/secret validators. وجود اسکیل طراحی به معنی اجرای ممیزی بصری کامل این بسته نیست.

گیت بعدی review دو PR و نصب sandbox مجاز است. طبق DD-033 از مالک فعلاً خرید/مدارک SMS نمی‌خواهیم. فعال‌سازی واقعی به AUTH-00 روی URL اصلی، فرستنده/SMTP معتبر، قالب SMS تأییدشده و secret امن/بودجه صریح، native limits، MFA/recovery/SIM policy و review migration/rollback وابسته است. credential واقعی فقط توسط خود مالک؛ secret در چت لازم نیست. هیچ policy تجاری یا signup/verified رسمی Production فعال نشد.

## رکورد تحویل

[PR180](https://github.com/safariarash7777-source/portfolio-platform/pull/180)، draft روی7cb030c؛ head هنگام ایجاد `cee76cf454d3c494c3df6dd21fc55a5f1217484d`. SHA کد05d5ae6 ثابت است؛ head جاری پس از commit مستندات از PR خوانده شود. اصلاح فوری [PR179](https://github.com/safariarash7777-source/portfolio-platform/pull/179) رویmain مستقل است.

در snapshot همین head، Dependencies، Secret/SQL و isolated-db موفق؛ Typecheck/Lint/Tests/Build و Database RLS درحال اجرا؛ Supabase Preview skipped بودند. Vercel Preview status موفق بود اما مبدأ Auth و ورود واقعی آن آزموده نشده‌اند. commit مستندات CI تازه دارد. Preview محلی8792، migration مصنوعی، محیط مشترک و Production مستقل گزارش شده‌اند؛ موفقیت build شاهد ارسال واقعی یا پذیرش مالک نیست.
