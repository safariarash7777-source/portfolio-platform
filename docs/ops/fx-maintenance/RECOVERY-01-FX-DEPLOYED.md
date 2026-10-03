# RECOVERY-01 FX — نصب و مشاهده واقعی، ۳ اکتبر ۲۰۲۶

با receipt P00 نسخه محدود روی سرویس اصلی نصب شد؛ فقط agent_status_ui.py و maintenance_status.py. تصویر486452d0… healthy و HTTPS /_stcore/health پاسخok داد. readback مستقل حفظenvironment/network/restart/data mount/command وhash app/models/data_sources/auth وهرچهارExcel را تأییدکرد. image833e… وcontainer اصلی بانامfx-dashboard-recovery01-status-backup محفوظ/متوقفاست. هیچ مدل/منبع/داده مالی عوض نشد؛ full212 نصب نشد.

پنل اصلی FX اکنون سه محور جدا دارد وازفایل واقعی سرور درآزمون component سه‌محور/zeroexception PASSشد. گزارشmetadata وreceipt باchecksum رویسرور تطبیق داده شد؛ run واقعی20260930T221759Z وupdated/finished2026-09-30T22:21:28.922931Z محفوظ‌اند، یعنی آخرین گزارشاقتصادی۱اکتبر۰۱:۵۱تهران؛ publication جدید۳اکتبر به‌معنیبررسی اقتصادی جدید نیست. execution=completed،source_health=degraded،data_completeness=incomplete.

## عامل واقعی

همانHermesjob9f78482170f4 وjobstore byte-for-byte محفوظاست: gpt-6-luna/openai-codex، deliverlocal، پنج‌روز. WindowsTaskHermes-FX-ExistingJob-Ticker برایcurrent-userInteractive/Limited ثبتشد؛ هر۱۵دقیقه وهنگامlogon فقطدوباره dueبودن همانjobرا بررسی می‌کند. TaskLastResult0 وtickerreceiptactual10:14:29Z /۱۳:۴۴تهران ثابت شد؛ هیچrunاقتصادیextra اجرا نشد. نوبتاقتصادیبعد:۶اکتبر۰۱:۵۱:۵۵تهران. timezone لپ‌تاپIranStandardTime، VMUTC. روشن‌بودن وورودکاربر شرط اجراست؛ هنگامخاموشی/خروج، Hermes/monitorCodex محلی اجرا نمی‌شوند؛ داشبورد وtimerساعتیTGJU/health رویVM مستقل می‌مانند. انتقال بهسرور انجام نشده؛ هزینه سرویس جدید صفر.

CLI gateway همچنان لازم نیست فعال نامیده شود؛ این احیایticker موجود باWindowsTaskاست، نهساختعامل جدید یاادعایdaemonHermesفعال.

## اصلاح اتصال و رخداد سازگاری

ابتدا helperportable ازبسته باFX_VM_CONFIG_DIR لازم کپی شد ودرhealthreadback KeyErrorداد؛ هیچprovider/datawrite دراینخواندن نبود. اصلاح فوری درهماندامنه: helperlegacy اصیل ازbackupبرداشته شد وفقطبلوکproxyselection باmoduleتأییدشده تغییرکرد؛ تمامpaths/config/TLS/knownhosts/authpolicy/argv قبلی باقی. اختلافexact-block وSSH/HTTPS واقعی PASS. hashhelperنهاییafc8a58e29d292711840c9ac58d29ce7de409ece4150153a9d17615ea74f0d46،module7d8d34cd…؛ فایلportableGitهمچنانconfigexplicitمی‌خواهد. backupها/لاگticker/task/config خصوصی وخارجGit/chat محفوظ‌اند. دستور بازسازی دقیق legacy درoperations/repair_legacy_connection.py ثبتاست.

## محدودیت داده و پذیرش

- قیمت/تاریخچهTGJU آخرینsourceDate۱اکتبر؛ دریافت۳اکتبر راقیمتروزنمی‌نامیم. cacheرله۳اکتبرtradeDateتک‌quoteندارد؛ quota/PGRST202/legacyguard هنوزدرشاهد09:55Z مشکلداشت. remainingunknown؛ directBrsApi/backfill صفر.
- SCIشهریور۱۴۰۵/pub۸مهر تأییدشده درفایل؛ CBIششExcelآرشیوی باpublicationunknown وقراردادمدلهای مبهم مسدود. نرخروزاخزا۳۰سپتامبر مستقل ازYTMماهانه/real-interestتا۱۴۰۵/۰۳ وbenchmarkناقص است. syntheticanchor وارد سرویس نشد.
- guest واقعیVercel `/admin/fx` بهlogin رفت؛ loginمدیر، memberdenial،۱۲تب/download/fullscreen/mobile/refresh رویاصلی **هنوز پذیرفته نشده**. آزمونcomponentیاstandalonehealthy بهجایآننیست. ورودمدیر ونسخهwrapper باP00/P01 است؛ اصلMainfrontend/Auth دست نخورده است.

## بازگشت

python3 /tmp/recovery_fx_status_release.py rollback --manifest /tmp/recovery-fx-status-manifest-20261003.json

container/imageقدیمی حفظشده، دادهfinancialهمانmountاست. metadataجدید باUIقدیمcompatible وbackupقبلانتشار درreleases/recovery01-status-20261003/metadata-before محفوظ. WindowsTaskباinstall-windows-hermes-ticker.ps1 -Uninstall برداشته می‌شود؛ job پنج‌روز دست‌نخورده می‌ماند. helperاصلی ازprivatebackupreceiptقابلبرگشتاست. هیچdatabase migration یاحذف انجام نشده.

**اثر عملی تحویل‌شده:** نصبstatus اصلی، انتشارmetadataverified، احیایزمان‌بندlocal. **باقی:** پذیرشپنل اصلی باprincipalواقعی، quotaزنده وچرخهطبیعیمنابع؛ همه‌داده‌ها تازه/کامل اعلام نشده‌اند.
