# اصلاح ترتیب طبیعی Tab — نامزد، بدون انتشار

مبنای دقیق: 52336c9a17cf8a9e8f3c4b5096b2525bf3fa25c7. شواهد root: tooltip در DOM قبل از SVG بود؛ Arrow به نقطهٔ درست می‌رسید اما Tab به SELECT بعدی می‌رفت و منبع ناپدید می‌شد. کلیک معمولی نسخهٔ مبنا واقعاً popup کدال باز کرده بود. redirect کدال به MonthlyActivity.aspx باید با زنجیرهٔ URL اولیه سنجیده شود، نه برابری خام URL نهایی.

شاهد تکمیلی root در outputs/p14-tooltip-interaction-root-20261104/browser-receipt.json: درخواست اول دقیقاً href رکورد 11662، سپس 302 به MonthlyActivity؛ Escape پاس. در viewport 375، زمان‌ها داخل tooltip بودند اما خود tooltip از x=251.65 تا510.04 بیرون صفحه بود. این ورودی موس در viewport موبایل بود، نه شاهد touch. اینها پذیرش نسخهٔ جدید محسوب نمی‌شوند.

قرارداد نصب‌شدهٔ Recharts 3.9.1، Tooltip.portal را می‌پذیرد و TooltipBoundingBox برای portal صریح، positionStyle مطلق پیش‌فرض را کنار می‌گذارد. محفظهٔ رسمی portal اکنون بعد از اسلات 280px نمودار در همان frame قرار می‌گیرد؛ منبع در جریان عادی زیر نمودار نمایش داده می‌شود. محفظهٔ بیرونی ارتفاع ثابت ندارد تا جزئیات روی نمودار یا کارت بعدی نیفتند. برای دسترس‌پذیری هیچ focus دستوری، preventDefault روی Tab یا tabIndex مثبت اضافه نشده است.

blur داخلی در هر دو جهت SVG به منبع و منبع به همان نمودار حفظ می‌شود؛ خروج از frame همچنان به کتابخانه می‌رسد. رفتار click/keyboard lane، لینک امن، نگاشت، مقدار، format، raw/UTC precision، backend و nonPreview تغییر نکرده‌اند. تنها سه فایل تغییر دارند: MonthlySalesCharts، MonthlySourceChartFrame و آزمون موجود.

۲۹ آزمون پاس؛ صفر fail/skip؛ TypeScript و lint محدود صفر؛ اجرای نهایی guard شبکه/child صفر. آزمون جدید ترتیب slot/portal و تحویل host بعد از mount را بررسی می‌کند؛ آزمون موجود برگشت Shift+Tab را در سطح event handler نیز پوشش می‌دهد. این آزمون‌ها پذیرش Tab طبیعی مرورگر نیستند. اجرای اول یک خطای harness داشت: در React نصب‌شده ref روی ReactElement است، نه props؛ خواندن ref در آزمون اصلاح شد، assert یا معیار محصول حذف نشد. log اولیه نگهداری شده است.

## پذیرش مرورگری موردنیاز root

- در هر دو نمودار: focus روی SVG، Arrow تا نقطهٔ مشخص، Tab طبیعی باید به اولین پیوند همان نقطه برسد؛ Enter باید درخواست اولیهٔ href دقیق کدال را آغاز کند. در صورت دو سری، Tab بعدی پیوند سری دیگر را بگیرد.
- Shift+Tab از اولین پیوند به SVG، سپس Arrow باید نقطه و منبع را تغییر دهد؛ Tab نباید از یک نمودار به منبع نمودار دیگر برود. خروج از frame نباید focus trap ایجاد کند. Escape باید جزئیات را ببندد.
- در موبایل 375 و دسکتاپ، click/tap و زیرنمودار بودن منبع، نبود هم‌پوشانی کارت بعدی، شکست واقعی raw/UTC با precision کامل، containment متن و scroll طبیعی بررسی شود. تمام rect خود tooltip و تمام Range متن در موبایل باید داخل 0..375 باشند؛ pageWidth به‌تنهایی معیار نیست. ورودی موس در viewport موبایل با لمس واقعی/شبیه‌سازی‌شده تفکیک شود.
- URL اولیه و redirect کدال جدا ثبت شوند. تست با focus مستقیم لینک، force، first یا حذف assertion جایگزین نشود. مقدار/واحد/رکورد تاریخی و تازه، انتخاب سال و مسیر nonPreview بازبینی شوند.

کارگر هیچ browser/GET/provider/SQL/deploy اجرا نکرده است. کنترل کامل CI/Preview/QA با هماهنگ‌کننده؛ خطای upstream 402 موضوع جدا باقی می‌ماند.
