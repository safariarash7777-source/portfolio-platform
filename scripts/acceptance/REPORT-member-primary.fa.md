# پذیرش محدود عضو در مقصد اصلی — ۲۰۲۶-۱۰-۱۷

این بسته فقط ابزار آزمون، رسید و SQL بررسی‌شدهٔ بازیابی را نگه می‌دارد؛ تغییری در محصول ندارد. مبنای کد مالی `1b6218c80e421498553a27f2865840bdb8f5c738` است. آزمون منفی تنظیم رسانه روی انتشار Production تأییدشده توسط هماهنگ‌کننده، `c042a2b4109ff33a5bb8b3e033093ed3c2dcbf23`، اجرا شد. نتایج ۱۴ PASS محیط ایزوله در `scripts/isolated-e2e/REPORT.fa.md` مستقل و دست‌نخورده باقی می‌مانند.

## محدوده و مقصد

- وب: `https://portfolio-platform-fawn.vercel.app`.
- Backend واقعی Production: `https://62.60.191.24/liara-preview`؛ مسیر `/liara-preview` بخشی از قرارداد مقصد است.
- PostgreSQL عملیاتی: کانتینر موجود `portfolio-stage-db-1`، پایگاه `postgres`، نسخهٔ 17.6. نام تاریخی stage به معنی محیط ایزوله نیست.
- فقط دو حساب تازه و ساختگی با marker برابر `member-primary-20261017-01`؛ نقش هر دو `user`. هیچ دادهٔ مشتری موجود خوانده یا تغییر داده نشده است.
- اعتبارنامه‌های ساختگی در پوشهٔ نادیده‌گرفته‌شدهٔ `.local-primary` با ACL خصوصی می‌مانند. کلید موجود سرویس تنها در حافظهٔ فرایند VPS خوانده می‌شود؛ نه خروجی، نه argv، نه رسید.

## وضعیت فعلی

| سناریو | وضعیت | شاهد و محدودیت |
|---|---|---|
| ایجاد حساب B و ساخت بومی profile با نقش user | PASS | `receipts/member-primary-20261017/provision-receipt.json`؛ پس از نصب کنترل‌شدهٔ trigger بومی توسط مالک داده |
| بازیابی فقط profile حساب A که پیش از نصب trigger ساخته شد | PASS | `repair-executed.json`؛ guard دقیق UUID/email/marker، نبود profile و ledger خالی؛ SQL فقط یک‌بار اجرا شد |
| ورود بومی Auth و GET مستقل holdings برای A و B | PASS | `native-empty-read.json`؛ هر دو HTTP 200، private/no-store، ledger هر دو صفر؛ این شاهد API است |
| اولین ذخیرهٔ مالی در وضعیت مجوزهای اولیه | BLOCKED اولیه؛ رفع شد | HTTP 403، پس از آن A=0/B=0؛ بدنهٔ خطای اولیه ثبت نشد و کد خطای دقیق ادعا نمی‌شود |
| تطبیق پنج بدنهٔ تابع نصب‌شده با migration مصوب | PASS | `financial-source-comparison.json`؛ bodyDiffs خالی، owner/mode/search_path مطابق؛ چهار EXECUTE لازم برای authenticated مفقود بود |
| نصب چهار EXECUTE لازم با حفظ حفاظت‌ها | PASS | توسط مالک داده؛ `financial-grant-install.json`؛ authenticated=4، anon=0، بدنه/owner ثابت، kernel خصوصی بسته، RLS و منع نوشتن مستقیم برقرار |
| ذخیره، تکرار همان درخواست و جداسازی B از A پس از بازیابی مجوزها | PASS | `api-first-save.json`؛ ذخیرهٔ A و خواندن مستقل موفق، replay=200/reused با همان نسخه، B کنترل=200، خواندن نسخهٔ A=404، scope RPC و PATCH مستقیم=403، A ثابت/B خالی |
| نسخهٔ دوم و logout/login بومی و خواندن مجدد | PASS | `api-second-version.json`؛ title-only، base_version=1، v1 ثابت؛ logout=204، anonymous=401، ورود تازه و خواندن v2=200؛ دو نسخه، هر دو ۳ گرم/unpriced/null |
| GET و PATCH تنظیم رسانه با حساب B غیرمدیر | PASS | GET 403، PATCH معتبر `{media_layout:2}` برابر 403، RPC عمومی قبل=۱ و بعد=۱؛ `media-negative.json` |
| ورود/ذخیره/خروج مرورگر روی مقصد اصلی | BLOCKED | راه مستند انتقال امن رمز خصوصی به CUA موجود نیست؛ API به‌عنوان مرورگر گزارش نمی‌شود |

## قواعد اجرا و بازیابی

`member-primary.py` تنها با config خصوصی، مقصد و marker ثابت و تأیید sole-writer اجرا می‌شود. درخواست مالی پیش از ارسال در state خصوصی ذخیره می‌شود تا پاسخ نامعلوم موجب client_token تازه یا رکورد تکراری نشود. دادهٔ مجاز فقط یک دارایی ساختگی ۳ گرم با valuation_mode=unpriced و declared_value=null است؛ هیچ قیمت حدسی تولید نمی‌شود.

`restore-member-financial-execute.sql` و rollback آن برای بررسی و اجرای مستقلِ گیت‌شده توسط مالک داده آماده شدند. ابزار پذیرش آن‌ها را اجرا نمی‌کند. مالک داده نصب زندهٔ نسخهٔ بررسی‌شده با SHA256 برابر `47ac49ed37e03cbc71af8b54f55be8194abac5a0532f708845b921ed770cd919` را تأیید کرد؛ سپس پذیرش مالی ادامه یافت. این SQL بدنه، owner، RLS، جدول‌ها و schema usage را تغییر نمی‌دهد؛ helper مالی خصوصی همچنان بسته است.

دو حساب برای پذیرش باقیمانده حفظ شده‌اند؛ هنوز retired نیستند. مرحلهٔ پایان، revoke بومی session و ban فقط همین دو حساب marker-bound است؛ تاریخچهٔ مالی نگه داشته می‌شود. JWT صادرشده ممکن است تا انقضا معتبر بماند. هیچ ban/unban برای شبیه‌سازی خطا اجرا نشده است.

تمام سناریوهای این بسته HTTP/Auth/DB هستند. هیچ cookie به مرورگر تزریق نشده، مرورگر مالک از حسابش خارج نشده، و runner قدیمی Playwright در این محیط اجرا نشده است.

محدودیت خطای شبکه: پاسخ API ذخیرهٔ موفق دریافت و کنار گذاشته شد، سپس همان درخواست تکرار و نبود نسخهٔ تکراری اثبات شد. قطع واقعی پاسخ مرورگر و نگهداری draft در Production در این اجرا آزموده نشد؛ شاهد API جای این سناریوی مرورگر نیست. مسیر بومی `/dashboard` نیز فقط از HTTP بررسی شد: پاسخ ۲۰۰، نام profile ساختگی، لینک holdings و نبود ورودی مدیریت.
