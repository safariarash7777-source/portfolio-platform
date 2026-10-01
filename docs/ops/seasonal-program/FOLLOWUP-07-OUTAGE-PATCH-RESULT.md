# Auth180 — اصلاح محدود طبقه‌بندی اختلال هویت/نشست

تاریخ2026-10-01؛ محیط ساخت/آزمون ایزوله، بدون استقرار. مالک دو نقص F06-LIM-IDENTITY-01/02، Auth/PR180 است. اصلاح قبلاً در ترکیب [PR186](https://github.com/safariarash7777-source/portfolio-platform/pull/186) توسط بازبین در `a49e37cecc7922d6d80c174910301e24a1841aee` اعمال و مسیرهای متأثر با nativeAuth503 مستقل پذیرفته شده‌اند. این بسته همان اصلاح را برای ورودی مستقل180 قابل واگذاری می‌کند؛ تمام ترکیب186 به180 منتقل نشده است.

## نسخه و مالکیت

- main مشاهده‌شده پیش از ویرایش: `51fd0661d48d791ce8758a87828a81ce72cac6df`.
- head ورودی180: `bb4f2f3e53859bbecb0ec942975ffb06fd2d2828`؛ همین commit مبنای checkout `portfolio-auth-outage-patch` و branch `codex/auth-outage-classification-20261001` است. checkout اصلی180 و head آن تغییر نکردند.
- source اصلاح: `a49e37cecc7922d6d80c174910301e24a1841aee`؛ head مشاهده‌شدهٔ checkout پذیرش محدود `be60bf54d64d60cc1c3c5d438034439ce12b9f15`، runtime پذیرفته‌شده همانa49 است. فایل‌های DEFECTS، regression-red-green و بخش جاری FOLLOWUP06 خوانده شدند؛ متن تاریخی baseline2605 شاهد جاری نیست.
- delta محصول: فقط `app/api/auth/identity/route.ts`، `app/api/auth/status/route.ts` و helper `lib/auth/session-error.ts`. آزمون همان `auth-session-handler.test.mjs` و تنها تغییر package، اضافه‌شدن آن به `test:auth-mobile` است؛ dependency/lock دست‌نخورده‌اند.
- فونت/فرانت، feed/read-state، منابع دوره184، SQL/RLS/migration، Vercel/env/provider و Production: هیچ تغییری ندارند.

## علت و رفتار

SDK ممکن است error را در نتیجهٔ getUser برگرداند و throw نکند. identity هر error را401 و status هر error را200/false گزارش می‌کرد؛ بنابراین خرابی سرویس پشت وضعیت نیاز ورود پنهان می‌شد. classifier مشترک source، missing/rejected session را از اختلال سرویس/تنظیمات جدا می‌کند. قبل از خواندن پروفایل خصوصی/نقش یا ساخت writer تصمیم گرفته می‌شود؛ مجوز هویت با تغییر کد HTTP اعطا نمی‌شود.

| وضعیت | identity GET/POST | auth/status | دسترسی خصوصی |
|---|---|---|---|
| SDK transport/configuration/nativeAuth503 |503، پیام عمومی قابل تکرار|503، `status: network_or_configuration_error`|هیچ read/role query یا ساخت writer|
| guest سالم، SDK missing/rejected session |401|200، `authenticated:false,role:null`|هیچ read/write|
| حساب ایمیلی معتبر بدون phone proof |POST401 مطابق شرط قبلی|رفتار نشست معتبر قبلی حفظ|phone confirmation جعل نمی‌شود|
| نشست معتبر و بازیابی سرویس |مسیر قبلی GET و شرط nativephone POST|role ازDB، مطابق رفتار قبلی|بدون fallback مدیریتی|

همه پاسخ‌های بررسی‌شده no-store هستند؛ raw SDK/provider details در پاسخ نیستند. session،UUID، cookie، رضایت، identity pending و phone proof تغییری نکردند. این اصلاح فعال‌سازی mobile/provider یا پذیرش مالک Production نیست.

## شاهد محلی، مستقل و CI

[red.json](./auth-outage-patch-evidence/red.json) و [red.txt](./auth-outage-patch-evidence/red.txt): همین آزمون روی پایه واقعی180، **5PASS/3FAIL**. [green.json](./auth-outage-patch-evidence/green.json) و [green.txt](./auth-outage-patch-evidence/green.txt): پس از انتقال محدود، **8PASS/0FAIL**. آزمون توابع واقعی handler و NextResponse را اجرا می‌کند؛ فقط client boundary تزریق شده و error classهای SDK واقعی‌اند. read/write در خطایAuth منع می‌شود؛ guest/status200false و email-only/POST401 حفظ شدند.

ESLint چهار فایل متأثر با صفر warning و typecheck محلی PASS. build/core/calc/کل nativeUI محلی دوباره اجرا نشدند؛ CI patch باید روی head خودش بررسی شود. **38PASS مستقل متعلق به دامنهٔ ترکیبی186 است**: شروع بررسیd941 و recheck متأثرa49؛ این عدد خودآزمایی این patch یا پذیرش همهٔ مسیرها/Production نیست. سرویس، DB، fixture، gateway و نشست بازبین برای این کار بازسازی، متوقف یا تغییر نکردند. نصب SQL یا آزمون OTP/SMTP واقعی انجام نشد.

## نسبت دقیق بهa49؛ جلوگیری از دوباره‌اعمال

[provenance.json](./auth-outage-patch-evidence/provenance.json) ثبت می‌کند **Git blob هر سه فایل runtime و فایل آزمون باa49 دقیقاً برابر است**؛ فرمان `test:auth-mobile` هم برابر است. سایر scriptهای package از180 حفظ شده‌اند و union ترکیب186 کپی نشده است. CRLF محیط ویندوز با Git canonical blob تطبیق داده شده، نه ادعای حدسی تشابه.

- روی ورودی180 بدون اصلاح: همین patch مستقل مصرف شود.
- روی ترکیبی کهa49 را دارد: patch runtime دوباره cherry-pick نشود؛ چهار blob/فرمان موجود را با provenance تطبیق و فقط گزارش مالکیت را در صورت نیاز مصرف کنید. به38PASS همان ترکیب استناد شود، نه ایجاد grant/phone/session تازه.
- در تجمیع ورودی‌ها، یک اصلاح مفهومی وجود دارد: `Auth180 outage classification = a49 runtime`. patch مستقل انتقال همان تغییر است؛ جایگزین ترکیب186 یا184 نیست. عنوان/مسیر فایل/فرمان آزمون دوباره ساخته یا اضافه نشود.
- بازگشت فقط revert این delta اپ/تست؛ هیچ DBdown، حذف حساب/پروفایل یا تنظیم محیط ندارد.

ابزار/مهارت: Git worktree مستقل و تطبیق remote/blobs، Node test با TypeScript transpilation و canonical Supabase SDK، ESLint/TypeScript، secret scan و GitHub CI. مهارت Supabase و verification-before-completion/systematic-debugging از کار Auth قبلی برای تفکیک خطای SDK و شاهد واقعی از fixture رعایت شدند؛ مهارت طراحی یا ساخت provider تازه اجرا نشده است. مبنای قرارداد README/CLAUDE/COMMAND/AUTH-MOBILE از مرحلهٔ Auth قبلی باقی است؛ این continuation فقط source پذیرش محدود را افزوده و اسناد مرکزی را ویرایش نمی‌کند.
