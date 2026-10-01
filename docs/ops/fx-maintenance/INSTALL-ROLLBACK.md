# انتقال به Git موجود و نصب/بازگشت — اجرا نشده

پیگیری ۱ اکتبر: import به worktree مستقل و runtime آفلاین Windows انجام شد؛ [گزارش پذیرش](FX-PORTABLE-RUNTIME-RESULT.md). نصب/بازگشت زنده و اتصال config واقعی همچنان اجرا نشده است. مراحل زیر runbook اصلی‌اند؛ ادعای NOT EXECUTED انتهای سند مربوط به تحویل اولیه است و اکنون فقط import/checkpoint و آزمون محلی طبق گزارش پیگیری تکمیل شده‌اند.

## مالک و مقصد

خواندن ساختار فعلی در `C:/Users/Asus/Documents/Codex/2026-09-29/c-users-asus-documents-codex-2026/work/portfolio-platform` انجام شد. شاخه مشاهده‌شده `codex/liara-budget-guard-20261001`، HEAD `4ce06b3ffbd6b50125021faeb454fbf11c73b900` متعلق به چت زیرساخت است. در آن checkout چیزی ویرایش، stage یا commit نشد. سند SERVICE-OWNERSHIP بعضی نام‌های Supabase قدیمی دارد؛ آن‌ها مقصد فعلی این مأموریت تلقی نمی‌شوند. مقصد DB فعلی همان خودمیزبان لیارا است و تغییرش با مالک زیرساخت است.

مسیر پیشنهادی برای مالک Git: `scripts/fx-maintenance/` برای منبع **همین** سرویس/maintenance و `docs/ops/fx-maintenance/` برای اسناد مرجع. این دو مسیر در bundle مشخص‌اند؛ ساخت repo یا اجرای سرویس موازی نیست. مسیر داخلی work حفظ می‌شود تا import/pathهای collector و publisher پراکنده عوض نشوند. `.data_health`، Excel مالی مدل، auth_private، known-hosts خصوصی، env و Hermes jobs.json وارد Git نمی‌شوند؛ داده و تنظیمات از محل امن موجود متصل می‌شوند.

## پیش‌نیازهای واقعی

- بسته `fx-git-transfer-20261001.tar.gz` و `TRANSFER-MANIFEST.json`: source/target path، SHA، تبدیل‌های محدود و dependency.
- پایه اجرایی موجود با شناسه immutable در `base-image-id.txt`؛ candidate پیشین با image ID ثبت‌شده در manifest تحویل قبلی. build فایل Docker قدیمی با requirements دارای >=، بازتولید دقیق runtime را تضمین نمی‌کند؛ برای این انتقال لایه روی همان base ثبت‌شده ترجیح دارد. constraints محلی و metadata نسخه سرور جدا ثبت شوند؛ یکسان فرض نشوند.
- Windows Python/venv موجود و bundled Python برای SSH/PDF؛ بسته وابستگی جدید نصب نشده است. Paramiko vendored و config امن موجود از `FX_VM_CONFIG_DIR` خوانده شوند؛ محلشان در Git ذخیره نمی‌شود.
- سه Excel اصلی و سند داده-health موجود: checksum/backup پیش از اتصال. اگر منبع قبلی موجود نیست، نصب با null/blocked متوقف شود؛ از Git نرخ یا forecast جایگزین نسازید.
- گیت سهمیه با شاهد تعیین مصرف قبلی روز و مرز روز؛ PR178/CI و تست ایزوله، نصب زنده نیست. سهمیه تا تعیین باقیمانده، مجوز دریافت اختیاری نمی‌دهد.
- تصمیم‌های D-FX و محدودسازی روش candidate قبل از معرفی خروجی‌ها به‌عنوان تأییدشده.

## ترتیب انتقال، توسط مالک checkout

1. commit مقصد و تغییرهای جاری خود را بررسی کند. bundle را **خارج checkout** باز و با SHA manifest تطبیق دهد. اگر target file از قبل هست، SHA قبلی را ثبت و diff بررسی کند؛ overwrite خودکار نباشد.
2. فقط مسیرهای مشخص bundle را به شاخه متعلق به همین تسک منتقل کند. README مرکزی دست نخورد؛ مدیریت لینک‌ها را جمع می‌کند. اسناد/شواهد مرجع در docs/ops هستند و artifacts حجیم بیرون Git با SHA ارجاع دارند.
3. template hook portable به `FX_MAINTENANCE_ROOT` نیاز دارد. برای SSH، `FX_VM_CONFIG_DIR` محل config و vendor **موجود** است. `FX_BUNDLED_PYTHON` مسیر runtime خوانده‌شده و `PPP_EXCEL / INFLATION_XLSX / RISKFREE_YTM_XLSX / BOURSE_XLSX / FX_DATA_DIR` به داده محلی موجود اشاره کنند. template آینده است و hook فعال فعلی تغییر نکرده.
4. چون بعضی collectorها هنوز `.data_health` را از مسیر داخلی می‌خوانند، در نصب محلی مسیر `scripts/fx-maintenance/work/liara-deploy-20260929/fx-dashboard/.data_health` باید به همان data-health محلی موجود متصل شود (junction یا mount کنترل‌شده، خارج Git). **بدون این اتصال اجرای کامل ممنوع**؛ صرف ست‌کردن FX_DATA_DIR کافی نیست. ساخت اتصال اکنون انجام نشده.
5. static compile، تست قرارداد با فایل‌های عمومی آرشیوشده، نسخه dependency و offline UI gate در candidate جدید انجام شوند. آزمون‌های candidate پیشین پذیرش نسخه portable transformed را اثبات نمی‌کنند.
6. source scan و secret scan پروژه، build، role/auth gate و hash code/data تطبیق داده شوند. PR/SHA مقصد ثبت شود؛ این تحویل PR جدید نمی‌سازد.

## نصب داده/کد پس از گیت‌ها

1. backup فایل‌ها و config/hook موجود با SHA و timestamp، بدون چاپ secret؛ نام image فعال و کانتینر rollback ثبت شود. داده financial DB تغییر نمی‌کند.
2. کد سرویس فعلی روی پایه immutable build شود؛ candidate بدون پورت عمومی، network none و volume read-only با gate آفلاین بررسی شود. Docker context باید طبق .dockerignore از داده/secret پاک باشد.
3. metadata و pointerهای داده جدید فقط اگر سند و validator آنها پاس است منتقل شوند. برای این بسته، سری CBI مبهم هنوز write-enabled نیست. publisher وضعیت bytes سرور را بازخوانی و receipt جدا می‌سازد.
4. با اجازه انتشار و پس از gate مستقل، کانتینر فعلی متوقف و با نام rollback حفظ شود؛ همان network، env امن و volume پایدار در کانتینر جدید استفاده شود. `FX_REQUIRE_AUTH=1` حفظ؛ secret با env فایل موجود، بدون درج در فرمان/log.
5. hook فعال فقط پس از نصب مسیر/dep و backup از template approved جایگزین شود. **cadence، job id، model، toolsets و wrapper تغییر نکنند.** اجرای کامل در این مأموریت انجام نشده و فقط پس از گیت‌ها مجاز است.

## کنترل پس از نصب

health HTTPS و localhost؛ login واقعی مستقل؛ ۱۲ تب؛ checksum code/سه Excel و status/receipt؛ timestamp قدیمی با انتشار جدید تازه نشود؛ قطع IFB pointer را تغییر ندهد؛ فایل CBI نامعتبر مانع model write شود؛ running قدیمی/overdue اخطار داشته باشد. سپس پذیرش واقعی `/admin/fx` با مدیر، مهمان/عضو عادی، موبایل، fullscreen، refresh و download توسط فرانت جدا انجام شود.

## بازگشت

- در شکست startup/auth/UI: کانتینر جدید متوقف شود، کانتینر rollback حفظ‌شده با نام اصلی و همان volume/env/network راه‌اندازی شود؛ کانتینر قبلی یا backup حذف نشود.
- فایل مدل فقط اگر در همین release تغییر معتبر داشته بازگردد؛ قبل از restore، SHA فایل جاری با SHA release تطبیق داده شود تا تغییر بعدی دیگران overwrite نشود. این بسته مدل را تغییر نداده است.
- hook و config از backup مشخص restore شوند؛ schedule/job فایل دست‌کاری نشود. receipt باید به bytes نسخه restoreشده اشاره کند؛ رسید release جدید برای گزارش قدیمی نگه داشته نشود.
- لایه DB سهمیه rollback مستقل و با مالک زیرساخت است؛ روی جدول‌های مالی یا داده تاریخی هیچ rollback خودسرانه انجام نشود.

### وضعیت اجرا

انتقال به checkout، commit/PR این بسته، نصب template، junction، swap Production، اجرای کامل Hermes و تغییر wrapper **NOT EXECUTED** هستند. بازبینی source و بسته‌بندی portable صرفاً آماده‌سازی قابل بررسی است.
