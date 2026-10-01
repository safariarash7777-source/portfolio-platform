# محیط پذیرش ایزولهٔ DEV-07

برنامهٔ بررسی‌شده: `1978bf562078336f21a7397d01acd8786b020f27`، build تولید محلی. محیط: `dev07-1978-local`، [ورود sandbox](http://127.0.0.1:3210/login?next=%2Fdashboard%2Fholdings). نشانی فقط از همین دستگاه قابل دسترسی است؛ Preview عمومی Vercel به این محیط محلی وصل نشده است. آماده‌کننده/سازنده: Codex root؛ بازبین جدا: Codex agent `dev07_independent`، بدون نقش در ساخت اصلاحات. این سند شاهد آماده‌سازی است؛ نتایج ۱۴ سناریو در صورت‌جلسهٔ مستقل ثبت می‌شوند.

## تطبیق نسخه و جداسازی

- PR #168 هنگام شروع: head `1978bf562078336f21a7397d01acd8786b020f27`، draft/open، merged=false؛ همان SHA در مخزن و در build sandbox.
- Preview عمومی شروع: `dpl_BDBLSQdKkJSmNmiZxhA8a3qeCaXV`، READY و همان SHA؛ این استقرار و Preview لیاراِ دارای بکاپ واقعی، محیط آزمون نوشتن/اختلال نیستند.
- PostgreSQL از volume تازهٔ `dev07-1978-data` و تصویر موجود Supabase بالا آمد؛ `auth.users=0` پیش از ساخت حساب‌ها. هیچ restore، dump، فایل بکاپ یا اتصال به دیتابیس واقعی برای این sandbox استفاده نشد. شبکهٔ DB اختصاصی و داخلی است و پورت PostgreSQL منتشر نشده است.
- فقط Auth/REST روی loopback `127.0.0.1`، پورت‌های 54331/54332؛ برنامه روی 3190، gateway مسیر روی 3210. gateway فقط مسیریابی/کنترل origin و API key دارد؛ پاسخ Auth/REST از GoTrue/PostgREST واقعی می‌آید، بدون پاسخ داده یا هویت شبیه‌سازی‌شده.
- `cron.launch_active_jobs=off` با SQL تنظیم و پس از reload اندازه‌گیری شد. Node برنامه در runtime دسترسی fetch بیرون loopback ندارد؛ فید واقعی/Production وارد سناریو نمی‌شود. این سیاست شبکه در گزارش آزمون اعلام می‌شود.

## نصب schema و شاهد

پیش‌نیازهای واقعی مخزن در همین DB تازه: `sql/archive/supabase_schema.sql`، `supabase_portfolio_tracking.sql` و `supabase_portfolio_versioning.sql`؛ سپس حداقل گرنت و خواندن فقط خودِ profiles از `sql/staging/g3003_staging_profiles_prereq.sql`. `auth.users`، roles و `auth.uid()` را خود تصویر Supabase و migrationهای واقعی GoTrue ساخته‌اند؛ `sql/test/supabase_bootstrap.sql` یا هویت تزریق‌شده استفاده نشد.

| migration | وضعیت این مأموریت | شاهد بعد از اجرا |
|---|---|---|
| phase32 | APPLIED_SANDBOX_ONLY | دو جدول دارایی، RLS و force RLS؛ RPC چهارآرگومانی record_member_holdings و portfolio_versions موجود |
| phase34 | APPLIED_SANDBOX_ONLY | دو جدول پژوهش، RLS، سیاست‌های نسخه و بازبینی موجود |
| phase35 | APPLIED_SANDBOX_ONLY | هفت جدول consultation، RLS و RPC رابطه/جلسه/انتشار/اقدام موجود |
| phase36 | APPLIED_SANDBOX_ONLY | RPC فهرست تأییدشده، branch status-only در save_consultation_action=true، گرنت authenticated و search_path خالی |

ترتیب نصب phase32→34→35→36 بود. فایل [preflight](../../sql/staging/dev07_preflight.sql) پس از نصب اجرا شد: هر ۱۴ پیش‌نیاز موجود، هر ۱۱ جدول مرتبط دارای RLS، و تابع اصلاح‌شدهٔ phase36 در catalog تأیید شد. شاهد نصب/hash فایل‌ها و خروجی catalog در `.task/dev07-migrations.json` و `.task/dev07-preflight.txt` حفظ شده‌اند؛ هیچ اعتبارنامه‌ای در آن‌ها نیست. نصب phase8 وبینار در اولین تلاش به پیش‌نیاز payments رسید؛ phase5 و سپس phase8 نصب و نبود وابستگی رفع شد. این نقص آماده‌سازی بود، نه تغییر کد محصول.

برای بازار/دارایی، schema کامل `terminal_t0.sql` و `ir_market_snapshots.sql`/`ir_market_history.sql` نصب شدند؛ فقط snapshot و یک قیمت با منبع `DEV07_SYNTHETIC` و عنوان‌های «ساختگی» درج شدند. هیچ دارایی، پژوهش، رابطه، جلسه یا اقدام از قبل برای قبولی آزمون ساخته نشد. بقیهٔ migrationهای غیرمرتبط به‌عنوان نصب‌شده فرض نمی‌شوند؛ این sandbox جای تطبیق کامل Production نیست.

## Auth، اتصال و تحویل امن

سه حساب `dev07-a@example.test`، `dev07-b@example.test` و `dev07-advisor@example.test` با API مدیریتی واقعی GoTrue ساخته و email-confirmed شدند. profiles برای A/B=user و advisor=admin است؛ مشاور فقط در registry همین sandbox با عنوان برچسب‌دار فعال ثبت شد. رابطه در آماده‌سازی صفر بود و باید A در محصول آن را اعطا کند. ثبت‌نام عمومی خاموش است؛ SMTP و بازیابی رمز موضوع این سناریوی ورود با حساب آماده نیستند.

URL برنامه و Site URL برابر `http://127.0.0.1:3210` و Supabase URL برابر همان origin با مسیر `/supabase` است. Auth redirect allowlist محدود به همان نشانی محلی است. CSP پاسخ برنامه `connect-src 'self' ...` است؛ درخواست ورود از همان origin می‌رود. gateway درخواست origin بی‌ارتباط را 403 می‌کند و origin مجاز را دقیقاً برمی‌گرداند. این پیکربندی loopback با HTTPS/CORS Preview عمومی یکسان فرض نمی‌شود.

اعتبارنامه‌ها فقط خارج مخزن زیر پوشهٔ خصوصی `C:/Users/Asus/.codex/private/dev07-1978bf5` با ACL اختصاصی کاربر Windows نگهداری شده‌اند. فایل `reviewer-credentials.json` فقط سه حساب پذیرش را دارد و هیچ کلید زیرساختی در آن نیست؛ ACL آن جداگانه اندازه‌گیری شد: تنها حساب محلی Windows با نام `Asus` دارای FullControl و بدون inheritance است. بازبین به helper محلی `.task/dev07-browser.mjs` دسترسی دارد که فرم UI را پر می‌کند و رمز/توکن را چاپ نمی‌کند. هیچ cookie یا JWT کاربر وارد مرورگر نمی‌کند. هر نقش پروفایل مرورگر جدا دارد. تحویل به بازبین انسانی دیگر باید با کانال امن مالک انجام شود؛ فایل رمز به مخزن/PR/گزارش پیوست نشود.

بررسی مقدماتی سازنده: A از UI وارد شد، به `/dashboard/holdings` برگشت و یک ردیف واقعی `auth.sessions` ایجاد شد؛ مرورگر overlay نداشت. این بررسی **پذیرش مستقل** نیست. بازبین باید ورود UI هر سه نقش را خودش انجام دهد و صورت‌جلسهٔ SHA/محیط/زمان را بسازد.

## نسخهٔ سرویس‌ها و ابزار

PostgreSQL 17.6، تصویر digest `6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb`؛ GoTrue v2.197.0، digest `1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`. این نسخهٔ DB با PostgreSQL 16 runner CI متفاوت است؛ نتایج هر محیط جدا ثبت می‌شوند.

Docker Hub برای دریافت REST timeout شد و ECR در Docker resolve نشد. باینری رسمی PostgREST v14.17 از [release رسمی](https://github.com/PostgREST/postgrest/releases/tag/v14.17) دریافت و digest انتشار آن دقیقاً برابر `d6e13926457487c99b77366d795dcfa32700554d08d418131d9a4ea3f6ca25e3` تأیید شد؛ روی لایهٔ cached تصویر DB، image اختصاصی `dev07/postgrest:14.17` ساخته شد. روش کم‌سرویس طبق [راهنمای رسمی self-hosting](https://supabase.com/docs/guides/self-hosting/docker) انتخاب شد. کلیدهای تنظیمات sandbox تصادفی‌اند؛ نشست کاربران را خود GoTrue پس از ورود با رمز صادر می‌کند.

## نگهداری و محدوده

محیط برای اجرای بازبین نگه داشته می‌شود؛ منابعش فقط کانتینرهای `dev07-1978-db`، `dev07-1978-auth` و `dev07-1978-rest` و volume/network همان پیشوندند. کانتینرهای دیگر، Preview لیارا، دادهٔ بکاپ، زمان‌بندی‌های واقعی و Production دست‌نخورده‌اند. ابزار و manifest محلی زیر `.task/dev07-*` برای همین دستگاه باقی می‌مانند. توقف/حذف فقط پس از پایان کار بازبین و با بررسی همین نام‌ها انجام شود. ادغام PR یا انتشار Production مجاز نشده است.
