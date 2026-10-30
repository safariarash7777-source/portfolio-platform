# P06.2/P07.4 — خواندن مستقل اطلاعیهٔ ذخیره‌شده

Base ثابت f12ba71c353e135f83d136105380f20dd59a95e0 از PR331؛ branch مستقل codex/codal-stored-reader-v04-20261031. مالک C فقط app/api/codal-list/route.ts، آزمون همان route، lib/codal-feed.ts/test در صورت نیاز و یک helper محدود lib/codal-feed-reader.ts. shared docs، Auth، writer، constructor عمومی Supabase، ماهانه/چارت/Workspace تغییر نمی‌کنند. این تهیهٔ کد و Draft برای review است؛ env/deployment/primary/provider/SQL/model اجرا نمی‌شود.

## رفتار و reuse

codalFeedQuery و codalFeedWindow موجود برای انتخاب metadata، ترتیب، سقف۶۰خواندن/۳۰نمایش، dedupe، source=codal_feed و coverage=stored-announcements reuse می‌شوند. lib/market-ir.ts/readSupabase فقط snapshot دیگری می‌خواند و مصرف‌کنندهٔ عمومی‌اش fallback دارد؛ fundamental/supabase.ts قرارداد codal_reports و تنظیم مشترک دارد. هیچ‌کدام مرز مستقلِ فقط codal_feed را ندارند. اعتبارسنجی URL/anon با تابع خالص موجود lib/liara-public-env.js/liaraPublicEnv و یک object ایزوله reuse می‌شود؛ helper یا constructor عمومی و process.env بازنویسی نمی‌شوند و return آن وارد build config نمی‌شود. helper جدید server-only تنها همان REST GET را انجام می‌دهد؛ SDK/Auth/store عمومی ساخته نمی‌شود.

تنظیم runtime پیشنهادی دقیق CODAL_FEED_READ_URL + CODAL_FEED_READ_ANON_KEY، بدون NEXT_PUBLIC و بدون نگاشت در next.config.js. اگر هر دو غایب باشند، همین GET با جفت عمومی موجود به روال قبلی می‌خواند؛ این فقط انتخاب تنظیم پیش از درخواست است، نه fallback پس از شکست. اگر یکی/هر دو override حاضر و ناقص/نامعتبر باشند، 503 و صفر fetch. override فقط مقصد ازقبل مجاز https://62.60.191.24/liara-preview را می‌پذیرد؛ JWT باید ساختار درست و role=anon،iss=supabase و exp معتبر داشته باشد. این بررسی claims تأیید امضا/سازگاری pair نیست؛ مقصد PostgREST آن را احراز می‌کند. هیچ anon واقعی/secret در source یا آزمون نیست.

تنها method=GET، جدول codal_feed و query موجود؛ headerهای ثابت خود reader، بدون cookie/header/session درخواست. redirect/error، credentials/omit، no-store، timeout۱۵ثانیه و سقف بدنه۵۱۲KiB؛ یک تلاش، بدون provider/relay/retry/جایگزینی. شکست upstream همچنان502 و status upstream مشخص در خطا/telemetry پالایش‌شده؛ خطای transport/body با پیام ثابت بدون متن خام خطا/credential. [] واقعی=empty؛ خطا/بدنه نامعتبر یا بیش از۶۰ردیف=error. publication/sent time/null/window با تابع موجود حفظ می‌شود؛ زمان دریافت جای publication/lastSuccess نمی‌نشیند.

## plan/tasks و پایان

1. ثبت reuse/base/مرز پیش از patch — انجام شد.
2. افزودن helper و thin route؛ هیچ consumer دیگر تنظیم جدید را نخواند.
3. آزمون actual GET با transport مصنوعی برچسب‌دار: مقصد مستقل و عدم تغییر Auth/write؛ URL/anon نامعتبر، pair ناقص، redirect/402/timeout/body limit/invalid JSON/empty؛ عدم forwarding و عدم retry/fallback؛ clock/null/۶۰→۳۰ و symbol encoding.
4. اجرای route+feed، رگرسیون مصرف‌کننده، typecheck/lint/core/secrets متناسب؛ registry/package/CI موجود تغییر نکند.
5. تحویل diff/SHA/Draft، نام تنظیم و rollback؛ هیچ ادعای پذیرش مقصد زنده/دادهٔ تازه یا حل علت تجاری402 نشود. برای انتشار Draft نباید Vercel auto-deploy ضمنی راه بیفتد؛ اگر branch guard موجود نیست، ابتدا patch قابل بررسی تحویل شود و scope این گام فقط با root حل شود، نه آرش.

## تنظیم و rollback پیشنهادی — اعمال نشده

در صورت مجوز بعدی root فقط دو entry جدید برای target=preview و gitBranch همین candidate با نام‌های server-only بالا؛ هیچ shared NEXT_PUBLIC یا Production عوض نشود. URL عمومی ثابت، anon عمومی از مسیر مجاز فقط در حافظه به ابزار تنظیم داده شود و در source/argv/log/receipt نیاید. قبل deploy جفت کامل، role/expiry و scope بازخوانی شود. rollback فقط همان دو ID جدید و کد helper/route این برش؛ حذف یک عضو pair به‌تنهایی در runtime باعث توقف503 است. env و deployment اکنون ممنوع‌اند. تاریخ موفقیت کامل مالی UNKNOWN باقی می‌ماند؛ رسید root@e71/cee1 بدون تکرار داده/SQL مرجع است.
