# DO NOT MERGE — اتصال آزمایشی عمومی P07.4

مبنا دقیق محصول PR345@0a0ee36995fef3c11cdfa68f81cb61a0702a45a6؛ UI/source/testهای CodalReportsTab کاملاً ثابت. شاخه/PR integration مستقل، بدون شرط env/flag قابل انتقال به محصول. sharedrefs و Product331/345 تغییر نمی‌کنند. این API فقط در این شاخه آزمایش است و قابل merge یا انتشار اصلی نیست.

## قرارداد پیش از کد

route موجود `/api/codal-list` مستقیماً helper اختصاصی همین پوشه را می‌خواند. مقصد ثابت `https://portfolio-platform-fawn.vercel.app/api/codal-list?symbol=%D9%81%D9%88%D9%84%D8%A7%D8%AF` است؛ تنها نماد دقیق فولاد پذیرفته می‌شود. مبدأ/مسیر/شرکت با query کنترل نمی‌شوند. query غیرمجاز یا نماد دیگر پیش از هر IO خطای واضح می‌گیرد. هیچ reader قدیمی/DB/relay جایگزین وجود ندارد.

فقط یک GET، credentials=omit، redirect=error، بدون ورودی Request/header/cookie/Authorization/apikey؛ helper فقط symbol می‌گیرد. timeout کل درخواست و body حداکثر۱۵ثانیه، body حداکثر۲۵۶KiB، حداکثر۳۰اطلاعیه. schema/source/coverage و codalSearchUrl.Symbol و مرجع‌های رسمی Codal اعتبارسنجی می‌شوند. publishedDate اختیاری/غایب/null همان‌طور باقی می‌ماند؛ فیلد زمان، عنوان، ترتیب، شمار، window یا تازگی حدس زده نمی‌شود. بدنه موفق معتبر عین بایت UTF8 عبور می‌کند، نه بازسازی ردیف‌ها. خطای upstream status خودش را حفظ می‌کند؛ redirect/timeout/بدنه نامعتبر خطای صریح‌اند، نه empty/fixture/fallback. source ثابت و DO_NOT_MERGE در header پاسخ قابل بررسی است، بدون تزریق داده یا تغییر UI.

## فایل و آزمون

`app/api/codal-list/route.ts`، helper جدید `public-integration.ts`، آزمون موجود و ثبت‌شده `route.test.ts` و همین scoped docs. package/registry، APIهای دیگر، CSP، env/DDL/key/DB/main ثابت. آزمون‌های offline همان مسیر ثبت‌شده Core را اجرا می‌کنند؛ دادهٔ کوچک مصنوعی فقط در test است و هیچ fixture runtime یا endpoint جعلی deploy نمی‌شود.

آزمون‌های لازم: نماد/مبدأ/pathallowlist و unknownquery، عدم forward header با Requestحاویcookie/Auth، redirect/error بدونfollow/retry، timeout fetch/body، bodylimit/schema/source/coverage/نماد ناسازگار، حفظ عینpayload/null/absence/ترتیب و خطایupstream. typecheck/lint و CI exacthead؛ build باید UI hash مبنا را حفظ کند.

## شاهد و پایان

Preview exactSHA مستقل و READY؛ chain مورد آزمون مرورگر→candidateAPI→publicProduction→codal_feed. فقط یک کلیک GET مرورگری مجاز، بدون دریافت خودکار یا retryاضافی. مجری cloud در صورت نبود browser tool این read را مصرف نمی‌کند و سهم یک کلیک را به root/A تحویل می‌دهد؛ HTTP/CI به جای browser acceptance ادعا نمی‌شود. root/A controlsloaded واقعی desktop/mobile را بررسی می‌کنند. SSR مالی این شاخه همچنان مسیر اصلی خودش را دارد؛ این اتصال آن را تعمیر یا ارقام مالی/حقخدمت/jobfreshness/P09 را تأیید نمی‌کند. علت۴۰۲ همچنان unknown.
