# اقدام دقیق مالک برای پذیرش واقعی NEXT09

این فهرست درخواست رمز/OTP یا مجوز ضمنی عملیات نیست. در این ادامه هیچ API بات، پیام، ثبت webhook، credential واقعی، تغییر محیط مشترک یا Production انجام نشده است. اقدام ردشده سرور build‌شده نیز نباید با ابزار/چت/فرمان دیگری تکرار شود. علت آن فقط `blocked by policy` است و علت دقیق‌تر در شواهد وجود ندارد.

## مقصدها و دامنه‌ای که مالک باید مشخص کند

| اقدام مالک | مقصد دقیق مورد نیاز | دامنه حداقل / شاهد غیرحساس |
|---|---|---|
| تأیید بسته قابل پذیرش | SHA ترکیب approved از191/185/Auth190 معادل +189+patch جدید، origin HTTPS آزمایشی تحت مالکیت | نام SHAها و origin؛ کد/SQL هماهنگ، send خاموش؛ پذیرش این task از ادغام استنتاج نشود |
| محیط داده مستقل | پروژه Supabase آزمایشی خالی با حساب‌ها/دوره‌ها/محتوای ساختگی، پروژه MySQL آزمایشی جدا | schema و grants بررسی‌شده؛ migration189 قطع redemption قدیمی حتی flag-off دارد؛ marker اولین رسید و namespace ثابت |
| هویت آزمایشی | دو حساب native سایت و دو Telegram principal ساختگی تحت کنترل آزمایشگر؛ نگاشت دو دوره و یک حساب منقضی | alias در گزارش عمومی؛ شناسه‌ها/خروجی نشست فقط در artifact خصوصی؛ بدون شماره/کدملی واقعی |
| مالک بات/کانال | bot آزمایشی مستقل و channel خصوصی آزمایشی بدون عضو واقعی؛ mapping channel→cohort تأییدشده | alias عمومی؛ bot/channel ID و allowlist آزمایشگر در فایل خصوصی؛ حقوق admin/invite واقعی باید توسط مالک بررسی شوند |
| مسیر webhook منتخب | فقط یکی از webhook موجود site `/api/telegram/webhook` یا miniapp webhook روی origin آزمایشی منتخب | انتخاب روشن برای هر bot، secret معتبر ingress؛ این task setWebhook نکرده و نمی‌کند |
| bridge / URLها | miniapp→site `/api/telegram/connection-proof`؛ miniapp `/api/platform-connection/prove`؛ user→site `/api/notifications`؛ worker `/api/notifications/worker` | قرارداد notifications.v1، Origin ثابت HTTPS، ساعت‌ها همگام؛ اتصال/رضایت دسته‌ها مستقل |
| مشاوره | MySQL آزمایشی→site `/api/leads/webhook` | URL HTTPS صریح، secret سرور، namespace/firstReceiptId ثابت، retry همان رسید؛ پرونده‌های قدیمی تطبیق دستی |
| تماس Telegram در پذیرش بعدی | فقط `https://api.telegram.org` برای همان bot آزمایشی و allowlist principal/channel ساختگی | مجوز روش‌ها جدا: lookup/admin-right inspection، private send برای همان گیرنده؛ join approval/decline فقط پس از پیاده‌سازی adapter؛ removal مجوز مستقل |

Token بات عملاً اختیار بات را می‌دهد؛ فیلتر روش/مقصد/گیرنده باید سمت adapter و harness اعمال شود و فرضِ token با scope ریزدانه مجاز نیست. بازکردن این گیت‌ها نیازمند اجازه مستقل مالک و رعایت محدودیت policy است، نه ادامه‌دادن مخفیانه همین عمل ردشده.

## تحویل امن تنظیمات

- مالک با حساب خودش در secret manager موجود یا تنظیمات server-only **Preview/experimental project منتخب** مقادیر را قرار دهد؛ فقط نام secret reference، origin و metadata مالکیت در چت/گزارش بیاید. دسترسی به Production، پروژه مشترک یا داده واقعی داده نشود.
- مقادیر لازم: bot token آزمایشی و webhook secret؛ bridge secret حداقل32کاراکتر؛ CRON_SECRET؛ Supabase server credentials آزمایشی؛ miniapp session secret؛ lead webhook secret. هر کدام فقط به process مربوط و با حداقل دسترسی تحویل شوند. هیچ مورد به NEXT_PUBLIC/client bundle نرود.
- اگر secret manager برای پذیرش در دسترس نیست، مالک یک فایل موقت خارج مخزن با ACL محدود به حساب اجراکننده و محل ثابت مورد توافق آماده کند؛ گزارش فقط وجود/reference و مقصد را ثبت کند. فایل، محتوای env، JWT، session cookie، initData خام، کد اتصال، confirmation و OTP هرگز در چت، PR، screenshot، stdout یا لاگ ذخیره نشوند. پس از پذیرش، فایل موقت حذف و token آزمایشی rotate/revoke شود.
- ورود native و دریافت OTP، اگر لازم شد، توسط خود مالک/آزمایشگر در رابط انجام شود؛ هیچ OTP از شخص درخواست یا در چت منتقل نشود. ما credential واقعی را از دستگاه/مرورگر استخراج نمی‌کنیم.

## ترتیب پذیرش بعدی و شاهد مورد انتظار

1. رفع/تعیین مسیر مجاز برای گیت **policy** با مسئول مجوز؛ تا آن زمان runtime smoke ردشده انجام‌نشده می‌ماند. این task مجوز تازه درخواست نمی‌کند و علت را حدس نمی‌زند.
2. مسئول ادغام کد+schema را هماهنگ کند:185 برای scoped detail/read UI،189، patch لینک و طبقه‌بندی SDK؛ send خاموش. حقوق/منبع Auth مشترک و grants هدف تأیید شوند. هیچ مهاجرت مشترک در این ادامه اجرا نشده است.
3. آزمایشگر فقط با داده ساختگی، نشست native واقعی دو سمت را اجرا کند: start→proof→همان نشست confirm، TTL/replay/جعل، قطع/relink، opt-in خاموش/روشن، outage و بازیابی. شاهد شامل نتیجه و alias است، نه token یا cookie.
4. با مجوز مستقل private send، دسترسی دو دوره، انقضا/لغو بعد از enqueue، correction/withdrawal، dedupe و خطای قطعی/نامعلوم را بسنجد. قبول API به معنی خواندن نیست. لینک نسخه+دوره پس از login به همان scope برگردد؛ notification-seen نباید read receipt ایجاد کند؛ «خواندم» نسخه جدید باید مستقل باشد.
5. admission واقعی **هنوز adapter/schema/endpoint ندارد**. ابتدا مالک policy رضایت جدا، channel mapping، operation ledger و removal/rejoin را تأیید و مجری adapter را پیاده کند؛ سپس آزمایشگر با مجوز method-scoped حقوق و join آزمایشی را بسنجد. mock planner مجوز یا اثبات عضویت نیست.
6. مسیر مشاوره فقط با receipt جدید و marker تأییدشده: pending واقعی، retry همان reference، یک canonical lead، conflict body، قطع/بازگشت transport. ارسال اعلان admin موجود فقط اگر گیرنده نیز آزمایشی و صریحاً مجاز باشد؛ در غیر این صورت غیرفعال بماند.

تا تحقق این شاهدها، وضعیت NEXT09 «patch ایزوله آماده بازبینی، پذیرش عملیاتی باز» است؛ CI/build/mock این گیت‌ها را نمی‌بندند.
