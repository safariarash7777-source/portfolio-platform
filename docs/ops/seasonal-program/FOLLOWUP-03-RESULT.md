# FOLLOWUP-03 — نتیجهٔ جداسازی منابع و زمان بارگذاری

2026-10-01. **BUILD/LOCAL ACCEPTANCE PASS؛ انتشار و پذیرش زنده OPEN.** این تحویل روی سایت اصلی نصب نشده است.

## مبنا، مالکیت و محدوده
- شاخه `codex/followup-latency-20261001` در worktree مستقل؛ base دقیق PR182=`e5740be93f666dc76a605ccef190f710767ab748`؛ PR182 روی PR174=`95cfa3410a97ac0d98cdefcb6671d4cfcb668646` است. main هنگام شروع=`51fd0661d48d791ce8758a87828a81ce72cac6df`. [PR187](https://github.com/safariarash7777-source/portfolio-platform/pull/187)؛ commit کد و شواهد `4687ceaa05d57233c1d718453016f3f1171aa353`. head نهایی پس از ثبت metadata فقط در handoff/CI تحویل ثبت می‌شود تا ارجاع به hash خود سند ایجاد نشود.
- مالکیت اطلاع داده شد: API عمومی بازار، بانک داده و reader عمومی؛ Auth/Storage/Navbar/tokens، reader پرونده/دارایی و relay تغییر نکردند. اسناد مرکزی در مالکیت هماهنگ‌کننده‌اند؛ ردیف پیشنهادی ثبت این نتیجه به او ارسال می‌شود.
- هیچ merge، migration، تغییر env مشترک/Production، نصب زیرساخت، درخواست BrsApi، backfill یا پیام به عضو واقعی انجام نشده است.

## علت و تغییر
1. API قبلی `Promise.all(getMarketData,getIrMarket)` داشت؛ fetch جهانی مهلت نداشت و ارزیابی هشدار نیز می‌توانست پاسخ را نگه دارد. اکنون ارائهٔ منبع جهانی حداکثر2s (fetch/body1.9s)، ایران حداکثر5s برای کل DB→fallback؛ fallback پس از abort آغاز نمی‌شود. API همان `crypto/goldGlobal/fetchedAt/ok/ir` را نگه می‌دارد و `partial` و `availability` مستقل با `sourceAt/readAt` می‌دهد؛ HTTP200 جزئی موفقیت همه منابع محسوب نمی‌شود. cache جهانی فقط پاسخ معتبر را جایگزین می‌کند؛ شکست با timestamp قدیمی/بدون عدد تازه، cooldown30s و آخرین دادهٔ معتبر اعلام می‌شود.
2. `/data` پیش‌تر اسکن کل avgVolume و ن۳۰/ن۱۰ را قبل از جدول انجام می‌داد. اکنون جدول اسنپ‌شات مستقل است؛ endpoint ضروری `/api/data/analytics?kind=volume|monthly|quarterly` فقط هنگام انتخاب همان فیلتر خوانده می‌شود. هر kind مهلت15s دارد؛ client18s، abort هنگام تغییر فیلتر/خروج، retry صریح و وضعیت خواندن/خطا/کهنه. «هنوز خوانده نشده» با «۰ نماد پوشش» اشتباه نمی‌شود. شمارش و انتخاب50نماد پرست بنیادی و صفحه‌بندی100ردیفی UI همان رفتار قبلی‌اند؛ حجم scan حذف نشده است.
3. avgVolume در همین مسیر، روی short-page/cap یا شکست وسط scan نتیجه ناقص را کامل cache می‌کرد. به keyset+fence همان reader182 وصل شد؛ volume non-null،45/20روز تقویمی،30/10روز معاملاتی،حداقل20/7روز،dedupeبزرگ‌ترینid و حذف آخرین روز برای پنجره10 تغییر نکردند. map فقط از مجموعهٔ کامل ساخته می‌شود؛ stale فقط آخرین مجموعهٔ کامل، با شمارش و زمان قبلی. ن۳۰/ن۱۰ نیز مهلت کل scan و body دارند؛ فرمول و تقدم اصلاحیه همان182 است.
4. در HTTP واقعی build محلی، انتظار پنهان `/market` پیدا شد: `TodayMarket→buildWatchlist` حتی داخل details بسته، scan نمادها را شروع می‌کرد. بخش جهانی، روندها و TodayMarket زیر Suspense مستقل قرار گرفتند؛ ارائه TodayMarket15s محدود است. موتور watchlist و محاسبات تغییر نکردند. مهلت نمایش، کار قدیمیِ watchlist را کاملاً لغو نمی‌کند؛ این محدودیت و fan-out قدیمی پایین ثبت شده است.
5. fetch دو مصرف‌کننده homepage حداکثر7s است؛ ticker در شکست کلی، دادهٔ معتبر قبلی را پاک نمی‌کند. قرارداد زمان/تومان/null/NAV174 و refresh182 محفوظ است.

## اندازه‌گیری پیش و پس
بودجه **قبل ویرایش کد** در [BUDGET](./followup03-evidence/BUDGET.md) ثبت شد. metadata فقط‌خواندنی Liara در12:00Z: stocks760/funds333،history45باvolumeغیرnull29610،ن۳۰5981،ن۱۰3638. این‌ها شمارش‌اند؛ هیچ عدد مالی یا رکورد کاربر از DB خوانده نشد. fixture همین تعداد و محتوای ساختگی دارد، **نه JSON هم‌اندازهٔ Production**. شبکهٔ مصنوعی DB40ms/request،جهان4000ms،cap1000؛ دو worker یکسان قبل/بعد.

| مسیر/شرط | n سرد / گرم | p50 سرد قبل→پس (ms) | p95 سرد قبل→پس (ms) | p50/p95 گرم قبل→پس (ms) |
|---|---:|---:|---:|---:|
| مسیر دادهٔ اولیه بانک |20/480|1669.44→98.47|1746.97→125.33|10.73/26.60→0.04/0.16|
| ارائه بازار با جهان4000ms |20/480|4008.13→1910.64|4018.05→1916.46|0.02/0.09→0.08/0.33|

p95=nearest-rank. گرم API پس از شکست از cooldown استفاده می‌کند؛ معادل latency خواندن تازهٔ موفق نیست. این اعداد **p95 Production/HTML/browser نیستند**. نمونه26.4s ممیزی قبلی فقط یک مشاهده است. همه20نمونهٔ پس، تحلیل کامل جدا داشتند: avg987نماد از29610ردیف،ن۳۰5981،ن۱۰3638؛ p50/p95 تحلیل کامل جدا1527.48/1630.53ms. هزینه scan منتقل شده، حذف نشده. [baseline](./followup03-evidence/baseline.json) / [after](./followup03-evidence/after.json).

پذیرش HTTP build واقعی محلی، تک‌نمونه و مصنوعی:
- جهان کند/ایران سالم:1956.48ms،stocks760/funds333 محفوظ،partial=true؛ هر دو سالم93.42ms.
- قطع هر دو منبع:78.31ms،دادهٔ کامل قبلی و **همان دو timestamp**؛ هر دو availability=stale.
- DBبی‌پاسخ با cache:5047.18ms؛ بدون cache5047.86ms،ir=null صریح،cryptoسالم1 وpartial=true،بدون loadingبی‌پایان.
- SSRبا جهان قطع: عنوان ایران216.52ms،بدنه کامل3422.22ms و خطای مستقل جهانی. نخستین آزمون SSRپیش از جداکردنTodayMarket5250ms بود و FAIL شد؛ همان شکست علت اصلاح boundary شد. final assertion زیر1500ms PASS. browser User-Agent عادی و stream تکه‌ای اندازه‌گیری شد.
- درخواست kindخصوصی/ناشناخته (`holdings`)400. API analytics هیچ Cookie/user-id/service-role/queryprivate ندارد.
شواهد [HTTP](./followup03-evidence/http-result.json)،[cold](./followup03-evidence/http-cold-db-error.json).

## آزمون و صحت
- Chrome/Next production build:8سناریو PASS — initial100ردیف/760نماد و333صندوق بدون درخواست analytics؛ خطای وسط فصلی cold، پایان loading و retry؛ فصلی کامل3638،ماهانه5981،volume29610؛ موبایل390بدون page overflow؛ staleماهانه50نتیجه با read timestamp اصلی؛ volumehung با deadline15s و آخرین کامل100ردیف. وضعیت «کامل نشد» هرگز نبود واقعی DB تلقی نمی‌شود.
- آزمون مستقل controls دسکتاپ: جستجو `نمونه1` و sort قیمت هنگام رسیدن پاسخ دیرتر حفظ شدند؛ فیلتر ماهانه11نتیجه در همین fixture. آزمون control ابتدا در موبایل به دلیل نقطهٔ click پوشیدهٔ ابزار ناموفق بود؛ با viewport1440/موقعیت قابل دسترس دوباره اجرا شد. **پذیرش تعامل sortموبایل از این شاهد ادعا نمی‌شود**؛ overflow/نمایش موبایل پاس است.
- unitactual bounded readers:760/333،تومان،null NAV/change،sourceDate،stale timestamp،cooldown وعدم Cookie. volume تحتcap317:29610ID باSHA256مجموعهٔ کامل برابر،987map،خطای وسط503 دادهٔ کامل قبلی را نگه داشت؛ warmبدون درخواست تازه. deadline provider غیرهمکار،body معطل وparentcancel (صفر درخواست با abortقبلی) پاس.
- core1246/0fail/0skip؛calc106/0fail/0skip؛typecheck،lint بدونwarning،build،secret scan وSQLvalidation پاس. پس از stage فایل‌های تازه، اسکن781فایل نیز پاس شد؛ شاهد CI exact-head در handoff تحویل ثبت می‌شود. این تست‌ها جای پذیرش زنده یا Auth دوکاربره نیستند.

## scope،provenance وcache
| داده | scope/cache | provenance/invalidation |
|---|---|---|
| ایران | public anon/RLS؛60s perprocess؛ single-flight؛failed cooldown30s | sourceAt ازsnapshot؛readAt جدا؛DB→relay قدیمی در مجموع5s؛ env ثابت همین process، restart/deploy invalidate |
| جهانی | public source؛5m perprocess؛cold/error30s retry | fetchedAt پاسخ معتبر؛failure زمان منبع را جلو نمی‌برد؛ ارائه2s حتی با alert evaluation قدیمی |
| حجم | public anon/RLS؛10m complete-only | table/window/filter/min-days/version1 وcoverage rows/pages/fence/completedAt؛ تغییر env یا کد نیازrestart؛روز پنجره در خواندن تازه طبقUTC قبلی |
| ن۳۰/ن۱۰ | دوreader public مستقل؛1h complete-only | report_kind/version1،زمان پایان scan،فیلتر/تقدم اصلاحیه محفوظ؛restart/TTLinvalidate |
| clientanalytics | فقط همان mount عمومی؛TTLkind؛reload/unmountپاک | no localStorage/global usercache؛ تغییرkind درخواست قبلی abort؛ expiry هنگام انتخاب مجدد/retry سنجیده می‌شود |
| watchlist/presets/alerts خصوصی کاربر | همان cookie Supabase/RLS قبلی | cache مشترک تازه برای حساب/دارایی/مجوز ساخته نشد؛ cache source بازار شامل رکورد حساب نیست |

کش ماندگار مشترک ساخته نشده است؛ cold serverless ممکن است scanکامل را دوباره بخواند. API analytics `Cache-Control:no-store` و503برایcold error،200برایstaleدادهٔ کامل دارد. بعد از timeout، partialscanمنتشرنمی‌شود؛ UIscope هشدار جدا دارد. Refreshپنج‌دقیقه‌ای182رویstock/fund تغییری نکرد؛ analyticsفعال به‌صورت دائمی polling نمی‌کند.

## نقص‌های باقی و گیت‌ها
| مورد | طبقه‌بندی / اقدام |
|---|---|
| bulkReturns PAGE50000/cap1000 و break/cachepartial | نقص درست‌بودن reader در SSRصندوق؛ در /data یا /api/market یا overview استفاده نمی‌شود. **UNFIXED،کار جدا**؛ بازده ناقص را معتبر تلقی نکنید. |
| getSymbolHistory روز/CSVبزرگ و dedupe چندversion | نقص coverage وقتی querylimit ازcap عبور کند یا برایwindowمطلوب نسخه کافی نباشد؛ مسیر download/terminal/watchlist. **UNFIXED**؛ default400 rawlimit800 زیرcap1000 است اما پوشش تمام400روز با duplicateها تضمین نشده. |
| TodayMarket→watchlist fan-out؛cache نتیجه حتی با historyهایfailed | نقص reader/coverage قدیمی؛ از مسیر نمایش اولیه خارج و ارائه15s محدود شد؛ engine/cachewatchlist تغییر نکردند. underlying خواندن قدیمی با این مهلت کاملاً cancelنمی‌شود. نیاز ممیزی coverage/watchlist جدا؛ این patch صحت رژیم تاریخی را بیش از قرارداد قبلی ادعا نمی‌کند. |
| روندهای overview و maxRows | readerهای legacy bounds/cap خود را دارند؛ این بسته فقط presentation boundary را جدا کرد؛ completeness تازه برای آن‌ها ادعا نمی‌شود. |
| Auth/private read latency | مالک جدا؛ هیچ cache مشترک یا bypass اضافه نشد. قبول A/B/ورود واقعی این تسک نیست. |
| quota178 | gate انتشار همان بسته:baseline مصرف/reset معتبر+phase28+تست failclosed؛ آخرین شاهد قبلی NOT_APPLIED. در این تسک نصب/درخواست اختیاری نشد. |
| انتشار | ترتیب174→182→اینPR پس از CI/review؛ install178 و env واقعی/Preview scope،پذیرش دو چرخهٔ زنده182،پوشش تاریخچه/NAV،Auth وintegration باز. هیچ merge خودکار مجاز نیست. |

در نتیجهٔ ممیزی اصلی، نبود همهٔ تاریخچه «از دست‌رفتن کل انتقال» ثابت نشد: ID/count/digestسه جدول درcutoffبکاپ matchبود؛ gapجمع‌آوری پیش از انتقال،NAVناقص،readercap وrefresh چند علت مجزا بودند. digestکل محتوای مالی به علت timeoutپذیرفته نشده؛ این تحویل latency آن شاهد را به صحت مالی ارتقا نمی‌دهد. گزارش اصلی در بستهٔ `reports/market-data-delivery-20261001` باقی است.

## ابزار و تحویل هماهنگ‌کننده
قواعد CLAUDE/iran-market-data،Next/Reactbest-practices،UI-UXprogressive/error،systematic-debugging/verification قبلی؛Gitworktree وAPIرسمیGitHub؛Node/tsx وChromeagent-browser؛SSH/psql فقطcountmetadataREADONLY. dependency/plugin/migration تازه لازم نشد. skillUI ابتدا Pythonسیستم پیدا نکرد؛ ازPythonهمراهCodex خوانده/اجرا شد؛طرح/توکن موجود حفظ شد.

ردیف پیشنهادی فهرست اسناد مرکزی (فقط هماهنگ‌کننده ثبت کند): `FOLLOWUP-03-RESULT — زمان بارگذاری منابع عمومی،benchmarkهم‌حجم وگیت‌های انتشار؛ تابع174/182/178`.
