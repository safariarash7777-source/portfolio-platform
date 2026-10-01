# تحویل قرارداد داده، روش‌شناسی و انتقال Git

پیگیری runtime در worktree مستقل اجرا شد: [نتیجه و محدودیت‌ها](FX-PORTABLE-RUNTIME-RESULT.md)، [شاهد اجرا](portable-runtime-evidence.json)، [هویت نسخه اصلاح‌شده](PORTABLE-RUNTIME-MANIFEST.json). runtime محلی Windows با fixture آفلاین PASS؛ container لینوکس و نصب زنده اجرا نشده‌اند. جدول زیر وضعیت تحویل اولیه است؛ وضعیت portable اولیه NOT TESTED با این آزمون محلی تکمیل شد.

نسخه مرجع: **۱ اکتبر ۲۰۲۶ — FX-REVIEW-NEXT**. این پوشه متعلق به همین تسک است؛ README مرکزی پروژه تغییر نکرده است.

## نتیجه قابل تحویل

| خروجی | نتیجه |
|---|---|
| استخراج قرارداد و مصرف‌کننده | PASS برای استخراج مستند؛ اعتبار همه ورودی‌های قدیمی تأیید نشده |
| وجود دو اختلاف روش در Production | PASS برای تطبیق hash کد فعال؛ استخراج خروجی مالی نشست انجام نشد |
| منبع هم‌تعریف تاریخچه ماهانه YTM | BLOCKED؛ سند وزن/جهان/تجمیع benchmark قدیمی تأیید نشد |
| بسته انتقال به Git موجود | آماده بازبینی؛ compile و بررسی bounded الگوی credentials؛ اجرای runtime portable هنوز NOT TESTED |
| نصب زنده/اجرای کامل/Hermes schedule/wrapper | NOT EXECUTED / UNCHANGED |

## اسناد اصلی

- [قرارداد ورودی‌ها، فرمول‌ها و اثر بر تب‌ها](DATA-CONTRACTS.md)
- [تصمیم‌های انسانی با گزینه و اثر](DECISIONS.md)
- [پژوهش تاریخچه YTM و معیار هم‌تعریفی](YTM-RESEARCH.md)
- [نصب، وابستگی‌ها و rollback](INSTALL-ROLLBACK.md)
- [قرارداد وضعیت/خطا/۱۲ تب برای فرانت](FRONTEND-CONTRACT.md)
- [شاهد مقایسه آفلاین و محل توابع](contract-evidence.json)
- [شاهد تطبیق کد فعال Production](production-contract-evidence.json)
- [نسخه runtime سرور](server-runtime.json)، [شناسه base immutable](base-image-id.txt)
- [manifest مسیرها، hash و تغییرات portable](TRANSFER-MANIFEST.json)، [رسید archive](TRANSFER-RECEIPT.json)

## تفکیک تازه از قدیمی

یافته جدید M-01: GDP ایران دلاری جاری در ECM پیش‌فرض، پراکسی اسمی است؛ ستون GDP آمریکا با پایه ثابت۲۰۱۵ در **جدول عمومی** وجود دارد اما پیش‌فرض ECM آن را مصرف نمی‌کند. خروجی ترکیبی ممکن است ECM را دربرگیرد. BEER پیش‌فرض GDP ندارد و تحت اختلاف نفت/CPI قرار می‌گیرد.

یافته جدید M-02: برآورد OLS با عنوان Frenkel–Bilson، تفاضل تورم تحقق‌یافته را در ستون نرخ بهره می‌گذارد. مسیر سری/backtest بدون نرخ بهره واقعی به Basic سقوط می‌کند. این دو مسیر یک مدل تلقی نمی‌شوند. Production نیز همین کد را دارد؛ مسئله صرفاً تازگی داده نیست.

در بررسی نهایی سطح M2، آستانه مطلق بر حسب **همت** از آستانه درصد جدا شد: ۲۵/۵۲ تطبیق سطح با آستانه دقیق؛ ۴۸/۵۱ تطبیق رشد. تطبیق آزمایشی با آستانه بزرگِ۰٫۱۵ همت، ۵۱/۵۲ بود اما برای مقدارهای کوچک تاریخی شاهد قوی محسوب نمی‌شود و نتیجه پذیرفته نهایی نیست. اختلاف ممکن است گردکردن/بازنگری باشد؛ بدون سند علت تعیین نمی‌شود. قرارداد پول «پایان سال Q4» هنوز تصویب‌شده قدیمی معرفی نمی‌شود.

هیچ سری مبهم به مدل متصل نشد؛ canonical `DATA` و تورم تغییر نکردند. کد formula، Production، job/cadence/model Hermes و wrapper فرانت دست نخورده‌اند. template انتقال به Git با hook فعال فرق دارد و فقط برای نصب آینده پس از بررسی است.

## فایل‌های حجیم و شواهد قبلی

بسته قابل انتقال: `C:/Users/Asus/Documents/Codex/2026-09-29/new-chat-2/outputs/fx-git-transfer-20261001.tar.gz`؛ SHA در TRANSFER-RECEIPT.json. داده خام عمومی شش Excel و نمونه YTM در بسته قبلی `outputs/fx-maintenance-handoff-20261001.tar.gz` با identity در `outputs/fx-maintenance-file-identities-20261001.json` قرار دارند؛ وارد درخت Git جدید نمی‌شوند. این مسیرها داخل پروژه‌اند، temp OS نیستند. هنگام تحویل به Git، مالک باید artifact را در محل حفظ artifacts پروژه نگه دارد و SHA مرجع را حفظ کند؛ انتقال cloud/storage در این مأموریت انجام نشد.

نسخه evidence قابل حمل در `docs/ops/fx-maintenance/evidence/` داخل archive نگه‌داری می‌شود: manifest قبلی، لاگ‌های local/candidate، receipt بازخوانی ایزوله، نگاشت CBI و گزارش YTM. gate قدیمی صرفاً نسخه candidate قبلی را پوشش می‌دهد؛ runtime portable یا پذیرش Production محسوب نمی‌شود.

وابستگی سهمیه: PR178 با SHA `4ce06b3ffbd6b50125021faeb454fbf11c73b900` طبق تحویل مالک زیرساخت آزمون ایزوله دارد، **NOT DEPLOYED**؛ در این چت تست‌های آن دوباره اجرا نشده‌اند. مصرف واقعی روز، مرز reset و legacy enforcement زنده همچنان گیت هستند. دریافت اختیاری و bulk repair مجاز اعلام نمی‌شوند.

## اقدام بعدی

مدیریت تصمیم‌های D-FX-01 و D-FX-02 و محدودسازی candidate را بررسی کند؛ سپس قرارداد CPI/پول/نفت را تعیین کند. مالک Git bundle را روی شاخه خودش، با diff/hash و اتصال امن داده/config وارد کند و تست runtime نسخه transformed را اجرا کند. پس از گیت سهمیه و اجازه انتشار، نصب/rollback طبق runbook؛ پذیرش `/admin/fx` مستقل با فرانت انجام شود.

مهارت‌های مؤثر: analyze-data-quality برای grain/تعریف/واحد/تطبیق؛ iran-market-data برای مرز metadata و توقف fetch اضافی؛ verification-before-completion برای تفکیک compile، hash source، UI gate و انتشار. اسکیل خوانده‌شده ولی اجرا نشده به عنوان استفاده گزارش نمی‌شود.
