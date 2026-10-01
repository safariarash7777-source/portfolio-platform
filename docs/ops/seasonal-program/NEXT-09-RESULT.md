# NEXT-09-RESULT — 2026-10-01

وضعیت: **ساخت ایزوله آماده بازبینی؛ پذیرش عملیاتی بات/Auth و فعال‌سازی باز است.** هیچ merge، استقرار دستی/Production، migration مشترک/Production یا پیام واقعی انجام نشده است. بررسی Preview خودکار GitHub/Vercel جداست؛ وضعیت عملیاتی Production از این کار معلوم نیست.

## تحویل

- سایت: اتصال دوطرفه یک‌بارمصرف ده‌دقیقه‌ای وابسته به همان نشست معتبر Auth، قطع اتصال، ترجیح اختیاری خاموش در شروع، مرکز اعلان و علامت مشاهده مستقل از خواندن پژوهش.
- توزیع: مصرف NEXT04/NEXT08 بدون تغییر فایل‌های مالکان، لینک نسخه با ورود سایت، صف پایدار با dedupe و claim هم‌زمان، بازبینی دسترسی پیش از ارسال، اصلاحیه/لغو، حداکثر سه تلاش فقط برای 429 قطعی. نتیجه نامعلوم دوباره‌فرستی خودکار ندارد؛ پذیرفته‌شدن API خوانده‌شدن نیست.
- مینی‌اپ: استفاده از نشست/initData و webhook موجود برای اثبات سمت تلگرام؛ مسیر مشاوره موجود با رسید محلی پایدار، شناسه هم‌بستگی و بازفرستی همان درخواست به leads مرجع سایت. رسیدهای قدیمی بدون هم‌بستگی خودکار دوباره کپی نمی‌شوند.
- قرارداد مشترک نسخه‌دار و راهنمای فعال‌سازی/بازگشت: [next09/README.md](next09/README.md)، کپی یکسان در مینی‌اپ `docs/next09/README.md`. هیچ env واقعی اضافه/تغییر یا secret ذخیره نشده است.

## شواهد ایزوله

| بررسی | نتیجه | فایل |
|---|---|---|
| PostgreSQL17، دو پروفایل grants، قوانین اتصال/صف/انقضا/lead + آزمون‌های HTTP/transport | 58/58 | next09/postgres-tests.txt |
| بازبینی مجدد transport پس از اصلاح delay | 7/7، تکرار subset | next09/transport-tests.txt |
| رگرسیون CI و همه آزمون‌های core پس از تطبیق webhook/worker و ثبت اسکریپت‌ها | 37/37 subset و 1239/1239 core | next09/ci-regression-tests.txt، core-tests.txt |
| سایت TypeScript، ESLint بدون warning، Next build | موفق | next09/typecheck.txt، lint.txt، build.txt |
| اسکن secret و اعتبارسنجی SQL مخزن | موفق | next09/secret-scan.txt، sql-validation.txt |
| مینی‌اپ TypeScript، Vitest و Vite/esbuild | 68/68 و build موفق؛ warning اندازه chunk موجود | telegram-next09/docs/next09 |
| مرورگر RTL موبایل/دسکتاپ سایت، اتصال/رضایت/قطع/مشاهده/خطا/خالی؛ فرم مینی‌اپ | موفق با پاسخ‌های مصنوعی، بدون page error | browser-results.json و تصاویر در هر مخزن |

Docker فقط container مستقل `next09-synthetic-db` با شبکه خاموش و دیتابیس‌های موقت next09 را استفاده کرد. fixture انقضا ساعت را در همین داده ساختگی جلو می‌برد؛ guard داده واقعی تغییر نکرده است. هیچ کلید سرویس/بات واقعی خوانده یا به transport داده نشده است. پاسخ‌های مرورگر و ارسال Telegram در تست‌ها مصنوعی هستند؛ این نتایج اثبات هویت یا ارسال واقعی نیستند.

دانلود agent-browser به timeout خورد؛ رابط واقعی با Playwright بسته‌شده و Chrome محلی بررسی شد. pglast محلی نصب نبود؛ آزمون گرامر محلی جداگانه اجرا نشد، ولی migration و RPCها واقعاً در PostgreSQL ایزوله نصب/اجرا شدند و job گرامر SQL در CI اولیه سبز بود. بازبینی خودکار اجرای سرور build‌شده برای smoke محلی را با دلیل عمومی `blocked by policy` رد کرد؛ بررسی runtime حالت production انجام نشده است. gate توسعه QA در کد بررسی شده است.

## مرز مالکیت و ادغام

پایه سایت Auth180 `bb4f2f3e53859bbecb0ec942975ffb06fd2d2828` شامل NEXT04/08 است؛ PR سایت باید روی `codex/followup-auth-20261001` بازبینی شود. پس از ادغام پایه، فقط مسئول هماهنگی retarget/rebase را تصمیم می‌گیرد. پایه مینی‌اپ main `94d20e104705b573d5def4b1f2058695cbdfcf9a` است.

Auth/middleware/globals/Navbar/fonts، components/member، publication-server/feed/read-state و migrationهای 04/08 دست‌نخورده‌اند. تنها migration جدید `20261001125428_next09_notifications.sql` است؛ اجرا روی هدف مجاز نیست و هنوز انجام نشده. webhook عمومی telegram-sync و تصمیم عضویت مستقل ساخته نشده‌اند. ایمیل حفظ، SMS deferred و Hermes دست‌نخورده است.

قابلیت‌های کانال از اسناد رسمی بررسی و در README ثبت شدند: عملیات اعضا به admin/حقوق واقعی بات وابسته است؛ عضویت شاهد پرداخت یا رضایت پرونده نیست. admission/removal کانال پیاده‌سازی نشده و جزو پذیرش عملیاتی باز است. حذف پیام پذیرفته‌شده و پس‌گرفتن کپی‌ها تضمین نمی‌شود.

## فعال‌سازی/بازگشت و موارد باز

راهنمای دقیق و نام envها در README مشترک است. قبل از فعال‌سازی، Auth مشترک و schema هدف، بات/کانال آزمایشی و حق admin، یک webhook منتخب برای هر bot، نشست واقعی دوطرفه، Origin/secretها و مرز پایدار شروع رسید مشاوره باید توسط مسئول محیط تأیید و فقط با کاربران ساختگی آزمایش شوند. flags ارسال خاموش؛ رویدادهای قدیمی پیش از opt-in stage شوند تا broadcast تاریخی رخ ندهد. فعال‌سازی این مرحله انجام نشده است.

بازگشت برنامه: خاموش‌کردن send، توقف worker، خاموش‌کردن NEXT09 هر دو مخزن و حفظ صف/تاریخچه/رسیدها. حذف schema یا احیای اتصال یک‌طرفه قدیمی مجاز نیست؛ تغییر grants نیازمند migration رو به جلو و بازبینی جداست. unknownها و درخواست‌های قدیمی replay نشوند. لینک‌های سایت همچنان مجوز جاری را کنترل می‌کنند.

## PR و وضعیت دقیق

| مخزن | Draft PR | commit پیاده‌سازی اولیه | پایه |
|---|---|---|---|
| سایت | [#189](https://github.com/safariarash7777-source/portfolio-platform/pull/189) | `9f65f38ee96a97a22728afbfb0403a017f1f76ce` | Auth180 |
| مینی‌اپ | [#5](https://github.com/safariarash7777-source/telegram-miniapp/pull/5) | `0aefd98e55091a6f5d0ebd9aca9f5335485a84a5` | main |

هر دو Draft/Open و mergeable در snapshot اولیه GitHub بودند؛ ادغام نشدند. مینی‌اپ CI run `36915267470` موفق. سایت seasonal sandbox run `36915223570` موفق؛ CI اولیه `36915223667` در core شکست داشت: dependency جدید در harness قدیمی، ثبت‌نبودن تست‌ها و endpoint بدون زمان‌بندی زیر cron. رفع شد: harness همان helper واقعی را مصرف می‌کند، تست‌ها در package scripts ثبت شدند و worker به `/api/notifications/worker` منتقل شد؛ قاعده cron و زمان‌بندی Production تغییر نکرد. اجرای محلی core پس از اصلاح 1239/1239 موفق بود. snapshot آخر head/checkها در `next09/PR-CHECKPOINT.json` ثبت می‌شود؛ موفقیت محلی جایگزین CI/Preview یا پذیرش بات واقعی نیست.

snapshot کد اصلاح‌شده در 19:47:33 UTC: سایت head `ad69b6a568fecafdee815d1c29a73c9ba66754d9` با CI run `36916116727`، seasonal run `36916116762` و status Vercel همگی موفق؛ مینی‌اپ head `ade9e916e8e4d01e0c35c607a4c6e3efd29afede` با CI run `36916107701` موفق. این‌ها headهای تأیید کد هستند؛ commit بعدی فقط شواهد نهایی را اضافه می‌کند. SHA و checkهای آخرین head دقیق در کپی هماهنگ‌کننده `next09/FINAL-PR-CHECKPOINT.json` ثبت می‌شوند تا گزارش به SHA خودش ارجاع چرخه‌ای ندهد. Preview فقط status موفق دارد؛ runtime/Production یا ارسال واقعی از آن نتیجه گرفته نشده است.

تاریخچه: 2026-10-01 نسخه 1 — تحویل ایزوله NEXT09؛ نسخه 2 — رفع ناسازگاری گیت‌های مخزن و ثبت CI سبز؛ ادغام/فعال‌سازی باز.
