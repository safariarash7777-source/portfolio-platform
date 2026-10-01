# تحویل مهندسی FX portable — ۱ اکتبر ۲۰۲۶

## SHA و پایه

- runtime آزموده‌شده Windows و Linux: `bce2e9e86a21c474742d0bedb76163f753fd7a00`؛ هیچ تست runtime تازه در مرحله push لازم یا اجرا نشد.
- پایه ثابت و inherited از PR178: `4ce06b3ffbd6b50125021faeb454fbf11c73b900`، شاخه `codex/liara-budget-guard-20261001`، [PR178](https://github.com/safariarash7777-source/portfolio-platform/pull/178) همچنان Draft و NOT DEPLOYED هنگام بررسی بود.
- شاخه تحویل: `codex/fx-portable-runtime-20261001`؛ Draft PR به **همان شاخه PR178** هدف‌گذاری می‌شود تا diff فقط `scripts/fx-maintenance/` و `docs/ops/fx-maintenance/` باشد. به main یا branch دیگری retarget نمی‌شود.
- commit مستندات پس از runtime، فقط گزارش/evidence/manifest تحویل را اضافه می‌کند؛ SHA دقیق آن پس از commit در PR body و رسید تحویل بیرون Git ثبت می‌شود. parent runtime است؛ هیچ کد اجرایی، فرمول یا config تغییر ندارد.

## هویت artifacts

TRANSFER-MANIFEST.json هویت bundle اولیه ورودی را دارد؛ PORTABLE-RUNTIME-MANIFEST.json هویت ۱۰۵ فایل checkpoint runtime را دارد و از افزودن مستندات Linux تغییر نمی‌کند. archive runtime شامل manifest نیز ۱۰۶ فایل دارد و خارج Git است. DOCS-DELIVERY-MANIFEST.json هویت اسناد افزوده و external inputs/output evidence را جدا ثبت می‌کند؛ manifest خودش و SHA commit containing آن عمداً self-hash ندارند.

شواهد Linux فقط metadata عمومی/مصنوعی‌اند؛ مسیر ماشین حذف شد. raw Excel، fixture archive، runtime archive، log خصوصی، cron/jobs، .data_health، secrets و config فعال commit یا push نمی‌شوند. source موجود checkpoint طبق تحویل قبلی باقی است؛ تغییر source جدید در این مرحله صفر است.

## گیت باز

Windows/Linux runtime با fixture PASS؛ transport انتشار metadata همچنان شبیه‌سازی‌شده است. UI سایت `/admin/fx`، browser/mobile/download، D-FX، تاریخچه هم‌تعریف YTM و سهمیه واقعی روز/انتشار بازند. PR178 CI یا این Draft، نصب سهمیه یا fresh financial data را اثبات نمی‌کند. merge، deploy، تغییر Hermes/model/cadence یا formula مجاز نشده و انجام نمی‌شود. پس از این تحویل، ادامه به تصمیم‌های D-FX و گیت سهمیه وابسته است.
