# پذیرش native محلی و بسته انتقال گیت‌دار

منبع برنامه در تمام این اجراها `0d63a8b64e4975a3c9dab3f1f579f91302602b01` بود. build محلی موفق شد؛ هماهنگ‌کننده CI `40911872278` را با هر پنج job موفق مستقل خواند. این گزارش پذیرش **مقصد آنلاین/اصلی یا آرش نیست**.

[رسید کامل و sanitized](native-acceptance.json)، [موجودی غیرصفر](native-nonzero-receipt.json)، [مرورگر](native-browser-receipt.json) و [آرشیو گیت‌دار](guarded-transfer-receipt.json) شواهد قابل بررسی‌اند. هیچ توکن، رمز، فایل env یا dump خصوصی در Git ثبت نشده است.

## چه چیزی واقعاً اجرا شد؟

چهار کاربر تازه و ساختگی در GoTrue جدا ساخته و هویت/marker آن‌ها با getUser تطبیق داده شد. APIهای واقعی Next، PostgREST14.17 و PG17.11 در همان محیط جدا به هم وصل شدند. source از Git با LF دقیق صادر شد؛ بایت‌های SQL و payload `c53de46…` پیش از اجرای schema کنترل شدند. سرویس‌های DB/Auth/REST شبکه داخلی و بدون bind/port داشتند؛ ingress فقط loopback و Node وب فقط با envهای ساختگی اجرا شد. هیچ حساب بازنشسته یا منبع اصلی بازفعال نشد.

- ۲۴ سناریوی پایه native شامل رضایت، draft/approve/publish جدا، فیلترها، پاسخ v1/v2، نسخه توصیه، جداسازی و revoke موفق شدند.
- مرحله تازه، gate خاموش در GET/POST و RPC مستقیم، مسئولیت اقدام عضو، جداسازی عضو A و مشاور نامرتبط را اجرا کرد. پاسخ HTTP **بعد از دریافت header واقعی 201** عمداً دور ریخته شد؛ GET همان action/version/text را یافت، فقط یک POST ارسال شد و replay نشد.
- نسخه دوم مالی از API واقعی goals ساخته و تأیید draft با مبنای قبلی رد شد. نسخه منتشرشده عضو حفظ شد؛ پس از revoke، عضو history2 را دید و GET مالک با هویت معتبر، **دقیقاً 403 و FORBIDDEN** بود. همه ۹ postcondition adapter روی همان DB، شامل سه kernel/قید/ACL/RLS، در probe فقط‌خواندنی true بودند؛ root نیز denial را مستقل تأیید کرد.

## موجودی غیرصفر؛ مرحله جدا پس از پایان resume

فاز نخست holdings/cashflow خالی داشت و شاهد عدم تغییر موجودی غیرصفر نبود. فاز جدا، از قراردادهای واقعی `POST/GET /api/portfolio/holdings` و `/api/personal-finance/cash-flow` استفاده کرد؛ جدول یا روش اقتصادی تازه نساخت.

| داده ساختگی | قبل feedback | پس از partial | پس از not_done |
|---|---:|---:|---:|
| دارایی اظهارشده، تومان | ۱٬۰۰۰٬۰۰۰ | همان | همان |
| مانده ابتدای دوره، تومان | ۵۰۰٬۰۰۰ | همان | همان |
| خالص جریان واقعی، تومان | ۸۰٬۰۰۰ | همان | همان |
| مانده پایان واقعی، تومان | ۵۸۰٬۰۰۰ | همان | همان |
| خالص برنامه نامعلوم | null | null | null |

یک position و دو cash-flow entry واقعاً وجود داشتند. GET کامل، id/version، مقدار/واحد/منبع و SHA256 جدول‌های version **و ردیف‌های position/entry** قبل و بعد هر دو feedback برابر ماندند. هر رویداد با receipt و GET مستقل actor/action/version/text تطبیق داده شد. گیت در پایان خاموش و رابطه تازه لغو شد؛ پس از آن هم مالک دقیقاً 403/FORBIDDEN گرفت.

## مرورگر و حدود شکست‌های آزمون

عضو B در مرورگر واقعاً وارد شد و history دو وضعیت را پس از revoke دید. در عرض‌های ۳۲۰ و ۳۹۰، clientWidth/scrollWidth به‌ترتیب ۳۰۵/۳۰۵ و ۳۷۵/۳۷۵ بود؛ RTL، متن هر دو رویداد و نبود canary یادداشت خصوصی/دکمه نوشتن مشاهده شد. [تصویر ۳۲۰](native-history-320.png) و [۳۹۰](native-history-390.png). مرورگر هیچ نوشتن مالی یا feedback انجام نداد؛ viewport بازنشانی و فقط تب خود آزمون بسته شد.

دو توقف harness حذف یا به موفقیت بی‌قید تبدیل نشده‌اند:

1. در تلاش نخست native، rollback با error متوقف شد، ولی SQLSTATE به‌علت psql غیرverbose ثبت نشد. **SQLSTATE آن تلاش UNOBSERVED می‌ماند.** بدون تکرار rollback، kernel/قید/مجوز/تاریخچه از همان DB مستقل بازخوانی و سازگار تأیید شدند. اثبات PT409 در دو پروفایل PG دیگر، شاهد SQLSTATE همین native run نیست. resume تنها مراحل باقی‌مانده v2/revoke را انجام داد.
2. در فاز غیرصفر، پس از POST/readback دوم، نام فایل `not_done` به‌علت underscore از سیاست فایل خصوصی رد شد. ادامه صریح، intent/receipt و DTO/fingerprint قبلی را تطبیق داد؛ هیچ POST مالی یا feedback تکرار نشد و فقط بستن gate/revoke باقی‌مانده اجرا شد. خطای نخست و hash آن حفظ شده‌اند.

پس از activation صرفاً ساختگی، enabled=false است ولی reader_sha/reviewed_at حفظ شدند: `DISABLED_WITH_AUDIT_HISTORY`. بنابراین `ROLLOUT_DEFAULT_OFF` سخت‌گیرانه false است؛ سابقه برای سبزکردن assertion پاک نشد. این با default-off واقعیِ نخستین نصب تفاوت دارد.

## تحویل و ادامه

آرشیو نهایی `start-a-guarded-transfer-r3b.zip` با source فوق شامل adapter، helper دقیق PR314، migrationهای apply اتمیک و rollback و verifier مستقل است. SHA256 آرشیو:
`4cc1cfc6ea172d9fa33d3ac651e179d72533797455ea3c3c7b75c1d8d61c29c7`

MANIFEST SHA256:
`2fb896dc429722a19f55fd679bf9453ef516af5fcae924640789d1392dfdef73`

پس از استخراج، فرمان `python3 verify-guarded.py . --manifest-sha256 <hash above>` فقط بایت‌ها و ساخت payload را بررسی می‌کند؛ baseline وارد اجرای نصب نمی‌شود. verifier واقعی در Linux/Python3.12.16 با network=none موفق و SQL دستکاری‌شده رد شد. هیچ attestation ساختگی در بسته نیست و خود انتقال، مجوز نصب ایجاد نمی‌کند.

پیش از cleanup، dump فقط‌ساختگی با hash مستقل خصوصی حفظ شد؛ dump منتشر نشده است. منابع container/network و process مربوط به همین مالک جمع و portهای ۳۲۱۸۹/۳۲۱۹۰ بسته تأیید شدند. imageهای مشترک حذف یا prune نشدند.

نصب primary هنوز نیازمند مقصد و اختیار جاری، پشتیبان/restore تازه و ظرفیت۱۰GiB، و **شاهد واقعی reader مستقر پیش از DDL** است. در این lab، native reader روی SQL قدیمی اجرا نشد؛ fallback نبود capability فقط unit-tested است و برای source به attestation مستقل هماهنگ‌کننده وابسته می‌ماند. entitlement تجاری، پذیرش آنلاین و پذیرش آرش بازند. root تنها نویسنده مرجع مشترک وضعیت است.
