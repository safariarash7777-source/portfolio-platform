# بستهٔ نصب و بازگشت P02 — ۲ اکتبر ۲۰۲۶

وضعیت: آمادهٔ بازبینی و نصب هماهنگ؛ **نصب زنده انجام نشده**. مبنا PR195 در `31c44ab635b672b589b7833bcbc78b41d36f1e75` است. این بسته گزارش immutable [PR207](https://github.com/safariarash7777-source/portfolio-platform/pull/207) را تغییر نمی‌دهد. توقف `arsadata`، انتشار، migration مشترک و خرید در اختیار این بسته نیست.

## تطبیق نسخه و شاهد

پنج فایل quota در [manifest](./manifest.json) با PR178 در `4ce06b3ffbd6b50125021faeb454fbf11c73b900` دقیقاً blob یکسان دارند؛ guard یا migration موازی ساخته نشده است. شواهد قبلی واقعی PostgreSQL برای همین blobها قابل استفاده‌اند، اما اجرای تازهٔ این نوبت محسوب نمی‌شوند.

- CI178، run `36843617522`، job `110308383700`: invocation واقعی `node --test relay/brsapi-budget.integration.test.mjs`، **۱۳ PASS، صفر fail/skip**. دو پروفایل grant، ۸ مصرف‌کننده، restart، قطع اتصال DB، baseline نامعلوم، کاهش سقف و release تکراری را پوشش می‌دهد.
- شاهد محلی ۱ اکتبر: PostgreSQL 17.11، image دقیق در manifest، network none، بدون پورت، **۱۴ PASS، صفر fail/skip**؛ تست چهاردهم خاموش/روشن‌کردن DB اختصاصی است. لاگ اصلی در `reports/budget-guard-20261001/evidence/postgres17-tests.log` محفوظ است.
- `server.mjs` در PR195 با PR178 یکسان نیست؛ آزمون actual-server با fetch mock باید برای همین candidate دوباره اجرا شود. این آزمون شبکهٔ واقعی یا DB Production ندارد.
- CI195 و CI207، DB **۴۴۳**: شاهد quota13 نیستند. `.github/workflows/ci.yml:111` فقط test:relay را اجرا می‌کند؛ آن اسکریپت آزمون DB quota را فراخوانی نمی‌کند. invocation مستقل integration در این مبنا غایب است. P00 مالک workflow است و افزودن همان invocation به candidate ترکیبی را هماهنگ می‌کند.

## ورودی‌های لازم برای اجازهٔ ارسال

اپراتور تنها با این چهار دستهٔ شاهد اجازهٔ شروع می‌دهد:

1. تصمیم انتشار/توقف آرش و receipt مالک P00: app/team/release/replica زنده، SHA هدف، توقف و پایان فرایندهای قدیمی بدون overlap. VPS Auth/DB و Vercel با PaaS worker `arsadata` اشتباه نشوند.
2. شاهد رسمی BrsApi: سقف، timezone و مرز واقعی reset، پنجرهٔ جاری، کران بالای مصرف قبلی همان پنجره و مالک کلید. `/debug`، uptime و `remaining=9000` شاهد صورت‌حساب نیستند. نامعلوم `null` است؛ baseline صفر از تاریخ/راه‌اندازی مجدد استنتاج نمی‌شود.
3. فهرست تمام مصرف‌کنندگان همان کلید، به‌همراه توقف/مهاجرت آن‌ها به شمارندهٔ مشترک. قفل DB فقط مصرف‌کنندگان این RPC را محدود می‌کند. فاصلهٔ ۱۰۰ms transport فقط فرایند خودش را پوشش می‌دهد؛ فعلاً یک replica و بدون مصرف مستقیم بیرونی لازم است.
4. receipt نصب phase28 با hash، مالک BYPASSRLS، GRANT و RLS درست، baseline تأییدشده و env/guard همین نسخه. روز داخلی تهران الزاماً مرز reset تأمین‌کننده نیست؛ تا تطبیق این دو، هر روز جدید بدون baseline متوقف می‌ماند.

هیچ‌کدام از این شاهدها با green CI جایگزین نمی‌شود. مسیر خودکار تأیید baseline روزانه هنوز تعیین نشده؛ ثبت‌نکردن روز بعد، توقف ایمن ایجاد می‌کند و به معنی آماده‌بودن به‌روزرسانی دائمی نیست.

## ترتیب اجرا پس از تصمیم انتشار

1. SHA و hash فایل‌ها را با manifest تطبیق دهید. app/team/release واقعی و تمام replicas را تأیید کنید. آخرین زمان snapshot را فقط‌خواندنی ثبت کنید؛ برای acceptance از `/api/market` یا `/market.json` refresh استفاده نکنید.
2. طبق طرح توقف PR207، worker را با مالک انتشار متوقف کنید. پایان in-flight و نبود worker قدیمی یا consumer بیرونی را احراز کنید. تاریخچه، NAV blacklist و snapshot مالی حفظ شوند.
3. schema/counter عملیاتی قبلی را خصوصی backup کنید. preflight کاتالوگ را قبل و بعد از نصب اجرا کنید؛ غیبت جدول در اجرای قبل خطای query نمی‌سازد:

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/ops/p02-quota-preflight.sql
# Only after the approved target/stop receipts:
psql -X -v ON_ERROR_STOP=1 -f sql/phase28_brsapi_budget.sql
psql -X -v ON_ERROR_STOP=1 -f scripts/ops/p02-quota-preflight.sql
```

credential از فایل/کانال خصوصی اپراتور خوانده شود؛ در argv، receipt یا لاگ وارد نشود. preflight فقط catalog metadata می‌خواند و مصرف/remaining را محاسبه نمی‌کند.

4. baseline در **همان** `brsapi_budget_days` ثبت شود: `day_key` با روز داخلی guard منطبق، `leased` کران محافظه‌کارانهٔ مصرف قبلی **و تخصیص‌های صادرشده**، `hard_ceiling` سقف تأییدشده، `usage_verified=true` فقط با شاهد، `baseline_note` مرجع غیرحساس receipt. ردیف موجود قفل شود؛ leased یا released کاهش نیابد و سقف برای ایجاد ظرفیت بالا نرود. اگر مصرف از سقف بیشتر است یا اختلاف پنجره حل نشده، رله متوقف بماند. هیچ lease آزمایشی یا ردیف آیندهٔ صفر در Production نسازید.
5. انتشار guard همراه `BRSAPI_BUDGET_ENFORCE_LEGACY=1`، اضطراری صفر و تک‌فرایند انجام شود. `PHASE28_APPLIED=true` فقط پس از receipt واقعی نصب. کارهای اختیاری خاموش: `CANDLE_BACKFILL_ENABLED=0`، `CODAL_ARCHIVE_ENABLED=0`، `CODAL_ENABLED=0`، `IME_ENABLED=0`، `SYMBOL_DETAIL_DAILY_CAP=0`. این flags همهٔ producerها را خاموش نمی‌کنند؛ بدون guard الزام‌آور یا توقف worker کافی نیستند.
6. فقط بعد از receiptهای بالا شروع کنید. health/debug فقط‌خواندنی، DB سالم، baseline معتبر، enforcement=true و counter ماندگار را بررسی کنید. دو چرخهٔ **طبیعی مجاز** باید با receipt قبل/بعد تأیید شوند: بدون overlap، مجموع تخصیص ≤ سقف، رد بودجه بدون send و بدون overwrite snapshot، timestamp منبع حفظ‌شده. refresh تزریقی مجاز نیست. تا این پذیرش، backfill یا fetch اختیاری آغاز نشود.

## rollback

روی خطای DB، budget یا grant، worker متوقف شود و آخرین snapshot سالم باقی بماند. شمارنده و نسخهٔ guard حفظ شوند. خاموش‌کردن enforcement، emergency=100، صفرکردن leased، حذف جدول یا بازگرداندن release کاهش‌دهنده بازگشت قابل قبول نیست. binary قدیمی با راه‌اندازی مجدد ظرفیت حافظه‌ای باز می‌کند؛ بازگشت آن فقط با منع ارسال و بازبینی جداگانه ممکن است. موفقیت health سایت شاهد سلامت provider نیست.

## receipt لازم برای P00

`candidateSha`، `migrationSha256`، `targetVerifiedAt`، `stop/drainReceiptRef`، `allConsumersReceiptRef`، `supplierWindowStart/reset/timezone`، `cap`، `priorUsageUpperBound`، `baselineReceiptRef`، `pre/postCatalogReceiptRef`، `env/release/replicasReceiptRef`، `cycle1/2ReceiptRef` و `rollbackOwner` ثبت شوند. هر مقدار یا مرجع تأییدنشده **null** بماند. هیچ credential یا ردیف مالی در receipt نیاید.
