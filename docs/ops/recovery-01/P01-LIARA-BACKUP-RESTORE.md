# RECOVERY-01 — بکاپ تازه مقصد واقعی و شاهد بازیابی P01

**PASS برای بکاپ منطقی DB و بازیابی ایزوله؛ نه پذیرش ورود/سایت یا اجازهٔ اجرای خودکار DDL.** [رسید بدون سکرت](./P01-LIARA-BACKUP-RESTORE-RECEIPT.json). مالک نصب و manifest نهایی P00 است؛ هیچ DDL/DML/نقش/حساب/سکرت اصلی توسطP01 تغییر نکرد.

## نسخه، زمان و محل

- مقصد واقعی: `portfolio-stage-db-1` / databasepostgres درLiara62.60.191.24، همان backend اصلی `/liara-preview`؛ نامstage آن را آزمایش نمی‌کند.
- source image ثابت `postgres17.6.1.167` با digest `6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb`؛ Nativepg_dump17.6 ازداخل همانcontainer، نهCLIbackup cloud سپتامبر.
- آغاز۳اکتبر2026، **10:14:06UTC /13:44:06تهران**؛ restore نهایی **10:34:45UTC /14:04:45تهران**؛ checksum/مقایسه نهایی **10:36:46UTC /14:06:46تهران**.
- snapshot درtransaction `REPEATABLE READ READ ONLY` صادر و تا پایانdump نگه داشته شد؛ inventory مبدأ وdump ازهمانsnapshotاند. شمارش‌ها با وضعیت زندهٔ بعدی رله مخلوط نشده‌اند.
- archivecustom کامل `postgres.dump`، **2,368,435,622bytes**؛ SHA256 `f725d1b02a820b78c859584ec648100ce208f6d622086d0f29d318c319af9635` پس ازrestore دوباره خوانده و برابر بود.
- backup وrole/global SQL وcronconfig وlog/inventory خصوصی فقط `/root/portfolio-recovery-backups/20261003T101406Z`؛ directory0700/file0600 ومالکroot، خارجGit. credential/hash/rawSQL/رکورد مشتری درگزارش نیست. این نسخه هنوز offsite نیست و فایل‌های باینریStorage دردامنه‌اش نیستند.

## آزمون واقعی بازیابی

یکcontainer تازه `portfolio-recovery-proof-20261003t101406z` باهمانimagecached، بدونpull، `network=none`، بدونhostport، بدونApp/Auth/REST/Storage، memory2GB/CPU0.75 و `cron.launch_active_jobs=off`. cron درsource همoff مشاهده شد؛ وضعیتtimerهای رله جداست. سایرcontainerهایNative/Production restart نشده‌اند. محیطproof درپایان متوقف است؛ OOMfalse وsourcehealthytrue وcontainerIDsource بدونتغییر.

اولrestoreباpostgres به‌علتrolemaintenanceمحدود شکست خورد؛ nativepostgres دراینimage عمداًsuperuserنیست. retry **فقط درtargetجدا** باnative `supabase_admin` اجرا شد. role/global SQL خصوصی قبل ازrestore، CREATEROLEموجود راguardکرد؛ ALTER/grantsحفظ شدند. هیچreservedrole/drop یاgrantضعیف‌تر برایسبزشدن آزمون انجام نشد. `pg_restore --clean --if-exists --single-transaction --exit-on-error` owner/ACL راحذف نکرد؛ `--no-owner/--no-privileges` استفاده نشد.

مقایسه۱۵۱۶قلم درpublic/auth/storage/identity_private باصفرsourceOnly/targetOnly:

| آزمون | نتیجه | حد شاهد |
|---|---|---|
| شمارش دقیق همهtableهای دامنه |PASS| نه تخمینreltuples؛ متصل بهsnapshotdump |
| auth.users وprofiles شناسه‌ها |PASS| digest مجموعهID خصوصی؛ هیچUUIDدرخروجی |
| جدول/owner/ACL/RLSenabled/forced |PASS| grantor وgrant-optionحفظ شدند |
| policy/تعریفusing/check |PASS| همهscopeها وSQLdefhash |
| column/constraint/index/trigger/view/function/defaultACL/schema/extensions |PASS| هویت وتعریف، نهفقطتعداد |
| archivechecksumبعدrestore |PASS| خواندن دوبارهفایل؛ restoreexit0 |
| سالم‌ماندنsource/جداییtarget/توقفproof |PASS| metadataDocker؛ بدونsourceDDL |
| محتوای همهسلول‌ها باdigestکامل |NOT_RUN| counts/ID/structure رااثبات کلpayload نمی‌نامیم |
| Storagebinary/offsite/HTTPS/login/refresh |NOT_RUN| DBbackup جای اینآزمون‌ها نیست |

مقایسهخام۲۳اختلاف دوطرفه داشت: **فقطترتیبentryهایACL** رویauthtables وauth.jwt؛ definition/owner/RLS/grantor/privilege/optionهم‌ارز بودند. normalizeفقطentryorder راsortکرد؛ همهentry/ستارهgrant-option/grantorعیناًحفظ شد. چیزی بهignoredobjects اضافه نشده وpermission تغییر نکرد. raw وnormalizedcomparison هر دوخصوصی محفوظند.

معیار semanticACL با قرارداد رسمی PostgreSQL17 برای `aclexplode` هم‌خوان است: هر امتیاز به grantor، grantee، privilege_type وis_grantable شکسته می‌شود. [مستند رسمی ACL](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE). مقایسهٔ انجام‌شده entryهای کامل راحفظ و فقطترتیب نمایش راcanonical کرد؛ digest تعریف تابع بدون تغییر بود.

## واگذاری برایDDLمنتخب و بازگشت

P00 اکنون می‌تواند **قبل ازاثرواقعی** SQLهای محدودrelease را باhashنهایی رویهمینproofrestoreآزمایش کند؛ containerمتوقف وsnapshotقبلDDLاست. شروعفقطهمینcontainer proof وورودSQL ازstdin، بدونAuth/network/cron، باnative نقشmaintenance برایrestore/DDL. اطلاعاتخصوصیtarget فقط aggregate/status؛ SQLtestfixtureهایCI رویsourceنصب نشوند. فایل‌های دقیق phase32/core/scope/legacyholdings-owner-only وphase34 ازmanifestP00 انتخاب شوند؛ phase35/36/37/38/identity/cohort نصب خودکار نمی‌شوند. CI وschema-cache/HTTP/permissionقبولی جداگانه لازم‌اند.

بازگشتسازگار: پیش ازbinaryقبلی، writerمالی با `P04-ROLLBACK-FREEZE.sql` وwriterپژوهش با `P07-ROLLBACK-FREEZE.sql` محدود وschema-cache reload شود؛ owner-onlyholdings حفظ شود. هیچDROP/DELETE/TRUNCATE/historyrewrite به‌طورخودکار انجام نشود. سپسcode/config/assetsقبلی رویmain51fd برگردند؛ table/body/history/UUIDها بمانند. DBrestoreکامل بهProduction پس‌ازثبت‌های جدید، rollbackروزمره نیست؛ نیازبهتوقفنویسندگان، حفظتغییرهای پس‌ازbackup و تصمیم مشخصاپراتور دارد. backupقبلDDL به‌تنهایی اجازهٔازبین‌بردن داده‌های بعدی نیست.

ابزار: SSH موجود وPython3 orchestration، Docker imagecached، nativepg_dump/pg_dumpall/psql/pg_restore17.6، read-onlycatalog/aggregate وSHA256؛ مهارتSupabase وworkflowbackupپروژه استفاده شد. [backup script](./p01-scripts/liara-native-backup-restore.py)، [retry همانarchive](./p01-scripts/liara-native-restore-resume.py)، [checkنهایی](./p01-scripts/liara-native-restore-check.py). تاریخ/مسیرretry بههمینproofپین‌اند؛ scriptretry راworkflowعمومی یاProductionrestore ننامید.
