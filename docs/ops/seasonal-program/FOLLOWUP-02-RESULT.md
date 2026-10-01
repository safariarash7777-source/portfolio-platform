# FOLLOWUP-02-RESULT — خواندن کامل و تازه‌شدن تابلو

تاریخ: 2026-10-01. وضعیت: پیاده‌سازی ایزوله؛ هیچ تغییر Production، migration یا تولیدکنندهٔ BrsApi اجرا نشده است. PR و SHA نهایی پس از ثبت تحویل در HANDOFF همین پوشه درج می‌شود.

## مبنا و مالکیت

- worktree: `work/followup-market-read-20261001`؛ branch: `codex/followup-market-read-20261001`.
- پایهٔ دقیق PR174: `95cfa3410a97ac0d98cdefcb6671d4cfcb668646`، branch `codex/next-07-market-20260930`. اصلاح واحد، null، NAV، زمان منبع/دریافت و wrapper دسترسی174 حفظ است.
- PR178 و branch quota guard در checkout جدا دست‌نخورده‌اند؛ این تغییر quota guard را وارد174 یا Production نمی‌کند.
- قبل از ویرایش، مالک frontend/Auth از فایل‌های reader و refresh با پیام هماهنگی مطلع شد. README مدیریت در repository قرارداد محصول ویرایش نشده است.

## مشکل اثبات‌شده و تغییر

`getHistorySymbols` یک GET بدون order با limit10000 داشت؛ max-rows1000 نتیجه را بریده و به عنوان کامل کش می‌کرد. `fetchCodal` نیز limit3000/2000 داشت و خطا/تهی واقعی هر دو [] می‌شدند. در نتیجه جفت دورهٔ سال قبل می‌توانست خارج صفحهٔ اول بماند. StocksBoard/FundsFullBoard دریافت دوره‌ای نداشتند و ساعت freshness فقط در رندر سرور محاسبه می‌شد.

خوانندهٔ مشترک اکنون GET با کلید anon و RLS موجود دارد. با همان فیلتر، highest visible id را fence می‌کند، سپس id.asc و cursor > آخرین id تا همان fence می‌خواند. صفحهٔ کوتاه دلیل پایان نیست. pageSize حداکثر1000، حداکثر1000صفحه، timeout10ثانیه برای هر تلاش، حداکثر2تلاش برای network/429/5xx؛ 4xx دیگر retry ندارد. صفحهٔ خالی قبل از fence، order/ID نامعتبر، شکست پایدار و تمام‌شدن بودجه خطای صریح‌اند. هیچ partial result به محاسبه یا کش کامل نمی‌رود. ن۱۰/ن۳۰ پس از خواندن کامل با captured_at نزولی و id نزولی مرتب می‌شوند تا تقدم اصلاحیه حفظ شود؛ محاسبهٔ مالی YoY تغییر نکرده است.

فهرست تاریخچه همان **فیلتر30روز** را حفظ می‌کند؛ ادعای همهٔ تاریخ‌های مخزن نمی‌کند. نمایش تهیِ کامل از شکست خواندن جداست. خروجی سازگار getHistorySymbols هنوز string[] است؛ مصرف‌کنندهٔ نیازمند صداقت پوشش باید getHistorySymbolsRead و coverage را استفاده کند. خروجی getFundamentalYoY همان monthly/quarterly به علاوه coverage جدا برای هر نوع است. wrappers Map برای radar حفظ‌اند؛ FOLLOWUP03 باید coverage را همراه گزاره‌های آن مصرف کند.

cache فقط کامل است، single-flight در هر process دارد، TTL تاریخچه10دقیقه/گزارش1ساعت، و پس از خطا cooldown30ثانیه. stale آخرین نتیجهٔ کامل را با completedAt و failure metadata نگه می‌دارد؛ cold failure error است. این cache حافظهٔ **هر instance** است؛ در cold start/serverless تضمین ماندگاری بین instanceها ندارد و snapshot تراکنشی MVCC هم نیست. ID fence appendهای بالاتر را جدا می‌کند؛ تغییر RLS یا داده در حین scan خارج تضمین snapshot است. جداول مبنا append-onlyاند.

تابلوهای سهام و صندوق‌ها هر پنج دقیقه از مسیر همان صفحه router.refresh می‌گیرند. درخواست UI مستقیم به BrsApi، endpoint تازه یا منبع جهانی اضافه نشده است. hidden tab درخواست تازه ندارد؛ برگشت به visible یک درخواست عقب‌افتاده می‌دهد. تا تأیید رندر سرور readAt، lease درخواست حفظ می‌شود؛ idle شدن transition به تنهایی تأیید دریافت نیست. پس از30ثانیه بدون تأیید هشدار می‌آید و خواندن دوم شروع نمی‌شود. در قطع transport بدون پاسخ رندر، خودکار هم‌پوشانی نمی‌سازد؛ برای بازیابی آن حالت، navigation/reload کاربر لازم می‌شود. این محدودیت صریح است.

مسیر getIrMarket، fallback قدیمی relay را همچنان دارد؛ اگر آن env فعال و DB قطع باشد، relay می‌تواند طبق رفتار قبلی upstream بخواند. این بسته fallback/producer را اضافه یا فعال نکرده؛ انتشار واقعی تا اعمال guard178 و baseline مشخص، مجاز/پذیرفته اعلام نمی‌شود.

URL/filter/sort و state جدول remount نشده‌اند. last-valid props حتی در cold/null read در همان client instance حفظ می‌شوند. ساعت freshness هر30ثانیه در visible به‌روز می‌شود و دریافت قبلی را به «تازه» تبدیل نمی‌کند. در آزمون مرورگر، اضافه‌شدن هشدار خطا browser anchoring را تغییر داد؛ حفظ اسکرول در پایان رندر و بعد از commit هشدار اصلاح شد و wheel/touch/کلیدهای پیمایش عمدی کاربر بازنویسی نمی‌شوند.

## شواهد و پذیرش

- 15تست جدید واحد: بیش از1000، cap317، نماد مرزی، retry میانی، شکست پایدار، 4xx، append پس از fence، order/shape/budget، single-flight/cache stale/cold، جفت دوره/اصلاحیه و زنجیرهٔ فصلی، دو cadence مصنوعی و hidden/slow gating.
- PostgreSQL17.11 + PostgREST14.17 ایزوله، SELECT تحت RLS با cap317: تاریخچه2407ردیف/8صفحه، ن۳۰1208ردیف/4صفحه، ن۱۰1208ردیف/4صفحه؛ count، distinct symbol و digest ID با **SQL همان فیلتر و role** برابر. هیچ رقم مالی واقعی خوانده/ثبت نشد. `followup02-evidence/sql-match.log` شاهد است. اجرای دوباره با SYNTHETIC_READ_DB=1 روی نام/پورت آزمایشی ثبت‌شده انجام شود؛ این تست به DB زنده وصل نمی‌شود.
- test:core1239/1239 و test:calc106/106 PASS در اجرای ثبت‌شده. typecheck، lint بدونwarning، secret scan748فایل، SQL validator46فایل و build نهایی پس از اصلاح UI PASS. هشدارهای SQL validator مربوط به فایل‌های تاریخی بدون تغییر است؛ migration اجرا نشده.
- Chrome واقعی headless با agent-browser0.38.1 و Next15.5.25، fixture محلی15886 و app15885، ساعت کنترل‌شده در مرورگر/سرور: stocks1440×1000، دو چرخه stamp جلو‌رونده بدون تغییر قیمت بازار بسته، hidden/resume، DB503 حفظ60ردیف/زمان/URL/search/sort/scroll با هشدار، recovery، maxActive1. `browser-stocks.json` و تصاویر شاهدند.
- صندوق390×844 PASS: دو چرخهٔ stamp، حفظ دسته طلا/search/sort و کارت، بدون overflow، DB503 با حفظ زمان/URL/اسکرول، و RSC نگه‌داشته‌شده پس از tick عقب‌افتادهٔ دیگر با maxActive1؛ wheel عمدی کاربر به نقطه قبلی برنگشت. browser-funds.json و تصویر کامل شاهدند. آزمون کامل screen reader و Auth واقعی ادعا نشده است.
- **پذیرش واقعی دو چرخه در محیط Production: BLOCKED/اجرا نشده**. baseline/reset مصرف مشترک BrsApi هنوز مشخص و guard178 مستقر نیست؛ استقرار این PR هم مجاز این تسک نیست. هیچ `/market.json` اجباری یا بک‌فیل upstream برای ساخت شاهد اجرا نشد. شواهد مصنوعی به‌عنوان دادهٔ زنده معرفی نمی‌شوند.

## ماتریس فایل و مرز FOLLOWUP03

| فایل | مسئولیت |
|---|---|
| lib/supabase/paged-read.ts + test/integration | خواندن keyset کامل، cache کامل و پوشش صریح |
| lib/core/history.ts | getHistorySymbolsRead، فهرست30روز کامل؛ getSymbolHistory فعلی خارج تغییر |
| lib/core/fundamentalData.ts + test | کل ن۱۰/ن۳۰، تقدم اصلاحیه و coverage سازگار |
| app/(protected)/terminal/page.tsx | هشدار پوشش، تهی واقعی30روز |
| app/data/page.tsx، ReadCoverageNotice | نمایش شکست/stale جدا برای ماهانه/فصلی؛ API props قبلی حفظ |
| lib/market-refresh.ts + test، MarketAutoRefresh | cadence/visibility/lease/ack و حفظ اسکرول |
| MarketFreshnessBadge، MarketShell | ساعت متحرک؛ فعال‌سازی refresh فقط stocks/funds |
| StocksBoard، FundsFullBoard، useRetainedBoard | آخرین props معتبر، همان فیلتر/ظاهر/منطق174 |
| app/market/stocks، app/market/funds | فعال‌سازی؛ getAccess/AccountBridge/Auth دست‌نخورده |
| package.json | wiring تست‌های جدید، بدون تغییر وابستگی/lock |
| followup02-evidence | fixture و شواهد مصنوعی؛ ابزار تست در محصول import نمی‌شود |

بودجهٔ DB هر cold/full scan: 1 درخواست fence + ceil(R/سقف واقعی پاسخ)، retry حداکثر دوبرابر؛ TTL و single-flight فقط per-process. بدون اندازه‌گیری زنده، p95 یا بهبود latency ادعا نمی‌شود. خواندن کامل تعداد درخواست را نسبت به قطع صفحهٔ اول افزایش می‌دهد؛ FOLLOWUP03 باید aggregation/cache/progressive render را با همین coverage و scope طراحی کند، نه حذف ردیف‌ها.

نقص‌های ثابت‌شدهٔ خارج این بسته: getSymbolHistory برای days بزرگ هنوز یک GET capped دارد؛ bulkReturns هنوز PAGE50000 و توقف با صفحهٔ کوتاه/HTTPfailure دارد؛ avgVolume سقف60صفحه و break خطا دارد. بنابراین این PR ادعای کامل‌شدن **بازده همهٔ صندوق‌ها، تاریخچهٔ CSV و میانگین حجم** نمی‌کند. اصلاح این خواننده‌ها باید با همان قرارداد کامل/coverage و بودجهٔ عملکرد، توسط مالک lib/core و هماهنگی FOLLOWUP03 واگذار شود. تداخل نکردن در فایل با تحویل latency03 لازم است. UI تغییر state/filter را بسیار سریع پشت سرهم به چند router.replace می‌فرستد و ممکن است پارامتر قبلی overwrite شود؛ مشاهدهٔ مصنوعی در ساخت آزمون ثبت شد، مستقل از refresh دوره‌ای. آزمون حفظ filter/sort بعد از تثبیت هر action انجام شده است؛ اصلاح این race به قرارداد useUrlState نیاز دارد.

## انتشار و بازگشت

PR مستقل **stacked با base branch174** لازم است؛ تا174 ادغام نشده، به main retarget یا squash نشود. قبل از انتشار تجمعی، head174/NEXT04، env Liara، guard178 و baseline روزانه را دوباره بررسی کنید. DDL، grants، env، relay، Vercel، حساب کاربری و دادهٔ مالی در این بسته تغییر نکرده‌اند. rollback: revert همین commit پس از rollback پلن174، بدون migration برگشتی. برای read smoke فقط metadata/count/time و SQL همان فیلتر استفاده شود؛ هیچ کلید یا رقم مالی واقعی در گزارش نیاید.

مهارت‌ها: iran-market-data پروژه، Supabase، Next.js، React Best Practices، verification-before-completion/systematic-debugging و agent-browser. ابزار: fetch anon/PostgREST، node/tsx، isolated Docker PostgreSQL/PostgREST، Chrome/agent-browser؛ CDP محلی فقط برای نصب ساعت مصنوعی چون command addinitscript این binary در اجرا پشتیبانی نشد. مرجع API: [Next15 router.refresh](https://nextjs.org/docs/15/app/api-reference/functions/use-router) و [Supabase pagination/range](https://supabase.com/docs/reference/javascript/range). تصمیم TTL و keyset بر اساس کد/آزمایش پروژه است، ادعای دستورالعمل الزامی منبع نیست.