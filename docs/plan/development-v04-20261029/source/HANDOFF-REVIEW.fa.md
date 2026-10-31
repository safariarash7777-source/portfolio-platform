# نتیجه بررسی محدود تحویل — نسخه ۰٫۳٫۱

تاریخ: ۶ آبان ۱۴۰۵ / ۲۸ اکتبر ۲۰۲۶، تهران.
دستیار داخلی phase1_handoff_review دریافت، خواندن و صحت manifest و آرشیو نسخه۰٫۳ را تأیید و سه مسیر را فقط‌خواندنی بررسی کرد. این دستیار جانشین هماهنگ‌کننده اجرایی موجود نیست. main مشاهده‌شده f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc است. runtime، DB زنده، نشست، لپ‌تاپ و مصرف آزموده نشدند. Vercel در این بازبینی دوباره خوانده نشد؛ شاهد قبلی root جداست.

## اصلاح برنامه

وابستگی کلی «P06 + قرارداد محاسبه/فیلتر → P09» بیش از حد گسترده بود. پیش‌نیاز اجرای هر پژوهش، داده و محاسبات معتبر همان مأموریت است. ثبت/بازخوانی و نسخه‌بندی کاربرگ موجود مستقل از تکمیل همه فیدها یا اجرای مدل تازه بررسی و پذیرفته می‌شود. این اصلاح، تغییر خواسته مالک نیست.

## موجودی و سه تحویل پیشنهادی

### ۱. پذیرش مسیر مالی تا مشاوره موجود

مسیرهای /dashboard/cashflow و /dashboard/goals به APIهای /api/personal-finance/cash-flow و /goals و دفترهای member_cash_flow_versions/entries و member_goals_versions وصل‌اند. /dashboard/consultation و /admin/consultation از /api/consultation و RPCهای load_consultation / command_consultation استفاده می‌کنند.

[قرارداد سرور](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/lib/consultation/server.ts#L13) و [کنترل مبنای مالی/پژوهشی](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/sql/consultation_workflow.sql#L165) در کد مشاهده شدند. [رسید تاریخی](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/docs/ops/advisor-approval-20261023/DELIVERY.md#L3) نصب/آزمون/انتشار را گزارش می‌کند؛ پذیرش آرش و پایلوت واقعی باز بوده‌اند.

پیشنهاد دامنه نخست: یک پرونده شخصی ساده روی دفترها و گردش موجود؛ بدون ورود کسب‌وکار مستقل، امتیاز سلامت، ریبالانس یا اتصال خرید به این برش. این محدودیت برای زیربسته است، نه حذف نیاز جامع.
پذیرش: دو نسخه مالی و بازخوانی، جداسازی دو عضو، رضایت و لغو، جلوگیری از انتشار پس از تغییر مبنای تأیید، مشاهده نسخه مشخص، پیگیری مستقل از موجودی، خطای ذخیره و تجربه موبایل/دسکتاپ.
وابستگی: نشست و حساب آزمون مجاز، مقصد سالم و نسخه نصب معلوم؛ وابسته به فولاد/Hermes نیست. آزمون مصنوعی منتظر بسته‌شدن تمام روش‌های توصیه واقعی نمی‌ماند.
فاصله معلوم: اتصال حق خرید خدمت در قراردادهای خوانده‌شده احراز نشده. وضعیت‌های فعلی viewed/acknowledged/doing/done/question هستند؛ «بخشی/نکردم» و پاسخ متنی مشاور به سؤال عضو کامل اعلام نشوند. ترجیحات این موارد قبلاً انتخاب شده‌اند؛ دوباره پرسیده نشوند.

### ۲. پذیرش ثبت، بازخوانی و نسخه دوم پژوهش

[صفحه /admin/research](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/app/%28protected%29/admin/research/page.tsx#L8) دو بخش متفاوت دارد: research_agent_drafts و ResearchWorkbook. کاربرگ از /api/admin/intelligence/workbooks و research_workbook_versions/reviews استفاده می‌کند.
[نمای پیش‌نویس ایجنت](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/components/admin/ResearchCaseFiles.tsx#L25) شماره نسخه کاربرگ ندارد و اتصال انتقال خودکار در UI مشاهده نشد. شناسه آن نباید به‌جای researchVersionIds در مشاوره استفاده شود؛ نسخه معتبر و تأییدشده کاربرگ مبنای آن قرارداد است.

[ذخیره API](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/app/api/admin/intelligence/workbooks/route.ts#L50) و [کنترل creationId](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/lib/intelligence/workbook-store.ts#L232) قابل بازاستفاده‌اند. نسخه اول با هویت ثابت، نویسنده و محتوای تلاش تطبیق داده می‌شود؛ نسخه‌های بعدی و بازبینی آزمون مستقل می‌خواهند.
پذیرش: ثبت و بازخوانی نسخه اول/دوم، حفظ قبلی، عدم انتقال تأیید به نسخه تازه، تعیین تکلیف قطع پاسخ پس از ثبت، تفکیک ذخیره/تأیید/انتشار. اجرای مدل تازه شرط این آزمون نیست.
وابستگی: نشست مجاز، مقصد ذخیره و پرونده منبع‌دار. وجود پرچم P07_PRIVATE_PREPARATION_ENABLED در کد مشاهده شده؛ مقدار runtime نامعلوم است. دفتر ارزیابی کامل از وجود این کاربرگ نتیجه نمی‌شود.
PR329 در بازبینی همچنان open/head9668620ab24ae6f1f6c11f7b12e19659a1f28bb5 بود؛ پرونده یا اصلاحات آن با main مخلوط نشود.

### ۳. پذیرش مسیر داده تا فیلتر و صفحه با زمان/واحد صادق

تب گزارش /symbol/[symbol] از /api/codal-list و codal_feed استفاده می‌کند؛ companyReportDiscovery فیلتر اطلاعیه بر عنوان/نوع/وجود متن تاریخ ارسال است. مسیر مالی مجزا readFundamentals → codal_reports → کنترل واحد/دوره و موتور ماهانه است.
[قرارداد feed](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/lib/codal-feed.ts#L1)، [فیلتر اطلاعیه](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/lib/core/companyReportDiscovery.ts#L25)، [کنترل واحد](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/lib/fundamental/supabase.ts#L313) و [کنترل سال مقایسه](https://github.com/safariarash7777-source/portfolio-platform/blob/f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc/lib/core/monthlyReport.ts#L216) شاهد کد هستند، نه سلامت امروز فید.
فهرست حداکثر۳۰ اطلاعیه پس از خواندن۶۰ رکورد است؛ ادعای پوشش کل تاریخچه نشود. sent_date غیرخالی اثبات انتشار معتبر یا تازگی نیست. واحد نامعلوم باعث پنهان‌شدن مقدار/نرخ است و نبود سال قبل با سال دورتر پُر نمی‌شود.
پذیرش: زمان ارسال/انتشار/پایان دوره/دریافت تفکیک، محدوده پوشش روشن، داده ناقص/سال غایب/اصلاحیه درست، خطا از خالی جدا و علت عبور فیلتر قابل مشاهده، نمایش واقعی موبایل و دسکتاپ. این برش فیلتر اطلاعیه را فیلتر اقتصادی معرفی نمی‌کند و آستانه مالی تازه نمی‌سازد.
وابستگی: نمونه با منشأ و خواندن ذخیره معتبر؛ فقط محاسبه وابسته به صادرات/خدمات به تعیین تکلیف PR329 وابسته است.

## آماده و باز

این‌ها سه زیربسته مناسب برای تکمیل برنامه و پذیرش‌اند؛ برنامه فنی همه جزئیات یا مجوز اجرا نیستند. موارد O03/O05/O07/O08/O16 همچنان به شرح سند مادر بازند؛ صرفاً موارد مرتبط هر زیربسته باید بسته شوند. هیچ سؤال محصولی تازه برای رفع تفاوت شناسه‌ها، محدودیت فهرست یا موجودی قابل خواندن لازم نیست.

اصلاحات بالا در اسناد محلی ثبت می‌شوند. ثبت در GitHub، اجرای API نوشتنی، نصب یا انتشار انجام نشده است. وضعیت زنده همچنان فقط COMMAND-CENTER مخزن است.
