# اعتبارسنجی P07.4 — ۱۴۰۵/۰۸/۰۸ (2026-10-30)

پایهٔ ثابت: `4013c7c3e972e6b026e093d8dbf39d9df7776fc1` از PR331. مقصد PR همین شاخهٔ C است: `codex/start-c-feed-coverage-20261029`. هیچ ادعای نصب main یا پذیرش آرش وجود ندارد.

## رفتار و شاهد

- RED: آزمون تازه روی کامپوننت واقعی، پیش از اصلاح، با `UI input not found` شکست خورد؛ ۱۸ آزمون قبلی پاس بودند.
- GREEN: ۱۹/۱۹ آزمون UI/discovery پاس؛ نوع و زمان ارسال پنهان/بازنمایان می‌شوند. جست‌وجو و نوع به‌صورت ترکیبی فعال باقی می‌مانند؛ شمار، علت کنارگذاری، عنوان/پیوند منبع، انتشار و هشدار نقص تاریخ حفظ می‌شوند. پاک‌کردن فیلتر انتخاب نمایش را پاک نمی‌کند. تعویض نماد نمایش پیش‌فرض را برمی‌گرداند و پاسخ دیررس قبلی را کنار می‌گذارد. در سناریوی تغییر نمایش فقط یک درخواست دریافت اولیه ثبت شد.
- رگرسیون feed/API: ۸/۸ پاس؛ پوشش محدود، انتشار قدیمی و حالت‌های خطا/دسترسی محفوظ.
- lint دو فایل: بدون هشدار/خطا؛ typecheck کامل با `--noEmit --incremental false` موفق؛ `git diff --check` موفق.
- fixture آزمون، metadata ساختگی است و شاهد دادهٔ واقعی یا پذیرش مرورگری نیست.

## بازتولید

```text
node node_modules/tsx/dist/cli.mjs --test components/symbol/CodalReportsTab.test.ts lib/core/companyReportDiscovery.test.ts
node node_modules/tsx/dist/cli.mjs --test app/api/codal-list/route.test.ts lib/codal-feed.test.ts
node node_modules/next/dist/bin/next lint --file components/symbol/CodalReportsTab.tsx --file components/symbol/CodalReportsTab.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

لاگ‌های خام خارج از Git در پوشهٔ `outputs/p07-report-fields-20261030` والد checkout نگهداری می‌شوند: `red.log`, `green.log`, `feed-regression.log`, `lint.log`, `typecheck.log`. نتیجهٔ CI و Preview باید پس از push با head دقیق تطبیق داده شود؛ این سند پیشاپیش آن‌ها را موفق نمی‌شمارد.

## مرز تحویل

تنها دو فایل کامپوننت/آزمون و SPEC/همین سند تغییر می‌کنند. package، API، موتور، دادهٔ مالی، provider، SQL، env و منابع بیرونی تغییر نمی‌کنند. کنترل نمایش، ترجیح محلی همان نماد است؛ ذخیرهٔ حساب ندارد. تاریخ انتشار حتی با پنهان‌کردن زمان ارسال باقی می‌ماند. روش برگشت: revert همین برش رابط.

برای پذیرش مرورگری: فهرست واقعی ذخیره‌شده را در Preview باز کنید؛ تغییر هر دو checkbox و حفظ عنوان/منبع/انتشار و نتیجهٔ فیلتر را در موبایل و دسکتاپ مشاهده کنید. اگر خواندن داده خطا داشت، کنترل‌ها و پذیرش وابسته به فهرست واقعی «مشاهده‌نشده» می‌مانند؛ endpoint جعلی ساخته نمی‌شود. ظاهر سراسری/P14، فیلتر اقتصادی شرکت‌ها و کل P07.1 در این برش تکمیل نمی‌شوند.
