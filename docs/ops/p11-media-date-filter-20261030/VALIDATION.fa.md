# اعتبارسنجی P11.4 — 2026-10-30

پایه مستقل main `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc`؛ شاخه `codex/p11-media-date-filter-20261030`. وضعیت CI/Preview پس از push با source دقیق ثبت می‌شود؛ main/Production و پذیرش آرش از این سند نتیجه نمی‌شوند.

## نتیجهٔ محلی

- helper پیش از اصلاح RED: ۵ آزمون قدیمی موفق، ۳ آزمون تازه برای helperهای غایب شکست خوردند؛ سپس ۸/۸ موفق.
- همان مجموعهٔ۸ آزمون در دو فرایند با TZ=UTC و TZ=America/Los_Angeles نیز موفق بود. مرز روز تهران روی دو لحظهٔ مجاور۲۰:۳۰Z، offset معادل، کبیسه، rollover نامعتبر، timestamp بی‌منطقه و تاریخ غایب کنترل شد؛ ساعت میزبان مبنای مقایسه نیست.
- actual MediaHub در harness موجود پیش از UI اصلاح RED شد: ۱۳ قبلی موفق، نبود کنترل تاریخ در آزمون تازه؛ پس از اصلاح۱۴/۱۴ موفق. fixtureها ساختگی و صرفاً آزمون‌اند.
- بازبینی hash روی candidate اولیه `06cb83a` یک ناسازگاری یافت: navigate قدیمی مقدار `all` را برای هر کلید حذف می‌کرد. assertion تازه با from=all ابتدا RED13/1 شد؛ اصلاح محدود، این sentinel را فقط برای network/kind نگه می‌دارد. تاریخ نامعتبر در hash و remount می‌ماند و پیام invalid به بازهٔ پیش‌فرض تبدیل نمی‌شود. لاگ `ui-hash-red.log` شاهد این اصلاح است؛ CI/Preview candidate اولیه به source بعدی منتقل نمی‌شود.
- بازبینی مستقل، نبود دکمه clear در read-error با items=[] و بازه معتبر را یافت. آزمون actual با هر پنج شرط فعال ابتدا RED13/1 شد؛ اصلاح، نمایش clear را به شرط فعال وابسته می‌کند، نه داده/نتیجه. همان دکمه همه پنج شرط و hash را پاک می‌کند، error باقی می‌ماند، empty جعلی یا fetch تازه ایجاد نمی‌شود؛ دکمه هم‌نامِ تکراری در empty ساخته نشد. لاگ `ui-error-clear-red.log` شاهد نقص پیش از اصلاح است.
- آزمون ترکیب q/network/kind/date از موارد هم‌متنِ شبکه/نوع متفاوت و یک عنوان نامنطبق استفاده می‌کند. dateLabel جای timestamp غایب نمی‌نشیند؛ unknown/invalid با شمار علت کنار می‌روند. بازکردن/بستن جزئیات، بازگرداندن hash قبلی، remount معادل reload، تغییر نوع، invalid/reversed، clear همه شرط‌ها و حفظ layout بررسی شد. هیچ fetch تازه انجام نشد. clear خطای واقعی خواندن را به ready/empty تبدیل نمی‌کند.
- lint چهار فایل کد/تست بدون هشدار/خطا؛ typecheck کامل با `--noEmit --incremental false` موفق؛ diff-check موفق. package هر دو فایل تست موجود را از قبل اجرا می‌کند و تغییر نکرد.

## بازتولید

```text
node node_modules/tsx/dist/cli.mjs --test lib/media/presentation.test.ts
node --test lib/media/global-layout.test.mjs
node node_modules/next/dist/bin/next lint --file components/insights/MediaHub.tsx --file lib/media/presentation.ts --file lib/media/presentation.test.ts --file lib/media/global-layout.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

لاگ خام در پوشهٔ والد checkout، `outputs/p11-media-date-filter-20261030`: helper-red/green، ui-red/green، lint، typecheck و timezone-UTC/timezone-America-Los_Angeles. پیش از commit، diff-check و staged secret scan نیز اجرا می‌شوند. hashهای source و نتایج آنلاین در outputs و PRbody ثبت می‌شوند تا commit وضعیت پس از head نهایی ساخته نشود.

## مرز پذیرش

کد فقط رسانهٔ خوانده‌شده را فیلتر می‌کند؛ ingest، منبع، publication/sync، نقش، حساب، فیلد سرور یا metadata تازه نمی‌سازد. تقویم ورودی میلادی است و نمایش جلالی قبلی با timezone تهران حفظ می‌شود. CSS فقط کنترل‌های جدید است؛ برند/چیدمان و انتخاب سراسری مدیر بازسازی نشده‌اند. موضوع بدون metadata غیرفعال می‌ماند. نمایش کارت/جزئیات برای تاریخ نامعتبر guard دارد و آن را امروز نمی‌نامد.

Preview روی پروژهٔ موجود اول بررسی می‌شود: محتوای واقعی، q+network+kind+date، detail/source و publication/sync تأییدنشده، بستن جزئیات، reload/hash و clear، invalid/reversed و موبایل/دسکتاپ. اگر خواندن واقعی شکست بخورد، فقط همان خطا ثبت و پذیرش دادهٔ واقعی مشاهده‌نشده می‌ماند؛ fake route، wrapper محصول، envcopy یا جمع‌آوری تازه از شبکه اجتماعی ساخته نمی‌شود. پذیرش مرورگر fixture نیست؛ انتشار اصلی و تصمیم ظاهر با هماهنگ‌کننده/آرش می‌مانند. برگشت با revert همین برش.
