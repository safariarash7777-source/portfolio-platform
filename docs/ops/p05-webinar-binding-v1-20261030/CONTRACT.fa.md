# P05 — قرارداد نامزد اتصال پرداخت وبینار

وضعیت: candidate، فروش و نویسنده‌ها پیش‌فرض خاموش؛ بدون نصب روی پایگاه اصلی. این بسته جایگزین پیشنهادی PR351 است، نه ادامهٔ تأیید آن. شاخهٔ 351 تغییر نمی‌کند. دفتر وضعیت همچنان COMMAND-CENTER با نویسندهٔ هماهنگ‌کننده است.

## مرجع و مرز

`payments` تنها دفتر پول است. `amount` موجود، مبلغ تومان در زمان صدور سمت DB است. purpose فنی `webinar.v1`، شناسهٔ عضو/ثبت‌نام/وبینار و intent ثابت، بخشی از هویت تغییرناپذیر پرداخت هستند. هیچ دادهٔ قدیمی backfill نمی‌شود. قیمت امروز، متن توضیح، FK یا صرف paidبودن منشأ خرید را اثبات نمی‌کنند.

صدور معتبر ثبت‌نام فقط توسط RPC نسخه‌دار جدید و در همان تراکنش ایجاد ثبت‌نام اثبات می‌شود. این RPC از قواعد موجود `register_for_webinar` استفاده می‌کند؛ بازگشت `already_registered=true` هیچ marker تازه‌ای نمی‌سازد. marker خصوصی فقط مرجع هویت/منشأ است، دفتر پول نیست. RPC قدیمی و تاریخچه/حقوق قبلی محفوظ می‌مانند؛ تعیین تکلیف legacy-unbound جداست. مسیر INSERT مستقیم عضو برای ثبت‌نام بسته می‌شود، اما این کار ردیف قدیمی را معتبر نمی‌کند.

## DTO و عملیات

- `webinar-payment-binding.v1`: purpose، paymentId، userId، registrationId، webinarId، intentKey، amountToman، createdAt، authority، providerState، status، refId، verifiedAt، registrationState و `registrationProvenance=register-webinar.v1`.
- خواندن capability و binding پرداخت وبینار فقط سروری است. قابلیت ناموجود، نسخهٔ ناشناخته، legacy و تعارض، مجوز provider/writer وبینار نمی‌سازند. رسید مالی legacy جداست: paid با ref/time معتبر یا failed از همان ردیف canonical خوانده می‌شود؛ خدمت unverified و دعوت/grant صفر می‌مانند. pending قدیمی فقط از مسیر تطبیق صریح همان authority با helper/RPC مالی موجود و بازخوانی مستقل بررسی می‌شود؛ charge یا purpose/خدمت تازه ساخته نمی‌شود.
- `prepare_webinar_payment`: فقط نشست عضو؛ ورودی registration و intent؛ مبلغ/عضو/هدف از مشتری گرفته نمی‌شود. یک intent برای هر ثبت‌نام؛ اختلاف کلید، intent تازه یا تکرار charge نمی‌سازد.
- `claim_webinar_payment_request`: فقط سرور؛ انتقال یک‌باره prepared→claimed پیش از تماس provider. فقط ACK قطعیِ برنده مجوز یک درخواست می‌دهد. ACK مبهم/خطای provider در claimed می‌ماند؛ retry خودکار یا intent تازه ممنوع است.
- `attach_webinar_authority`: فقط سرور، یک‌باره claimed→attached؛ همان authority بی‌اثر، authority متفاوت conflict؛ بازخوانی مستقل پیش از تحویل URL.
- `settle_webinar_payment`: فقط سرور پس از verify قطعی؛ بازاستفاده از verify_payment/fail_payment موجود؛ بازخوانی مستقل پس از یک تلاش ثبت، بدون replay نوشتن پس از ACK مبهم.

قفل عملیات جدید: advisory ثبت‌نام، ردیف ثبت‌نام اگر موجود، سپس پرداخت؛ قفل قیمت فقط هنگام prepare. guardهای جدول از مسیر REST/مصرف‌کنندهٔ قدیمی هم اعمال می‌شوند. marker و binding قابل بازنویسی/حذف نیستند. حذف ثبت‌نام/وبینار، سند مالی/marker را cascade نمی‌کند؛ شناسه‌های binding عمداً FK cascade ندارند و reader فقدان خدمت را unresolved گزارش می‌کند.

تنها گذار مجاز به paid، UPDATE از pending با رسید معتبر است؛ INSERT paid، بازگرداندن free/refunded، reset وضعیت bound نهایی به pending و ساخت دوبارهٔ شناسهٔ صادرشده رد می‌شوند. ویرایش metadata سابقهٔ legacy بدون تغییر وضعیت محفوظ است. TRUNCATE جدول‌های پرداخت/ثبت‌نام از PUBLIC/anon/authenticated/service_role بسته می‌شود؛ RLS و row-trigger به‌تنهایی این دستور را پوشش نمی‌دهند.

پول paid و خدمت unresolved مستقل‌اند. رسید قطعی در نبود/لغو/تغییر ثبت‌نام، پول را pending/failed نمی‌کند و خدمت را زنده نمی‌کند. هیچ entitlement، دعوت، پیام، حق مشاوره یا معامله در این بسته صادر نمی‌شود.

## گیت و ترتیب انتشار

خواننده ابتدا باید جداگانه نصب و مشاهده شود. روی schema قدیمی fail-closed است؛ بنابراین این برش بدون بررسی ترتیب انتشار، جایگزین فوری مسیر عمومی پرداخت نیست. callback عمومی فقط purpose معتبر ذخیره‌شده را dispatch می‌کند؛ legacy-unbound به دوره/مشاوره/وبینار ارتقا نمی‌یابد. endpoint وبینار همان reader را به کار می‌برد و query فقط hint قابل تطبیق است.

مصرف‌کنندهٔ ثبت‌نام، پیش از هر write قرارداد را با GET جلسه‌ایِ مالک انتخاب می‌کند: `read_webinar_registration_state` در schema جدید، یا فقط در missing-function قطعی، خواندن شکل قدیمی با فیلتر صریح عضو. خطای شبکه/Auth/capability ناشناخته به writer قدیمی fallback نمی‌کند. schema قدیمی، وبینار رایگان و flag خاموش، مسیر قدیمی ثبت‌نام را پیش از write حفظ می‌کنند؛ بعد از ACK مبهم هیچ fallback/write دوم نیست. duplicate معتبر marker قبلی را فقط می‌خواند؛ legacy بدون marker معتبر نمی‌شود.

صفحه `registration_id` واقعی را مصرف می‌کند. intent به همان registration متصل و پیش از POST پرداخت به‌صورت metadata حداقلی در sessionStorage حفظ می‌شود؛ اطلاعات مالی/actor ذخیره نمی‌شوند. GET احرازشده، intent/مرحلهٔ واقعی و در صورت اتصال معتبر URL همان authority را برای reload/recovery برمی‌گرداند. claimed/unknown هیچ charge/intent تازه‌ای نمی‌سازد؛ نتیجهٔ نامعلوم ثبت‌نام هم فقط recovery خواندنی دارد. query موفقیت، مدرک مالی/خدمت نیست. ResultPage از client نشست و فیلتر مالک روی canonical payments می‌خواند؛ webinars نیز وضعیت مالک و مبلغ/واحد/زمان snapshot را مصرف می‌کند.

فعال‌سازی نیازمند هم‌زمانی `WEBINAR_PAYMENT_BINDING_WRITES=1` در سرور و گیت‌های DB است. هر دو گیت DB issuance/settlement ابتدا false هستند؛ migration setter عمومی ندارد. schema/ACL/native JWT و backup/restore/ظرفیت از مسیر نصب موجود باید مستقل پذیرفته شوند. طبق رزرو هماهنگ‌کننده، فقط یک path در test:db برای thin SQL test افزوده می‌شود؛ CI/test:core/runtime مشترک تغییر نمی‌کنند. هیچ تصویر runtime جایگزین، سرویس یا هزینهٔ تازه‌ای مجاز نمی‌شود.

DDL نامزد: `sql/20261030133000_webinar_payment_binding.sql`، مطابق رزرو صریح هماهنگ‌کننده در ساختار موجود repo؛ ابزار/تاریخچهٔ migration موازی ساخته نمی‌شود. SQLهای phase5/phase8 بازنویسی نمی‌شوند. D032، حقوق MB/MG، O10/O14، ظرفیت/دیررس و سیاست تجاری باز می‌مانند.

## پذیرش و برگشت

آزمون‌ها: schema/capability غایب، legacy بدون binding، تغییر قیمت پس از صدور، تعارض هویت/authority/ref، دو عضو، INSERT مستقیم، bypass مصرف‌کنندهٔ قدیمی، immutable binding، ACK گم‌شده، هم‌زمانی claim/settlement، حفظ تاریخچهٔ غیرصفر، paid/unresolved، و خاموش‌بودن گیت‌ها. آزمون VM، PG و Auth/API واقعی شاهدهای جدا هستند؛ CI جای native یا پذیرش آرش نیست.

برگشت عملیاتی: شروع و نویسنده‌ها خاموش، reader سازگارِ fail-closed باقی؛ دادهٔ پول/تاریخچه حذف نشود و direct INSERT یا create_payment قدیمی برای rollback باز نشود. نصب اصلی، فروش و پذیرش انسانی با این سند اعلام نمی‌شوند.
