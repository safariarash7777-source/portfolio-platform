# مصرف رسید تصحیح در دو ابزار موجود — فقط بررسی

در۳۱اکتبر، مسیر بررسی صریح به همان ابزارهای پشتیبان و نصب مشاوره افزوده شد. هر دو روی Linux موجود اجرا شدند و [رسید مستقل اجرا](../../plan/development-v04-20261029/evidence/P15-existing-consumers-root-20261031.json) دارند: ابزار پشتیبان ساعت۰۴:۲۱:۵۵تهران و نصب‌کننده ساعت۰۴:۲۲:۴۴تهران. این تغییر کد و اجرای caller است؛ نصب یا قالب تازه پشتیبان نیست.

## مسیر استفاده و نسخه

- [backup-checkpoint.ps1](../../../scripts/ops/cashflow-checkpoint/backup-checkpoint.ps1)، کنش `ReviewCorrectedCheckpoint`، checkpoint ثابت `20261030T215307Z` و همان helper بررسی‌شده. این کنش Destination، Fixture و OfflineFixture نمی‌پذیرد و هیچ پوشه/کلید/فایل پشتیبان نمی‌سازد.
- [install-native.py](../../../scripts/testing/consultation/install-native.py)، گزینه `--review-corrected-checkpoint`، فقط بسته بررسی‌شده را از stdin می‌خواند؛ پیش از مسیرهای قدیمی SQL/container برمی‌گردد. این گزینه با `--source` یا `--target-copy` ترکیب نمی‌شود.
- [مصرف‌کننده مشترک نسخه۱](../../../scripts/ops/cashflow-checkpoint/corrected-checkpoint-consumer.py) برای هر دو نام caller مجاز است. کد آن با SHA ثابت، کد gate با SHA ثابت و binding تاریخی با SHA ثابت پین‌اند. packet شامل سه مقدار base64 به نام consumer، gate و binding است؛ ورودی نصب‌کننده حداکثر۱۲۸KiB است. ابزار پشتیبان همین بسته را از فایل‌های بررسی‌شده موجود می‌سازد؛ هیچ credential داخل packet نیست.

```powershell
pwsh -NoProfile -File scripts/ops/cashflow-checkpoint/backup-checkpoint.ps1 -Action ReviewCorrectedCheckpoint -CheckpointId 20261030T215307Z -ReviewedHelperSha256 1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2
```

کدها از طریق SSH در حافظه اجرا شدند؛ فایل منبع روی سرور نصب نشد. gate همان قفل اشتراکی، هویت مبدأ/کپی، کپی متوقف و بدون شبکه، اصل failed، تصحیح مستقل۱۹ACL و کل dump را تازه می‌خواند. هیچ نتیجه cached به‌جای بررسی زنده وارد نمی‌شود. زمان خروجی PowerShell ممکن است با منطقه محلی نمایش داده شود؛ hash اصل فایل‌های receipt مربوط به بایت‌های همان فایل‌هاست.

## نتیجه آزمون

۱۱ آزمون مرزی موفق‌اند: تغییر کد/binding، ورودی نامعتبر، نام caller خارج فهرست، بازبرچسب‌زدن failed، تغییر هویت/آرشیو/شبکه، ورود مجوز نوشتن و خروج زودهنگام مسیر بررسی از نصب‌کننده. این آزمون‌ها SSH/SQL/Docker ندارند. علاوه بر آن، هر دو caller واقعاً gate را روی Linux اجرا کردند و اصل failed و تصحیح مستقل را با هم مصرف کردند؛ dump کامل۲٬۴۰۶٬۵۴۶٬۲۹۵بایت در هر اجرای جدید خوانده شد. تکرار خواندن برای دو caller تازه است، نه بازاجرای backup/restore.

هر۱۶ آزمون قدیمی Capture/Verify پس از این تغییر موفق‌اند؛ C# رمزگذاری، AES/HMAC/DPAPI، قالب هفت‌فایلی و شرط اصلی passed تغییر نکرده‌اند. نسخه و hash دقیق بایت‌های اجراشده در رسید است. داده/کلید/فایل رمزگذاری‌شده آموزشی آزمون داخل Git وارد نشد.

## محدودیت باقی‌مانده و اقدام بعدی

`readOnlyConsumerIntegrated=true` فقط همین دو مسیر بررسی است. `captureVerifyProfileIntegrated=false` و `legacyApplyPathIntegrated=false` صریح می‌مانند. اصل failed به passed تبدیل نمی‌شود؛ مسیر قدیمی Capture/Verify هنوز نمی‌تواند بسته تصحیح‌شده را آرشیو و تصدیق کند و مسیر اعمال قدیمی همچنان checkpoint۲۳اکتبر دارد. این گزینه جدید، راهی برای اعمال SQL جدید با آن نصب‌کننده قدیمی نیست.

برای نصب، profile نسخه‌دار رمزگذاریِ همه رسیدهای وابسته، بازیابی مستقل، وضعیت schema/ظرفیت تازه، build متصل به مقصد، خواننده سازگار قبل از نویسنده، برگشت نسخه، Storage binary در صورت وابستگی و حق واقعی خدمت هنوز گیت جدا هستند. مسئول اتصال عملیاتی و مقصد root است؛ هیچ SQL، شروع/توقف container، انتقال پشتیبان، نصب، Hermes یا هزینه تازه از این دو اجرا انجام نشد.
