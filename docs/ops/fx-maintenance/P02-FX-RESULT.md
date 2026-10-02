# P02-FX — نتیجه زیرکار مستقل برنامه v0.1

۲ اکتبر ۲۰۲۶؛ مالک FX/Hermes، همکاری با P02 بازار/لیارا. مبنا PR183@8723c557، شاخه `codex/p02-fx-contracts-20261002`. برنامه اصلی چهار فایل00/01/03/04 خوانده و checksum آنها در evidence ثبت شد؛ فایل‌های برنامه/central README/دفتر تصمیم مرکزی تغییر نکردند.

## اکنون چه کار می‌کند؟

اپراتور می‌تواند بدون شبکه، شش Excel عمومی آرشیوی را با validator موجود183 و گیت مکمل بررسی کند. خروجی فقط metadata منبع/دوره/انتشار/نگاشت است، نه ارقام raw یا ادعای model-ready. آرش برای هر D-FX دو گزینه، شاهد لازم، اثر، مسئول و اقدام بعدی مشخص دارد. هیچ گزینه به approved تبدیل نشده است.

## بازاستفاده و تغییر

- PR183 بازاستفاده شد؛ source IDs، mapping و period/unit/checksum همان validate_cbi_mapping موجود؛ داشبورد یا Hermes از نو ساخته نشد.
- دو فایل مستقل اضافه شد: `work/p02_fx_checks.py` و `tests/test_p02_fx_checks.py` در scripts/fx-maintenance. helperها فقط آفلاین‌اند و در hook/job/ingest/مدل فعال wire نشده‌اند. database/schema/API/store جدید صفر.
- اسناد P02-FX شامل نگاشت source→unit/base/period/time→model، جدول تصمیم، handoff سهمیه/producer، evidence و تست هستند.
- PR191/195 metadata و diff195 بررسی شد؛ parser null/unit N10 تکرار/اعمال نشد. به گفته مالک P02، base P00=195@31c44ab؛ integration منتخب با P00، وابستگی FX183 جدا و ثابت است.

## شاهد اجرای واقعی

۱۴ سناریوی مصنوعی PASS: Q3≠Q4، تبدیل واحد برگشت‌پذیر، gap و null رشد، CPI با ماه ناقص، ماه متفاوت YTM/تورم، اعشاری≠درصد، trade آینده/کهنه/سررسیده، timestamp بی‌timezone، تولید سند≠انتشار، write غیرمصوب، سال ناقص، unit/base/hash متعارض و publication آینده. شبکه test process با guard موجود183 به loopback محدود بود.

validator موجود هر شش Excel آرشیوی را checksum/schema/تعریف/واحد/دوره کنترل کرد. مکمل، میانگین سال CPI با۱۲ماه کامل برای پنج سال و قرارداد رشد متوالی GDP را آزمود؛ Q4 غایب نقدینگی null ماند. ارقام داخل اسکریپت بودند و چاپ یا وارد prompt/گزارش نشدند. این metadata PASS، تطبیق رشد با سری انتشار رسمی یا منشأ/درستی ردیف مدل قدیمی را تأیید نمی‌کند.

هر شش publication_date نامعلوم؛ همه bindingها disabled؛ live fetch، model write، انتشار و تصمیم مصوب صفر. جدول coverage دوره آخر **آرشیو موجود** را نشان می‌دهد، نه آخرین انتشار امروز. checked_at ورودی CLI در evidence زمان ارزیابی سناریو است؛ زمان تولید evidence جدا ثبت می‌شود. هیچ source جدید جست‌وجو یا درخواست provider نشد.

## نصب/انتشار/rollback

فقط ساخته و آفلاین آزموده شد؛ نصب schema، wire کردن guard به Hermes، Production و wrapper صفر. cadence محلی پنج‌روزه همان قبلی است. rollback این زیرکار حذف commit/فایل‌های افزودنی در branch خودش است؛ داده/مدل/DB rollback ندارند چون تغییر نکردند. source/runtime manifest183 دست‌نخورده است.

## گیت و اقدام بعدی

| گیت | مسئول | اقدام بعدی |
|---|---|---|
| P00 نسخه/مالکیت مشترک | یکپارچه‌سازی | مصرف183 و این delta روی integration195 منتخب بدون ساخت دوباره؛ release/schema manifest |
| D-FX-01…06 | آرش + هماهنگ‌کننده | انتخاب گزینه و ثبت تعریف/شاهد در DECISION-LOG موجود؛ سپس candidate مجاز |
| انتشار رسمی شش سری | FX با منبع مصوب | سند release/revision؛ generated/download time جای آن ننشیند؛ دریافت زنده فقط بعد گیت |
| prior usage/reset/install178 | مالک لیارا/P02 | metadata تازه مصرف پیشین و مرز روز، نصب مشترک و دو چرخه مجاز؛ UNKNOWN با صفر جایگزین نشود |
| admin/fx | مالک P01/فرانت | ورود واقعی مجاز، همه۱۲تب/guest/member/mobile/fullscreen/refresh/download؛ شاهد مستقل183 کافی نیست |

هیچ gate policy ردشده با ابزار/چت دیگر دور زده نشد. این نتیجه سازنده است؛ بازبینی مستقل/پذیرش انسانی/انتشار مشتری هنوز انجام نشده‌اند. تحویل PR/SHA و scopes در receipt بیرون commit self-reference ثبت می‌شود؛ قابلیت یا عملیات زنده بعدی به همین گیت‌ها وابسته است.
