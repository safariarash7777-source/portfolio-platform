# P00 — قراردادهای باز برای نسخهٔ ترکیبی

۲۰۲۶-۱۰-۰۲؛ این پرونده تعارض فنی را حفظ می‌کند، تصمیم تجاری یا پذیرش تازه ایجاد نمی‌کند. مبنا195@31c44ab و مالکان [baseline](P00-BASELINE.md) هستند.

| قرارداد | شاهد/موضوع | مالک حل و شرط تغییر |
|---|---|---|
|publication.v1 و draft|P03 `73c768cdfa06a18e02776c2e62eae7ad70de6c03`: ذخیرهٔ draft جدید نسخهٔ منتشرشدهٔ قبلی را non-current و از list/detail پنهان می‌کند؛ receipt متعلق بهUUID نسخه است. publishedAt/asOf مهلت اعتبار نیست|P07 نویسنده، P03 reader، P06/P08 مصرف‌کننده. رفتار فعلی حفظ؛ تغییر معنای replacement/validity با قرارداد نسخه‌دار و predicate مشترک list/detail/mark، آزمون لغو/بازپس‌گیری و migration افزایشی ثبت شود|
|اندازهٔ اقدام/مخرج|P04 بررسی قراردادP07@52cd3a9: position_pct مخرج همان موقعیت ابزار است؛ allocatable مخرج کل سبد نیست. target صفر با موتور بردار مثبت مجموع۱۰۰٪ تطبیق می‌خواهد|P07/P06 enum/size/denominator مشترک را حل کنند؛ هویت dedupe باید scope خصوصی را لحاظ کند. تا آن،P06 اجرا و schema مشترک فعال نشود|
|AI هزینه/ارجاع|دو یافته snapshot اولیه درPR202@2ca3058 اصلاح شدند؛ P11 هر دو blob نهایی ledger6098dac وhandoffc940595 را برابر snapshot آزموده‌شده و۱۱assert مستقلPASS ثبت کرد؛ رسید تازه درPR203@bb585f4|فقط overrun-dispatch وlineage-projection بسته‌اند؛ پذیرش کلledger/Auth/RLS/LLM/G2/G3 باز است. ثبت سه آزمون additive درpackage بدون تغییر گارد اصلاح شد؛ CI37015915730 رویhead202@e4419f9 مستقلاًsuccess تأیید شد. provider/collector خاموش|
|سبد تلگرام|miniappPR6@a8ced161f31c54d4432aeb1aadf84c9734d1b3af،runtimefa61a5c،base mini5@26c885c؛ فقطpreviewآفلاین. commitBlocked=true؛ GET/receipt/durablefreeze و انتقال واقعی باز|P04 canonicalGET/receipt/account/memberConfirmedAt؛P05 adapter.195 باmini6 ترکیب‌شده نیست. workflowPRبهmain اجرا نشده؛ CI سبز ادعا نشود و retarget برای سبزکردن مجاز نیست|
|سهمیه/داده|P02/PR207@81e68e4 و CI37016337689 success؛ priorUsage/reset UNKNOWN،phase28 زنده غایب،دوچرخه مجازNOT_RUN؛ snapshot/NAV کهنه با گزارش مستقل|P02 قرارداد نصب178/مصرف قبلی/reset و گیت دوچرخه؛ sandbox195 نصب/پذیرش سهمیه نیست. درخواست اختیاری provider اضافه نشود. طرح توقف فقطPaaS app arsadata درCONTAINMENT.fa.md نیاز تصمیم واقعی آرش وpreflight دارد؛ اجرا نشده وVPS backend/Auth/DB/Vercel هدف نیست|
|پذیرش/عملیات|P11 measurement.v0.1 projection است؛ seen≠read≠action، received≠first_response و closed≠resolved. J00…J13 بهG0…G4 متصل، اجرای سفرهاNOT_RUN در تحویلP11|P11 با صاحبان مسیرهای محصول؛ instrumentation بدون موافقت صاحب فایل وارد نشود. رضایت/نگهداری/صاحب پشتیبانی/SLA و پایلوت۲۰–۳۰ هنوز تصمیم مالک‌اند|

مسیر گزارش‌ها متعلق به checkout هر مجری است. لینکPR و snapshot head زمان‌دار در inventory نگهداری می‌شوند؛ تغییر head بعدی پذیرش snapshot قبلی را به خود نمی‌گیرد.

## هماهنگی محدود package scripts — P08

P00 تغییر محدود `package.json` در checkout ایزولهP08/PR202 را برای افزودن فقط `lib/assistant/baseline-195.test.ts`، `fixture-ledger.test.ts` و `fixture-service.test.ts` به `test:core` ثبت کرد. گارد registry آزمون‌ها حفظ می‌شود؛ dependency/lockfile/سایرscripts تغییر نمی‌کنند. P01 مالک عمومی فایل است و از این محدودهٔ additive مطلع شد؛ در نسخهٔ ترکیبی، P00 افزودنی‌های مستقل مالکان را یک‌بار و بدون حذف مسیرهای موجود جمع می‌کند. این هماهنگی اجازهٔ تغییر فرانت/Auth یا خرید provider نیست. CI تازه فقط بهSHA جدید نسبت داده شود.
