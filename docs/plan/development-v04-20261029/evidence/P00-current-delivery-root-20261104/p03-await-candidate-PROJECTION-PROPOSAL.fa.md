# پیشنهاد جداگانهٔ projection — NOT_APPLIED

این فایل source/controller/capsule را تغییر نمی‌دهد. run.py و workflow در اختیار root هستند؛ پذیرش قدیمی، 403، NO_REPLAY و معنای status/null دست‌نخورده می‌مانند.

## گپ‌های منبع در d6/54

- case:105 پس از آخرین stage عمومی fixture-binding/after، reload و settle را اجرا می‌کند؛ case:134 وارد `compositionSummaryPhase` می‌شود. نبود stage بعدی، توقف در همان خط۱۰۵ را ثابت نمی‌کند.
- case:13، PASSهای مرورگر را با `P03_TICKET_BROWSER_CHECK` ثبت می‌کند؛ controller:1102 فقط prefixهای assembly را می‌خواند. آخرین PASS عمومی، پنجرهٔ خطا را به ابتدای این بخش محدود نمی‌کند.
- runtime:108 برای wait، پسوند ثابت `_not_ready` یا `_read_failed` می‌سازد. controller:1027–1044 چند مرحلهٔ قدیمی را می‌پذیرد، اما مرحله‌های p09 زیر را با پسوند نمی‌پذیرد.
- phase:55 کدهای `p03_composition_http_200/201` و phase:63/65/70/72/78/79 کدهای ثابتِ جدول زیر را می‌سازد؛ این‌ها در enum فعلی d6 نیستند. متن exception یا validator فارسی نباید به جای کد ثابت وارد خروجی عمومی شود.
- status مربوط به default prepare در controller:1183–1184 فقط برای همان stage/before قدیمی مجاز است. null آن در fixture-binding/after، نتیجهٔ HTTP یا شکست default prepare نیست.

## delta پیشنهادیِ محدود و قابل رد

افزودن فقط literalهای زیر به enum ثابت؛ نه regex، startsWith عمومی یا عبور متن دلخواه:

```text
p03_composition_http_200
p03_composition_http_201
p03_composition_summary_missing
p03_composition_published_basis
p03_composition_ticket_link_version
p03_composition_foreign_rpc_denial
p03_composition_feedback_rows
p03_composition_feedback_financial_change
p09_browser_fixture_capability_not_read_not_ready
p09_browser_fixture_capability_not_read_read_failed
p09_browser_uncertain_ui_not_seen_not_ready
p09_browser_uncertain_ui_not_seen_read_failed
p09_browser_advisor_not_ready_not_ready
p09_browser_advisor_not_ready_read_failed
p09_browser_advisor_reply_not_read_not_ready
p09_browser_advisor_reply_not_read_read_failed
```

برای تفکیک HTTPهای هم‌کد، یک enum مرحلهٔ صریح در همان phase کافی است: `summary-save`, `summary-submit`, `summary-approve`, `summary-publish`, `summary-link-prepare`, `summary-link-command`, `summary-foreign-rpc`. نام متغیر یا پیام خارجی، نام مرحله نشود؛ سه حالت حلقه فقط با mapping ثابت submit/approve/publish نگاشت شوند. پیش/پسِ اعتبارسنجی prepare از دریافت HTTP جدا بماند تا HTTP201 با پذیرش checksum اشتباه نشود.

اگر status projection لازم شد، ورودی آن فقط رکورد ساختاریِ همان intent/result موجود باشد، نه native.log، body یا exception. تطبیق باید شامل binding و source موجود، نقش actor مجاز، مسیر دقیق، شمارهٔ واقعی journal و تطبیق ordinal داخل result و نام فایل باشد. شماره از counts/آخرین stage حدس زده نشود؛ فقط تطبیق یکتای موجود و معتبر پذیرفته شود. بدون تطبیق یکتا، مقدار null/UNOBSERVED بماند.

شکل عمومی محدود پیشنهادی: `{phase, path, ordinal, status}`؛ تنها phaseهای صریح بالا، path دقیق `/api/consultation`، `/api/consultation/ticket-attempts`، `/api/consultation/tickets` یا `/rest/v1/rpc/lookup_consultation_ticket_attempt` متناسب با phase، ordinal صحیح 1..999 مطابق فایل سه‌رقمی واقعی و status صحیح 100..599. هیچ body، token، شناسهٔ عضو، request UUID، fingerprint یا متن خطا منتقل نشود. status مشاهده‌شده حتی 404 فقط گزارش است؛ انتظار 403/201 موجود عوض نشود و null به موفقیت یا شکست تبدیل نشود.

گیت آفلاینِ لازم برای این پیشنهاد: پذیرش تک‌تک literalها؛ رد نام ناشناخته/پسوند اضافه/payload اضافی؛ عدم خروج متن خصوصی؛ رد مسیر/ordinal/status/binding ناسازگار و حفظ null؛ مقایسهٔ byte-exact عملیات و پذیرش قدیمی. اجرای این پیشنهاد و تست‌هایش جزو نامزد await حاضر نیست.
