# FX-LINUX-RUNTIME-RESULT — ۱ اکتبر ۲۰۲۶

## نتیجه

**PASS برای runtime سرویس portable روی Linux با همان checkpoint `bce2e9e86a21c474742d0bedb76163f753fd7a00`.** مانع قبلی نبود image در Docker محلی با استفاده از image موجود روی همان سرور قبلی برطرف شد؛ image جدید دانلود یا build نشد. source و manifest و branch checkpoint تغییر نکردند و worktree clean است.

base immutable واقعی: `sha256:833e161e172392df43e7bd95cb6b1d2884f863dfb54bf2234344668a8da31795`. وجود image و منابع ابتدا فقط‌خواندنی بررسی شد: حدود ۶٫۵GB حافظه آزاد و ۵۷GB دیسک آزاد؛ تست محدود به یک CPU، ۱GiB RAM، ۲۵۶ PID و tmpfs ۵۱۲MiB بود. هیچ اجرای تستی در کانتینر فعال Production انجام نشد.

## پذیرش واقعی

| کنترل | نتیجه |
|---|---|
| هویت کد | ۱۰۵ hash در PORTABLE-RUNTIME-MANIFEST با source mounted Linux تطبیق داشت؛ archive شامل manifest نیز ۱۰۶ فایل دارد |
| ورود | مهمان و رمز نادرست صفر تب؛ رمز تصادفی آزمایشی معتبر هر ۱۲ تب را رندر کرد؛ HMAC معتبر/نامعتبر کنترل شد |
| UI | AppTest واقعی هر ۱۲ تب بدون exception؛ سه محور مستقل و تازه‌سازی موفق |
| startup | process واقعی Streamlit داخل کانتینر روی loopback؛ health و HTTP موفق؛ پورت عمومی وجود نداشت |
| مسیر داده | symlink فقط در source آزمایشی برای data-health؛ هر شش Excel عمومی با hash/schema/واحد/دوره خوانده شد؛ resolve در Linux صحیح |
| قطع منبع | دو تلاش IFB پیش از خروج شبکه مسدود شد؛ bytes/date/SHA pointer آزمایشی حفظ شد |
| receipt و موعد | publisher با transport محلی شبیه‌سازی‌شده، readback bytes، رد receipt ناسازگار و موعد عقب‌افتاده موفق |
| شبکه و mount | `network=none`، rootfs read-only، source/fixture/runner mounts read-only، cap-drop ALL و no-new-privileges؛ upstream connections صفر |
| ورودی | hash همه فایل‌های fixture قبل/بعد یکسان؛ ارقام مدل مصنوعی و Excelهای CBI عمومی آرشیوی‌اند؛ داده/secret کاربر منتقل نشد |
| Production | ID/image/running/start timestamp و SHA تنظیم mount قبل/بعد یکسان؛ exec یا mount فعال برای تست انجام نشد |

اجرا در ۱۵٫۷ ثانیه، exit ۰، بدون اصلاح source checkpoint تمام شد. نام container آزمایشی `fx-portable-linux-20261001-bce2e9e` و پوشه اختصاصی `/tmp/fx-portable-linux-20261001-bce2e9e` است؛ container پایان یافته و متوقف است. گزارش/log خصوصی آزمایش در همین پوشه جدا از سرویس نگه داشته می‌شود. حجم/کانتینر/config فعال دست‌نخورده ماند؛ mount هیچ volume زنده‌ای به container تست نداد.

## مرز نتیجه

- این پذیرش **سرویس داشبورد** روی Linux است. hook موجود Hermes ویندوزی است و روی Linux اجرا نشد؛ job، cadence پنج‌روزه، مدل و config فعال همچنان حفظ‌اند. انتقال عامل به سرور همیشه‌روشن در این مأموریت نیست.
- transport publisher همچنان شبیه‌سازی‌شده است؛ SFTP فقط برای انتقال و بازخوانی hash آرشیوهای آزمایشی به پوشه ایزوله استفاده شد، نه انتشار وضعیت سرویس زنده.
- fixtureها تازه‌بودن واقعی داده بازار، تاریخچه هم‌تعریف YTM یا اعتبار روش اقتصادی را اثبات نمی‌کنند. D-FX و گیت سهمیه و انتشار بازند؛ هیچ formula یا اتصال سری مبهم تغییر نکرد.
- browser/download/mobile/fullscreen و مدیر واقعی `/admin/fx` از این تست نتیجه نمی‌شوند. wrapper و Production تغییر نکردند؛ live fetch و پیام خارجی صفر.

## تحویل و بازبینی

`linux-runtime-evidence.json` شاهد اجرای Docker و hashes ورودی‌هاست. `PORTABLE-CHECKPOINT-RECEIPT.json` هویت checkpoint و archive اولیه را حفظ می‌کند؛ وضعیت تاریخی NOT_TESTED در آن با این گزارش Linux تکمیل شده و receipt اولیه overwrite نشده است. archive همان SHA `d455bba077d6c9bcf392b1374185cb29e3c29d380bc515cf7296de1ffbc774dc` را دارد.

در زمان اجرای Linux checkpoint محلی بود. مرحله تحویل مهندسی، همین runtime SHA را همراه commit جداگانه مستندات به شاخه `codex/fx-portable-runtime-20261001` push و Draft PR با base شاخه PR178 آماده می‌کند. SHA مستندات و URL در body/رسید تحویل ثبت می‌شوند؛ push/PR مجوز merge یا نصب زنده نیست. GIT-HANDOFF.md رابطه پایه و هویت artifacts را توضیح می‌دهد.

runner خارجی و fixture archive در outputs با checksum ثبت شده‌اند؛ raw workbookها خارج Git باقی‌اند. README مرکزی و checkout لیارا تغییر نکردند. این گزارش، گیت runtime قبلی را تکمیل می‌کند؛ انتشار یا قابلیت تازه انجام نشده است.
