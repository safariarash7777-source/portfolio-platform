# تحویل موج ساخت NEXT-04/05/07/08

۳۰ سپتامبر تا آغاز۱اکتبر۲۰۲۶ تهران. ساخت، آزمون و جمع‌کردن checkoutهای ایزوله به درخواست مستقیم آرش انجام شد. ادغام در main، نصب روی محیط واقعی، فعال‌سازی policy تجاری، پرداخت و پیام به عضو واقعی انجام نشده است.

## خروجی و نسخه

main و PR168 پیش از شروع و پیش از تحویل دوباره تطبیق شدند: `51fd0661d48d791ce8758a87828a81ce72cac6df` و `3462f0178ebed6b7a9966b465ba0756119ce267a`. PR173=`7f915e3578cac4582dab95c61cfae57e1c6d0568` اکنون phase38 دارد؛ برخورد شماره37 در یادداشت قدیمی سابقه است. مدل مالی173 در این موج تغییر نکرده و سازگاری/نصب آن گیت جداست.

baseline=`f6cb560478d51d48dcee2c9b2801eb047f5c7214`، شاخه `codex/wave-02-base-20260930`: ترکیب main و168 برای بازبینی، با حفظ تنظیمات Liara و حل تعارض محدود COMMAND-CENTER/next.config.js/package.json. این کار پذیرش/ادغام168 در main نیست. هر چهار PR OPEN/DRAFT و به همین baseline هستند؛ به این گفتگو attach شدند.

| بسته | PR | SHA کد اولیه / head مشاهده‌شده | تحویل |
|---|---|---|---|
| 04 | [175](https://github.com/safariarash7777-source/portfolio-platform/pull/175) | `0dcfd1d` / `bb7c2f9f89ea48929b6fd13a9dc9b16d58efa8a6` | [گزارش/API](NEXT-04-RESULT.md)، [CSV](next-04-fixtures.csv)، [DTO نمونه06](next-04-ui-fixtures.json) |
| 05 | [177](https://github.com/safariarash7777-source/portfolio-platform/pull/177) | `dca2868` / `27e59ad8d85f37da32b6f5346d289afdb73b20e6` | [گزارش](NEXT-05-RESULT.md)، [قرارداد پوسته](NEXT-05-COMPONENT-CONTRACT.md)، تصاویر قبل/بعد |
| 07 | [174](https://github.com/safariarash7777-source/portfolio-platform/pull/174) | `a29d47c` / `95cfa3410a97ac0d98cdefcb6671d4cfcb668646` | [گزارش](NEXT-07-RESULT.md)، [ماتریس۱۲×۲۶](next-07-evidence/data-to-dashboard-matrix.csv)، budget delta و تصاویر |
| 08 | [176](https://github.com/safariarash7777-source/portfolio-platform/pull/176) | `0927155` / `d69763563ef695b2d16ea2e52be4a4452b0811dc` | [گزارش/publication09](NEXT-08-RESULT.md)، SQL/HTTP و مسیر تصویری انتشار |

شاخهٔ بازبینی ترکیبی `codex/wave-02-review-20260930` در `portfolio-wave-02-review`، product code همراه اصلاح ابزار آزمون روی `a762d85` است. چهار package cherry-pick و scriptهای package.json به صورت union حفظ شدند؛ هیچ شاخهٔ اصلی جابه‌جا نشد. نسخهٔ محلی قابل بازبینی: [خانه](http://127.0.0.1:8770)، [دوره](http://127.0.0.1:8770/webinars)، [عملیات04 با fixture](http://127.0.0.1:8770/qa/next04)، [دفتر08 با fixture](http://127.0.0.1:8770/qa/next08). صفحات QA صرفاً development و flag صریح، بدون دورزدن gate admin؛ در Production notFound هستند. این Preview داده و هویت Production ندارد.

## نتیجهٔ قابل استفاده

04 از entitlements/phase27/webinars و Auth موجود استفاده می‌کند: CSV preview→commit→confirmed identity claim→نیازسنجی→مجوز محدود cohort/module. retry و replay grant را تمدید نمی‌کند. هویت نامرتبط، grant مستقیم authenticated admin، private file و دورهٔ لغوشده در DB/API کنترل شده‌اند. policy نهایی سه‌ماه انتخاب نشده؛ دو حالت explicit آزمایشی، window شروع inclusive/پایان exclusive و timezone تهران موجودند. commercialEnabled=false الزام schema است.

05 پوسته، خانه، کاتالوگ دوره و درخواست وقت را با متن خدمت و اطلاعات واقعاً منتشرشده بازسازی کرده است. درخواست ایمیل، رزرو تأییدشده نیست؛ خطا ورودی را حفظ می‌کند. شمار و زمان بستهٔ بازار تنها از مسیر موجود گرفته می‌شوند؛ دادهٔ نامعلوم به صفر/تعطیلی/زنده تبدیل نمی‌شود. URLهای موجود و login next حفظ شده‌اند؛ فونت محلی OFL و توکن‌های مشترک برای06/07/08 مستندند.

07 خطاهای ×۱۰ مبلغ، fallback زمان امروز، null و bubble مبتنی بر NAV بی‌اعتبار را اصلاح کرده و همان موتورهای موجود را مصرف می‌کند. module wrapper فقط canonical RPC04 را می‌خواند؛ legacy full با cohort خلط نمی‌شود. delta فراخوان upstream صفر؛ نمودار یا بک‌فیل تازه برای خانوادهٔ بی‌مصرف ایجاد نشده است.

08 از پژوهش/تصمیم phase34 استفاده می‌کند: متن مخاطب با منبع/زمان، نوع، نسخه، مخاطب و کانال صریح؛ save→ready داخلی→publish→withdraw و اصلاحیه. نیاز آموزشی aggregate و lead canonical به کار روزانه وصل‌اند. draft/یادداشت خصوصی برای مشتری و sender service قابل خواندن نیست. Telegram فقط انتخاب کانال در رکورد است؛ ارسال09 ساخته نشده است.

## شواهد و رفع نقص در تجمیع

| بررسی | نتیجه و حد |
|---|---|
| 04 SQL/HTTP + unit/regression | ۳۴/۳۴، دو privilege profile مصنوعی، صفر skip؛ Auth تزریق‌شده در handler، نه login واقعی GoTrue/Storage HTTP |
| 05 public/HTTP | ۵۷/۵۷ و۳/۳، actual Next route با REST loopback مصنوعی؛ ورودی خطا باقی و receipt از booking جدا |
| 07 core/calc/relay | بستهٔ مستقل۱۲۲۴core/۱۰۶calc، relay offline؛ live Codal در suite عمداًSKIP، نه دریافت زندهٔ اثبات‌شده |
| 08 SQL/HTTP و بازاستفاده | ۲۶/۲۶ و۳۳/۳۳، روی SHA نهایی migration04؛ core پس از ثبت scripts۱۲۱۶/۱۲۱۶ |
| ترکیب چهار بسته | **۱۲۲۸core،۵۷public،۹contract، صفر fail/skip**؛ typecheck/lint صفر warning؛ build Next15.5.25،۴۱صفحه static؛ یک warning cache webpack خطای build نیست |
| SQL ترکیبی |۴۸فایل،۱۰۳۵statement، صفر مردود؛ triggerهای PL/pgSQL از parser skip هستند و اجرای واقعی SQL شاهد مکمل است |
| مرورگر | Chrome واقعی390/1440، [گزارش](wave-02-evidence/BROWSER-SMOKE.md)، API published/empty/failure بدون interception، تاریخ تهران و disabled CTA؛ فونت، focus و overflow04/08 روی پوسته مشترک |
| CI GitHub | در چهار head جدول بالا CI Gate، Dependencies، Typecheck/Lint/Tests/Build و Secret/SQL و DB RLS **success مستقلاً خوانده شد**؛ isolated-db04 همsuccess. Supabase Preview در هرچهارskipped. موفقیت Vercel Preview Comments پذیرش UI/auth واقعی نیست |

در اولین اجرای core ترکیبی دو ایراد ابزار آزمون ظاهر شدند: harness middleware باید helper جدید entitlement را از مسیر صحیح بار می‌کرد؛ فایل‌های آزمون publication باید در scriptها ثبت می‌شدند. هر دو با حفظ آزمون رفتاری اصلاح و core دوباره کامل پاس شد؛ گاردها خاموش نشدند. workflow sandbox04 در شاخهٔ ترکیبی، DB publication را هم در صورت حضور بسته08 اجرا می‌کند. این گیت در PR04 مستقل،08 را حاضر فرض نمی‌کند.

در بازبینی تصویری، مبلغ صندوق و کارت نماد ×۱۰ اصلاح شد؛ fixture کندل با ترتیب REST درست شد. جدول عملیات04 min-width680 و scroll داخلی گرفت و دکمه‌ها44px شدند. خام‌خوانی فایل خصوصی حتی در حضور policy SELECT عمومی باز در synthetic DB ممنوع ماند. source time/NAV در Production با این شواهد synthetic خودکار پذیرفته نمی‌شود.

بازبینی خودکار اجرای local production start05 را فقط با پیام blocked by policy رد کرد؛ راه امن dev Preview استفاده شد و همان اقدام از ابزار دیگری تکرار نشد. build موفق است؛ production runtime جدیدی برای05 ادعا نمی‌شود.

## نصب و تصمیم‌های باز

Migration04=`20260930182629_seasonal_course_membership.sql`، SHA256=`509A6A8C17D47E26BD4ADFBE438E02F80B6DA225DA778B0F124825BFE4F9E71B`؛ migration08=`20260930182918_research_publication_queue.sql`، SHA256=`C72828B50E66843D594C6BE710F6BA813FB7FF8E7591581F6F4E2C1ECC1F5229`. LF در gitattributes تثبیت شده تا hash checkout ویندوز و CI برابر باشد. [شاهد hash](wave-02-evidence/migration-hashes.json). نصب محصول: پیش‌نیازهای موجود phase8/11/27 و phase34 برای08، سپس04→08؛ ترتیب مستقل32→34→35→36→37→38 ترازنامه طبقledger خودش تطبیق شود. این فایل‌ها در محیط واقعی اعمال نشده‌اند. rollback04 حذف ledger/پرونده/Storage یا بازکردن public URL نیست.

- D-034 OPEN: شروع، تقویم، آرشیو و استثناها پیشنهاد باقی‌اند؛ configure صریح sandbox جای تصمیم مالک را نگرفته است.
- D-035 OPEN: CSV مستقل تحویل شد؛ API/webhook اختصاصی شریک فقط با سند رسمی.
- D-036 IN_REVIEW: publication/event09 آماده، opt-in/outbox/تحویل Telegram و سیاست اعلان هنوز09 و تصمیم مالک را لازم دارد.
- D-024 OPEN/HOLD_BY_OWNER: Production payments و entitlement پرداخت فعال نشده‌اند.
- پذیرش login/storage واقعی Liara، SMTP/signup، نصب clone مجاز و گیت‌هایDEV07/173 و تأیید انسانی پژوهش باقی‌اند. این موج آن‌ها را خودکار نمی‌بندد.

ورودی06 اکنون آماده است: seasonal.v0.1، grant projection و resource list API، fixture برچسب‌دار و قرارداد پوسته. ورودی09: membership audit envelope04 و publication resolver/event08؛ sender باید قبل ارسال، نسخه و مخاطب/مجوز/opt-in را دوباره بررسی کند. شروع خودکار06/09/10 یا مجوز انتشار از تحویل حاضر نتیجه نمی‌شود.
