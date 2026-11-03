# بستهٔ بازبینی اتصال نمودارهای canonical — ۲۰۲۶-۱۰-۳۱

**export محلی برای بازبینی؛ بدون ادغام main، push شاخه یا انتشار.** مالک این هشت فایل A است؛ COMMAND-CENTER و ثبت وضعیت محصول فقط با root است. شاخه `codex/p07-canonical-chart-integration-20261031` از main واقعی `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc` ساخته شد؛ مرجع main از GitHub همان روز با ref محلی تطبیق داده شد. هیچ منبع بازار یا provider فراخوانی نمی‌شود.

## موجودی و مرز پیش از ویرایش

صفحهٔ canonical موجود `app/symbol/[symbol]/page.tsx` از قبل MonthlySalesCharts، FundamentalCharts و QuarterlyCharts را مصرف و گزارش‌های ماهانه را با sanitizer موجود پردازش می‌کند. reader موجود واحد مبلغ نامعلوم را کنار می‌گذارد. route، API، reader، قرارداد ورودی، units/sanitizer، حقوق/Auth/SQL/وابستگی/قیمت تغییر نمی‌کنند. محافظ گپِ public/design یک adapter آموزشی بود و به patch محصول منتقل نمی‌شود.

| فایل رزروشده | منشأ تغییر قابل بازبینی |
|---|---|
| `lib/core/monthlyReport.ts` و `monthlyReport.test.ts` | نرخ PR361@66765f7؛ مقدار/null از۲۳؛ helper تقویم مشترک از۰db |
| `components/symbol/MonthlySalesCharts.tsx` | مقدار null و پیام فقدان داده از۲۳ |
| `lib/fundamental/calc.ts` و `n30.test.ts` | اسلات‌های ن-۳۰ و حفظ گزارش‌های واقعی از۰db |
| `components/symbol/FundamentalCharts.tsx` | نمایش null/گپ و بازاستفاده sanitizer از۰db |
| `components/symbol/QuarterlyCharts.tsx` | فقط ارقام سه محور عمودی از۵۵۷ |
| همین برگ تحویل | منشأ، وابستگی، آزمون و حدود export |

نسخهٔ نهایی همین هفت فایل دقیقاً از `5572742fee8b691cdc4e8f00541757c172511a30` انتخاب می‌شود؛ بازنویسی یا cherry-pick کل شاخه انجام نمی‌شود. موجودی main نشان داد این deltaها هنوز در آن نیستند و تمام وابستگی‌های لازم از قبل حضور دارند. `public/design/**`، EDU، نمونه تصمیم/پرونده، bundle/manifest نمونه، CSS و مسیر موازی وارد export نمی‌شوند. دادهٔ تاریخ‌دار یا پاسخ نمونهٔ runtime افزوده نمی‌شود.

این بسته فرمول نرخ، پایهٔ بازار، واحد یا روش جمع تازه نمی‌سازد. actual data، سازگاری واحد گزارش‌ها، قیمت و تقویم معاملات، بازبینی دسترسی کامل و پذیرش آرش بازند. شواهد مرورگر/CI منابع قبلی تاریخی‌اند و پذیرش این integration محسوب نمی‌شوند. خروجی patch/رسید با SHA و hash دقیق در outputs نگه داشته و به root تحویل داده می‌شود؛ بررسی code/application محلی از نصب و اجرا روی مقصد جداست.

## بررسی همین بسته

هفت فایل canonical با نسخه۵۵۷ برابرند و۱۰ وابستگی/مصرف‌کنندهٔ main، شامل native page، reader، types/units/sanitizer، quarterly core، formatter، History و package/lock عیناً ثابت‌اند. هیچ import طراحی در پنج فایل runtime وجود ندارد. کد، schema و دادهٔ مقصد تغییری نکرده‌اند.

۵۵ آزمون محاسبات ماهانه/ن-۳۰/سالانه و۱۷ آزمون موجود actual symbol page موفق شدند؛ typecheck، lint محدود و diff-check نیز موفق‌اند. اجرای این دو مجموعه با محافظ آفلاین، هر چهار شمارندهٔ شبکه/فرایند فرزند/محیط حساس/فایل خصوصی را صفر ثبت کرد. آزمون page از readerهای stub استفاده می‌کند؛ این سروررندر آفلاین، مرورگر، hydration یا خواندن دادهٔ واقعی نیست. هشدار از قبل موجودِ useLayoutEffect در Term ثبت شد و با تغییر خارج از دامنه پوشانده نشد.

اجرای نخستِ محافظ روی runner با pipe داخلی tsx و خواندن snapshot محیط توسط آزمون اختیاری wiring ناسازگار شد و موفق محسوب نشد. علت IPC در کد نصب‌شدهٔ tsx بررسی شد؛ در preload خصوصیِ شواهد، فقط همان pipe والد به اتصال ناموجود شبیه‌سازی می‌شود. هیچ اتصال واقعی/خارجی مجاز نشده و محافظ مخزن تغییر نکرده است. wiring زیر محافظ سخت، نتیجهٔ معتبر تازه ندارد و بدون محافظ تکرار نشد. دو مجموعهٔ موفقِ بالا جدا و با exit صفر ثبت شده‌اند؛ نتیجهٔ CI قدیمی جای این وضعیت نیست.

منشأهای۶۶۷/۲۳/۰db/۵۵۷ و QA محدود Preview به همان sourceها تعلق دارند؛ root بسته شدن گیت محدود محور۵۵۷ را گزارش کرده است ([شاهد root](https://github.com/safariarash7777-source/portfolio-platform/pull/332#issuecomment-6537631767)). این شاهد، پذیرش مسیر canonical یا دادهٔ زنده نیست. برای export محلی، CI/ساخت مقصد/نصب/انتشار/پذیرش آرش NOT_RUN یا NOT_APPLIED باقی می‌مانند. آزمون و CI قدیمی دوباره اجرا نشده‌اند.

## تحویل و مصرف

export در `outputs/p07-canonical-chart-integration-20261031/` شامل patch با full-index، سورس هشت فایل، manifest/receipt و شاهد بررسی بدون شبکه است. patch فقط روی main ثابت بالا بررسی می‌شود؛ ابتدا `git apply --check` و سپس بازبینی تغییرات لازم است. تطبیق روی index موقت، بدون دست‌زدن به index یا شاخهٔ main، باید در receipt با درخت برابر نامزد ثبت شود. ZIP و اعضایش پس از ساخت بازخوانی و hash می‌شوند. اجرای نصب/ادغام/انتشار به این export واگذار نشده است؛ root مالک گام بعدیِ بازبینی و ثبت مرجع است.
