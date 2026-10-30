# P10.1 — رویداد intent ثبت‌شده، followup مستقل

مبنا دقیق349@37b0c1b9acdd7e38bcd6d39b31d4d847892fd321؛349 فریز است. مالک فایل‌هایprojection/adapter/panel/test موجود و displaysetterهای مستقل ResearchWorkbook، C است. package/CI دررزروB350، writer/store/SQL/Auth/lock/freeze/worker/runtime دست‌نخورده می‌مانند. sharedrefs فقطroot.

## تطبیق DTO پیش از patch

همان GET فهرست موجود، saveIntents را با intentId/workbookId/baseVersion/targetVersion/preparedAt و intentNextOffset برمی‌گرداند؛ durableRecoveryAvailable=false شکست زیرخواندن را اعلام می‌کند، نه empty. GET قدیمی‌تر موجود items/nextOffset دارد. فیلد کافی است: هیچ DTO/API/storequery تازه لازم نیست. requestHash/title/requestBody/createdBy/authorMatchesSession برای این history مصرف یا کپی نمی‌شوند.

## قرارداد برش

رویداد workbook_intent_recorded با identity از intentId واقعی و source ثابت؛ زمانpreparedAt همان منبع یاnullباعلت. workbookId وbase/target فقط ازmetadataR2معتبر می‌آیند. targetVersion هرگزversionId یااثبات وجودنسخه نیست؛ intent فقطثبت‌آماده‌سازی است، نهsaveexecuted/success/start/end. duplicate همانintentId یکرویداد؛ metadataمتعارض یکID کنارگذاشته وreportمی‌شود. requestHashشناسهرویداد نیست. workerهاnot_suppliedمی‌مانند.

برای محدودیتscope/privacy، فقط آخرین صفحهٔ تأییدشده نمایش داده می‌شود، نه ادغام صفحه‌ها از نشست‌های احتمالی متفاوت. offset/cursor همان request/response موجود است؛ completeHistory همیشهfalse. nextOffset=null تکمیل کل تاریخچه را ثابت نمی‌کند. missing/loading/error/unavailable/invalid از خواندنواقعاًخالی جداست؛ درخطاmetadataقبلی پنهان می‌شود. با مرجع معتبر پرونده از349 فقطworkbookIdهمسان نمایش داده می‌شود؛ درنبود آن صفحه به‌صورت مستقل باشناسهپروندههرintent وبدونانتساب به متن بازشده برچسب می‌خورد. نسخه‌ها/reviewهای349 مستقل وپیوندreviewv1 محفوظ‌اند.

درResearchWorkbook فقطuseStateنمایشی وsetter ازهمانrefreshList/olderIntents اضافه می‌شوند؛ هیچ GET/POST جدید یا تغییررفتارR2/autoRestore/reopen/unknown نمی‌دهیم. درmetadata state فقطUUID/نسخه/زمان معتبر یا نشانگرنامعتبر غیرحساس باقی می‌ماند. panel ابزار ثبت/refresh ندارد.

## فایل/پایان

lib/intelligence/research-history.ts/test، research-history-metadata.ts، components/admin/ResearchHistoryPanel.tsx/test و ResearchWorkbook.tsx/test، همینscope docs. آزمون‌ها درهمانpathهایثبت‌شده؛ registry/CIتغییرنمی‌کند. actualcomponentباهمانGETها، pagination/error/missing، dedupe/conflict، source/target و privacy/reopen/unknown رگرسیون لازم‌اند. CIexactsource وnativeworkflowموجود بدونتغییر پیگیری می‌شود. primary/authbrowser/workerreceipt وfutureappendruntime همچنان گیت‌هایبازند؛ هیچمدل/نصب/اجرایworker نداریم.

در assertion خواندنیِ ازقبل موجود C در workbook-intent.integration.test.ts نیز فقط intentId/preparedAtِ همان listموجود با raw native receipt ازقبلخوانده‌شده تطبیق داده می‌شود؛ بدونSQL/query/setup/writer تازه. خودworkflow و ثبتpath ثابت‌اند.
