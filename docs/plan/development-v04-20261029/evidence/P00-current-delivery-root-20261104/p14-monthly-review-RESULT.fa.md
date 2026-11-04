# بازبینی آفلاین منبع ماهانه پس از reload — بدون patch محصول

مبنا: `2aa0cc46e0adb5c73e24bb752706e3168c94fc94`. وضعیت root همچنان **UNCONFIRMED** است. این بررسی علت قطعی مرورگر را اثبات نمی‌کند و پذیرش ماهانه، hydration یا لمس واقعی نیست.

## شواهد موجود

تصویر `outputs/p14-quarterly-source-ui-root-20261104/monthly-regression-observed.png` یک ستون در شهریور ۱۴۰۵ نشان می‌دهد. receipt ریشه برای سه تلاش ماهانه متن خالی و پیوند صفر دارد؛ activeElement ثبت نشده است. root بعداً از متغیرهای همان اجرای بسته‌شده، بدون GET تازه، این جزئیات را فرستاد:

- rect نمودار: x=37، y=265.640625، width=301، height=280.
- tap: x=157.4 (۴۰٪ عرض نمودار)، y=355.640625؛ سپس دو rAF.
- focus روی همان plot، دو ArrowLeft؛ بعدتر focus مجدد روی همان plot و پنج ArrowLeft دیگر؛ هر کلید با دو rAF.

مقایسهٔ مستقیم 4e و2aa نشان داد کد MonthlySalesCharts، MonthlyPointSourceLabel، monthly-point-provenance، MeasuredResponsiveContainer و هستهٔ monthlyReport تغییر نکرده‌اند. frame مشترک فقط marker عمومی و height/width اختیاری گرفته؛ پیش‌فرض ماهانه همان280 است و منطق event/portal/blur عوض نشده است. این عدم تغییر، به‌تنهایی پذیرش رفتار مرورگر نیست.

## بازسازی محدود با کتابخانهٔ واقعی

`probe.cjs` هستهٔ واقعی monthlyReport را از snapshot2aa بار می‌کند و یک گزارش **مصنوعی** شهریور می‌سازد. مبلغ مصنوعی برای ساختن ستون است، نه شاهد مقدار یا clock زنده. store، middleware رویدادها و selectorهای نصب‌شدهٔ Recharts3.9.1 واقعی‌اند؛ DOM یا مرورگر شبیه‌سازی نشده است.

هندسه طبق کد و شاهد root تنظیم شد: 301×280، محور ماه معکوس، محور Y سمت راست با عرض58، marginهای top/right/left=8 و bottom=0. ورودی از تابع واقعی مختصات نسبی می‌گذرد، شامل گردکردن پیکسل.

| تلاش | نتیجهٔ آفلاین با همین مفروضات |
|---|---|
| tap ثبت‌شده با x=157.4 | index6، مهر؛ payload مقدار null و صفر مورد قابل نمایش |
| focus تازه + دو ArrowLeft | index2، خرداد؛ null |
| focus مجدد + پنج ArrowLeft دیگر | index7، آبان؛ null؛ focus شاخص قبلی را صفر نمی‌کند |
| کنترل مستقل: focus تازه + پنج ArrowLeft | index5، شهریور؛ یک payload دارای مقدار |
| کنترل مستقل: مرکز tick شهریور | relative x=130.95833333333334، absolute x≈167.9583؛ شهریور و یک payload |

هر پنج assertion پاس شد؛ guard اجرای probe: network=0 و childProcess=0. نتیجه در `probe.json` و خروجی در `probe-first.log` است. ابعاد محور واقعی، readiness، focus واقعی، synthetic click حاصل از touch و دادهٔ دقیق صفحه از این probe اثبات نمی‌شوند.

## نتیجه و گام پذیرش

سه نتیجهٔ خالی root با انتخاب ماه‌های خالی کاملاً سازگارند. شواهد فعلی نقص source یا نیاز به patch را ثابت نمی‌کنند؛ بنابراین هیچ فایل محصول تغییر داده نشد و candidate.patch ساخته نشده است. UNCONFIRMED به PASS تبدیل نشده است.

در QA بعدی root، پس از تثبیت view/year و hydration، مرکز خود ستونِ دارای مقدار از DOM همان لحظه خوانده شود؛ tooltip باید نام همان ماه را نشان دهد. مسیر keyboard باید با ثبت activeElement و index/label آغاز شود؛ focus مجدد به معنی reset انتخاب نیست. تعداد Arrowها از انتخاب نامعلوم ادامه داده نشود. گپ‌ها همچنان بدون مقدار و منبع جعلی بمانند. مسیر بومی Tab/Enter و درخواست اولیهٔ href دقیق سپس redirect کدال جدا بررسی شود؛ بدون force/first.

عدد x≈167.9583 صرفاً کنترل آفلاین این هندسه است؛ مختصات hardcode برای اجرای بعدی نیست. هیچ providerGET، browser، SQL، branch، push، env، نصب یا deploy اجرا نشد. checkout5fe فریز و تمیز باقی ماند؛ بسته‌های قبلی ثابت‌اند.
