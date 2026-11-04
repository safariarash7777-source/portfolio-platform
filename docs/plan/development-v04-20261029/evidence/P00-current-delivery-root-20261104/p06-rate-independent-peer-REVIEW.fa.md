# بازبینی مستقل rate hotfix — source-only

source دقیق: `73c4b3ab769fe915f15c32206e5c8de7c6159a48`، checkout خواندنی `company-tools-20261024`. نویسندهٔ اولیه agent_runtime و integrationreview از این peer جدا بودند. diff۲۱ مسیر و source actual transport، policy، producer wiring، caller retry/codal cursor و existing workflow/readiness خوانده شد. هیچ test، API، CLI، WS، dispatch، SQL یا mutation source انجام نشد.

نتیجه: در دامنهٔ source بررسی‌شده P1/P2 پیدا نشد.

- `relay/brsapi-transport.mjs`: singleton process-local؛ monotonic clock و failclosed رویinvalid/backwardclock؛ full۵دقیقه cold-start پیشازاولینsend؛ فاصلهحداقل۳۰۰ms بعدازreturnheaders؛ rolling۳۰۰در۳۰۰۰۰۰ms و۲۰در۱۰۰۰ms؛ failed fetch attempts نیزدرstartsمی‌مانند. admission/accounting/fetch بدونawaitمیانی، queue≤۲۵۶، queuedabortبدونsend،redirect:error؛ processهای دیگر هماهنگ نمی‌شوند.
- production imports ازsharedbrsFetch در server،client،codal،commodity،ime،options،symbol-detail وcandle-backfill وجود دارد. fetch injection آزمایشی جای wiring پیشفرض را عوض نمی‌کند.
- client/codal/codal-engine localdeferral را providerfailure/retryفوری نمی‌نامند؛ feed incomplete وbackfillcursor محفوظ می‌مانند. این تغییر، retry عادیprovider راحذف نمی‌کند؛ تمامstartsهمچنانpaced هستند.
- server پسازlisten stored baseline راhydrateمی‌کند و پسازwaitForBrsReadiness producer jobs راarmمی‌کند. transportخودش نیزcoldgateدارد؛ سلامتlistener معادلfreshdataنیست.
- deploy acceptance ازpassive/debug وrequireTransportPolicy=true استفاده می‌کند؛ policy نیازمند sent≥۲ وminStartGap≥۳۰۰ است. metrics صریحاًglobalEnforced=false/priorProcessWindow=unknown/process_lifetime است؛ currentplan/globalquota اثبات نمی‌شود.
- regression source شاملcoldstart،mixedkeys/hosts،rollingfailure،oversleep/earlywake،abort،invalidclock،queuebound،localfailure وactualserverwarmup است. نتیجهٔاجرای تست رااینpeer مستقلاًتولید نکرده وادعای freshPASSندارد.

حدود: اینsourceقبولی process-local است؛ نه مالکیتglobalcollector، نهproviderplan/daybaseline/budget، نهcurrentreleaseimage یاrollbackrunnability ونهdeployment/browseracceptance. root مالک cutover/اجرای بعدی است و gateهایidentity/rollback مستقل باقی می‌مانند.