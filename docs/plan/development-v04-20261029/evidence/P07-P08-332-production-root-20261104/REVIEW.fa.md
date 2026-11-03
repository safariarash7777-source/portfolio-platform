# تحویل واقعی شرکت و مقایسه صندوق — ۴ نوامبر تهران

این برش از همان P07/P08/P14 نسخه۰٫۴ پس از PR332 روی Production منتشر شد؛ پایان کل بسته‌ها یا انتخاب نهایی ظاهر نیست.

- [فولاد، تب بنیادی](https://portfolio-platform-fawn.vercel.app/symbol/فولاد#fundamental)
- [فملی، تب بنیادی](https://portfolio-platform-fawn.vercel.app/symbol/فملی#fundamental)
- [گزارش‌ها و منشأ](https://portfolio-platform-fawn.vercel.app/symbol/فولاد#reports)
- [انتخاب و مقایسه صندوق](https://portfolio-platform-fawn.vercel.app/market/funds)

نسخهٔ آزموده‌شده `a86ca24598da0aebab0a1d19df83840cb3b99425`، deployment `dpl_EK9Lp28bbpAGfPy7yVNoA7i8DSce`، درخت `8f44af97c781a22c20c2c4a30c67555355aa62a4` است. source بازبینی‌شده19ccd و checkout واقعی CI همان درخت را داشتند؛ انتشار و alias اصلی جدا بازخوانی شدند. پس از آن [Production ابزار فقط‌خواندنی PR393](observer-production-readback.json) با نسخه78c3054 و deployment `dpl_EQmjDFccs6WKo7kHzY3zJFEaUpDX`، READY و روی alias اصلی بازخوانی شد؛ app/components/lib/relay/workflow/next.config نسبت به19ccd اختلاف ندارند. این پیوستگی کد با پذیرش مرورگری جدا یکی نیست. [نشانی تغییرناپذیر نسخهٔ واقعاً آزموده‌شده](https://portfolio-platform-qzpmj4fg2-safariarash7777-4463s-projects.vercel.app) نیز در دسترس است.

## مسیر بررسی و نتیجه

در Chrome واقعی و context ایزوله، تب بنیادی هر دو شرکت با دادهٔ موجود باز شد؛ reload پس از hydration همان تب را نگه داشت و عرض390 overflow نداشت. عنوان‌های مشاهده‌شده عیناً در [رسید](production-smoke.json) هستند؛ تعداد نمودار Preview برای Production حدس یا تکرار نشده است. [شاهد تصویری Preview هم‌خانواده](../P07-388-7216-root-browser-20261104/REVIEW.fa.md) جدا نسخه7216 و محدودیت خود را دارد.

در صفحه صندوق، پنج انتخاب هم‌نوع از URL بازگشتند. سپس تایپ جست‌وجو و انتخاب در58.2میلی‌ثانیه، پیش از debounce250، هر دو مقدار را حفظ کردند؛ reload، رفتن واقعی به نماد و بازگشت به صندوق‌ها، انتخاب/جست‌وجو/مرتب‌سازی را نگه داشتند. پاک‌کردن انتخاب فیلترهای دیگر را پاک نکرد. [رسید تعامل](production-race-return.json)؛ خطای صفحه و POST صفر بودند. این ثبتِ مالی عضو یا پذیرش مسیر AccountBridge نیست.

## تعهد بسته و باز

بسته‌شدهٔ محدود: انتشار نمودارها و منشأ موجود بدون حذف قابلیت‌ها؛ ماندگاری انتخاب غیرخالی صندوق پس از reload و رفت‌وبرگشت؛ رفع lost-update جست‌وجوی تأخیردار. آزمون ساخت default backend نیز RED→GREEN داشت و وارد CI شد.

باز: ورود دو گزارش جدید شرکت، مقدار/نرخ فاقد واحد یا receipt معتبر، برابری کامل دو نمونهP14 و انتخاب انسانی، سود تقسیمی/دوره همسان/هزینه و ریسک کل صندوق، ورود حساب در مسیر بازگشت، نصب و حق خدمت مشاوره. نبود داده صفر نمی‌شود؛ data آموزشی وارد محصول نشده است. متادیتای ناقص env شاهد نبود override در Production نیست.

مالک اقدام بعدی: A صفحه و اصلاح محدود producer؛ C قرارداد/منشأ داده با حفظ مالکیت قبلی؛ B جریان عضو/مدیر؛ root یکپارچه‌سازی، تشخیص فقط‌خواندنی و پذیرش مقصد. [همان COMMAND-CENTER](../../../../COMMAND-CENTER.md) مرجع وضعیت کل۸۵تعهد است.
