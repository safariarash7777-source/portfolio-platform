# RECOVERY-01 — شاهد زندهٔ خط لولهٔ داده، P02

مأموریت کامل `RECOVERY-01-arash-site.md` با SHA256 `7BCC9DE9DA825CEF1900F53227C80952CD0ECB553C8632D99EE17E3722BE14D5` خوانده شد. این فایل ورودی P02 به SERVICE-MAP متعلق به P00 است؛ پایان بازیابی یا تحویل دمو محسوب نمی‌شود. زمان‌ها UTC مگر تصریح تهران؛ مشاهده ۳ اکتبر ۲۰۲۶، 09:30–09:43 UTC.

## توپولوژی و سلامت مشاهده‌شده

| مرحله | میزبان/نقش | شاهد فعلی | خلأ/اثر روی سایت |
|---|---|---|---|
| منابع بازار/اختیار/NAV/اعلان | BrsApi؛ سند رسمی کدال پس از اعلان | GET فقط‌خواندنی debug رله؛ stocks/index/gold-currency/options OK | هیچ probe جدید API تأمین‌کننده انجام نشده؛ صحت ارقام مستقل هنوز پذیرفته نیست |
| دریافت/زمان‌بندی | PaaS لیارا `arsadata.liara.run`؛ رله و jobها داخل همان process | refresh 09:28 و 09:33، push DB=200؛ Codal engine/archive و NAV/backfill وضعیت اجرایی دارند | active PaaS release SHA، replicas و env/timer flags دقیق هنوز UNKNOWN؛ فاصلهٔ ۵دقیقه با کد و دو refresh سازگار است |
| Gateway/REST/Auth | VPS لیارا `62.60.191.24/liara-preview` | Docker stage gateway/Auth/rest/storage/db همگی running/healthy، restartCount=0 در09:34 | نام stage/preview به معنی آزمایشی‌بودن مصرف آن نیست؛ سایت اصلی همین مسیر را انتخاب کرده است |
| دیتابیس عملیاتی | `portfolio-stage-db-1`، PostgreSQL17.6، PostgREST→`db:5432/postgres` | snapshot و Codal امروز append/update دارند؛ pg_cron حاضر ولی job/run هر دو **۰** | دریافت بازار در این DB از pg_cron جاری نمی‌آید؛ job واقعی داخل رله باید در نقشه ثبت شود |
| reader/API سایت | Vercel `portfolio-platform-fawn.vercel.app`؛ سند مأموریت main@51fd066/dpl_9su… | کد همان SHA: DB snapshot اول، relay fallback دوم، cache60s؛ `/api/market` global alerts side effect دارد | نسخه/host سند را P00/P01 زنده بازخوانی می‌کنند؛ این فایل ادعای دریافت تازه deployment از Vercel ندارد. API market برای تست فراخوانی نشده |
| صفحه اصلی بازار | `/market`, `/market/stocks`, `/market/funds`, `/market/options`, `/codal`, `/symbol/:id` | سند مالک امروز200 و767/335 نشان داده؛ DB09:39 نیز767/335 دارد | رابط main هنوز receipt را تازگی قیمت قلمداد می‌کند؛ patchهای178/214 روی Production نصب نیستند |

Docker versionهای مشاهده‌شده: Caddy2 با image pin، GoTrue v2.197.0، PostgREST v14.17، storage v1.77.6، Supabase Postgres17.6.1.167. فقط allowlist metadata و endpoint hostname/path خروجی داده شد؛ env، command line، credential و ردیف مشتری چاپ نشدند.

## هر خانواده چه وضعی دارد؟

| خانواده | شاهد امروز | زمان‌بندی/آخرین موفقیت | خرابی اثبات‌شده/اقدام کوچک |
|---|---|---|---|
| سهام/صندوق درون‌روزی | DB09:28:762/333؛ DB09:39:767/335؛ refresh طبیعی | main relay refresh حدود۵دقیقه؛ DB push200 | تغییر تعداد، قطع کامل یا مقصد اشتباه را ثابت نمی‌کند. ساعت/روز منبع در ردیف‌های stock/fund ذخیره نیست؛ receipt جای آن نشود |
| شاخص/EOD/breadth | eod lastDate=2026-09-30، rows1080؛ index lastJdate1405-07-08 | EOD پس از close طبق کد؛ ساعت/تقویم تهران. در09:39UTC شنبه هنوز جلسهٔ امروز تمام نشده | نبود row امروز پیش از EOD gap قطعی نیست. regime تاریخی65نماد به767نماد تعمیم داده نشود؛ official calendar/source coverage لازم است |
| تاریخچه طلا/ارز | latest history ingest09:13:12 امروز، هرکدام3082 ردیف | نوشتن history فعال مشاهده شد | stocks/funds history آخرین ingest15سپتامبر؛ symbol_history جدا تا30سپتامبر دارد. یکی‌گرفتن این جدول‌ها نادرست است |
| اختیار |1114 قرارداد،581call/533put؛ base وexpiry/OI موجود | options.lastOk09:33؛ همان چرخه طبیعی | size_contract در مستند رسمی وجود دارد اما mapper آن را حذف کرده؛ unit/valueUnit و clock نیز در snapshot غایب. Number(null/empty/bool)→0 defect کد است؛ عامل۱۰ِ ارقام واقعی هنوز بدون تطبیق raw همان چرخه پذیرفته نیست |
| NAV/حباب |25/335 NAV با date1405-07-11، time12:31–12:33تهران؛310 صندوق جاری در blacklist326عضوی | debug per-symbol updated25/failed1، cache25؛ دور NAV ساعتی طبق کد | همهNAVها کهنه نیستند. پوشش310مورد کم است؛ علت نمادبه‌نماد در state ذخیره نشده، category UNKNOWN. پاک‌کردن انبوه ممنوع؛ price source-clock غایب، حباب زنده بی‌شرط معتبر نیست |
| فید/پردازش کدال |N10:3709/486symbol؛N30:6129/346symbol، latest ingest09:23امروز | engine v3 آخر08:38،4insert/2parseFailed؛ archive09:24،13insert/1parseFailed. intervals کد3h/45min؛ flags دقیق UNKNOWN | فید موفق، تمام parserها را سالم نمی‌کند. ledger engine600، archive400 persistent؛ در representativeها parser_version=2 است، نه195v3 |

نمونه‌های کدال stored: فولاد N10:21/15parsed، N30:32parsed؛ فملی N10:21/16parsed، N30:46parsed؛ وبملت N10:18parsed؛ شستا N10:6parsed، اصلاحیه منتشرشده1405-07-10 امروز در DB هست؛ بپاس report0 با feed موجود. غیبت بیمه به‌تنهایی علت دقیق unsupported/parser/queue را مشخص نمی‌کند. آخرین period ذخیره فولاد/فملیN30 برابر2026-08-22 است؛ بدون تطبیق آخرین سند رسمی نمی‌گوییم گزارش جدید حذف یا جا مانده است.

فیلد `codal_feed.publish_date` از `date_title` (تاریخ عنوان/دوره) پر می‌شود، نه زمان انتشار. صفحه feed فعلی sent_date را نمایش می‌دهد؛ برای پژوهش تطبیق سند از این فیلد به عنوان publication استفاده نشود. raw.date_publish/time_publish و منبع رسمی مستقل بررسی شوند. سه URL رسمی کدال از ابزار web در این نوبت قابل دسترسی نبودند؛ دریافت دوباره از endpoint Brs یا backfill برای سبزکردن پذیرش انجام نشد.

## سهمیه و مانع نصب guard

live09:30/09:37: table/RPC غایب؛ `enforced=false`، `store.healthy=false`، `lastError.code=PGRST202`، emergency100 تمام‌شده، client disabled. debug.used=0/remaining9000 واقعی نیست؛ lifetime counters و process sent7165 مصرف تأییدشده روز نیستند. transport100ms، min108.65ms، scope process است؛ همه consumers/replicas و مرز reset/مصرف قبلی UNKNOWN.

[قوانین رسمی امروز](https://brsapi.ir/tsetmc-exchange-free-bourse-api-key-request/) حداقل فاصله را برای AIO50ms و حالت عادی300ms، محدودیت key وIP را مستقل بیان می‌کنند؛ حساب/سقف واقعی این کلید از پنل تأیید نشده. daily hard9000 تنظیم کد است و قرارداد تأمین‌کننده محسوب نمی‌شود. نصب178 با baseline نامعلوم دریافت را متوقف می‌کند؛ نصب مستقل یا آزمایشی روی Production انجام نشده است.

## سه رفع اول و وابستگی انتشار

1. **نمایش زمان/پوشش و خواندن ناقص:** reuse214/195 به patch کوچک سازگار main51fd؛ source clocks موجود propagate، ناموجودnull، receipt جدا، cache/deadline/error مستقل. با P01 ظاهر فعلی حفظ شود؛ کل پوسته195 cherry-pick نشود.
2. **اختیار و null/اندازه/واحد:** mapper همان endpoint، Number(null) defect، size_contract صریح و metadata واحد/زمان؛ بدون provider call اضافه. UI از P01 و sample raw چرخهٔ طبیعی برای numerical acceptance؛ تاریخچه overwrite نشود.
3. **سهمیه و NAV/Codal/history:** P00 ابتدا release/replicas/all consumers و baseline/reset معتبر، backup فعلی Liara +restore receipt و rollback نگهدارنده snapshot. سپس همان178 guard/phase28/env به‌صورت واحد، دو چرخه طبیعی؛ پس از آن ترمیم NAV نمونه و بررسی سند/queue/parser محدود. repair reader مستقل از این مانع ادامه می‌یابد؛ backfill/افزایشjob منتظر quota است.

شاهدهای metadata و queryها در همین پوشه/P02 namespace تحویل P00 می‌شوند. تأیید نهایی یعنی اثر روی همان دامنه و نمونه واقعی؛ این تشخیص پایان RECOVERY-01 نیست. هیچ خرید، provider change، financial rewrite، blacklist clear، live stop/install یا انتشار در این مشاهده انجام نشده است.
