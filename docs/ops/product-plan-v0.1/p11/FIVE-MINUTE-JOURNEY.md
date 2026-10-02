# پذیرش مستقل مسیر شروع عضو A و منع B

مرجع سند03، P03 و P11؛ مقصد candidate208+P03 با SHA/schema/URL و اجازه slot ازP00. پنج دقیقه **بودجه پیشنهادی سناریو** است، نتیجه کاربر کم‌تخصص نیست. تا receipt مقصد، وضعیت NOT_RUN؛ از محیط195 یا screenshotP03 نتیجه نسخه ترکیبی نسازیم.

## ورودی لازم P00 و P03

URL مجاز و SHA runtime ترکیبی؛ manifest schema hashes و status نصب؛ fixtureهای native A/B، دو cohort و نسخه محتوا/منبع؛ دسترسی credential از فایل محدود یا login تعبیه‌شده بدون رمز/OTP در چت؛ پاسخ Auth و resource outage قابل کنترل در همان sandbox؛ rollback و مسئول محیط. هیچ build سنگین/seed یا تغییر مشترک توسطP11 انجام نشود؛ حساب‌های آزمایشی و اقدامات مجاز را صاحب محیط تحویل دهد. policy-blocked Preview199/NEXT09 مقصد جایگزین نیست.

## مسیر پنج‌دقیقه‌ای پیشنهادی

| بازه راهنما | کار A | شاهد لازم |
|---|---|---|
| ۰–۱ دقیقه | ورود native با redirect به خانه عضو؛ دوره درست و قدم بعدی | runtimeSHA، login outcome و عنوان cohort؛ قطعAuth با expired اشتباه نشود |
| ۱–۲ دقیقه | شروع نیازسنجی کوتاه با متن غیرحساس fixture؛ تغییر دوره/refresh | draft حفظ، پاسخ دیررس متن جدید را بازنویسی نکند؛ فرم ارقام دارایی شرط ورود نیست |
| ۲–۳ دقیقه | پیدا کردن lesson/منبع مجاز و جلسه با زمان تهران | search/filter و خطا≠جلسه خالی؛ فقط صفحه جاری بودن فیلتر ثبت شود |
| ۳–۴ دقیقه | بازکردن نسخه publication و اعلام مطالعه | همان UUID و source/asOf، receipt نسخه‌دار؛ نسخه بعد هنوز unread |
| ۴–۵ دقیقه | یافتن مسیر پشتیبانی/وضعیت دریافت و مسیر خروجی داده موجود | received وعده پاسخ نیست، first_response/SLA نامعلوم؛ export فقط اگر route واقعاً موجود و مجاز است |

اگر قسمت آخر هنوز runtime ندارد، MISSING_PRODUCT_PATH ثبت شود؛ نمونه آفلاین جای آن را PASS نکند. هیچ تلگرام یا پیام واقعی در این مسیر فعال نمی‌شود؛ اتصال/نسخه مشترک تلگرام همچنان گیت جدا باقی است.

## منع B، خطا و بازیابی

با نشست native B از همان URL نسخه/فایل دوره A درخواست شود: هیچ داده خصوصی A در list/detail/download/receipt نباشد. GET نباید مطالعه بسازد. revoke حسابA روی request بعدی مجوز را ببندد؛ capability قبلی signedURL تا TTL مستند مالک می‌تواند باقی باشد، این محدودیت پنهان نشود. آزمون لغو فقط با هماهنگی صاحب sandbox و fixture، نه تغییر داده مشتری.

برای outage Auth/data کنترل‌شده، وضعیت503/خطای صادقانه، حفظdraft و بازیابی مسیر سالم بررسی شود؛ قطع واقعیprovider یا تغییر env/DB در دامنهP11 نیست. refresh/logout/relogin باید session حقیقی بسازد؛ storageState/JWTساختگی پذیرش ورود نیست. console/network فقط کد عمومی و HTTP/زمان؛ token، cookie، سؤال/مبلغ در گزارش ذخیره نشود.

## معیار و ثبت

سازنده مسیر، P11 بازبین مستقل و انسان کم‌تخصص سه نقش جدا هستند. record زمان هر قدم از monotonic clock و زمان تهران، محیط، SHA و schema؛ نتیجه PASS/FAIL/BLOCKED/NOT_IMPLEMENTED و code محدود. تأیید انسانی فهم دوره/دارایی/بدهی/خالص/ناقص و استفاده حقیقی پنج‌دقیقه‌ای OPEN می‌ماند. سناریوهای کامل J00…J13 در ACCEPTANCE.md حفظ و این مسیر صرفاً بخش شروع عضو/منعB را پوشش می‌دهد.

اولین اقدام وابسته: P00 URL/SHA و slot محیط را تحویل دهد؛ P03 selectors/fixtures و delta را معرفی کند. سپسP11 در browser مجاز مستقل اجرا و screenshot/نتیجه غیرحساس را در همین پرونده ثبت می‌کند. اگر مقصد آماده نیست، سایر کارهای مستقل ادامه دارند و گیت زمان/پایلوت مصوب نام نمی‌گیرد.

## P03 handoff received 2026-10-02

PR209 a44aff3b301cd2d4635f14ac4069e50c466cfe02 is separate evidence, not the combined target. Native member path is /dashboard?cohort=<exact UUID>; login must retain cohort. Anchors: #member-courses-title, #member-needs-title, #member-webinars, #member-publications-title. Lesson detail /publications/[id]; read POST body {cohortId}, exact server publication UUID/actor/time. Needs draft is same-user/exact-cohort sessionStorage, same tab, two-hour TTL; no cross-device guarantee. Signed resource capability TTL is 60 seconds per owner's statement and revocation must be tested at next issuance.

/member-home-preview is UI fixture only and has an empty publication feed: it cannot establish native Auth, Storage, lesson receipt or A/B isolation. Prior native fixtures are superseded/revoked; P11 must not reset/copy them. Needs, webinar and short-link failure scenarios are owner-provided fixtures, not authorization to cut off a real provider. Teacher approval, inexperienced-person comprehension and real five-minute use remain HUMAN OPEN.
