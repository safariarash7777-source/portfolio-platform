# P01 — خواندن مستقل پروفایل، 2026-10-03

وضعیت: **اصلاح محدود ساخته و آزموده در شاخهٔ ایزوله؛ محیط‌ها و Production تغییر نکرده‌اند.** PR/CI/SHA نهایی در رکورد پایین اضافه می‌شود. این تکمیل، فعال‌سازیSMS، حل ورود مالک یا پذیرشNative219 نیست.

## مشکل و رفتار تازه

رویcfa/8444، GET `/api/auth/identity` قبل از بررسی نشست، به‌علت خاموش‌بودن مسیر موبایل503 می‌داد. خانه عضو آن را خطای عمومی پروفایل نشان می‌داد؛ جدول‌ها وRPC موجود بودند. شاهد مستقل03اکتبر در `docs/ops/full-audit-20261003/P01-PROFILE-TRIAGE.md` پوشه مشترک محفوظ است.

اکنون GET ابتدا همان `getUser` واقعی سرور و تفکیک401/503 موجود را مصرف می‌کند، سپس قابلیت مستقل server-only را بررسی می‌کند. `AUTH_PROFILE_READ_ENABLED=true` فقط خواندن را فعال می‌کند؛ unset/false/مقدار نامعتبر خاموش است. روشن‌کردنSMS یا provider لازم نیست. POST، phoneconfirmed، same-origin، writer و گیت AUTH_MOBILE_ENABLED قبلی عیناً حفظ شده‌اند.

| شرط | API / کارت |
|---|---|
| نشست غایب یا ردشده |401 / ورود و بازگشت |
| اختلالAuth یا پیکربندیclient |503عمومی / unavailable؛ هیچRPCخصوصی |
| کاربر احرازشده، قابلیت خواندن خاموش |503 باcode=profile_disabled / متن صریح «پروفایل خصوصی در این محیط فعال نیست» |
| خواندن روشن، کلیدهای غایب/نامعتبر |503عمومی / unavailable؛ هیچRPC و هیچادعایincomplete/recorded |
| خواندن روشن، کلید معتبر، RPCموفقnull |200profile=null / incomplete |
| رکورد خود فرد بانسخه/ساختار/decryptمعتبر |200 / recorded؛ هویت رسمی همچنانpending |
| خطایRPC، رکورد ناسازگار، کلید قدیمی ناموجود یاAAD حساب دیگر |503عمومی / unavailable؛ بدونprofileدرخطا |

کارت ازDTO موفق `profileWriteEnabled` را فقط برای مقصد ویرایش مصرف می‌کند. وقتی خواندن فعال و موبایل خاموش است، وضعیت دیده می‌شود و لینک مسیر تکمیلِ غیرفعال نمایش داده نمی‌شود. قرارداد قدیمی فاقداینفیلد، فعال‌بودن ویرایش را اثبات نمی‌کند و UIآن راfalse می‌گیرد. تغییر صرفاً حالت/متن همین کارت است؛ globals/Navbar/صفحهlogin بازطراحی نشدند.

## هویت، مجوز و داده

مدل حساب همانUUID canonical است؛ حساب یا grant تازه ساخته نشده. GET از clientکوکی‌دار باRPCبی‌پارامتر `auth_read_private_identity` استفاده می‌کند؛ تابع موجود فقط `user_id=auth.uid()` را می‌خواند. هیچ userId ازquery/body پذیرفته نمی‌شود؛ adminclient یا service-role برایGET به‌کار نرفته است. decrypt باAAD همان user.id/keyVersion است و رکورد رمز‌شدهٔ حساب دیگر را نمی‌پذیرد. دادهٔ پروفایل فقط درAPIخصوصیِ فرد حاضر است؛ projection خانه نام/کدملی را دور می‌ریزد.

کلیدهای موجود یا migration تغییر نکردند. helperpreflight فقط readinessboolean ازmaterial موجود می‌دهد و کلید را صادر نمی‌کند؛ AES-GCM/HMAC/rotation و UUID/ایمیل/نسخه‌هایappend موجود حفظ شده‌اند. انتخاب سخت‌گیرانه: حتیRPCnull بدونmaterial معتبر، profile ناقص محسوب نمی‌شود. این سیاست از نمایش اشتباه readiness جلوگیری می‌کند؛ فعال‌کردنreadflag بدونkey-ready پیامunavailable را حفظ خواهد کرد.

## نسخه و مالکیت

پایه دقیق **`2e44dc1d7008acf0b0c76e8679238514f4f7bab2`**، head فعلیPR219 هنگام شروع؛ baseآنcfa4e211 بود. main51fd066 مستقلاً تطبیق می‌شود؛ تغییرAuth219 بهProduction منتقل نشده. شاخهٔ تازه `codex/p01-profile-read-20261003` درcheckout تمیز و متعلق بهP01 (`portfolio-p01-origin-harness`) ساخته شد. شاخه/کانتینر/DB/پذیرش جاریP00 دست‌نخورده است.

مالک این diff: route هویت، helper قابلیت خواندن و preflight، adapter و کارت عضو، تست‌ها، .env.example و قرارداد Auth متعلق به P01. middleware، callback، login، mobile POST، SQL، package/lock و workflow تغییر ندارند. P00 می‌تواند پس از پذیرش جاری، فقط commit این بسته را بررسی کند؛ commitهای بزرگ219 یا شواهدNative دیگر به‌عنوان تحویل این patch نقل نمی‌شوند.

## آزمون و حد شاهد

- 26 آزمون تازه: handler واقعی GET/POST، AES-GCM واقعی و Supabase SDK نصب‌شده با transport ساختگی؛ null، رکورد خود، foreign AAD، query حساب دیگر، ناشناس، غیرفعال، کلید ناقص، خطای Auth/RPC، نسخه نامعتبر و حفظ گیت POST.
- 2 مورد از آن‌ها markup واقعی React کارت را برای disabled، read-only و edit-enabled بررسی می‌کنند؛ این مشاهده بصری Native نیست.
- 22 آزمون member/home با adapter و قرارداد نوشتن: PASS.
- suite کامل auth-session-handler: **124 PASS**، شامل همان 26 آزمون تازه؛ این دو شمار جمع‌شدنی نیستند.
- Typecheck بدون incremental با سقف heap768MiB و lint فایل‌های TypeScript تغییرکرده: PASS. build سنگین محلی انجام نشد؛ build به CI واگذار شد.

Auth/getUser درharness به‌صورتfixture است؛ RPC ازSDKواقعی باtransportساختگی عبور می‌کند؛ کلیدهای آزمون تصادفی و فقط درحافظه‌اند. این آزمون، نشست واقعیSSR، ارسالprovider یا permissionدرDBزنده نیست. SQL/RLSتغییر ندارد؛ نیاز به پذیرش مستقل DB/API/مرورگر نسخهٔ تازه پس از نصب مجاز باقی است. خطای نخست تست، مقایسه prototype بینVM وhost بود؛ assertion باprojectionJSON اصلاح شد و رفتار محصول تغییر نکرد.

## تحویل بهP00 و بازگشت

پیش از نصب مجاز آینده: readflagراصریح انتخاب کنید، readinessکلیدهایexisting رابدوننمایشvalue تأیید کنید، سپس null/own/foreign/unauth/serviceerror وmobile-off را درهمانSHA آزمون کنید. صرف وجودRPC readinessکامل نیست. براینصباینpatch هیچ migration تازه لازم نیست؛ تغییرتنظیمکلید یا env روی8444/8445/Production توسطP01 انجام نشده. defaultخاموش نیاز بهتنظیمصریح دارد؛ sourceخوانده‌شدهٔ قبلی که باmobile=true پروفایل می‌خواند، پس ازنصباینpatch بایدreadflagصریح خودش را داشته باشد. این requirementباید پیش ازrollout بررسی شود.

بازگشت source باrevertcommit محدود اینPR؛ DB/دارایی/مشاوره/ایمیل/UUID تغییر نکرده وrollbackDB لازم نیست. نمونه فعلیcfa، Native219 و Production همان نسخه‌های پیشین باقی‌اند. گزارش بهصورتartifact مشترک تحویل می‌شود؛ هیچپیامبهچتدیگر یا providerارسال نشده.

مهارتSupabase و guidanceNext موجود؛ ابزارGit، Node/TypeScript/ESLint، ReactSSR، installedSupabaseSDK وGitHubCI. [مستندgetUser](https://supabase.com/docs/reference/javascript/auth-getuser) و [RPC](https://supabase.com/docs/reference/javascript/rpc) بازخوانی شد؛ changelog.md باPowerShell خوانده شد پس ازunsupported-content-type درابزاروب. تغییرAPIنسخه/وابستگی، gatewayیاSQL لازم نشد. credential/key/hash/OTP/token/cookieواقعی درکد/گزارش خواندهیاافشا نشد.

## رکورد تحویل

[Draft PR221](https://github.com/safariarash7777-source/portfolio-platform/pull/221)، روی شاخهٔ P00 `codex/p00-auth-next-20261002@2e44dc1d7008acf0b0c76e8679238514f4f7bab2`. SHA کد آزموده‌شده **`b9bf993d10902f1b23d8e4319d56121b30137b16`** است؛ commit مستندات ممکن است head را تغییر دهد. CI اولیه37112497268 هنگام ثبت این رکورد in_progress بود؛ Native این بسته **NOT_RUN** است. نتیجه تازهٔ CI باید با head جاری تطبیق شود؛ ساخته، CI، نصب و پذیرش چهار وضعیت مستقل‌اند.
