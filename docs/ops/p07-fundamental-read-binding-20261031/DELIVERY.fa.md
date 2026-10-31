# نامزد محلی binding خواندن بنیادی — ۲۰۲۶-۱۰-۳۱

**Local export review / NOT_FOR_MERGE؛ بدون push، Draft remote، تماس با منبع واقعی، نصب env یا انتشار.** base فریز `cdc7cb7eace650ab1f7668739af38ea7e9f7bcb6` و شاخه `codex/p07-fundamental-read-binding-20261031` است. A مالک فایل‌های همین برش است؛ COMMAND-CENTER و cleanup/release binding فقط با root باقی می‌مانند. گیت دادهٔ قبلی `BLOCKED_DATA_READ_402` با موفقیت کد بسته نمی‌شود.

## رزرو پیش از source edit

- `lib/fundamental/supabase.ts`: فقط انتخاب تنظیم خواندن، همان transport و اتصال حافظه موقت؛ parser/build/selection و خروجی مالی تغییر نمی‌کنند.
- `lib/fundamental/read-config.server.ts` و `read-binding.test.ts`: helper سروری حداقلی و آزمون object/GET/cache/error با مقادیر مصنوعی. helper خالص `liaraPublicEnv` موجود فقط با object ایزوله بازاستفاده می‌شود؛ profile بررسی‌نشدهٔ C وارد نمی‌شود.
- `lib/fundamental/wiring.test.ts` و `read-status.test.ts`: فقط fixture binding و قرارداد transport متناسب؛ هیچ آزمون واقعیِ منبع یا تغییر قرارداد مالی.
- `vercel.json`: فقط deploymentEnabled=false برای نام دقیق همین شاخه؛ crons و تمام فیلدهای base محفوظ.
- همین leaf: قرارداد binding، شواهد، محدودیت و export؛ وضعیت محصول مرجع موازی ندارد.

هفت فایل canonical و تمام derive/parser/units/types/sanitizer، SDK/Auth/write، route/API، next.config، relay C و ops B ثابت‌اند. source/env واقعی خوانده، چاپ یا بازنصب نمی‌شود. ابزارهای عمومی Supabase فقط برای مستندات خوانده شدند؛ هیچ query یا مدیریت پروژه اجرا نمی‌شود.

## قرارداد مقصدِ هنوز نصب‌نشده

فقط `FUNDAMENTAL_READ_URL` و `FUNDAMENTAL_READ_ANON_KEY` سروری هستند؛ URL مجاز دقیق `https://62.60.191.24/liara-preview` است. هر دو غایب: همان جفت legacy خواننده. وجود یکی، blank یا نامعتبر: error/zero GET؛ fallback به legacy وجود ندارد. نقش anon، issuer=supabase و expiry با validator موجود بررسی می‌شوند؛ این بررسی claim/shape است و ادعای تأیید رمزنگاری امضا نیست. کلید و نتیجه validator در process.env، next.config، SDK، Auth/write یا bundle عمومی نصب نمی‌شوند.

همان دو GET ثابت `codal_reports` با select/order، limitهای۴۰۰/۲۰۰، timeout۸ثانیه و no-store می‌مانند؛ method=GET، redirect=error، credentials=omit و فقط apikey/Authorization از جفت همان درخواست. Cookie/Authorization ورودی forward، retry یا fallback پس از شکست وجود ندارد. null/empty/error طبق قرارداد قدیمی جدا می‌مانند؛ ۴۰۲ علت قطعی billing یا نبود گزارش محسوب نمی‌شود.

تنظیم پیش از cache بررسی می‌شود؛ cache با digest داخلیِ mode/URL/key اتصال دارد و خود کلید ذخیره یا چاپ نمی‌شود. جفت نامعتبر یا تغییر binding، cache را پاک می‌کند؛ پایان درخواست قبلی حق ندارد cache مربوط به binding تازه را بنویسد. TTL۶۰ثانیه و parser موجود حفظ می‌شوند. بازار/history و rate basis/قیمت/تقویم معاملات مستقل و بازند.

## قرارداد انتشار بعدی با root

ابتدا export و readback محلی همین source؛ سپس تصمیم root درباره binding/cleanup و بازبینی کد. در این برش env، credential، TLS trust، مقصد عمومی، grant/SQL/provider/model/ingest تغییر نمی‌کنند. اگر مرحله بعد مجاز شد، جفت سروری باید در همان مقصد و scope شاخه، با rollback و خواندن مستقل هر دو خانواده N10/N30 بررسی شود؛ برداشتن guard یا نصب جفت مجوز جدا و شاهد تازه لازم دارد. READY/CI یا پاسخ mock، پذیرش دادهٔ واقعی نیست.

فعال‌سازی/بازگشت باید اتمیک برای هر دو متغیر باشد: حذف یا خالی‌کردن یکی از آن‌ها rollback نیست و عمداً error/zero GET می‌دهد. حذف هر دو فقط مسیر legacy را فعال می‌کند و بسته‌شدن مشکل۴۰۲ را تضمین نمی‌کند. مالک باید پیش از هر عملیات، source SHA، شاخه و مبدأ ثابت، scope دو تنظیم، وضعیت cleanup و روش بازگشت را ثبت کند؛ سپس بدون چاپ مقادیر، valid بودن claim/expiry را بررسی و هر دو خانواده را مستقل از cache بخواند. Auth، SDK، market/history و هیچ writer مصرف‌کنندهٔ این جفت نیستند.

## شواهد محلی و مرز آن‌ها

۲۴ آزمون موفق‌اند:۱۴ مورد binding/GET/cache/failure،۶ آزمون wiring موجود و۴ آزمون validator موجود. URL دقیق، blank/partial، نقش/issuer/expiry، دو GET/limit/order/select/timeout۸ثانیه، header خود جفت، no retry/fallback، جداسازی empty/error، key/source/mode rotation، انقضا حین fingerprint، A→B→A، پاسخ دیررس و cache مستقل دو نماد پوشش دارند. کلیدهای آزمون ساختگی و بدون امضای معتبرند؛ ادعای ارتباط واقعی وجود ندارد. ۴۰ رویداد واقعیِ همین mock با whitelist فیلدهای phase/status/kind/reason در `mock-read-log.json` خارج از source ذخیره می‌شوند؛ نه credential، URL، Cookie، body یا Error.message.

محافظ آفلاین موجود با mock دقیق IPC والد tsx بازاستفاده شد. محافظ خصوصیِ دیگری، خواندن نام‌های تازهٔ binding و هر نوشتن متغیر محیطی را هم رد می‌کند. همهٔ شمارنده‌های network/childProcess/sensitiveEnvironment/privateFile و privateBindingReads/environmentVariableWrites صفرند. wiring به‌جای snapshot/نوشتن env سراسری، object مصنوعی تزریق می‌کند. read-status با fixture سراسری/screener قدیمی دست‌نخورده ماند؛ حالات transport آن در مجموعهٔ تازهٔ ایزوله آزموده شده‌اند و اجرای کامل آن/CI/ساخت Next در این export ادعا نمی‌شود.

یک شکست نخست ناشی از fixture آزمون TTL بود که symbol را فیلتر نمی‌کرد؛ با اصلاح fixture به query واقعی، انتظار empty معتبر شد. ناسازگاری نوع‌گذاری CJS با NODE_ENV نیز در cast محلیِ object دو‌فیلدی حل شد؛ validator مشترک تغییر نکرد. typecheck، lint و diff-check نسخهٔ نهایی موفق‌اند. بررسی AST،۱۲ تابع parser/selection/query، دو interface موجود و ثابت‌های limit/TTL/cache را برابر base یافت؛۱۷ فایل محافظت‌شده از جمله هفت canonical، units/types/sanitizer/validator/next.config و reader مجزای screener ثابت‌اند. در vercel فقط guard همین شاخه افزوده و crons/base عیناً حفظ شده‌اند.

export فقط۶ فایلِ رزروشدهٔ لازم دارد؛ remote push/Draft/deploy/نصب تنظیمات انجام نشده است. patch روی index خصوصی از base باید tree نامزد را دقیق بازسازی کند؛ ZIP/member/hash و receipt نیز بازخوانی می‌شوند. marker سروری و بررسی source، جداسازی کد را نشان می‌دهند؛ bundle واقعی و TLS/امضای JWT/اجازهٔ upstream/دادهٔ واقعی هنوز گیت release هستند. blocker قبلی۴۰۲ باز است و این نامزد، پذیرش عملی آن نیست.

مرجع عمومیِ بررسی‌شده: [کلیدهای self-hosted Supabase](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys) و [changelog](https://supabase.com/changelog). این منابع برای کنترل قرارداد استفاده شدند؛ راهنمای نصب/تعویض کلید آن‌ها در این مأموریت اجرا نشد.
