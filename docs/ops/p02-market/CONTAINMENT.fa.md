# مهار موقت مصرف رله — طرح اپراتور، اجرا نشده

۲ اکتبر۲۰۲۶؛ درخواست PM برای اقدام مشخص پیش از پذیرش178. هیچ توقف سرویس، تغییر env، scale، deploy یا migration در تهیه این طرح انجام نشد. تصمیم Production با آرش/P00 است.

## چه چیزی اثبات شده و چه چیزی نیست

دو GET خواندنی debug در۱۳:۲۴:۳۰٫۱۲۱ و۱۳:۴۴:۴۰٫۱۲۲ UTC انجام شد. فاصله مشاهده۱۲۱۰٫۰۰۱ ثانیه است. جدول [مقایسه ماشینی](evidence/containment-observations.json) و دو فایل خام پالایش‌شده کنار آن‌اند.

|شمارنده/کنترل|اول|دوم|حد تفسیر|
|---|---:|---:|---|
|transport.sent|5240|5263|تفاضل نمایش‌داده‌شده۲۳؛ شناسه process/uptime نداریم؛ نرخ اکنون نیست|
|budget.rejectedByBudget|1136|1159|تفاضل نمایش‌داده‌شده۲۳؛ مساوی تعداد درخواست رسیده به provider نیست|
|store.errors|615|626|تفاضل نمایش‌داده‌شده۱۱؛ خطای DB/RPC، نه مصرف quota|
|legacy.enforced|false|false|هر دو نمونه محدودیت خاموش است|
|store.healthy|false|false|هر دو نمونه store خراب است|
|budget.day|2026-10-02|2026-10-02|روز داخلی تهران؛ پنجره reset تأمین‌کننده اثبات نشده|
|degradedUsed|100|100|بودجه اضطراری حافظه‌ای مصرف شده؛ ظرفیت امروز یا باقی‌مانده نیست|

اولین sample برای overBudgetPassed هر producer، داده صادر نکرد؛ delta آن **UNKNOWN** است. نمونه دوم symbol-detail۱۲۸۵ وoptions۵۶۶ را تجمعی دارد. اینها event شمارش عبور از رد داخلی‌اند؛ billing، موفقیت پاسخ provider، نرخ امروز و سهمیه باقی‌مانده نیستند. هیچ نمونه سوم برای تولید نرخ یا درخواست BrsApi ساخته نشد. LegacyMeter در کد شمارنده‌های حافظه‌ای process دارد؛ PersistentDailyBudget قدیمی روز داخلی و degradedUsed را در restart/تعویض روز تازه می‌کند. هویت build/process رله زنده و مصرف بیرونی همان کلید UNKNOWN است؛ هیچ تداوم process یا reset واقعی از روند افزایشی فرض نشود.

## کنترل موجود و محدودیت‌ها

هدف قابل شناسایی: برنامه PaaS رله `arsadata`، نشانی `https://arsadata.liara.run`. inventory تاریخی مهاجرت project_id=arsadata وscale=۱ دارد؛ این scale شاهد وضعیت امروز پنل نیست. برنامه VPS دیتابیس/Auth `arsadata-backend` و سایت Vercel مقصد توقف نیستند. پیش از عمل، P00 باید نام پروژه/تیم، مالکیت همان endpoint، release جاری و تمام replicaها را از پنل زنده خواندنی تطبیق دهد.

جدول بررسی کد (195 و main51fd066) به معنی تأیید SHA رله در حال اجرا نیست:

|مصرف‌کننده|کنترل موجود|کفایت مهار|
|---|---|---|
|candle-backfill|CANDLE_BACKFILL_ENABLED=0|فقط worker زمان‌بندی‌شده؛ توقف همه providerها نیست|
|codal archive|CODAL_ARCHIVE_ENABLED=0|فقط worker آرشیو، موتور اصلی جدا|
|codal engine|CODAL_ENABLED=0|موتور زمان‌بندی‌شده؛ مسیرهای دیگر باید جدا inventory شوند|
|IME|IME_ENABLED=0|workerهای IME؛ توقف options/قیمت/NAV نیست|
|symbol detail/rotation|SYMBOL_DETAIL_DAILY_CAP=0|در کد بررسی‌شده، remaining صفر و مسیر cache-only؛ کنترل process پس از restart، نصب build زنده نامعلوم|
|options،AllSymbols،GoldCurrency،Index،NAV|خاموش‌کن مستقل یکپارچه تأییدشده ندارند|کاهش چهار worker بالا این مسیرها را نمی‌بندد|
|legacy مشترک|BRSAPI_BUDGET_ENFORCE_LEGACY=1|در binary قدیمی، degraded allowance۱۰۰ می‌تواند با restart دوباره باز شود؛ مهار کامل نیست|

**صرف روشن‌کردن enforcement یا خاموش‌کردن client راه‌حل این incident نیست.** client فعلاً خاموش است ولی مسیر قدیمی مصرف دارد. تغییر env معمولاً restart می‌خواهد و ممکن است allowance اضطراری binary قدیمی را باز کند. تغییر LIMIT یا صفرکردن counter، baseline واقعی ایجاد نمی‌کند.

## اقدام پیشنهادی فوری، قابل بازگشت

پس از تصمیم مستقیم آرش و تطبیق هدف توسط P00: **فقط برنامه رله PaaS `arsadata` موقتاً خاموش شود** تا نصب و پذیرش178/تعیین baseline ممکن شود. این کار مصرف‌کننده‌های درون همان برنامه، از جملهsymbol-detail/options/NAV/candle/codal، را با کنترل موجودِ پلتفرم متوقف می‌کند. برنامه/دیسک حذف یاscale حساب/VPS تغییر نمی‌کند.

دستور اپراتور در CLI ازقبل authenticated، پس از بررسی `--help` نسخه نصب‌شده و account/team صحیح:

```text
# PROPOSED ONLY — DO NOT RUN WITHOUT THE RECORDED PRODUCTION DECISION
liara stop -a arsadata
```

نام این دستور و انتخاب برنامه از [مستند رسمی توقف لیارا](https://docs.liara.ir/references/cli/stop-app/) بررسی شد. راه جایگزین همان کنترل خاموش‌کردن برنامه در پنل صحیح است؛ هیچ token درargv یا چت قرار نگیرد. CLI این دستگاه برای این کار نصب/اجرا نشد و API مدیریتی فراخوانی نشد.

اثر محصول: دریافت تازه قیمت، NAV،options،گواهی و کدال این رله متوقف می‌شود. سایت Vercel و دیتابیس/Auth لیارا با این دستور تغییر نمی‌کنند؛ آخرین snapshot ذخیره‌شده حذف نمی‌شود. خواننده موجود ابتدا DB و سپس relay را می‌خواند، بنابراین انتظار استفاده از آخرین داده یا empty/error صادقانه می‌رود؛ **سلامت تمام صفحات/ورود یا برچسب کهنگی Production از این انتظار تضمین نمی‌شود**. مسیرfallback ممکن است خطا/تأخیر بدهد و باید با RO بررسی شود؛ برای بررسی، `/api/market`، صفحه اصلی بازار یا refresh اجباری که side effect دارد فراخوانی نشود.

محدوده تضمین: توقف همین app، نه همه مصرف‌کنندگان احتمالی بیرونی همان کلید. قبل از ادعای «مصرف کل کلید صفر»، replica/سرویس‌های دیگر و مصرف‌کنندهFX باید inventory شوند. درخواست‌های قبلاً ارسال‌شده و writeهای in-flight ممکن است تا پایان shutdown کامل شوند؛ توقف فوری یا snapshot ثابت از لحظه کلیک فرض نشود.

## اجرای اپراتور و شاهد پذیرش مهار

۱. رسید تصمیم آرش، زمانUTC، app/team/release/replicacount وscale پیشین ثبت شود؛ قبل از توقف، timestamp/count/schema snapshot، وضعیتreadonlyDB وreadinessAuth ثبت شود. هیچ dump مشتری/کلید لازم نیست.

۲. کنترل stop فقط برایarsadata اعمال شود؛ رسید control-plane و زمان تکمیل shutdown ثبت شود. restart خودکار/CI redeploy/replica دیگری از همین app آن را روشن نکند. سرویس DB، Auth، VPS، DNS و Vercel دست‌نخورده بمانند.

۳. پس از پایان shutdown، کنترل پنل نشان دهد app متوقف و replica فعال ندارد. دو مشاهده خواندنی با فاصله چرخه فعلی، فقط برای بررسی timestamp/count snapshot و نبود writer همان رله انجام شود؛ اگر writer دیگر دارد، علت جدا مشخص شود. نبود پاسخ debug به‌تنهایی صفرشدن provider traffic را ثابت نمی‌کند. برای تأیید، request به provider یا cold refresh ساخته نشود. هر timeout/error مسیر UI صریح گزارش شود.

۴. P00/P02: در sandbox مستقل،178 با hash مشخص و baseline ساختگی تست شود: unknown→صفر upstream/صفر snapshot write؛ DB failure؛ restart وrelease بدون بازشدن سقف؛ stopbudget آخرینsnapshot را حفظ کند. بعد baseline/reset واقعی از منبع مجاز و مصرف‌کنندگان مشترک مستند شود. هیچ نصب یا grant روی DBProduction از این طرح مجاز نیست.

۵. بازگشت عادی فقط بعد از تصمیم rollout جدا، budget مستقل ازrestart و baseline معتبر؛ دو چرخه واقعیِ مجاز و شاهد counters/snapshot/واحد/تازگی ثبت شود. قبل از آن bulk/NAV retest آغاز نشود.

## rollback و تصمیم مورد نیاز

کنترل برگشت مستند: [روشن‌کردن برنامه لیارا](https://docs.liara.ir/references/cli/start-app/)، `liara start -a arsadata` برای همین هدف با account/team صحیح. **برگشت به binary قدیمیِ بدون سهمیه، ریسک قبلی را برمی‌گرداند؛ rollback خودکار نیست.** اگر آرش استمرار دریافت را بر مهار ترجیح داد، P00 این انتخاب و خطر مشخصِ شمارنده نامعتبر را ثبت کند؛ توقف را صرفاً با معیار «صفحه کند شد» خودکار لغو نکند. داده پاک یاcounter صفر نشود؛ config/release پیشین محفوظ باشد.

تصمیم دقیق برای طرح به آرش، از طرف هماهنگ‌کننده: «مجوز توقف موقت فقط برنامه دریافت داده arsadata، با باقی‌ماندن سایت Vercel و DB/Auth و توقف به‌روزرسانی داده تا پذیرش سهمیه178؛ یا ادامه وضعیت فعلی با محدودیت سهمیه اثبات‌نشده». این تصمیم اکنون اخذ/اجرا نشده است. این گزارش درخواست خرید، افزایش سهمیه یا ترمیم انبوه نیست.
