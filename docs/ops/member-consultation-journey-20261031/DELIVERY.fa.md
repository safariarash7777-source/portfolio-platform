# اتصال نسخهٔ عضو و مشاوره — رسید منبع

این رسیدِ یک نسخهٔ قابل بررسی است. وضعیت جاری پروژه و پذیرش فقط با هماهنگ‌کننده در COMMAND-CENTER ثبت می‌شود.

## مسئله، مخاطب و مالک

نسخهٔ بررسی نشست عضو و نسخهٔ مشاوره/پاسخ‌های نسخه‌دار در دو شاخهٔ جدا بودند. این بسته آن دو منبع موجود را در یک candidate جمع می‌کند تا نصب و آزمون مسیر عضو روی یک کد مشخص ممکن شود. مخاطب عضو آزمایشی، آرش و هماهنگ‌کننده است؛ این خروجی پذیرش آن مسیر نیست.

START-B اتصال تجربهٔ عضو و شاهد مصرف‌کننده را دنبال می‌کند. START-A مالک منطق مالی/مشاوره است؛ root مالک یکپارچه‌سازی، عملیات مقصد و حل تعارض مشترک است. هیچ writer یا سیاست مالی تازه‌ای در این بسته ساخته نشده است.

## ارتباط دقیق منبع

- والد عضو: `c0eadaba4be1a070d3f93b2c9706e2c13e9a20f3`، PR341، بر main `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc`.
- والد مشاوره: `7752638842c3f4c8a6984e3ec753a6c92aad80fc`، PR357، شامل PR334 در `497ae4681783db7aa9bd9339993c36a29e93ed56`.
- مبنای مشترک: `3acbab90d101620591f44ee9967adbac123d4a28`.
- commit ادغام: `109b5078ab9965257d29df363fc1eb25ba6edfa0`؛ هر دو والد و تاریخچه حفظ شده‌اند.
- تعارض فقط `package.json` و `docs/README.md` بود. بایت‌های حل تعارض از artifact بازبینی‌شدهٔ root مصرف شد. SHA256ها به‌ترتیب `67aa6d16afc7b04b161c28be8d4020fc7967ee240bfb0c60510602698b146faa` و `1c0e87d3a1246b23235e763cf4d7a9aa15d5e0e86638193845fa1ce2e5712538` هستند.

اسکریپت زیر merge خود Git را در index موقت بازسازی و فقط همان دو blob را جایگزین می‌کند؛ برابری کامل tree با commit ادغام، وابستگی و lock بدون تغییر، حضور هر ۱۷۱ آزمون literal از هر دو والد و محدودبودن تغییرات پس از merge به دو مسیر تخصیص‌یافته را می‌سنجد. این بررسی شبکه، برنامه، Auth یا DB را اجرا نمی‌کند. تاریخچهٔ هر دو والد باید در checkout قابل خواندن باشد.

```sh
node scripts/testing/member-consultation-journey/source-binding.mjs HEAD
```

این guard در منبع CI ثبت خودکار نشده است: `package.json` باید دقیقاً همان artifact حل تعارض root بماند. اجرای محلی guard و اجرای CI موجود دو شاهد جدا هستند. guard با candidate معتبر موفق و با والد قدیمی عضو رد شد.

تغییرات بعد از commit ادغام فقط زیر این دو مسیر مجازند:

```text
scripts/testing/member-consultation-journey/**
docs/ops/member-consultation-journey-20261031/**
```

PR358 قرارداد بدون writer است و جزو این محصول نیست. بسته‌های 348 و 354/356/359 نیز به منبع محصول وارد نشده‌اند؛ frozenها تغییری نکرده‌اند.

## قابلیت موجود و فاصلهٔ واقعی

| مرحله | قابلیت منبع موجود | شرط پذیرش مصرف‌کننده |
|---|---|---|
| ورود و خانهٔ عضو | تشخیص نشست نامشخص، رد نشست منقضی و جلوگیری از خواندن خصوصی در حالت نامشخص؛ صفحات مالی موجود | ورود واقعی و مشاهدهٔ پروندهٔ غیرصفر روی همین candidate |
| پروندهٔ مالی | APIهای نسخه‌دار holdings، cash-flow و goals موجود | ذخیره و بازخوانی مستقل، حفظ نسخه و `null` و واحد/منبع |
| رضایت | `grant` و `revoke` رابطهٔ مشاور | رضایت صریح و جداسازی عضو دیگر؛ `grant` درخواست مستقل مشاوره نیست |
| حق همان خدمت | اتصال عملیاتی اثبات نشده | سطح دسترسی تحلیلیِ قدیمی و قرارداد358 حق مصرف خدمت ایجاد نمی‌کنند |
| درخواست مستقل | command یا چرخهٔ ticket در قرارداد موجود نیست | فاصلهٔ محصول/دامنه با مالک A و root؛ question به ticket تغییر نام نمی‌دهد |
| پاسخ نسخه‌دار | `/api/consultation` و `/api/consultation/replies`، کنترل نقش/رابطه و نسخهٔ دقیق | draft/approve/publish آزمایشی جدا و دیدن همان نسخه توسط عضو |
| پیگیری | سؤال/پاسخ نسخه‌دار و وضعیت اقدام عضو | خروج/ورود مجدد، خواندن مستقل history و برابری دادهٔ مالی پیش و پس از feedback |

## شواهد و معیار پایان

روی منبع ادغام، ۱۵۳ آزمون متمرکزِ واقعی route/card/workspace/contract/roster/replies با صفر شکست و صفر skip گذشتند. نسخه و integrity همهٔ packageهای نصب‌شده با lock منطبق بود؛ نصب یا ارتقای وابستگی انجام نشد. guard منبع ۱۷۱/۱۷۱ آزمون literal را حفظ‌شده یافت. این‌ها اجرای هدف آنلاین نیستند؛ آزمون قدیمی `native-nonzero` در PR334 هم شاهد امروز این candidate نیست.

CI جدید باید همین head را بسنجد. برای تحویل جریانِ قابل استفاده، root باید هویت/schema/backup/restore و محیط تست موجود را تثبیت کند؛ سپس عضو مجاز با پروندهٔ غیرصفر، پاسخ نسخه‌دار، خروج/ورود و بازخوانی مستقل بررسی شود. جداسازی عضو دیگر، revoke، حفظ draft پس از خطای ذخیره، و عدم تغییر موجودی با feedback جزو همان پذیرش است. نصب schema، provision یا reuse محیط/حساب قبلی از این commit مجاز فرض نمی‌شود.

کد ادغام‌شده قابل بررسی است؛ استقرار مقصد، پذیرش جریان کامل، حق همان خدمت، درخواست مستقل و پذیرش آرش هنوز با این رسید اثبات نمی‌شوند. تحویل بعدی B شاهد مصرف‌کننده روی محیط تأییدشدهٔ root است؛ شخصی‌سازی یا انتشار توصیه برای عضو به تأیید صریح آرش وابسته می‌ماند.


## P01.2/P05.1 — نامزد تشخیصی فقط‌خواندنی، ۳۱ اکتبر

مسئله: دسترسی تحلیلی قدیمی، حق همین خدمت را اثبات نمی‌کند. مالک این برش START-B و مخاطب بررسی، root است؛ وضعیت و پذیرش در COMMAND-CENTER می‌مانند.

منبع helper و آزمون آن `f353300d61a4738b7b6bc2fd2177f9cdc5955a4b`، بر پایهٔ محفوظ `1bf8f86b7bcaaedcb8320e178b1589a33b88e306` است. دو فایل `lib/consultation/ticketServiceRightDiagnostic.ts` و `.test.ts` از classifier موجود استفاده می‌کنند؛ هیچ resolver، provider، دفتر یا نگاشت اقتصادی تازه ندارند.

helper فقط snapshot و زمان ارزیابیِ فراخواننده را بررسی می‌کند. provenance گزارش‌شده با `sourceAuthority=unverified` حفظ می‌شود؛ service state فقط unknown/not_connected و serviceIdentifier/quota/obligations برابر null است. admin/full/source آزاد و consulting فعال، حق همین خدمت نمی‌شوند. **حق خدمت همچنان NOT_CONNECTED است.**

پانزده آزمون محلی روی f353 موفق‌اند؛ TypeScript محدود و lint دو فایل و اسکن staged موفق‌اند. مرز میکروثانیه، خطا/ناقص/foreign/duplicate و حفظ recovery همان receipt/history/body/token با قرارداد موجود در حافظه بررسی شدند؛ این آزمون‌ها DB/Auth/DOM یا پذیرش مقصد نیستند. لاگ شکست نخست Typecheck و اصلاح annotation/config بیرون مخزن جدا محفوظ‌اند.

آزمون هم‌نام با یک literal در گروه نخست test:core، پیش از &&، ثبت شده؛ literalهای قبلی و lock ثابت‌اند. guard دقیق شاخهٔ codex/p01-p05-service-right-diagnostic-20261031=false با حفظ guardهای قبلی و crons اضافه شده است. نتیجهٔ CI همین child فقط با رسید تازه معتبر می‌شود.

helper هنوز caller محصول، DTO یا UI ندارد و writer را فعال نمی‌کند. SQL/prepare/command/capability/endpoint/fixtureRunId و receipt/body/token/hash قبلی محفوظ‌اند. reader قراردادی برای UI و اتصال منبع واقعی حق، تخصیص و پذیرش مستقل می‌خواهند؛ نصب، grant/import، خرید، مدل، محیط عملیاتی و انتشار در این برش انجام نشده‌اند.


## الحاقیهٔ محلی P01/P03: نمایش تشخیصی دسترسی قدیمی — ۲۰۲۶/۱۰/۳۱

- مسئله و مخاطب: عضوِ رابطهٔ مجاز، وضعیت خوانده‌شدهٔ دسترسی تحلیلی قدیمی خود و منشأ ثبت‌شده را در همان صفحهٔ درخواست ببیند؛ این داده مجوز حق خدمت، سهمیه یا ثبت ایجاد نمی‌کند.
- مالک: START-B؛ هماهنگ‌کنندهٔ ریشه مالک ادغام، مقصد واقعی و پذیرش است. دامنهٔ تخصیص‌یافته فقط سه consumer، محافظ منبع، manifest محافظ و همین الحاقیه است.
- مبنا و وابستگی: 303f4c016505e9fdb8f12236168961f48a10ca0f و helper محفوظ f353؛ parent معتبر و تطبیق actor/client، Auth.getUser(jwt) و SELECT مجاز خود عضو لازم است. نقش مشاور/مدیر برای عضو دیگر یا parent نامعلوم، خواندن entitlements ایجاد نمی‌کند. ACL و دسترس‌پذیری واقعی جدول مشاهده نشده‌اند.
- رفتار قابل مشاهده: جزئیات در بخش موجود؛ وضعیت قدیمی، منشأ تأییدنشده، «زمان ارزیابی این دستگاه» و «حق مشاورهٔ این صفحه هنوز متصل نیست». منبع آزاد با React escape، dir=auto و شکست رشتهٔ بلند نمایش داده می‌شود. نبود اطلاعات با — و وضعیت نامعلوم حفظ می‌شود؛ active قدیمی حق خدمت نیست.
- خواندن مستقل: session صرفاً حامل توکن است؛ getUser همان JWT را اعتبارسنجی می‌کند؛ یک SELECT با هفت ستون، user_id همان actor، count=exact، order=id، range=0..999 و retry(false)، Authorization در همان query builder. توکن در state/ref/props/URL/storage/log قرار نمی‌گیرد. سقف ده ثانیه و abort والد؛ پس از Auth دیررس یا تغییر هویت، GET تازه آغاز نمی‌شود. کامل‌بودن فقط با آرایه و count صحیح ۰..۱۰۰۰ برابر طول سطرها؛ بقیه unknown. اعتبارسنجی معنایی و زمان میکروثانیه همان helper محفوظ است.
- استقلال: خطا یا کندی این خواندن، تاریخچه، بازیابی تلاش، draft، needsRefresh یا مجوز ثبت را تغییر نمی‌دهد. invalidation دادهٔ تشخیصی را فوراً پاک می‌کند. GET خودکار به POST تبدیل نمی‌شود.
- معیار پایان این بستهٔ محلی: سه مصرف‌کننده و لایهٔ محافظ دقیق، همراه با آزمون handler واقعیِ mock شده و markup، type/lint/scan و patch/head/tree قابل بازبینی. معیار اتصال مقصد واقعی، مرورگر، صحت CSS/overflow و پذیرش آرش در این بسته بسته نمی‌شود.
- شاهد آزمون: ۱۵ آزمون قبلی و ۱۰ case تازه در ticket-storage-ui.test.tsx؛ JWT/header، self-only، count ناقص/نامعلوم/خالی کامل، سطر نامعتبر، استقلال تاریخچه/draft، deadline با Auth غیرقابل abort، race هویت/GET و unmount، escape منشأ و سازگاری props قدیمی. wrapperهای RTL با عرض ۳۹۰ و ۱۴۴۰ صرفاً static markup هستند؛ اندازه‌گیری چیدمان و browser acceptance نیستند. گزارش خام نهایی و hashها در بستهٔ شاهد بیرون مخزن ارائه می‌شوند.
- حدود وضعیت: طراحی و کد و آزمون محلی قابل بررسی؛ هنوز ادغام، CI این candidate، انتشار، Preview، رفتار روی مقصد واقعی و پذیرش انسانی انجام نشده است. هیچ SQL/DTO/API/prepare/package/workflow/fixture، provider، mapping اقتصادی یا runtime جدید تغییر نکرده است.
- هزینه: هیچ مدل، خرید یا منبع زیرساخت تازه اجرا نشده؛ مبلغ مصرف محلی اندازه‌گیری نشده است. اجرای محلی صفر بودن کل هزینهٔ زیرساخت/داده/مدل پروژه را اثبات نمی‌کند.


## الحاقیهٔ ثبت remote و CI عادی برای consumer تشخیصی

- نسخهٔ محلی پذیرفته‌شده: be573950d0d8d7d4b91043b180e6f86e73b94fee؛ این پذیرش فقط شش فایل و شاهد محلی است، نه SDK/ACL/CSS یا حق خدمت واقعی.
- تخصیص هماهنگ‌کننده: فقط vercel.json یک guard دقیق برای codex/p01-p03-legacy-diagnostic-ui-20261031=false، امتداد دقیق محافظ/manifest و همین الحاقیه. سه guard و cron قبلی حفظ؛ کد سه consumer/test، helper، lib/app/SQL/package/workflow و همهٔ pinهای قبلی ثابت.
- پس از guard/scans/diff و تطبیق byteها، ordinary push همان شاخه و Draft stacked روی PR377 با base303 مجاز است. CI عادی و hook خودکار موجود مجازند؛ rerun دستی، force/merge، تغییر تنظیم typecheck/cache/workflow یا انتشار مجاز نیست.
- شاهد پایان ثبت در رسید بیرون مخزن: head/tree، raw source و patch، checksum، CI واقعی و commit/tree واقعی checkout؛ گزارش local-only به CI یا پذیرش runtime تبدیل نمی‌شود. full typecheck/build در runner تازه با همان گیت معمول اجرا می‌شود.
- runtime UI/SSR/live query/Preview/env/service grant/مدل/SQL/main، مقصد واقعی و پذیرش آرش همچنان در مالکیت هماهنگ‌کننده است. مبلغ CI تا receipt واقعی نامعلوم می‌ماند؛ هزینهٔ زیرساخت، داده و مدل جدا گزارش می‌شود.


## پذیرش مستقل خواندن تشخیصی قدیمی از 7b — آماده‌سازی ۳۱ اکتبر

مسئله: برش UI پیشین شاهد SDK/RLS/DOM واقعی این خواندن مستقل نداشت. مخاطب عضو و بازبین فنی؛ مالک START-B؛ وابسته به Linux/GoTrue/PostgREST/Next و Chrome موجود. کد محصول، SQL، DTO، writer، package و lock عین 7b1f5c0 می‌مانند. mode جدید legacy-diagnostic-v1 نام و pin خواننده699 را تغییر نمی‌دهد.

خروجی قابل مشاهدهٔ برنامه‌ریزی‌شده: درخواست هفت ستون با همان JWT تأییدشده در getUser، جداسازی ردیف خود/دیگری، نمایش منقضی/فعال/لغوشده و منشأ تأییدنشده در همان بخش، ثبت بسته، حق خدمت متصل‌نشده، صفر GET ردیف عضو دیگر برای مشاور و پاک‌شدن تشخیص با تغییر هویت/خروج SDK واقعی. معیار پایان آزمایش: رسید مستقل Linux و پاک‌سازی منابع owned؛ آزمون آفلاین به‌تنهایی این معیار نیست. در این مرحله اجرای واقعی هنوز انجام نشده و پذیرفته نشده است.

schema همان phase11 موجود است. زیر پروفایل explicit-grant ابتدا فقدان SELECT و پاسخ منفی بررسی می‌شود؛ سپس فقط در tmpfs همان run به authenticated مجوز SELECT داده می‌شود، نه نوشتن یا حق اقتصادی. root در 09:33:47 UTC کاتالوگ مقصد واقعی را فقط‌خواندنی دیده است: authenticated SELECT=true و RLS/policy خود و admin موجود؛ anon SELECT=true آن مقصد در fixture بازسازی نمی‌شود، پس منفی anon یا 403/[] آزمایش به مقصد تعمیم داده نمی‌شود. رسید root: outputs/p15-root-native-capture-20261031/entitlement-select-catalog.json. این grant جزو قرارداد SQL phase11 یا نصب مقصد نیست.

هیچ primary/query واقعی، credential واقعی، مدل، سرویس یا Preview جدید استفاده نمی‌شود. داده و حساب‌ها تازه و ساختگی‌اند. Artifact عمومی فقط وضعیت و شمارش و هش کد خواهد داشت؛ توکن، header، email، raw URL، storage، trace یا log خصوصی منتشر نمی‌شود. نصب و حق واقعی خدمت و پذیرش آرش UNOBSERVED/NOT_APPLIED می‌مانند.


مرور root روی source/test مستقل ab3b11a انجام شد؛ ۱۷ آزمون مستقل root و ۱۲۹ آزمون محلی PASS بودند. ثبت محدود hook موجود تأیید شد: job همان feedback-reader-compatibility؛ mode جدید فقط exact branch codex/p01-p03-legacy-native-20261031 است. old feedback699 با pin و هشت check قبلی فقط روی شاخه خودش اجرا می‌شود؛ اجرای موفق قدیمی ۲۷ API و ۱۱ DOM روی شاخه جدید تکرار نمی‌شود. vercel.json فقط false همین شاخه را افزوده است؛ cronها ثابت‌اند. خروجی عمومی hook فقط JSON پالوده است؛ نتیجه واقعی پس از اجرای عادی PR جدا تحویل خواهد شد. workflow_dispatch/manual rerun/Preview/primary انجام نمی‌شود.


### نتیجهٔ اولین hook واقعی و اصلاح محدود fixture

run41191240155/job124508287657 روی3fe1f02 در 31اکتبر پس از135+4آزمون آفلاین Linux، تأیید جداسازی و چهار حساب تازه در strict_grant_baseline متوقف شد؛ هنوز سناریوی محصول/خواندن legacy آغاز نشده بود. در10:06:10UTC پاک‌سازی هر6منبع و Chrome processStopped/contextsClosed/ownedTempRemoved=true ثبت شد؛ تکرار دستی صورت نگرفت و PASS صادر نشد.

علت: sql/test/portfolio_precondition.sql:140–141 پس از پروفایل explicit، پیش‌فرض GRANT ALL برای جدول‌های بعدی می‌گذارد؛ phase11 بعداً entitlements را می‌سازد و این امتیاز را به ارث می‌برد. اصلاح فقط driver است: ACL ارث‌رسیده به‌صورت boolean مشاهده، فقط همان جدول درtmpfs برایPUBLIC/anon/authenticated/service_role بسته، سپس baselineمنفی403 وGRANT SELECTauthenticated مصوب آزموده می‌شود. default privilege/schema/RLS و SQL محصول و تمام منابع7b تغییر نمی‌کنند. fixtureanon همچنان از مقصد اصلی محدودتر است؛ نتیجه به مقصد تعمیم ندارد. child اصلاحی فقط از hook عادیPR اجرا می‌شود، نه بازاجرای دستی یا replay.

خواندن مستقل ACL در fixture به matrix صریح SELECT/DML برای anon/authenticated/service_role/PUBLIC پیش از محدودسازی، پس از REVOKE و پس از GRANT SELECT تکمیل شد. پس از REVOKE همه SELECT/DML بایدfalse و پس از GRANT تنها authenticated.SELECT بایدtrue باشد. RLS و forced و hash سیاست‌ها قبل/بعد دقیقاً ثابت می‌مانند. سه matrix و hash به‌صورت شاهد عمومی پالوده ثبت می‌شوند؛ هیچ row یا token در آن‌ها نیست. root نیز علت portfolio_precondition:140–141 و اصلاح محدود fixture را تأیید کرد.
