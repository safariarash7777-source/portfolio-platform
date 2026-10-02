# P01 — ادامهٔ ثبت‌نام و بازیابی ایمیل؛ 2026-10-02

**کد مستقل آماده؛ پذیرش UI/provider واقعی OPEN.** PR208 ثابت ماند. این ادامه روی PR211@`04651152ed3828c52a0dfa36eef57286f899bef7` ساخته شد؛ parent آن208@`f0e002bc7c9f22f0425adc41b8b6b81c3a1fcc11` و مبنای محصول195@`31c44ab635b672b589b7833bcbc78b41d36f1e75` است. commitهای کد جدید `c1bf80c`، `ac8a6012168cb63ccc46562ac28c8b271f79dbc2` و اصلاح امضای Next route در **`639ee3420ee071352086eb81b83b005da14e30d8`**؛ تغییرهای211 دوباره cherry-pick نشوند. main51fd066 و199@e1c46e3 پیش از ساخت تطبیق شدند. P00 مالک manifest، نصب و منابع محیط است؛ Auth/API/callback و این فرم‌های حساب متعلق بهP01‌اند.

## نقص مشخص و اصلاح

| پیش از اصلاح | شاهد کد در208 | رفتار جدید |
|---|---|---|
|ثبت‌نام ملی/شماره را به user_metadata می‌داد|register/page.tsx signUp options.data national_id/phone؛ اطلاعات ممکن است وارد JWT شود|نام/ایمیل/رمز فقط؛ BFF موجود `/api/auth/email`، native signUp و profile trigger موجود؛ keyهای phone/national_id/role/data رد می‌شوند |
|فرم گفت «ثبت‌نام موفق؛ ایمیل ارسال شد» بدون delivery proof|register موفقیت SDK را ارسال قطعی می‌نامید|receipt شرطی `confirmation_requested`؛ duplicate شناخته‌شده همان receipt؛ حساب≠عضویت، credential/grant قدیمی تغییر نمی‌کند |
|activation ثبت‌نام با تنظیمات تأیید نامعلوم|legacy client signUp مستقیم؛ وضعیت واقعی GoTrue سنجیده نمی‌شد|flag جدید server-only و read settings واقعی؛ ایمیل فعال، signup فعال، auto-confirm خاموش لازم؛ UNKNOWN/خطا503 قبل signUp |
|هر failure بررسی نشست، «لینک نامعتبر یا منقضی» می‌شد|reset effect فقط data.authenticated را می‌خواند؛ catch=false|checking/ready/proof_required/unavailable جدا؛503/JSON نامعتبر به unavailable و retry؛ password-only یا proof قدیمی فرم مجاز نمی‌گیرد |
|next از بازیابی گم می‌شد|login→forgot بدونnext؛ recover callback fixed؛ template recovery بدونRedirectTo؛ reset→dashboard|next محلی allowlisted از درخواست→template fragment/PKCE→reset→مقصد اصلی؛ external/malformed fallback؛ حتی next خراب پس از verify، لینک مصرف‌شده را خطا نمی‌کند |
|نام cookie در callback با دموی جدید فرق داشت|211 طبق درخواست محدود فقط سه factory را تغییر داد|callback چهارم هم از نام اختیاری واحد مصرف می‌کند؛ default همان قبلی |
|JSON malformed503 و content-length تنها سقف ورودی بود|email route request.json مستقیم|body stream واقعی حداکثر4096byte و cancelِ اضافه؛ malformed400، oversized413 قبل Auth؛ Origin قبلی پابرجا |

نام/ایمیل/رمز به همان Auth بومی می‌روند؛ user/grant/table جدید ساخته نشده. کد ملی/شماره به private identity API موجود، پس از proofهای خودش تعلق دارد؛ SMS تجاری خاموش و identity رسمی pending است. دادهٔ metadata قدیمی حذف یا migrate نشده؛ پاک‌سازی گذشته بستهٔ جدا می‌خواهد. ورود password ایمیلی، UUID و پرونده‌ها حفظ شده‌اند. role از profile trigger/DB و grant از دورهٔ موجود می‌آید، نه metadata یا confirmation receipt.

فایل‌های پوستهٔ اصلی، globals، layout، Navbar/Footer، font و199 تغییر نکردند. کارت و رنگ/فونت فرم‌های موجود حفظ شدند؛ ورودی‌های خصوصی از ثبت‌نام عمومی حذف شدند. focus کنترل رمز قابل دسترسی، autocomplete و طول مجاز، role alert، Suspense برای searchParams و abort بررسیِ قدیمی رعایت شدند. بررسی React طبق مهارت react-best-practices انجام شد؛ این بازبینی کد است، نه مشاهدهٔ صفحه در موبایل/دسکتاپ.

## قرارداد قابل نصب

- `POST /api/auth/email` action signup: fullName/email/password12…128/next اختیاری؛ metadata تنها full_name. `AUTH_EMAIL_ALLOW_SIGNUP` پیش‌فرض خاموش؛ همچنین `AUTH_EMAIL_ENABLED=true` و GoTrue `/auth/v1/settings` با سه Boolean لازم. یک GET Auth اضافی در هر درخواست signup مجاز، timeout8s/no-store/no retry؛ صفر درخواست BrsApi. این بررسی، readinessِSMTP یا قفل atomic تنظیمات GoTrue نیست؛ اپراتور تغییر تنظیمات را در rollout کنترل کند.
- Native `/signup` هنوز endpoint مستقل GoTrue است؛ flag برنامه یا کوچک‌شدن فرم، آن endpoint را نمی‌بندد. `GOTRUE_DISABLE_SIGNUP`، provider/auto-confirm و trusted ingress/rate limits باید در مقصد مجاز واقعاً نصب و آزموده شوند. در Production فعال نشوند. duplicate code شناخته‌شده400 همان receipt200 را می‌دهد؛ receipt موفقیت delivery یا عضویت نیست.
- `GET /api/auth/status?scope=email-recovery`: getUser + getClaims معتبر؛ authenticated/recovery ready یا proof_required فقط؛ هیچ role/UUID/AMR خام صادر نمی‌کند و profile خوانده نمی‌شود. getUser/claims اختلال503؛ claims ردشده401؛ anonymous همان200authenticated=false. GET قبلی بدونscope محفوظ است.
- set-password علاوه بر نشست و confirmedemail، proof روشotp/recovery در بازه `now-300 < timestamp <= now` می‌خواهد. proof آینده/قدیمی/password-only رد؛ readinessUI جای guardAPI نیست. native Auth رمز را ذخیره می‌کند؛ UI اطلاعات را در شکست نگه می‌دارد.
- recovery template اکنون RedirectTo را درfragment حمل می‌کند؛ TokenHash همچنان fragment است و قبل ناوبری حذف می‌شود. template قدیمی بدونRedirectTo معتبر می‌ماند و بهdashboard برمی‌گردد. ورود/recovery قدیمی PKCE محفوظ؛ queryهای credential در ingress/APM باید redact شوند.
- `NEXT_PUBLIC_SUPABASE_COOKIE_NAME` باید در چهار factory/browser build/server یکی باشد. نام دموی اعلام‌شده P00 غیرمحرمانه است؛ این عامل مقدار env را تنظیم نکرد. unset رفتار default را نگه می‌دارد. port به‌تنهایی isolation کوکی نیست.

[قرارداد Auth v1](AUTH-API-CONTRACT-v1.md) و [راهنمای دقیق SMTP/قالب](../../../services/auth-email/README.md) در همین branch به‌روز شدند؛ Blueprint/COMMAND و manifest مشترک دست نخوردند. contractVersion/schema/payment/duration policy تازه ایجاد نشد.

## تطبیق ماتریس عضویت با کد موجود

| حالت | پیاده‌سازی واقعی حاضر؛ بدون انتخاب سیاست تجاری |
|---|---|
|ثبت‌نام موفق|فقط auth.users contact confirmed مطابق import contact؛ `seasonal_claim_registration`؛ پیش از آن signup receipt حق دوره نمی‌دهد |
|رسید تکراری|source/external ID و batch commit؛ claim مجدد grantRef قبلی، شمار grant ثابت؛ rowduplicate409 و renew خودکار ندارد |
|دو دوره|`seasonal_module_access(p_module,p_cohort)`؛ scope منابع دقیق؛ union ماژول مجاز، انتقال منبعC1 بهC2 نیست؛ legacyfull گسترش نمی‌یابد |
|دیرهنگام|fixture policyِcohort-window انتها را همانcohort نگه می‌دارد؛ configpolicy دیگر هنوز D-034 تصمیم باز؛ claim اختیار تمدید ندارد |
|منقضی|بازه شروع inclusive و انتها exclusive؛ ارزیابی module/resource رد؛ داده شخصی retained |
|لغو/بازپرداخت|revoke تاریخچه و دلیل؛ درخواست بعدی denied؛ cohortcancel و commandidempotency/fingerprint؛ signedURL قبلی تاTTL موجود، حذف instant ادعا نشود |
|حساب نامرتبط|unverified/mismatched contact، anonymous یا userId جعلی به403/401/422؛ matchedUser ازauth.uid نهbody |
|مشاوره مستقل|مشاوره با consent جدا؛ renew/grant دورهٔ دیگر لازم؛ نقش/مشاوره، منبع دوره نمی‌دهد |

شاهد source: migration `20260930182629_seasonal_course_membership.sql`، `lib/seasonal/seasonal.integration.test.ts` (claim retry، دوcohort، late، expiry/cancel، manualrenew/consultation) و `lib/seasonal/seasonal.test.ts` (Gregorian3months در برابر90روز، Tehran و مرزماه). این نوبت SQL مشترک/سیاست/price تغییر یا نصب نشد. [ماتریس قبلی P01](p01-session-contract/ACCESS-MATRIX.csv) محفوظ است؛ آزمون native در candidate جدید جدا لازم است. P01 نمی‌گوید همهٔ فید/دادهٔ قدیمی مشتری پس از انقضا قابل مشاهده‌اند؛ تصمیم تجاری سابقه هنوز باز است.

## شاهد آزمون و محدودیت محیط

**محلی:**144PASS،0FAIL،0skip؛97 تست handler/SDK/SMS/resource شامل33test جدید email،38regression نشست،3cookie،8Auth موجود،8resource موجود و7SMS؛47تست مرتبطTS. typecheck، lint باصفرwarning، scansecrets و diffcheck PASS. Node24.19/Next15.5.25/SSR0.10.2/AuthJs2.105.1، dependency/schema جدید صفر. VM handler واقعی، canned transport و SDK واقعی برای cookieOptions؛ هیچ server/account/DB/provider call زنده در این آزمون‌ها نیست. ثبت تست از script موجود Auth با import انجام شد؛ package/lock/workflow تغییر نکرد.

```sh
node --test scripts/testing/auth-session-handler.test.mjs scripts/testing/seasonal-resource-handler.test.mjs services/auth-sms/core.test.mjs
node node_modules/tsx/dist/cli.mjs --test lib/auth/mobile.test.ts lib/auth/email.test.ts lib/seasonal/seasonal.test.ts lib/access-standing.test.ts components/account/returnPath.test.ts components/account/loginFlow.test.ts lib/member/home.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
```

**build محلی NOT_RUN**: درخواست P00 منع build سنگین، لپ‌تاپ حدود1GiB حافظه آزاد از8GiB داشت؛ build نهایی باید CI همانhead را بگذراند. builtِ208 یا typecheck به‌معنی build این کد نیست. نتیجه CI در PR exacthead سنجیده شود.

CI اولیه215@f1eb9f8، run37039326938: typecheck/lint/test وDBRLS/dependencies/secretSQL PASS؛ Build FAIL به‌علت `GET(request?:Request)` که با validator مسیرNext سازگار نبود.639ee34 امضا را بهGET(request:Request) اصلاح کرد؛ رفتارJS آن ثابت است. typecheck تازه گذشت؛ CI تازه باید نصب‌پذیری را تأیید کند، شکست اولیه به سلامتAuth یاprovider نسبت داده نشود.

**candidate ثانویه P00**: اپراتور گزارش داد0ed89c2 درcandidate با `65c215b801958c32599fafb0f6e331dd5ce3d181` مصرف و49Auth/typecheck گذشت؛ دموی8444 password-only و ready-to-launch بود. این ادامهٔ email روی آن نصب نشده؛ PKCE/provider acceptance از آن استنتاج نمی‌شود.1958443 مستقل باقی است.

**دسترسی واقعی این عامل:** healthِ8444 از لپ‌تاپ با TLS معمول وtimeout10s به TaskCanceledException رسید، HTTPstatus نامعلوم. سپس یک تلاش عمومی IAB برای `https://62.60.191.24:8444/login?next=%2Fadmin%2Ffx` با `net::ERR_BLOCKED_BY_CLIENT` پیش از صفحه مواجه شد؛ تب فقطabout:blank ماند و بسته شد. هیچ credential/OTP منتقل نشد. علت شبکه/کلاینت یا سلامت server از این دو شاهد قطعی نیست. provider/auth/role هنوز آزموده نشده، تصویر محصول ثبت نشده؛ دیدن کد را مشاهده UI نمی‌نامیم. تب/Chrome/HTTP/tunnel یاstartup199 برای دورزدن این مانع استفاده نشد.

## تنظیم لازم provider و مرحلهٔ بعد

SMTP واقعی UNKNOWN/NOT_ACTIVATED؛ demo بدون ایمیل بیرونی، شاهد delivery نیست. اپراتور در محیط مجاز باید نام host/port و TLS واقعیprovider، sender/domain مجاز، SPF/DKIM وDMARC، `GOTRUE_SMTP_HOST/PORT/USER/PASS/ADMIN_EMAIL/SENDER_NAME`، rate/maxfrequency/OTPexpiry، `GOTRUE_SMTP_LOGGING_ENABLED=false`، `GOTRUE_MAILER_AUTOCONFIRM=false` وtemplateهایconfirmation/recovery را نصب کند. username/password/key تنها در secret manager؛ هیچ مقدار در چت/PR نیاید. provider/مدارک/قرارداد/خرید با مالک و مبلغ مشخص؛ خرید انجام نشد.

`GOTRUE_SITE_URL` و `GOTRUE_URI_ALLOW_LIST` و `NEXT_PUBLIC_APP_URL` باید دقیقاً frontendِcandidate باشند؛ بسته settings/SDK/server به همان backendساختگی و public-key مربوط برسد. header rate-limit درtrustedingress واقعاً overwrite و rawAuthport خصوصی باشد. برای signup آزمون `AUTH_EMAIL_ALLOW_SIGNUP=true` فقط درsandbox مجاز پس از نصبconfirmation/no-autoconfirm؛ legacypassword بهآن وابسته نیست. receipt ثبت‌نام/بازیابی یاSMTPقبول‌شده، تحویل و مصرف لینک نیست.

پس از دسترسی مجاز وcandidate شامل همینcode: A/B با credential مصنوعی امن، login→role→refresh/reload→logout/relogin، redirect و/admin/fx؛ سپس signupemail→لینک واقعی→SSR/UUID/profilerole وclaimرسید؛ recovery→مصرف→proofready→ذخیره→loginرمزجدید، انقضا/replay/tampering/provider قطع/quota را بازبین مستقل اجرا کند. مشترینامرتبط privategrant نگیرد؛195cookie در8444 خوانده نشود. وضعیت فعلی همه این گیت‌ها **OPEN** است. تغییر credential مالک شخصی با خودش؛ اصل URLProduction و loginمالک جداOPEN، ایمیلlegacy حذف نشود.

Rollback: برایcandidate بهbuildپذیرفتهٔقبلی برگردید؛ signupflag خاموش، template/envsnapshot هماهنگ باهمانSHA؛ حذف UUID/profile/ledger/assets یا resetDB مجاز نیست. تغییر metadataقدیمی، Production rollout/migration/merge، SMSتجاری و قیمت/مدت جدید انجام نشد.

ابزار: PowerShell/Git/Node/VM/SDK، CI، مرورگر CUA فقط navigation عمومی، و خواندن artifactهایP00. مهارت‌هایSupabase/Next و Reactbestpractices استفاده شدند؛ دستور nativeWindows computer-use خوانده شد ولی nativeapp اجرا نشد. مبناهای اولیه: [Supabase signUp/PKCE](https://supabase.com/docs/reference/javascript/auth-signup)، [password/recovery و SMTP](https://supabase.com/docs/guides/auth/passwords)، [settings دقیقGoTrue2.197](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/settings.go). هیچ secret/hash/UUIDمالک/اطلاعات خصوصی در شاهد نیست.
