# رفع محدود مانع دیسک — P15، ۳۰ اکتبر ۲۰۲۶

وضعیت: **اجرا و بازخوانی شد؛ پذیرش انتشار/بازیابی هنوز باز است.** فقط ۷۶ فایل pack کش ساخت Webpack از ۱۱ کپی مشخص حذف شد. داده، نسخهٔ پشتیبان، تاریخچه، لایهٔ container، image، volume، node_modules و خروجی اجرایی حذف نشدند. هیچ نصب، انتقال سرویس، restart، upgrade، اجرای مدل یا هزینهٔ تازه انجام نشد.

## استفاده و نسخه

- مرجع وضعیت: [COMMAND-CENTER](../../COMMAND-CENTER.md#development-v04-program-20261030).
- [ابزار محدود](cleanup.py) پیش‌فرض فقط dry-run است؛ فقط مسیرها و inode/device/size/mtime همان [manifest](../../plan/development-v04-20261029/evidence/P15-webpack-pack-manifest-readonly-20261030.json) را می‌پذیرد. SHA256 معنایی manifest: `bd2e31e2602d563bb4fb152305015a322fe6c2999f2ab4d108c2506011df7da8`.
- عملیات پایان یافته است؛ اجرای دوباره ابزار با همین manifest فقط receipt و مسیرهای باقی‌مانده را بازمی‌خواند. intent ناشناخته خودکار تکرار نمی‌شود. intent/result خصوصی در `/var/lib/portfolio-ops/webpack-cache-20261030` با دسترسی محدود نگهداری شد.
- مسیر انتخابی همان cache filesystem در پیکربندی Webpack/Next است؛ package start هر ۱۱ کپی production `next start` بود. ساخت بعدی می‌تواند کش را از کد و lockfile دوباره بسازد؛ زمان ساخت بعدی ممکن است بیشتر شود.

## شاهد و نتیجه

[Dry-run واقعی Linux](../../plan/development-v04-20261029/evidence/P15-webpack-cleanup-dry-run-20261030.json) وجود ۷۶ pack تک‌پیوندِ عادی، تطبیق manifest و صفر descriptor باز را تأیید کرد. مسیر canonical و والدهای بدون symlink بررسی شدند؛ حذف فقط با parent descriptor و بررسی دوباره inode انجام شد، نه حذف بازگشتی.

[اجرای واقعی](../../plan/development-v04-20261029/evidence/P15-webpack-cleanup-apply-20261030.json) در 11:55:55–11:55:58Z پایان یافت. تخصیص packها ۴٬۶۲۲٬۰۱۶٬۵۱۲ بایت بود. فضای آزاد از ۶٬۷۸۳٬۴۲۶٬۵۶۰ به ۱۱٬۴۰۵٬۴۳۰٬۷۸۴ بایت، حدود **۱۰٫۶۲GiB**، رسید؛ guard ده GiB بدون کاهش حد پاس شد.

هش محتوای فایل‌های canonical کد/lock/config/BUILD_ID و fingerprint متادیتای ۹۲۲۳ فایل محفوظ `.next` پیش/پس برابر بود؛ این ادعای هش محتوای تک‌تک فایل‌های runtime نیست. cacheهای fetch/image، server/static و node_modules دست‌نخورده‌اند.

[بازخوانی مستقل بعدی](../../plan/development-v04-20261029/evidence/P15-post-cleanup-readonly-20261030.json) در 12:01:55Z، آزادبودن ۱۰٫۶۲GiB و سلامت پنج سرویس stage را نشان داد. ۵۳ container محفوظ‌اند؛ ۲۳ running و دو app قدیمی همچنان در restart loop قبلی‌اند. رفع restart loop یا سلامت همه خدمات ادعا نمی‌شود. CPU در نمونهٔ یک‌ثانیه‌ای ۱۱٫۷۹٪ busy و RAM available حدود۵٫۲۶GiB بود؛ این روند بلندمدت یا مصرف Hermes نیست.

## محدودیت و اقدام بعدی

پاس شدن guard ده GiB به‌تنهایی مجوز شروع migration نیست. [بودجهٔ تازهٔ فقط‌خواندنی](../../plan/development-v04-20261029/evidence/P15-fresh-backup-budget-readonly-20261030.json) حجم DB فعلی را ۱٬۴۲۵٬۲۹۶٬۵۳۱ بایت و آخرین dump نگهداری‌شده را حدود۲٫۳۹GB نشان داد. headroom بالای guard برای dump جدید و کپی بازیابی کافی نیست؛ backup/restore تازه هنوز اجرا نشده است. نمونهٔ فشرده‌سازی، حجم کل یا قابلیت بازیابی کامل را ثابت نمی‌کند.

مسئول root: فراهم‌کردن فضای بودجهٔ backup+restore با نگهداری بدون اتلاف و بازیابی‌پذیر، سپس checkpoint تازه و reader سازگار پیش از DDL. حفظ آرشیوها/receiptهای قدیمی و پشتیبان فعلی الزامی است. Hermes نصب/منتقل نشده؛ پیشنهاد یک مأموریت هم‌زمان با سقف منابع قبلی و اثبات اتصال پشتیبانی‌شده برقرار است. ادغام arsadata نیز تا backup/restore، جلوگیری از collector تکراری، cutover برگشت‌پذیر و consumer readback پایان‌یافته حساب نمی‌شود؛ سرویس موجود خاموش نشده و صرفه‌جویی صورتحساب ادعا نمی‌شود.
