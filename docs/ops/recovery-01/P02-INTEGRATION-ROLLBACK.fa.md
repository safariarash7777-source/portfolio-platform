# P02 — بسته محدود قابل ادغام در RECOVERY-01

پایه `51fd0661d48d791ce8758a87828a81ce72cac6df`؛ مالک انتشار P00. دو commit منتخب، به ترتیب:

1. `603877f6a3c2f70d25c073ce748f55945e2e76c9` — mapper اختیار و چهار آزمون mock؛ فقط `relay/options.mjs` و `relay/options.test.mjs`.
2. `4213dda041f8aaaf8a98d7e24047ca47564e6230` — reader/API و deadline/quality، هفت فایل؛ بازاستفاده محدود214 روی پایه اصلی، نه cherry-pick کل195/214.

`p02-patch-manifest.json` hash هر9فایل از بایت Git blob ثبت می‌کند؛ hash نسخه CRLF روی ویندوز ملاک تطبیق نیست. schema/config/assets/auth/UI/package/CI در این دو commit تغییر نکرده‌اند. دو commit در git-common-dir پروژه product-direction موجودند؛ نیازی به گرفتن parent195 برای ادغام نیست.

## وابستگی‌ها و آزمون

- مصرف‌کننده‌های nullable در `app/market/page.tsx`، `components/market/StocksBoard.tsx` و `lib/core/marketHeadline.ts` باید در patch همان‌ظاهر P01 هماهنگ شوند. typecheck مستقل این بسته روی main دارای10خطای همین مصرف‌کننده‌هاست؛ بسته standalone آماده انتشار نیست.
- نمایش اختیار از valueUnit=null واحد تومان حدس نزند؛ contractSize نامعلوم،1000 فرض نشود. quoteclock و receiptclock و محدودیت پوشش جدا نمایش داده شوند. اضافه شدن metadata، عدد موجود tval را تبدیل نکرده است.
- P00 invocation آزمون‌ها را در package/CI شاخه واحد اضافه کند: `node --test relay/options.test.mjs` و `node --import tsx --test lib/market-bounded.test.ts`. نتایج محلی4+13PASS، صفرskip. lint فایل‌هایTS موفق، syntax relay موفق؛ lint relay طبق تنظیم موجود ignored است و به عنوان lint موفق relay گزارش نشده.
- typecheck/build/lint و بررسی390/1440 برای ترکیب نهایی، مالک integration است. آزمون‌های mock هیچ داده مصنوعی به سایت تزریق نمی‌کنند.

## نصب محدود

بسته هیچ تغییرSQL و محافظ بودجه ندارد. محافظ178/phase28/env باید جدا با baseline/reset/مصرف‌کنندگان معتبر و backup/restore فعلی Liara آماده شود؛ نصب آن با مصرف نامعلوم ممنوع است. این دو commit سهمیه یا cadence یا replica را افزایش نمی‌دهند.

قبل انتشار رله، release/image فعال و replica/env فعلی به همراه snapshot metadata ثبت شوند؛ protected backup فعلی و بازیابی لازم مأموریت باید رسید داشته باشد. پیش از دریافت این رسید، در این بسته فقط کد و آزمون و شواهد فقط‌خواندنی آماده شده و نصب/خاموش کردن فرآیند زنده انجام نشده است.

P00 ابتدا همان شاخه تحویل واحد را با adaptersP01 و CI بگذراند؛ سپس deploy code روی سرویس‌های هدف طبق manifest مشترک. از `/api/market` برای probe تکراری استفاده نشود چون مسیر موجود ارزیابی هشدار و ارسال شخصی دارد؛ `/market.json` نیز ممکن است refresh بسازد. metadata دیتابیس/debug و چرخه طبیعی برای مشاهده سلامت استفاده شوند. نمونه واقعی یک چرخه برای تطبیق واحد/scale مالی تا UI، هنوز مرحله پذیرش جداست.

## بازگشت

receipt نسخه زنده Vercel و PaaS قبل نصب باید در manifest مشترک ثبت شود. در شکست، آخرین snapshot و ردیف‌های تاریخچه نگه داشته شوند؛ release قبلی همان سرویس بازگردد. schema تغییر نکرده و metadata افزوده با mapper/reader قبلی سازگار است. بازگشت هیچ DELETE/UPDATE تاریخچه مالی، پاک کردن blacklist یا replay انبوه نیاز ندارد. برای بازگشت کد، P00 هر دو patch داده و adaptersUI متناظر را به صورت هماهنگ برگرداند؛ branch ناقص nullable مستقل نصب نشود.

## وضعیت فعلی

کد ثبت‌شده و آزمون موضعی موفق؛ نصبProduction و پذیرش عددی/بصری انجام نشده. پیشرفت P02 از این نقطه به ترکیب نسخه و رسید نصب P00/P01 وابسته است؛ این سند اعلام پایان RECOVERY-01 نیست.
