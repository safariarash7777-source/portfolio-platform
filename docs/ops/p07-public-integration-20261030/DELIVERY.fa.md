# DO NOT MERGE — تحویل integration منبع عمومی P07.4

مبنای UI: محصول PR345@0a0ee36995fef3c11cdfa68f81cb61a0702a45a6. blob فایل CodalReportsTab.tsx برابر302b992af85cf57e6fb795194b8b3a0eb1bd4ca9 و test آن6f3d0d0477d31c97aeaba09dc89aaf755bbc3f72 است؛ هر دو عین مبنا مانده‌اند. Product331/345، package/runner، env/DB/main تغییر نکرده‌اند. تمام این شاخه/PR و helper/test آن یک اتصال integration مستقل است؛ ادغام یا انتشار اصلی مجاز نیست.

## مسیر واقعیِ تنظیم‌شده

مرورگر UI موجود → GET هم‌مبدأ `/api/codal-list?symbol=فولاد` → helper عمومی server-side → GET ثابت `https://portfolio-platform-fawn.vercel.app/api/codal-list?symbol=%D9%81%D9%88%D9%84%D8%A7%D8%AF` → codal_feed موجود Production.

source از ابتدا همین مسیر است؛ بعد از۴۰۲ یا به‌عنوان fallback انتخاب نمی‌شود. هیچ reader مالی/DB/credential یا header ورودی وارد helper نمی‌شود و از env/flag استفاده نمی‌کند. این source chain تنظیم‌شده و با mock آزموده‌شده است؛ ثبت end-to-end مرورگری مرحله مستقل root/A است. SSR مالی و مسیرهای دیگر همین UI تغییر نکرده و ممکن است همچنان خطای قبلی داشته باشند.

GET فقط نماد دقیق فولاد، حداکثر۱۵ثانیه شاملbody، حداکثر۲۵۶KiB، حداکثر۳۰ردیف را می‌پذیرد؛ redirect/نماددیگر/queryاضافی رد می‌شوند. timeout درمرحله request/body، invalidJSON/schema/source/coverage/نماد و linkناسالم خطای مشخص‌اند. errorstatus و errorpayload معتبرِ عمومی upstream عیناً عبور می‌کنند. خطا به empty یا cacheپنهان بدل نمی‌شود، retry/collector/provider/model/alert/POST ندارد. publication غایب/null و ترتیب/عنوان/منابع و payload معتبر بدون بازسازی حفظ می‌شوند؛ هیچwindow/زمان/تازگی به آن اضافه نمی‌شود.

headerهای پاسخ `X-Integration-Only: P07-DO-NOT-MERGE` و `X-Public-Source-URL` مقصد عمومی ثابت و `X-Upstream-Status` وضعیت شناخته‌شده را اعلام می‌کنند؛ Cache-Control=no-store. header/Cookie/Auth/apikey ورودی یا Set-Cookie خروجی upstream forward نمی‌شوند. نسبت شرکت به query ثابت و codalSearchUrl.Symbol تحویل‌شده محدود است؛ identity تک‌تک ردیف‌ها یا شرکت از متن عنوان حدس زده نمی‌شود.

## آزمون محلی

`npx --no-install tsx --test app/api/codal-list/route.test.ts components/symbol/CodalReportsTab.test.ts lib/core/companyReportDiscovery.test.ts`

۳۳آزمون موفق (۱۴relay و۱۹UI/discovery)، lint scoped و typecheck موفق. helper فقط از route.test.ts موجود و ازقبل ثبت‌شده Core آزموده می‌شود؛ رجیستری موازی ساخته نشده. mockهای کوچک فقط داخل test هستند، نه درruntime/deployment. HEADخودکار و methodدیگر پیش ازIO رد می‌شوند تا probe سهمGETدستی منبع را مصرف نکند. CI/Preview exactSHA از metadata جدا پیگیری می‌شوند؛ موفقیت واحد محلی موفقیت مرورگر یا مقصد اصلی مالی نیست.

## یک read مرورگریِ رزروشده برای root/A

cloud ابزار مرورگر ندارد؛ هیچ GET زنده به integration API یا source برای این تحویل مصرف نشده است. برای جلوگیری از مصرف دوباره، cloud از curl/CLI/web-fetch نیز API را نمی‌خواند. root/A روی Preview ثابت همان SHA:

۱. تب reports فولاد را باز و footerSHA را تطبیق دهد؛ با یک کلیک «دریافت فهرست» همان request هم‌مبدأ را درNetwork ثبت کند. خطا در صورت وقوع ثبت و همان‌جا توقف؛ retry تازه ندارد.

۲. status/headerهای integration و URLمبدأ و response source=codal_feed/coverage=stored-announcements را ثبت کند؛ شمار واقعی را از پاسخ همان request بخواند، نه۲۱ثابتِشاهدقبلی. payload/window/publication ناموجود ساخته نشود.

۳. روی همان دادهٔ بارشده نوع/زمان راخاموش‌روشن، filter/reset و row-specificهشدار/پیوندمنبع را بررسی کند؛ این کنترل‌ها نباید GET تازه‌ای بسازند. با resize همان صفحه موبایل/دسکتاپ را بسنجد، نه reload و خواندن دوباره.

این پذیرش محدود P07.4 و reader اطلاعیه است؛ joblastSuccess/داده مالی جاری/حق خدمت/پذیرش کامل P09 نیست. علت۴۰۲ قدیمی و موضوعاشتراک با۲۰۰ این source عمومی نتیجه‌گیری نمی‌شوند. برگشت: کنارگذاشتن PR integration، بدون تغییر runtime یا DB/env محصول.
