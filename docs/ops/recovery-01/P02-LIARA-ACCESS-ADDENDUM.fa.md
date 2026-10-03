# P02 — دسترسی زنده PaaS و اصلاح محدود NAV

بررسی تکمیلی۳اکتبر۲۰۲۶، حدود10:24–10:28UTC. این الحاقیه جای رسید نسخه اجرایی PaaS را نمی‌گیرد.

## نتیجه جستجوی مسیر دسترسی

- در قابلیت‌های callable این چت، connector مخصوص Liara وجود ندارد.
- `Get-Command liara` در PATH نتیجه نداد. wrapper/package در مسیرهای مشخص Roamingnpm، ProgramFiles/nodejs، workspace و bundledNode موجود نبود. cache نصب موقت npm در AppData/Local/npm-cache/_npx بررسی شد و package `@liara/cli` پیدا نشد؛ مسیر .npm/_npx نیز حاضر نبود. این جستجو ادعای نبود ابزار در همه فایل‌های دستگاه نیست.
- مرورگر قابل کنترل در این چت فقط IAB/MCPApps خودش است؛ Chrome/native و تب‌های نشست دیگر در inventory آن حاضر نیستند. کنسول `https://console.liara.ir/` در تب ساخته‌شده به `https://console.liara.ir/auth` رسید؛ فرم ورود ایمیل/شماره تلفن مشاهده شد. هیچ credential، OTP، cookie، token، storage احراز هویت یا کل env استخراج/چاپ نشد و هیچ فرم ورود ارسال نشد.
- ابزار web به تنهایی رسید authenticated deployment/scale/settings نمی‌دهد. debug موجود رله، بخشی از اجرای jobها را نشان می‌دهد ولی جای تنظیم زنده و مالک/replica/release را نمی‌گیرد.

بنابراین نسخه/image فعال PaaS، تعداد replica، تنظیم کامل timer/timezone و mapping مالک همچنان UNKNOWN هستند. سالم بودن receiver و نوشتن DB در چرخه طبیعی تأیید مستقل دارد و این مانع آن نتیجه را باطل نمی‌کند.

## اقدام دقیق اپراتور

مالک یا اپراتور مجاز همان حساب Liara، با ورود امن خودش به کنسول، سرویس **arsadata** در بخش Platform را انتخاب کند و از نمای deployment/release فعال، منابع/scale و settings این اطلاعات غیرمحرمانه را بدهد:

| اطلاعات لازم | حداقل خروجی مجاز |
|---|---|
| نسخه فعال | شناسه release، SHA کد اگر موجود و image/digest؛ وضعیت فعال و زمان deploy |
| فرآیند | تعداد replica فعال و restart/start time در صورت نمایش |
| flags | فقط نام flag و boolean فعال/غیرفعال؛ نمونه‌های کد CODAL_ENABLED،CODAL_ARCHIVE_ENABLED،CANDLE_BACKFILL_ENABLED |
| timer | interval عددی و timezone واقعاً تنظیم‌شده؛ default کد به عنوان env واقعی معرفی نشود |
| مالک | مالک عملیات غیرمحرمانه و ارتباط release با سرویس arsadata.liara.run |

کل env، API key، رشته اتصال، credential یا log خام درخواست نشده‌اند. سطح دسترسی لازم، امکان **خواندن همین app و deployment/resource/settings مربوط** است؛ نام دقیق نقش IAM لیارا از حساب جاری تأیید نشده و نباید role جدیدی را حدس زد یا دسترسی امنیتی تازه ساخت. P00 کنسول ورود را در پنل خودش باز کرده و نیاز ورود امن/رسید اپراتور را به صورت مشخص مدیریت می‌کند؛ P02 سؤال انسانی تکراری ایجاد نکرده است.

quota/backfill/افزایشjob تا baseline معتبر و موجودی همه consumers گیت‌شده است. اصلاح readers و نمایش محدود داده به این مانع وابسته نیست. هیچ provider call تازه در این audit انجام نشد.

## اصلاح NAV پس از بازبینی

P00 edge را یافت و P02 با قرارداد reuse214 تأیید کرد: `relay/nav-quality.mjs` حالت‌های ready/stale/invalid-time/invalid-unit/unavailable را مستقل از clock می‌دهد و applyNav فقط ready را منتشر می‌کند. اگر metadata قبلی همراه NAV باقی بماند، reader نباید source rejection را با ساعت ظاهراً تازه خنثی کند.

آزمون رفتاری روی clockهای تازه و جفت‌شده، navStatus=stale را به حباب10 تبدیل می‌کرد؛ انتظارnull بود. پیش از اصلاح:14PASS/1FAIL. commit موضعی `4e5cb64f86f89956d5eb7b0b20ab456d1f1613f3`، پس از4213dda، فقط `lib/market-quality.ts` و `lib/market-bounded.test.ts` را تغییر داد:

- هر flag صریح غیرready، حباب راnull و کیفیت را stale/unavailable/unknown-time می‌کند؛ flag نامشخص ready فرض نمی‌شود.
- row اصلی، قیمت، NAV، NAVصدور، تاریخ/ساعت و status نگه داشته می‌شوند و input mutate نمی‌شود.
- ready یا flag غایب legacy همچنان باید گارد clock و pairing موجود را بگذراند؛ source ready ساعت گمشده یا داده کهنه را معتبر نمی‌کند.

اکنون15آزمون reader/NAV، صفرfail/skip، و lint دو فایل موفق است. چهار آزمون mapper اختیار قبلاً موفق بود و فایل آن در این patch تغییر نکرده است. UI/Auth/schema/blacklist/provider/cadence تغییر نکردند. P00/P01 برای cherry-pick و قرارداد نمایش مطلع شدند؛ نصب/پذیرش روی سایت همچنان مرحله جداست. manifest تازه hash فایل‌های همان9path را در commit نهایی4e5cb64 نگه می‌دارد؛ شاهدها و ادعای13PASS قبلی مربوط به نسخه4213dda هستند.
