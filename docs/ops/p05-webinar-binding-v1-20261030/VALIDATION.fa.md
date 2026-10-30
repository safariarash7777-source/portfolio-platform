# P05 binding v1 — شواهد و گیت‌های باقی‌مانده

**LOCAL CANDIDATE / NOT_READY_FOR_INSTALL**. پایهٔ این شاخه 92acdb6 از برش منجمد PR351 است؛ پایهٔ main آن برش f93dbdc بود. جایگزینی سه route، adapter/آزمون و migration افزایشی در قرارداد جدید صریح است؛ هیچ پذیرش 351 به این برش منتقل نمی‌شود.

## مشاهده‌شده در محیط محلی

- `node --test lib/zarinpal.test.mjs`: ۲۳۵ آزمون، صفر خطا؛ آزمون DTO و رگرسیون‌های قبلی generic از همین entry موجود import می‌شوند. provider/DB/پیام‌ها ساختگی‌اند؛ helper، routeها و مسیر مثبت صفحهٔ واقعی بارگذاری می‌شوند. خطای احراز هویت به مهمان یا مجوز پرداخت تبدیل نمی‌شود.
- typecheck و lint هشت فایل TypeScript/TSX موفق‌اند؛ رجیستری آزمون موجود نیز دو آزمون موفق دارد.
- build واقعی Next15 با env ساختگی و جلوگیری از HTTP/fetch بیرونی موفق شد؛ ۳۹ صفحه تولید شدند. هیچ کلید واقعی یا .env برای build مصرف نشد؛ این build شاهد رفتار مقصد نیست.
- parser واقعی PostgreSQL از pglast8.4: ۴۵ statement و ۷ بدنهٔ تابع غیرtrigger موفق؛ بدنهٔ چهار trigger به علت محدودیت مستند parser **بررسی نشده** است. هیچ SQL محلی اجرا نشد.
- بازتولید خصوصی schema قبلی روی reader واقعی جدید به GREEN رسید؛ صفر فراخوانی provider/تسویه/نوشتن ثبت‌نام. جزئیات و اصل شاهد خارج Git محفوظ‌اند. این شاهد، گیت‌های DDL جدید را اثبات نمی‌کند.

آزمون‌های مسیر، missing/old capability و legacy، دادهٔ malformed، query تکراری/متعارض، default-off در برنامه و DB، مبلغ snapshot، 100/101 و رد قطعی، ACK مبهم و بازخوانی ناموفق، paid/unresolved، recovery محدود paid/pending، claim هم‌زمان و منع درخواست provider دوم را پوشش می‌دهند. هیچ تستی از paid/unbound حق وبینار نمی‌سازد؛ پیام/دعوت/entitlement صفر است.

بازبینی مستقل روی 57ef سه شکاف یافت؛ در candidate بعدی اصلاح شدند و پذیرش SQL همچنان جداست: منع revival در خود guard، اتصال register/UI به قرارداد نسخه‌دار و intent ثابت، و جداسازی حقیقت وجه legacy از اعتبار خدمت. نامعلوم‌بودن ACK در مسیر واقعی client→register→payment، reload بدون درخواست دوم، حفظ free/old-schema، query جعلی موفقیت، رسید RLS مالک و پاک‌شدن لینک ادامه پس از شکست خواندن آزموده شدند. آزمون‌های عمومی قدیمی حذف نشدند؛ mock canonical با ref/time و committed failure برای بازخوانی کامل شد.

## گیت PG و Auth/API — هنوز اجرا نشده

thin SQL test در `lib/payments/webinar-binding.integration.test.ts` و همان `test:db`/PG service Linux موجود ثبت شده؛ helper `lib/ops/test-postgres.ts` بدون تغییر بازاستفاده می‌شود. قبل هر اتصال CI/GITHUB_ACTIONS، Linux، loopback5433 و نبود env غیرمستقیم الزام می‌شود؛ نام UUID و marker مالکیت پیش از DDL/cleanup کنترل می‌شوند. bootstrap و phase5/8/30 و guard واقعی مصرف می‌شوند، نه نسخهٔ تقلیدی. اجرای محلی انجام نشده است؛ غیبت psql یا شکست در CI skip نمی‌شود. این گیت، **PG16 role-seam** است؛ PG17 target و GoTrue/JWT جدا می‌مانند. runtime353 فقط با برش مستقل و هماهنگی مالک گسترش می‌یابد. این جدول هنوز **مأموریت پذیرش** است، نه فهرست آزمون SQL موفق:

| سناریوی PG/native با دادهٔ مصنوعی | نتیجهٔ لازم |
|---|---|
| baseline غیرصفر legacy پیش از migration؛ حقوق/تاریخچه قبل و بعد | مقدار، هویت و وضعیت قبلی ثابت؛ هیچ marker یا purpose قدیمی ساخته نشود |
| گیت‌های اولیه؛ JWT واقعی دو عضو، metadata ادعای admin | هیچ writer جدید/دسترسی خصوصی؛ عضو B نتواند پرونده/intent عضو A را بخواند یا صادر کند |
| INSERT مستقیم ثبت‌نام توسط عضو و مصرف‌کنندهٔ قدیمی | رد عملی از REST؛ RPC نشست‌محور موجود همچنان تحت قواعد فعلی کار کند |
| register نسخه‌دار جدید در برابر already_registered قدیمی | فقط ایجاد تازه در همان تراکنش marker بگیرد؛ existing با فراخوانی مجدد معتبر نشود |
| prepare با گیت آزمون باز؛ دو intent هم‌زمان | یک ردیف پول برای همان registration؛ کلید متفاوت conflict؛ مبلغ فقط snapshot DB |
| تغییر قیمت پس از صدور؛ owner/webinar/payment/ref متعارض | مبلغ صادرشده ثابت؛ تعارض هیچ خدمت یا تسویهٔ اشتباه نسازد |
| تغییر purpose/هویت/مبلغ/زمان؛ claim و attach دوباره | guard عملی؛ claim یک برنده؛ همان authority بی‌اثر و authority متفاوت conflict |
| generic/legacy paid و consumer قدیمی UPDATE registration | مسیر DB هم حق وبینار نسازد؛ refunded/free→paid یا pending و بازساخت شناسهٔ صادرشده رد شوند؛ metadata legacy محفوظ |
| verify/fail قدیمی برای intent bound با گیت settlement خاموش | writer دورزن مجاز نباشد؛ create_payment قدیمی همچنان بسته بماند |
| verify قطعی، ACK گم‌شده و replay/هم‌زمانی | دفتر پول/ثبت‌نام دوباره تغییر نکنند؛ بازخوانی canonical مستقل |
| حذف/بازپرداخت ثبت‌نام در فاصلهٔ verify | پول paid محفوظ؛ خدمت unresolved/refunded احیا نشود و marker/history حذف نشوند |
| کاتالوگ، ACL مؤثر، search_path و همه triggerها | با bytes بازبینی‌شده و نقش‌های واقعی تطبیق؛ native cleanup از مسیر موجود |

این تست‌ها نباید به provider، primary یا داده/حساب قدیمی وصل شوند. تغییر gate صرفاً در آزمایشگاه متعلق به همان اجرای synthetic مجاز است؛ native JWT با SQL claims ساختگی جایگزین نمی‌شود. source exact، readback و cleanup هر اجرا مستقل ثبت شوند.

## نصب و انتشار

PG/native، بازبینی مستقل نهایی DDL/DTO، مشاهدهٔ reader واقعی، backup/restore/ظرفیت تازه و ترتیب DDL/reader/activation بازند. پیش از push/CI در این سند هیچ merge، انتشار Preview/Production، تغییر primary، فعال‌سازی فروش یا پذیرش آرش اعلام نمی‌شود. provider helper، Auth، entitlements، CI و test:core تغییر نکرده‌اند؛ package فقط یک path مصوب در test:db دارد. گیت‌های تجاری/حقوق قبلی، ظرفیت و دیررس همان وضعیت پیشین را دارند. ظاهر پیش از main باید در Preview بازبینی شود.

اقدام بعدی مسئول مشخص دارد: هماهنگ‌کننده بازبینی مستقل و پروفایل P05 در runtime پذیرفته‌شده را تعیین می‌کند؛ مجری این برش یافته‌های کد/SQL را روی همین شاخه رفع می‌کند. فعال‌سازی از سبز بودن build استنتاج نمی‌شود.
