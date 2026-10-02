# قرارداد projection سنجش — measurement.v0.1

وضعیت: PROPOSED_FOR_P00؛ schema [event.schema.json](event.schema.json). این قرارداد رخدادهای سرویس را مصرف می‌کند؛ event bus، ledger یا مجوز موازی ایجاد نمی‌کند. کلید توقف collector نباید محتوا، Auth یا محاسبه قطعی را متوقف کند.

## داده مجاز

هر ردیف: contractVersion، eventId، type، occurredAt و recordedAt با timezone، environment، releaseSha، sourceContract، sourceRef، subjectKey/cohortKey/versionKey، dimensions. sourceRef شناسه یکتای opaque projection است؛ مقدار خام receipt/URL/شناسه تلگرام نیست. subjectKey و بقیه کلیدها pseudonymous هستند، داده شخصی همچنان محسوب می‌شوند. UUID/phone/email را به‌صورت hash ساده صادر نکن؛ mapping یا HMAC اختصاصی محیط و دوره با کلید سمت سرور و دسترسی محدود توسطP00 تعیین شود. کلید، lookup و salt هرگز در گزارش/کلاینت قرار نگیرد. member/cohort canonical فقط از سرویس صاحب مصرف می‌شود.

allowlist بسته است؛ additionalProperties:false در ردیف وdimensions. متن آزاد، سؤال/پاسخ/ویس، هدف/نیاز خصوصی، مبلغ/تعداد/ترکیب دارایی، نام/تماس/Telegram chat_id، token، receipt، IP، user agent، URL یا query کامل، stack trace و payload خام ممنوع. dimensions فقط status/action/channel/reasonCode/category/durationMs دارد؛ category خطای عمومی است. هیچ رقم پولی در event نیست؛ هزینه عملیات فقط در ledger محدود جداگانه با واحد/منبع ثبت شود.

## رخداد و صاحب اتصال

| type | شاهد و اتصال پیشنهادی | صاحب | dimension الزام‌آور |
|---|---|---|---|
| access.eligible | snapshot دسترسی دوره معتبر، نه ثبت‌نام بی‌مجوز | P01 | status=allowed |
| session.started | موفقیت احراز واقعی سمت سرور؛ outage چنین رخدادی نیست | P01 | status=success |
| meaningful.completed | receipt/commit معتبر؛ read_declared، lesson_checkpoint، webinar_participation، holdings_confirmed، question_submitted یا action_recorded | P03/P04/P06/P08 | action؛ status=success |
| membership.renewed | seasonal_events؛ قرارداد تمدید و receipt اصلی | P01 | status=success |
| publication.published / publication.withdrawn | research_publication_events publication.v1 با نسخه اصلی | P07 | status=success |
| notification.result | attempt نهایی دفتر notifications.v1، نه worker count | P05 | channel؛ status=accepted/retry/failed/unknown/cancelled |
| notification.seen | seen واقعی مرکز اعلان اگر موجود/پذیرفته؛ delivery جانشین آن نیست | P05 | channel؛ status=success |
| publication.read_declared | اولین receipt معتبر user+version؛ بدون event تولیدی در دفتر اصلی | P03 | status=success |
| action.recorded | خوداظهاری بررسی/انجام/انجام‌ندادن/سؤال؛ اصل مقدار/زمان در canonical مالی | P06 | action=reviewed/done/not_done/question؛ status=success |
| assistant.result | metadata مجاز اجرای پاسخ و rubric جدا؛ بدون متن یا رقم خصوصی | P08 | status=sourced/referred/unsourced/failed؛ durationMs |
| support.lifecycle | دفتر ticket اصلی، create/first_response/resolve/reopen | P11/عملیات | action=opened/responded/resolved/reopened؛ category |
| service.error | کد عمومی از boundary معتبر | صاحب سرویس | reasonCode؛ category |

`access.eligible` snapshot در هر checkpoint مجاز تکرار می‌شود اما جمعیت ازdistinct subjectKey+cohortKey درanchor ساخته می‌شود. cohort/version برای read/action/notification/publication اجباری؛ request invocation/ticket با sourceRef متمایز می‌شود. اعلان unknown خودکار retry نیست. seen ≠ read_declared ≠ action.done ≠ معامله تأییدشده. lesson_checkpoint یا webinar_participation نیازمند شاهد تعامل تعریف‌شده توسطP03 است؛ بازکردن فایل/لینک checkpoint محسوب نمی‌شود.

## حذف تکرار و ترتیب

- sourceRef با identity اصلی (مثلاً receipt user+version یا attempt_id) در محیط توسط adapter به opaque key تبدیل شود؛ یک sourceRef/type یک eventId پایدار دارد. retry projection event تازه نیست. تلاش مجدد واقعی attempt جدید دارد، ولی نرخ تحویل نهایی بر notification canonical است.
- رخدادهای دیررس براساسoccurredAt در بازه خود می‌مانند؛ recordedAt برای completeness/latency و watermark است. بازپخش بدون مجوز امروز محتوا را بازنمی‌گرداند. duplicate/conflicting eventId quarantine، شمارش نشود؛ شاهد متناقض حذف خاموش نشود.
- شناسه نسخه ازpublication.v1 می‌آید؛ adapter نسخه ساختگی یا current را به receipt تاریخی تحمیل نمی‌کند. withdraw/تصحیح، صف و پاسخ فعال باید ازcanonical resolver پیروی کنند.
- همه timestampها UTC ذخیره، بازه/هفته درAsia/Tehran با تبدیل calendar-aware؛ client clock منبع مجوز/تمدید نیست.

## دسترسی و نگهداری

collector پیشنهادی فقط سمت سرور با allowlist و fail closed برای داده تحلیلی؛ خطای آن سرویس اصلی را fail نمی‌کند. member API یا LLM به این dataset دسترسی ندارد. گزارش مدیر فقط aggregate؛ drilldown ticket در سیستم محدود با grant جدا. baseline/pilot گروه کوچک برچسب تجربه عمومی در گزارش نگیرد تا حداقل جمعیت و رضایت/سیاست نگهداری مصوب شود. دوره نگهداری و فرایند حذف/غیرفعال‌سازی mapping تصمیم باز هستند؛ تا تعیین آنها collector واقعی فعال نشود. fixture آفلاین فاقد داده واقعی است.

`verify.py` فقط schema، نگاشت الزامات، معنای lifecycle و fixtureهای مصنوعی را بررسی می‌کند؛ adapter واقعی، authorization، RLS، tenant isolation یا browser را اثبات نمی‌کند. آزمون اتصال هر adapter بر عهده صاحب محدوده باP00 است.
