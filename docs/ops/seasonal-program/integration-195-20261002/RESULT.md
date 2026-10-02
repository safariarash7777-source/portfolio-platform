# پذیرش هدفمند مصرف‌کنندگان195 و رفع مانع CI

> **مرحلهٔ محیط پس از درخواست «انجام بده»:** [پیش‌بررسی و بستهٔ آمادهٔ اجرا](ENVIRONMENT-HANDOFF.md). PreviewهمانSHA موجود است، امابهSupabaseقدیمی وصل است؛ نبودfrontend رفع ونیازbackend مستقل دقیقاًثبت شد.۱۸hashschema تأیید،۰migrationاجرا،۰ورودواقعی. نتیجهٔزیر مربوطبهپذیرش مصرف‌کننده وCIاست؛ بهورود/Production تعمیمداده نشود.

۲ اکتبر۲۰۲۶؛ ثبت شاهد در 14:07:26 تهران /10:37:26UTC. بازبین FOLLOWUP06، سازندهٔ اصلاح N10 یا fixture197 نیست. [شواهد ساختاری](EVIDENCE.json) و [آزمون قابل‌بازتولید](targeted-consumers.test.mjs) همراه‌اند. این تحویل کد محصول، سرویس یا Production را تغییر نمی‌دهد.

## نسخه و حضور اصلاح

GitHub مستقلاً تأیید کرد: PR195، OPEN/DRAFT، base191@`a83f71d922a93ec2bfb398a306d7b282ce1db81f` و head `31c44ab635b672b589b7833bcbc78b41d36f1e75`. پایه191 واقعاً ancestor این head است؛ شاخهٔ ترکیبی تازه لازم نیست.

نکتهٔ ancestry: commit منبع197 یعنی `6d4bb58de67f360c5f24774b38a92436c9d7aa00` خودش ancestor195 نیست؛ مالک195 آن را قبلاً به‌شکل `6cba6c1494e7da403b83a08e52b56ad93c56010d` مصرف کرده است. commit مصرف‌شده ancestor195، stable patch-id هر دو `5fb826880ca9d8545b86ece057a576bd2adffede` و blob آزمون feed هر دو `25c62357e3831c0bf79925b7e3c8efab1f53cfe2` است. هیچ cherry-pick یا شاخهٔ جدید در این بررسی ساخته نشد.

هفت blob مالی، شامل package.json و آزمون قرارداد، دقیقاً با runtime `fa4b84fd126db70efae6a1b068a6a0e2a98bf3d5` برابرند؛ diff مستقیم خروجی ندارد. checkout مالک پیش و پس از آزمون پاک بود. تفاوت نسبت به head شکست‌خورده a1bf054 فقط آزمون feed و دو گزارش است؛ runtime/schema/Auth تغییر نکرده‌اند.

## CI نهایی و علت شکست قبلی

[CI36988719285](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36988719285) روی **31c44ab کامل بالا**: هر پنج job Dependencies، Quality، Secret/SQL، Database RLS/Integrity وCI Gate موفق. [seasonal36988718928](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36988718928) نیز روی همان SHA موفق است. metadata SHA و نتیجهٔ run/jobها با GitHub GET خوانده شد؛ CI دوباره dispatch نشد.

شکست run36984900710 سابقهٔ واقعی head a1bf054 باقی می‌ماند. بازبینی diff197 و گزارش مالک feed تأیید می‌کند fixture تاریخ ثابت اول اکتبر داشت؛ زمان فرمان ready/انتشارهای قبلی از آن عبور می‌کرد. اصلاح با یک anchor در DB، بعد از بزرگ‌ترین clock/command و درج immutable هم‌زمان، فاصلهٔ یک میکروثانیه و تمام شروط UUID/cursor را حفظ کرده است. آزمون انتشارِ از پیش موجود در آینده نیز اضافه شده. runtime، مجوز، migration یا شروط پذیرش ضعیف نشده‌اند. بازتولید DB و negative control clock-only متعلق به مالک197 است؛ CI نسخهٔ نهایی مستقلاً تأیید شد و این بازبین DB/service را دوباره نساخت.

## بررسی تازهٔ هدفمند؛۶ PASS، صفر FAIL/skip

بررسی مستقل196 فقط parser/engine در چهار case frozen را پوشش می‌داد؛ بررسی حاضر مصرف‌کننده‌های پایین‌دست را با ورودی‌های جدیدِ صرفاً ساختگی می‌سنجد. suite کامل core/calc، هفت قرارداد N10، چهار replay196 یا۳۹ اجرای191 دوباره اجرا نشدند.

| شناسه | نتیجه | مسیر و شاهد مشاهده‌شده |
|---|---|---|
|IC195-01|PASS|deriveN10: ناخالص جاری null، قبلی موجود؛ روایت مقایسه حذف، حاشیه خالص مستقل محفوظ، JSON همچنان null|
|IC195-02|PASS|ناخالص قبلی null، جاری موجود؛ روایت بهبود ساختگی تولید نمی‌شود|
|IC195-03|PASS|mask/score: غایب «نامشخص» و بدون driver ناخالص؛ صفر مشاهده‌شده همچنان driver و باند عددی معتبر دارد|
|IC195-04|PASS|زنجیره۳/۶/۹/۱۲ با فقدان ناخالص۶ماهه: دو فصل متأثر null، فصل بعد قابل‌محاسبه، TTM خالص مستقل محفوظ، ورودی تغییر نمی‌کند|
|IC195-05|PASS|تابع واقعی کامپوننت سالانه: ردیف ناخالص مجهول از داده نمودار حذف، صفر واقعی و داده خالص حفظ می‌شوند|
|IC195-06|PASS|کامپوننت واقعی فصلی: null و صفر به داده نمودار منتقل، connectNulls=false؛ tooltip برای null خط تیره و برای صفر رقم صفر می‌دهد|

روش دو بررسی کامپوننت: source همان head از دیسک خوانده و با TypeScript/React واقعی به element tree تبدیل شد؛ برای دسترسی به تابع private سالانه فقط export در حافظه اضافه شد. داده و props Recharts و تابع formatter واقعی بررسی شدند. **این پذیرش قرارداد داده/نمایش است؛ مرورگر، پیکسل، hydration یا رابط تعاملی روی deployment نیست.** هیچ mock از نتایج مالی یا copy اصلاح‌شدهٔ function body ساخته نشد.

اجرای مجاز و آفلاین از checkout195 با وابستگی‌های موجود:

```powershell
$env:REVIEWED_CHECKOUT = (Get-Location).Path
node node_modules/tsx/dist/cli.mjs --test 'C:/Users/Asus/Documents/ChatGPT/توسعه سایت/portfolio-product-direction/docs/ops/seasonal-program/integration-195-20261002/targeted-consumers.test.mjs'
```

نتیجهٔ مستقیم process: tests6، pass6، fail0، skipped0، exit0؛ duration11853.8364ms. دادهٔ واقعی، شبکه/provider، SQL، حساب/JWT، سرویس یا نمودار مرورگری استفاده نشد. این script در بستهٔ مدیریت نگهداری می‌شود، به PR195 یا فایل‌های مالک چیزی اضافه نشده است.

## بستهٔ آماده و اقدام اپراتور

**خود PR195@31c44ab کوچک‌ترین candidate موجود است:**191 را در ancestry دارد، اصلاح مالیfa4b84fd و patch197 را قبلاً دارد، CI همان head سبز است و شش بررسی مصرف‌کنندهٔ مستقل حاضر نیز موفق‌اند. بستهٔ ترکیبی/PR اجرایی جدید نسازید. شاهد196 فقط چهار case همان runtime باقی می‌ماند؛۳۹ شاهد191 به۱۹۵ نسبت داده نشده‌اند. این نتیجه رفع Auth، داده واقعی یا Production نیست.

مسئول بعدی اپراتور محیط با مالک Auth است. او باید origin HTTPS **sandbox ساختگی مجاز** و شناسه غیرمحرمانهٔ آن را معرفی کند؛ deployment همان31c44ab، اتصال browser/server به همان backend، زوج URL/anon، کلید server فقط در مسیر امن، CSP/CORS، SiteURL/callback، schema/grants و private Storage را تطبیق دهد. وضعیت نصب از دفتر sandbox191 بررسی شود؛ نصب محیط مشترک یا تغییر سرویس در این مأموریت مجاز نیست. DB Preview لیارا بازیابی‌شده از بکاپ واقعی مقصد این آزمون نیست.

پس از آماده‌شدن محیط در گام جداگانهٔ مجاز: بازبین مستقل ورود واقعی، نقش، refresh، خروج/ورود و browser مسیرهای متأثر را بررسی کند؛ آرش credential را فقط در UI خودش وارد کند. زمان/request-id پاک‌سازی‌شده در صورت خطا برای trace به مالک Auth داده شود؛ رمز، token یا OTP در گزارش نیاید. مقصد/trace علت پاسخ «Direct IP» هنوز ثابت نشده است. گیت ناشر/واحد/rights، ذخیره/approval مالی و گیت انسانی پژوهش/مالی هر کدام فقط به قابلیت خود متصل‌اند.

**BLOCKED محیط پذیرش نهایی:** origin/deployment مجاز و بومیِ همین31c44ab با ورود واقعی هنوز به این بازبین تحویل نشده است. localhost3399 برنامه191 قدیمی است و بدون تغییر سرویس نمی‌تواند شاهد UI/Auth195 باشد؛ این محدودیت با اجرای سرور تازه جبران نشد. اصلاح اختلاف400/404/429 feed/Auth نیز جدا نزد مالک قرارداد باقی است؛ رفتار مشترک401/403/5xx به معنی بسته‌شدن آن نیست.

193/NEXT09 در دامنه حاضر نیست. رد policy قبلی built-server دور زده یا تکرار نشد. merge، استقرار، تغییر سرویس، migration مشترک، ingest/backfill و Production انجام نشده‌اند. گزارش و ابزار آزمون فقط محلی در checkout مدیریت ذخیره شدند؛ commit/push یا انتشار از ذخیرهٔ فایل استنتاج نمی‌شود.
