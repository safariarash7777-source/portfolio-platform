# سنجه‌ها و کیفیت اندازه‌گیری

مرجع تعریف: 01-product بخش10. هدف کاهش زمان و رشد ارزش؛ تعدادPR، کلیک و پیام ارسالی KPI نیست. داده واقعی فعلاً UNKNOWN. سه KPI اصلی و guardrailها؛ هدف عددی جدید پس از baseline و تصمیم آرش.

| KPI | جمعیت، مخرج و بازه | صورت و حذف تکرار | کاربرد/محدودیت |
|---|---|---|---|
| فعال‌سازی هفت‌روزه | اعضای یکتای واجد دسترسی یک cohort که از شروع دسترسی معتبرشان هفت روز کامل گذشته؛ پنجره [eligibleStart,eligibleStart+7days)؛ اعضای immature جدا | عضو دارای session.started موفق و حداقل یک meaningful.completed داخل پنجره؛ distinctsubject+cohort | رفع مانع ورود/کار اصلی؛ ورود به‌تنهایی کافی نیست، مبلغ خصوصی اجباری نیست. وضعیت لغو/منقضی در پنجره جدا گزارش شود؛ حذف خاموش نکن. |
| استفاده معنادار هفتگی | اعضای دارای دسترسی در حداقل یک بخش هفته؛ هفته شنبه00:00 تا شنبه بعد00:00 تهران؛ تعداد واجدان و person-days exposure کنار گزارش | distinctmember با کار اصلی مجاز در زمان وقوع؛ read_declared/checkpoint/commit/question/action؛ numerator≤denominator | تعداد و نرخ هر دو؛ ارسال/seen/ورود/بارگذاری نمودار معیار استفاده نیست. سؤال یا self-report کیفیت/اثر را ثابت نمی‌کند. |
| تمدید همان دوره | اعضای قبلی واجد تمدید در cohort اصلی، در مهلت مصوب؛ مهلت/تعریف eligible و ارتباط دوره بعد باP01/آرش | distinctmember که در دوره بعد grant تمدید معتبر و شاهد وصول لازم سیاست دارد؛ فروش تازه جدا | بدون policy/receipt معتبر null؛ membership.renewed تنها proxy دسترسی است، فروش وصول‌شده نام نگیرد. |

کنترل مخرج: snapshot eligible به نسخه سیاستP01 متصل؛ آزمون A/B، grant تکراری، revoked/expired، دو دوره و بازه immature الزامی. join بین محیط‌ها ممنوع؛ fixture/QA و کارکنان با tag مجاز محیط از cohort واقعی جدا. صدور همان receipt دوباره numerator را زیاد نکند. اگر completeness نامعلوم یا adapter کلیدی غایب باشد نرخ null و آخرین watermark/coverage گزارش شود؛ مخرجصفر → null (0/0 نیست).

## تشخیص و guardrail

| سنجه | تعریف و منبع | تصمیم/حد |
|---|---|---|
| اعلان | شمار canonical notification با وضعیت نهاییaccepted/failed/unknown/cancelled؛ seen و read برversion جدا؛ duplicate/stale جدا | unknown معادل شکست قطعی نیست. نرخ accepted ازattempt count ساخته نشود. صفر اعلان منسوخ/تکرار نامطمئن در acceptance suite شرط خروج، تضمین عملیاتی آینده نیست. |
| دسترسی/محاسبه/محرمانگی | incident تأییدشده و blockerهای باز به تفکیک سبب، صاحب و محیط | هر blocker ورود/مجوز/عدد/محرمانگی مانع گسترش پایلوت؛ صفر افشای بین‌عضوی در آزمون شرط خروج. |
| پاسخAI | sourced/unsourced/referral/failure، نسخه مدل/دستور/منبع در evidence محدود؛ rubric انسانی۶۰سؤالی برنامه (۲۰/۲۰/۱۰/۱۰) | هدف پیشنهادی۹۰٪ کیفیت عادی برنامه، تا ارزیابی انسانی پذیرش نیست؛ نسبت بدون source مستقل بررسی شود. صفر افشای عددخصوصی و صفرانتساب نسخه منسوخ در suite. |
| زمان آرش | active production minutes/output و approval minutes/output جدا؛ support minutes/week؛ elapsed approval جدا | paired historical/current نمونه‌های مشابه با scope/کیفیت ثبت‌شده؛ بدون baseline درصد کاهش تعیین نشود. |
| هزینه خدمت | infrastructure+data+AI+message+video+labor؛ دوره و واحد پول/منبع؛ هر cost_id یکتا | مبلغprovider نامعلوم یا هزینه غایب null؛ نسبت per active member با جمعیت هفته هم‌بازه، allocation دوره جدا. ارزها بدون نرخ منبع‌دار جمع نشوند. |
| پشتیبانی | opened/resolved/reopened؛ first human response و resolution durations؛ backlog و oldest age | پاسخ خودکار humanresponse نیست. censored ticketهای باز کنار percentile؛ SLA بدون تصمیم مالک تعهد نیست. |

پوشش هزینه: تعداد دسته‌هایی که مبلغ و منبع معتبر دارند/شش دسته مورد انتظار، همراه مواردmissing. هزینه ناقص «کل هزینه» یا سودقطعی نام نگیرد. فرمولاقتصاد: درآمدوصول‌شده دوره+کارمزدوصول‌شده+مشاوره‌وصول‌شده−هزینه‌مستقیم−جذب/عملیات؛ شاهد وصولP09 مستقل از analytics. حدود۷۰۰عضو و۴میلیون دربرنامه نقل آرش است، baseline verified مالی نیست.

هر کارت گزارش: definitionVersion، cohort/window، releaseSha/environment/schema، numerator/denominator، missing/late/duplicate، source و publication/measurement date، reviewer، uncertainty و next action. تعداد۷۰۰کل با۷۰۰هم‌زمان معادل نیست؛ هم‌زمانی ازوبینار/provider و load test مجاز تعیین شود.
