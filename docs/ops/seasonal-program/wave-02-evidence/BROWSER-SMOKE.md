# بازبینی مرورگر نسخهٔ ترکیبی موج02

2026-10-01 تهران /2026-09-30 UTC. checkout `portfolio-wave-02-review`، HEAD مشاهده‌شده در این اجرا `220924dfc4b4141222a190f7413cf66126e117d2`. UI روی `http://127.0.0.1:8770`، REST مصنوعی روی8771. Chrome واقعی headless با agent-browser و session ایزوله next05؛ CUA browser قابل استفاده نداشت. هیچ interception در مرورگر برای این بازبینی فعال نبود.

## اتصال04→05 از مسیر واقعی HTTP

GET/api/courses واقعاً اجرا شد؛ fixture فقط لایهٔ REST را جایگزین می‌کند و DB واقعی نیست. پاسخ published200، contractVersion seasonal.v0.1، یک course برچسب‌دار و یک cohortA با startsAt2026-10-01T05:30Z و endsAtExclusive2027-01-01T05:30Z، timezone تهران و registrationAction.enabled=false بود. ردیف draft در پاسخ دیده نشد؛ این شاهد با fixture اعلام‌شدهٔ حاوی draft سازگار است، ممیزی مستقیم DB نیست. [پاسخ](courses-published-api.json).

UI390×844 و1440×1000 همان نوبت مصنوعی را رندر کرد: «۹ مهر۱۴۰۵ ساعت۰۹:۰۰» و «۱۱ دی۱۴۰۵ ساعت۰۹:۰۰»، توضیح پایان دسترسی و ثبت‌نام غیرفعال با دلیل. هزینه/موضوع/ضبط فرض نشده است. [تصویر390](courses-published390.png)، [تصویر1440](courses-published1440.png)، [متن DOM و disabled واقعی](courses-published-dom.json)، [هندسه390](courses-published390-geometry.json). در هر دو عرض document scrollWidth=clientWidth؛ cohortCount=1.

پس از تغییر کنترل fixture بهempty، actual API پاسخ معتبر courses:[] داد و UI «نوبت بعدی هنوز منتشر نشده است» نشان داد؛ [API](courses-empty-api.json)، [390](courses-empty390.png)، [1440](courses-empty1440.png).

پس از تغییر بهfailure، actual API HTTP503 با availability:unavailable و پیام عمومی گرفت؛ UI «اطلاعات دوره دریافت نشد» و دکمهٔ دریافت دوباره داشت، به حالت خالی تبدیل نشد؛ [API](courses-failure-api.json)، [390](courses-failure390.png)، [1440](courses-failure1440.png). پس از آزمون حالت fixture بهpublished برگردانده شد و صفحه دوباره cohortA را دریافت کرد. [health پس از پایان](fixture-health-after.json):fixture=true، mode=published، remoteCalls=0. هیچ داده یا سکرت خصوصی ذخیره نشده است.

## پوسته و فونت مشترک روی میزها

`/qa/next04` و `/qa/next08` هر دو component واقعی را با transport/fixture مستقل ازDB اجرا می‌کنند؛ main آزمایشی است و Auth/پوستهٔ کامل admin واقعی از آن نتیجه نمی‌شود.

| مسیر |390 |1440 | مشاهده |
|---|---|---|---|
| عملیات04 | [تصویر](admin04-shell390.png) / [هندسه](admin04-shell390.json) | [تصویر](admin04-shell1440.png) / [هندسه](admin04-shell1440.json) | فونت Vazirmatn محلی loaded؛ btn44px؛ table680px داخل container308px با scroll داخلی؛ خارج صفحهoverflow ندارد |
| دفتر08 | [تصویر](admin08-shell390.png) / [هندسه](admin08-shell390.json) | [تصویر](admin08-shell1440.png) / [هندسه](admin08-shell1440.json) | فونت Vazirmatn محلی loaded؛ btn44px؛ متن RTL و header/فرم خوانا؛ خارج صفحهoverflow ندارد |

تم روشن مشترک body background rgb(248,247,244)، foreground rgb(15,23,42) در هر دو میز اندازه‌گیری شد. Tab واقعی04 از عنوان به شروع datetime با outline2px، و Tab08 ازmodepicker به «میزروزانه» با outline2px ثبت شد؛ [شاهد08](admin08-keyboard390.json) و [تصویر](admin08-keyboard390.png). کنتراست کامل تمام اجزای خصوصی در این smoke ممیزی نشده است؛ نتیجهٔ tokenpairهای05 و آزمون‌های کیفیت مستقل مرجع‌اند.

## حدود نتیجه

این اجرا وابستگی UI05 به API04 را در نسخهٔ ترکیبی رفع و سه حالت published/empty/failure را تأیید کرد. build یا productionstart جدید اجرا نشد. دادهٔ بازار زنده، Auth واقعی، هویت واقعی، entitlement واقعی، پرداخت، partner و Telegram آزموده نشده‌اند. شواهد عملیات grant/review/revoke04 و publication08 در بازبینی مستقل قبلی محفوظ‌اند؛ در این smoke دوباره عملیات نوشتنی انجام نشد.
