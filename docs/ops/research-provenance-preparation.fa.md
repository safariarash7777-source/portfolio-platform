# آمادگی قرارداد منشأ و بازبینی پژوهش — غیرفعال

مبنا: `main@72e2b3e32d8a80fa9544105f0e439012d9c48738`. این برش فقط ابزار آفلاین آزمون و بازبینی است؛ هیچ route، engine، ذخیره، مجوز، migration، agent یا نشر را فعال نمی‌کند. پذیرش Gate3 همیشه `false` است.

`research-provenance.ts` از `IntelEvidence/Source/Claim/Event/ClaimEvidence`، `StoredVersion/StoredReview` و `RehearsalDay/IntelRun` موجود استفاده می‌کند. reference یک sidecar آفلاین است؛ موتور، حافظه یا رسید تصمیم تازه نیست. شناسهٔ کاربرگ، شناسه و شمارهٔ نسخهٔ ذخیره‌شده، hash محتوای parse‌شده، شناسهٔ رسید و شناسه/hash شواهد را مقایسه می‌کند. `ResearchWorkbook.version=1` نسخهٔ schema است؛ جای شمارهٔ نسخهٔ ذخیره‌شده را نمی‌گیرد.

تغییر محتوا، شماره/شناسهٔ نسخه یا hash شاهد، reference قدیمی را ناسازگار می‌کند. نبود excerpt/منبع/پیوند claim، اختلاف نشانی/زمان و scope نامعلوم برای ادعای وابسته خطاست. واحد از متن یا URL حدس زده نمی‌شود: چون `IntelEvidence` فیلد واحد ندارد، `requiresUnit=true` همواره gap و خطای `dependent_unit_unattested` می‌دهد. این نیازها declaration آفلاین‌اند؛ مشخص نمی‌کنند متن واقعاً به واحد وابسته است یا نه. تعیین وابستگی هنوز کار بازبین است.

نشانی معتبر یا hash اعلام‌شده صحت نقل و منبع را ثابت نمی‌کند. `consistent=true` تنها تطابق ورودی‌هاست؛ حتی با آن، `sourceTruthVerified`، `quotationTruthVerified`، `humanReviewAuthenticated` و `publicationAuthorized` همگی false می‌مانند. پرچم‌های وارداتی approved/published از مسیر `parseWorkbook` حذف می‌شوند و مجوز نمی‌سازند.

gapهای فعلی:

- DTO `StoredReview` هویت بازبین ندارد. ورودی اختیاری `nativeReviewIdentity` فقط ستون‌های موجود فاز۳۴ (`id/version_id/reviewed_by/reviewed_at`) را با همان رسید تطبیق می‌دهد؛ از نویسنده یا متن کاربرگ بازبین نمی‌سازد. هیچ session یا اصالت رکوردی را احراز نمی‌کند.
- snapshot پیوند شواهد/hash در زمان تصمیم، و mapping کاربرگ به claim در schema فعلی persist نشده‌اند. reference تازه‌ساخته یا قابل‌ویرایش، مدرک این نیست که انسان همان محتوا را دیده است.
- واحد canonical در `IntelEvidence` موجود نیست. هیچ ساختار حدسی به دادهٔ زنده اضافه نشده است.
- `RehearsalDay` پیوند run، تقویم زمانی و منشأ واقعی/مصنوعی ندارد. wrapper آفلاین این کمبود را ثبت می‌کند؛ برچسب `real` ورودی، اصالت داده را ثابت نمی‌کند.

rehearsal فقط تاریخ‌ها و اجراهای یکتا، با زمان معتبر و وضعیت succeeded، را به عنوان **روزهای اعلام‌شده** می‌شمارد. clock بررسی ورودی صریح است؛ اجراهای تکمیل‌شده در آینده قبول نمی‌شوند. synthetic/unknown، روز یا run تکراری و metrics نامعتبر کنار گذاشته می‌شوند. ده ردیف تکراری ده روز نیست؛ ده روز اعلام‌شده نیز پذیرش Gate3 نیست. `summarizeRehearsal` موجود تغییر نکرده است. برای reference ناسازگار، هویت/زمان رسید در خروجی معتبر نمایش داده نمی‌شود.

نمونهٔ `research-provenance.synthetic.example.json` عمداً خطا دارد: hash قدیمی، رسید غایب، واحد/scope اثبات‌نشده و rehearsal مصنوعی. همهٔ نام‌ها، نشانی‌ها، شناسه‌ها و داده‌ها ساختگی‌اند؛ این نمونه نباید وارد دادهٔ واقعی Gate3 شود.

آزمون مستقل: `npm run test:research-provenance`. نتیجه و شمارش واقعی در receipt تحویل ثبت می‌شود؛ این متن ادعای اجرای آزمون یا Gate3 PASS نیست. برای این برش build/DB/API زنده لازم نیست و انجام نمی‌شود.
