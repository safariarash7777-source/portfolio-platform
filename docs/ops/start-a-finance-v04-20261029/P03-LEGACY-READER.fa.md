# P03 — حفظ فیلتر و reader تازه روی SQL قدیمی

کد محصول آزموده‌شده: `a302b78b67ae1fe90d6028b8f1a0dacd9263910b`، همان PR334 بر پایه PR314. این سند شاهد محلی است؛ نصب اصلی، reader واقعاً مستقر و پذیرش آرش را اعلام نمی‌کند. بسته SQL مهرشده r3b همچنان متعلق به `0d63` و دست‌نخورده است.

## رفتار اصلاح‌شده

جست‌وجوی نام و وضعیت رابطه از پنل موقت به Workspace همان هویت منتقل شدند. انتخاب پرونده و بازنشانی ویرایشگر دیگر این دو مقدار را پاک نمی‌کنند. تغییر هویت همچنان آن‌ها را پاک می‌کند؛ selection از پاسخ مجاز تعیین می‌شود. ظاهر، Auth، SQL، گیت و محاسبات مالی تغییر نکردند.

آزمون رفتار قدیمی ابتدا شکست خورد؛ پس از اصلاح، ۳۴ آزمون Workspace/UI، lint محدوده و typecheck موفق بودند. آزمون پاسخ تأخیردار، remount پس از لغو ویرایش، حفظ انتخاب و پاک‌شدن نمایش پس از خروج را پوشش می‌دهد. مهر لاگ‌ها در `member-filter-log-seals.json` است؛ لاگ خام در outputs محلی نگهداری می‌شود.

## آزمون native تازه با SQL قدیمی

نمونه مستقل `consultation-next-d142985d` با چهار کاربر ساختگی تازه، GoTrue واقعی، PostgREST، PostgreSQL17 و Next همان SHA ایجاد شد. حساب یا dump بازنشسته احیا نشد؛ سرویس‌ها روی شبکه داخلی بودند و ورودی فقط loopback بود. payload دو وضعیت تازه و companion گیت در این نمونه نصب نشدند. fingerprint هر سه تابع قدیمی، constraint پنج‌وضعیتی و نبود جدول گیت پیش و پس از آزمون تطبیق داده شدند.

- RPC قدیمی فیلد capability نداشت؛ GET تازه آن را `extendedFeedbackWrite:false` تفسیر کرد.
- رویداد قدیمی `doing` نسخه ۱ عیناً خوانده شد؛ یادداشت خصوصی به عضو نرسید.
- هر دو POST وضعیت `partial` و `not_done` با `409/FEEDBACK_DISABLED` رد شدند. شمار فراخوانی `command_consultation` قبل و بعد ۶ بود؛ اختلاف صفر. تعداد action و receipt و نسخه مالی نیز ثابت ماند.
- پس از لغو رضایت، عضو تاریخچه قدیمی را خواند و مشاور دقیقاً `403/FORBIDDEN` گرفت.
- در مرورگر، فیلتر `revoked` و نام `Legacy` پس از انتخاب پرونده حفظ شدند؛ ردیف انتخاب‌شده قابل مشاهده و غیرفعال بود. عرض‌های ۳۲۰ و ۳۹۰، RTL و نبود overflow افقی بررسی شدند. این شاهد محدود به مسیر عضو ساختگی است و فیلترهای ریسک/ارزش دارایی مشاور را تأیید نمی‌کند.

رسید قابل بررسی: `legacy-reader-receipt.json` و `member-filter-browser.json`. تصویرهای viewport با پیشوند `member-filter-proof` مرجع بصری‌اند؛ capture تمام‌صفحه اثر ترکیب تصویری داشت و مرجع پذیرش نیست. هیچ ثبت مالی یا بازخوردی در مرورگر انجام نشد.

## جمع‌کردن محیط و ادامه

پیش از پایان، dump فقط‌ساختگی به‌صورت خصوصی حفظ شد؛ ۳۱۷۸۶۵ بایت، SHA256 برابر `f4616a6ca08b8af0c4e7321442e6144b257b6208df10683c9820dc8470066408`. چهار container و دو network متعلق به همین run و process همان برنامه جمع شدند؛ portهای ۳۲۱۸۹/۳۲۱۹۰ بسته‌اند. image مشترک حذف نشد. وضعیت نهایی: چهار کاربر، یک رویداد، هفت receipt پس از لغو، رابطه فعال و نسخه مالی صفر؛ جدول گیت وجود ندارد.

فرمان‌های اجرا در همین checkout، به‌ترتیب:

```text
node scripts/testing/consultation-feedback/native-lab.mjs prepare a302b78b67ae1fe90d6028b8f1a0dacd9263910b --legacy
node scripts/testing/consultation-feedback/native-lab.mjs up-host --legacy
node node_modules/tsx/dist/cli.mjs scripts/testing/consultation-feedback/native-lab.mjs seed --legacy
node node_modules/tsx/dist/cli.mjs scripts/testing/consultation-feedback/native-lab.mjs login-only --legacy
node node_modules/tsx/dist/cli.mjs scripts/testing/consultation-feedback/native-legacy.mjs --legacy
node scripts/testing/consultation-feedback/native-lab.mjs down --legacy
```

این نمونه پایان یافته است؛ اجرای مجدد فرمان‌های نوشتن با همان مسیر مجاز نیست و guardهای وجود فایل/منبع آن را رد می‌کنند. برای اجرای مستقل بعدی مقصد و حساب تازه لازم است. ۲۴ سناریوی سابق تکرار نشدند.

CI و Preview همین کد با هماهنگ‌کننده پیگیری می‌شود؛ شاهد CI مربوط به `0d63` به این SHA تعمیم ندارد. نصب اصلی و فعال‌سازی writer به readback واقعی مقصد، نسخه reader مستقر و guardهای نصب موجود وابسته می‌مانند.
