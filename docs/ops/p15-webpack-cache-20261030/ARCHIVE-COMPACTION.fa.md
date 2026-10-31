# نگهداری بدون اتلاف آرشیوهای سرد و بودجهٔ بازیابی — P15

مجاز در محدودهٔ دستور تازهٔ مالک: آزادسازی فضا بدون اتلاف داده/هزینه/اختلال، با قابلیت بازگشت. این کار حذف backup/history/proof نیست؛ نمایش خام تکراری چهار dump قدیمی پس از اثبات کامل به gzip تبدیل شد. آخرین checkpoint خام۲۴اکتبر، تمام globals/cron/inventory/receiptها، هفت proof داده‌دار، image/volume و سرویس‌ها محفوظ‌اند.

## نسخه و مسیر استفاده

ابزار [compact-archive.py](compact-archive.py) فقط چهار checkpoint ثابت زیر را می‌پذیرد. prepare اصل را حفظ می‌کند؛ promote فقط پس از تطبیق دوبارهٔ اصل/فشرده و مصرف‌کننده‌ها، نمایش خام تکراری را برمی‌دارد؛ materialize همان `postgres.dump` را بدون بازنویسی فایل موجود بازمی‌سازد. عملیات نتیجه‌نامعلوم خودکار از نو اجرا نمی‌شود؛ readback فقط رسیدها را می‌خواند.

| checkpoint در `/root/portfolio-recovery-backups` | بایت خامِ محفوظ پس از بازشدن | بایت gzip |
|---|---:|---:|
| 20261003T101406Z | 2,368,435,622 | 561,080,127 |
| 20261006T092801Z | 2,369,907,015 | 561,309,200 |
| 20261009T163452Z | 2,372,409,614 | 561,694,354 |
| 20261017T114409Z | 2,378,622,379 | 562,610,134 |

کنار هر آرشیو، `RESTORE-RAW-PATH-20261030.json` خصوصی با SHAها، بودجه و دستور دقیق بازیابی گذاشته شد. **مصرف‌کنندهٔ قدیمی ابتدا باید raw path را materialize کند**؛ gzip را مستقیم به ابزاری که `postgres.dump` می‌خواهد ندهید. نمونهٔ دستور برای اولین checkpoint:

```sh
python3 /root/portfolio-recovery-backups/archive-compaction-20261030/20261003T101406Z/tool.py 20261003T101406Z materialize
```

نسخهٔ دقیق ابزارِ بازیابی و SHA آن در prepared receipt همان checkpoint نگهداری می‌شود؛ کد بعدی جای آن را بی‌صدا نگرفته است. این فرمان فقط raw file را می‌سازد؛ DB یا سرویس را restore/start نمی‌کند. فضای پیش‌نیاز همان guard۱۰GiB به‌علاوه بایت خام و۳۲MiB است. پس از materialize، ابزار قدیمی از مسیر قبلی و بایت‌های قبلی استفاده می‌کند؛ gzip نیز حفظ می‌شود. اجرای دوبارهٔ یک عملیات ناشناخته readback است، نه replay.

## شاهد واقعی Linux

برای **هر چهار فایل**، SHA و شمار بایت کل اصل، کل stream بازشده، فایل خامِ کاملاً materializeشده در tmpfsخصوصی و فایل gzip پس از promotion سنجیده شد. `pg_restore --list` همان image پین‌شدهٔ موجود، روی فایل خام واقعی در `/recovery/postgres.dump` موفق بود: networknone، read-only، بدون capability، memory۱۲۸MiB، CPUنیم‌هسته. tmpfs فقط یک فایل هر بار، دسترسی۰۷۰۰/۰۶۰۰ و شرط RAM آزاد داشت و پس از آزمون پاک شد. این **فهرست‌خوانی واقعی آرشیو است؛ بازیابی کامل و تازهٔ DB نیست**.

هش تمام فایل‌های تاریخی دیگر هر پوشه پیش/پس برابر بود. [مصرف‌کننده‌های سه آرشیو نخست](../../plan/development-v04-20261029/evidence/P15-archive-consumers-readonly-20261030.json) و [آرشیو چهارم](../../plan/development-v04-20261029/evidence/P15-archive-consumers-additional-readonly-20261030.json): فقط containerهای exited با bind read-only، صفر FD باز و صفر ارجاع در محدودهٔ automationهای نام‌برده. این scan ادعای جست‌وجوی کل filesystem/مصرف‌کنندهٔ خارجی ندارد. پیش از هر promote همه containerهای فعال و FDها دوباره بررسی شدند؛ stoppedبودن به‌تنهایی مجوز نبود.

چهار receipt نهایی: [۳اکتبر](../../plan/development-v04-20261029/evidence/P15-archive-20261003T101406Z-promote-20261030.json)، [۶اکتبر](../../plan/development-v04-20261029/evidence/P15-archive-20261006T092801Z-promote-20261030.json)، [۹اکتبر](../../plan/development-v04-20261029/evidence/P15-archive-20261009T163452Z-promote-20261030.json)، [۱۷اکتبر](../../plan/development-v04-20261029/evidence/P15-archive-20261017T114409Z-promote-20261030.json). پاسخ prepare اول از حد۲۲۰ثانیهٔ گیرنده گذشت؛ [بازخوانی مستقل](../../plan/development-v04-20261029/evidence/P15-archive-20261003T101406Z-readback-20261030.json) موفقیت قبلی را از رسید پایدار اثبات کرد؛ prepare دوم تکرار نشد.

پس از cache و این نگهداری، در13:12:33Z فضای آزاد **۱۸٬۶۳۶٬۹۸۴٬۳۲۰بایت، حدود۱۷٫۳۶GiB** بود. شرط بودجهٔ عملیات بعدی۱۷٫۲۵GiB است: backup تازه، proofrestore و بازکردن دوبارهٔ بزرگ‌ترین آرشیو قدیمی، علاوه‌بر guard بدون کاهش۱۰GiB. این عدد «ظرفیت همیشگی» یا مجوز Hermes نیست.

## checkpoint تازه، گام بعدیِ جدا

[fresh-checkpoint.py](fresh-checkpoint.py) backup engine تازه‌ای نمی‌سازد؛ bytes دقیق helper موجود با SHA `1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2` را با همان قفل/هویت/backup/restore/مقایسهٔ سخت اجرا می‌کند. helper روی سرور تعویض نمی‌شود.۱۳آزمون موجودِ ACL/identity آن، شامل۱۲۸زیرمجموعهٔ مجاز، پاس شدند.

[scope کاتالوگ واقعی](../../plan/development-v04-20261029/evidence/P15-backup-schema-scope-readonly-20261030.json) نشان داد سه schema خصوصیِ consultation/portfolio/scope با۱۹تابع و۰relation از inventory شش‌schemaای قبلی بیرون‌اند. pg_dump موجود هیچ schema filter ندارد و کلDB را می‌گیرد؛ wrapper مقایسهٔ مکمل پیش/پس source و target را شرط موفقیت می‌کند: نام/signature، definition hash، owner/ACL/defaultACL، SECURITY DEFINER، proconfig/search_path، مجوز مؤثر سه نقش و dependencyهای کاتالوگ. query مکمل روی source در transaction فقط‌خواندنی اجرا و [اعتبارسنجی شد](../../plan/development-v04-20261029/evidence/P15-private-schema-query-readonly-20261030.json). اختلاف یا drift باعث عدم پذیرش می‌شود؛ هیچ ACL تازه‌ای خودکار مجاز نمی‌شود.

تا نتیجهٔ همین عملیات نیاید، **backup/restore تازه پذیرفته نشده است**. wrapper فقط proof تازهٔ متعلق به خودش را برای خواندن مکمل start/stop می‌کند؛ primary SQL write، migration، تغییر helper/سرویس اصلی، ارتقا، انتقال Hermes، هزینه یا خاموشی PaaS ندارد. backup منطقی DB نیز پشتیبان فایل‌های باینری Storage یا کل سرویس‌های مالی نیست. root مسئول گیت بعدی و ثبت نتیجه در COMMAND-CENTER است.
