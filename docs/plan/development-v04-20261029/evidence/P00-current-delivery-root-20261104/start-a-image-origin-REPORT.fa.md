# منشأ تصویر M1 — بررسی اسناد موجود، بدون اجرا

شناسهٔ مورد بررسی: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.

## نتیجه

| پرسش | شاهد موجود | نتیجهٔ محدود |
|---|---|---|
| مرجع repository با digest | `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` در منبع دقیق 6ccb و رسید موفق تاریخی 41191680124 ثبت است | FOUND_HISTORICAL_REFERENCE؛ دریافت‌پذیری فعلی UNKNOWN |
| پلتفرم | همان منبع pull را با `linux/amd64` درخواست می‌کند | REQUESTED_PLATFORM؛ سند مستقل manifest/config برای PostgreSQL پیدا نشد؛ OBSERVED_PLATFORM UNKNOWN |
| شناسهٔ مشاهده‌شدهٔ محلی | موجودی ۲۷ اکتبر، مقدار id و tag=`postgres:17-alpine` را ثبت کرده؛ گزارش ۳ نوامبر نیز همین مقدار را از container inspect فیلد Image گرفته است | HISTORICAL_LOCAL_ID؛ این شاهد در محیط دیگری است |
| نگاشت repository digest → manifest پلتفرم → config digest → image inspect Id | رسید عمومی فقط نام مرجع تصویر را منتشر می‌کند؛ مقدار واقعی `s.imageIds.db` و metadata پلتفرم PostgreSQL در آن نیست | UNKNOWN؛ equality روی runner تازه اثبات نشده است |

نباید از یکسان‌بودن رشته‌های گزارش‌های محیط‌های متفاوت، یکسان‌بودن index/manifest/config را نتیجه گرفت. توصیف M1 به‌عنوان config ID هدف، قرارداد کد پیشنهادی است؛ این بررسی نگاشت مستقل آن به digest مخزن را تأیید نکرد. همچنین نوشتن `postgres@` جلوی یک image ID به‌تنهایی مرجع قابل pull تولید نمی‌کند. مرجع بالا صرفاً به‌دلیل وجود در منبع و رسید تاریخی گزارش شده است، نه به‌دلیل این تبدیل رشته‌ای.

## شاهدهای مشخص

- `company-tools-20261024/docs/plan/development-v04-20261029/evidence/P01-P03-381-6ccb-root-linux-20261031/successful-run-sanitized.json`: run41191680124، source `6ccb106ace4711be7359c7fc8c8d6ab33670f719`، مرحله isolation-attested موفق و مرجع db بالا. SHA256: `48ce2fdad4638db6b0332153307dde7cc87957d9c28a0c6dffb58a97fa499b1c`.
- منبع Git همان 6ccb، `scripts/testing/consultation-tickets/native-auth-runtime.mjs`: pull پلتفرم linux/amd64؛ کنترل عضویت digest در RepoDigests؛ نگهداری `details.Id` در `s.imageIds[role]`. رسید عمومی `images` را از ثابت مرجعها می‌سازد، نه از imageIds. کنترل مستقل platform/config این فایل برای PostgREST است؛ نباید به PostgreSQL تعمیم داده شود.
- `outputs/research-coordination-20261027/vm-image-inventory-readonly.json:329–334`: id بالا و tag postgres:17-alpine. SHA256: `2621d1bbdff2c22cd0d539d2fa302691aff51c8663f8bd30299ccf684127be43`.
- `outputs/liara-readonly-diagnostic-20261103/runtime-location.json:67` و نمونه‌های دیگر: imageId تاریخی بالا. SHA256: `a9ac7b9d024c6f3169cba01e169106e054ceb895fbda2ccb4af2d789f2bf702a`.
- مولد همان گزارش، `remote-runtime-location.py:11`، imageId را از container inspect `o['Image']` می‌گیرد، نه RepoDigests یا manifest. SHA256: `47eed8d58500f0d9bceec5a159697cf62497cec9f68754e2835879912ecf760d`.
- snapshot runtime مشتقِ capsule در `outputs/p03-composition-runtime-e0-root-resume-20261104/revision2/final-source/candidate/overlay/scripts/testing/consultation-tickets/assembled-auth-runtime.mjs:135–139` نیز همین تفکیک را نشان می‌دهد. SHA256: `469d60128fad6a71fe432fbd5f674bfa032c56b9ff6a8b0e2ef7523b3b5d1ff3`.

جست‌وجو فقط در اسناد و خروجی‌های موجود workspace بود. نبود شاهد در این جست‌وجو به‌معنای نبود قطعی آن در همهٔ محیط‌ها نیست. private native log خوانده نشد.

## پیشنهاد کوچک برای root، در همان job Linux — اجرا نشده

۱. پیش از ساخت هر کانتینر، مرجع تاریخی بالا فقط نامزد کشف metadata باشد. digest و نوع سند registry، descriptor مربوط به linux/amd64 و config descriptor مستقل خوانده و ثبت شوند. اگر مرجع نامعتبر یا پلتفرم ناموجود بود، توقف؛ بدون fallback به tag متغیر.
۲. اگر mapping کامل به config ID مورد انتظار M1 تأیید شد، root می‌تواند preload صریح و محدود به همان مرجع immutable/پلتفرم را در همان job انجام دهد. پس از آن `image inspect` باید RepoDigests، Id، Os و Architecture را با mapping پین‌شده تطبیق دهد؛ فقط همین فیلدهای امن و digest شواهد منتشر شوند، نه Env/history تصویر.
۳. اگر config descriptor با M1_IMAGE فرق داشت، نگاشت رد شود؛ هیچ تغییر خودکار pin، alias، tag یا پذیرش شناسهٔ دیگری مجاز نیست. بازبینی و اصلاح صریح قرارداد تصویر نزد root می‌ماند.
۴. تنها پس از تطبیق، M1 با همان image ID مشاهده‌شده و `--pull never` اجرا شود. آماده‌سازی تصویر از پذیرش SQL-copy جداست. تا کشف mapping، preload-ready=UNKNOWN و native-authorized=false در این تحویل باقی است.

هیچ pull، registry/network request، Docker command، dispatch، SQL، نصب، تغییر سرویس/اعتبار/مدل یا تغییر branch انجام نشد. این فایل صرفاً خروجی بررسی خواندنی و پیشنهاد است؛ دفتر وضعیت موازی نیست.
