# FOLLOWUP04 — ابزار ترمیم پوشش، تحویل آفلاین

**آمادهٔ بازبینی:** ابزار برنامه‌ریزی و شبیه‌سازی ادامه‌پذیر ساخته شده است. **اعمال نشده:** هیچ کندل یا NAV واقعی دریافت و هیچ دادهٔ سایت ترمیم نشده است. ابزار، حالت اجرای زنده ندارد.

## نسخه و مالکیت

- [PR198](https://github.com/safariarash7777-source/portfolio-platform/pull/198)، draft، شاخه `codex/followup04-coverage-20261002`.
- پایهٔ ثابت [PR178](https://github.com/safariarash7777-source/portfolio-platform/pull/178): `4ce06b3ffbd6b50125021faeb454fbf11c73b900`؛ main مشاهده‌شده `51fd0661d48d791ce8758a87828a81ce72cac6df`.
- commit پیاده‌سازی و fixtureهای ورودی: `9b0a978100723059f8363eccaba04b57a894a26c`؛ commitهای شواهد جدا هستند.
- برنامه در `scripts/ops/coverage-plan-core.mjs` و CLI در `scripts/ops/coverage-plan.mjs` است. هیچ worker جدیدی داخل رله نصب یا import نشده است.
- با مالک «داشبورد نرخ ارز» بر سر کلید، صف و counter مشترک178 هماهنگ شد. Hermes/FX، Auth، کدال و فایل‌های store/transport/candle-backfill/server دست‌نخورده‌اند؛ PR187 و پذیرش196 حفظ شده‌اند.

## وضع واقعی داده بر اساس شاهد ذخیره‌شده

این داده‌ها نمونهٔ ثبت‌شدهٔ incident دوم اکتبرند، نه خواندن تازه هنگام تحویل. `observedAt` دقیق در [ورودی واقعیِ metadata](followup04/inputs/observed-metadata.json) و [برنامهٔ تولیدشده](followup04/observed-plan/plan.json) آمده است.

- شاهد SQL تاریخچه در `2026-10-01T22:26:11.282258Z`: ۲۲سپتامبر ۱۰۷۳ نماد، ۲۳ و ۲۶ تا ۲۹سپتامبر هرکدام ۱ نماد، ۳۰سپتامبر ۱۰۸۰ نماد. این شمارش‌ها علت نبودن ردیف هر نماد را ثابت نمی‌کنند.
- شاهد snapshot در `2026-10-01T22:18:08.797061Z`: ۷۶۰ سهم و ۳۳۳ صندوق؛ ۲۵ فیلد NAV موجود. تازگی و نسبت معتبر این NAVها در آن خواندن تأیید نشده است. آمار قدیمی ۳۸/۳۳۳ شاهد مبدأ دیگری است و پوشش فعلی محسوب نمی‌شود.
- شمار blacklist قدیمی: ۳۰۸ صندوق فعال و ۳۲۵ عضو کل، با مشاهدهٔ ثبت‌شدهٔ ۱اکتبر. نام عضو، علت و تاریخ بررسیِ تک‌تک آن‌ها در بستهٔ پاک‌سازی‌شده حاضر نیست؛ تازه‌بودن این شمار در زمان تحویل تأیید نشده است.
- وضعیت backfill در `2026-10-01T22:24:27.6640563Z`: doneCount=1244 و queueRemaining=0، ولی reqDate=2026-09-30. این وضعیت پایان صف اولیه است، نه کامل‌بودن بازه و نه مصرف واقعی روز جاری.

فقط شناسهٔ عمومی «فملی» از شاهد DOM شناخته شده است؛ شناسه‌های کامل snapshot و دادهٔ نماد×روز در گزارش ذخیره نشده‌اند. بنابراین ماتریس واقعیِ خروجی **جزئی** است: ۱شناسه × ۹تاریخِ ۲۲…۳۰سپتامبر، هر ۹ سلول UNKNOWN. تعطیلی یا نبود معامله از روز هفته استنتاج نشده است. `universeComplete=false` و `missingUniverseDays` مانع ادعای پوشش کل بازارند. نبودن task واقعی در این خروجی به معنی نبودن شکاف نیست؛ دادهٔ لازم برای تصمیم غایب است. NAV/blacklist خالیِ این ورودی به معنی پاک‌سازی یا نبودن اعضای واقعی نیست.

## قرارداد برنامه و شبیه‌سازی

هر سلول یکی از covered / holiday / no-trade / unsupported / gap / unknown است. سرآیند یا ردیف به‌تنهایی به‌عنوان تقویم رسمی پذیرفته نمی‌شود. تعطیلی، نبود معامله و قابلیت ابزار به شاهد صریح و منبع/زمان نیاز دارند؛ تناقض هم UNKNOWN می‌ماند. GAP فقط وقتی ساخته می‌شود که معاملهٔ نماد، روز باز رسمی، پشتیبانی type2 و خواندن کاملِ بدون ردیف، شواهد صریح داشته باشند. `verified` یک ادعای ورودیِ اپراتور است و باید واقعاً با سند تطبیق داده شود؛ ابزار اصالت سند بیرونی را خودکار تأیید نمی‌کند.

هر نماد با GAP یک task کندل روزانهٔ تعدیل‌نشده دارد؛ پارامتر range روی endpoint اختراع نشده است، دامنهٔ ترمیم در metadata محلی محدود می‌شود. زیرنماد ختم به رقم فارسی/عربی/لاتین و حق‌تقدم حذف می‌شوند. type3، دادهٔ intraday و مقادیر مالی مصنوعی تولید یا وارد history واقعی نمی‌شوند.

`initialState.done` حفظ می‌شود و task بازه را پنهان نمی‌کند. checkpoint جدا فقط metadata مصنوعیِ پوشش، eventهای افزایشی، scope digest و کران قبلیِ lease را نگه می‌دارد؛ با done اولیه یکی نیست. پاسخ خالی، ناقص، series ناسازگار یا خطا، task را تمام‌شده نمی‌کند. ادامه با scope دیگر، ردیف تکراری یا counter بازنشانی‌شده رد می‌شود. replay کامل هیچ درخواست یا ردیف تازه ندارد.

NAV: اعضای blacklist حفظ می‌شوند؛ علت/تاریخِ نامعلوم null است. فقط metadata پاسخ مثبت، واحد ریال، نسبت معتبر و زمان منبع حداکثر۲۴ساعت، همراه عضویت فعال cs_id68 و قابلیت تأییدشده می‌تواند valid_current باشد. NAV صفر، کهنه، آینده یا نامعلوم جاری محسوب نمی‌شود. همهٔ candidateها deferred هستند و plannedNAVRequests=0 است؛ هیچ NAV retest در این بسته وجود ندارد.

شبیه‌سازی از کلاس واقعی `PersistentDailyBudget`، adapter اعتبارسنجی‌شدهٔ `makeSupabaseLeaseStore` و factory صف۱۰۰ms خود PR178 استفاده می‌کند. RPC و پاسخ دریافت، fixture محلی و صریحاً SYNTHETIC هستند. بودجهٔ زنده/خارجی را نمی‌پذیرد، counter دوم یا کلید جدید مستقر نمی‌کند. این **mock RPC** است، نه پذیرش PostgreSQL یا ظرفیت تأمین‌کننده؛ شواهد واقعی sandbox PostgreSQL178 در گزارش خودش محفوظ‌اند و به این بسته تعمیم داده نشده‌اند.

## بودجه و شاهد قبل/بعد

| محیط | قبل | بعد / نتیجه |
|---|---|---|
| metadata واقعیِ ذخیره‌شده | پوشش کامل نماد/تاریخ و علت نامعلوم | ۹سلول UNKNOWN جزئی؛ صفر درخواست، بدون ادعای ترمیم |
| fixture مصنوعی CLI | ۲ GAP، ۲ holiday، ۲ unsupported | ۲ task با ۲ دریافت شبیه‌سازی‌شده؛ ۲ metadata row مصنوعی |
| replay همان checkpoint و ledger | ۲ metadata row | ۲ ردیف حفظ‌شده، صفر دریافت/duplicate جدید |
| بودجهٔ مشترکِ نامعلوم | lease تأییدنشده | صفر send و remaining=null |
| توقف وسط صف / restart / روز تازه | task ناتمام باقی | ادامه فقط با baseline مصنوعی معتبر؛ lease قبلی صفر نمی‌شود |

بودجهٔ مثال مصنوعی ۲ درخواست برای همان روزِ مصنوعی است؛ ظرفیت واقعی نیست. حداقل برنامه = تعداد نماد دارای GAP؛ کران تحت فرض صریح تلاش‌ها = تعداد task × maxAttempts. هر retry هم از counter مشترک مصرف می‌کند. lease سوخته، همهٔ تولیدکنندگان FX/market/nav/codal و مصرف مستقیم بیرون counter باید در ظرفیت واقعی لحاظ شوند. declaredDailyRequestCap فقط سقف پیشنهادی دامنه است؛ مجوز مستقل ارسال نیست. daily live capacity، بودجهٔ مجاز NAV و ETA واقعی **UNKNOWN/null** باقی‌اند. ۱۰۰ms در شبیه‌سازی ≥۵۰ms اخطار مستقیم کاربر است؛ این شاهد هماهنگی همهٔ replicaها یا ظرفیت روزانهٔ کلید نیست.

محدودهٔ ورودی حداکثر۳۶۶روز و۲۰۰هزار سلول است؛ دامنهٔ بزرگ‌تر به بسته‌های مصوب کوچک‌تر تقسیم شود. شمار درخواست/تلاش و cursor، چیزی به تاریخچهٔ واقعی اضافه نمی‌کنند. شناسه‌های قدیمی DB در این بسته قابل حذف نیستند چون مسیر نوشتن DB وجود ندارد؛ پذیرش بعدی باید ID-set قدیمی با cutoff ثابت و پوشش واقعی را دوباره مقایسه کند.

## اجرای قابل بازتولید

```powershell
node scripts/ops/coverage-plan.mjs --input docs/ops/seasonal-program/followup04/inputs/observed-metadata.json --out reports/coverage-observed
node scripts/ops/coverage-plan.mjs --input docs/ops/seasonal-program/followup04/inputs/synthetic-metadata.json --out reports/coverage-synthetic --simulate docs/ops/seasonal-program/followup04/inputs/synthetic-responses.json
node scripts/ops/coverage-plan.mjs --input docs/ops/seasonal-program/followup04/inputs/synthetic-metadata.json --out reports/coverage-replay --simulate docs/ops/seasonal-program/followup04/inputs/synthetic-responses.json --checkpoint reports/coverage-synthetic/checkpoint.json --ledger reports/coverage-synthetic/simulated-shared-ledger.json
node --test relay/coverage-plan.test.mjs scripts/ops/coverage-plan.test.mjs
```

برای ادامه، فایل ledger پایدار اجباری است؛ fixture اولیهٔ counter نباید دوباره به‌جای ledger مصرف‌شده استفاده شود. CLI هیچ `--live` یا credential نمی‌گیرد. خروجی plan/CSV و simulation/checkpoint/ledger محلی است. metadata CSV، سلول فرمولی ورودی را هم خنثی می‌کند.

## آزمون و ابزار

۱۴ آزمون رفتاری/CLI، صفر fail/skip: شواهد هر کلاس، تناقض/خواندن ناقص، نماد ممنوع، blacklist و NAV کهنه/صفر/عضویت نامعلوم، صفر ارسال در baseline نامعلوم، دو consumer مشترک، قطع store، توقف و resume/restart/روز جدید، response ناقص، سقف تلاش، replay و رد counter عقب‌رفته. آزمون CLI با trap واقعی fetch/socket، تلاش شبکه را صفر مشاهده کرد.

core=1091 PASS و calc=106 PASS، صفر fail/skip؛ کل test:relay، lint و build محلی و secret scan قبول شدند. تعداد core متفاوت از PR195 است چون پایه178 قدیمی‌تر و ثابت است؛ شمارها جمع یا به نسخهٔ دیگر منتقل نمی‌شوند. build با تنظیمات placeholder انجام شد. گزارش test خامی که ممکن است خروجی fixture مالی داشته باشد منتشر نشده؛ فقط [قراردادهای metadata](followup04/validation/contracts.txt) و [خلاصهٔ بررسی](followup04/validation/summary.json) منتشر می‌شود.

مهارت `iran-market-data` و مرجع کامل BrsApi خوانده شد. بازبینی زندهٔ صفحهٔ عمومی قوانین در این نوبت 502 داد؛ حداقل۵۰ms از اخطار مستقیم تحویلی آرش است، نه ادعای واکشی موفق امروز. ابزارهای استفاده‌شده: Git/GitHub، Node/node:test، ESLint و Next build؛ بدون عامل/مدل جدید. اسناد مرکزی به مالک PM تحویل می‌شوند و موازی ویرایش نشده‌اند.

## اقدام دقیق اپراتور و گیت انتشار

1. **خروجی فقط‌خواندنی کامل و زمان‌دار:** اپراتور script `scripts/ops/coverage-metadata-export.sql` را پس از تطبیق schema روی مقصد درست بازبینی کند؛ اجرا در این بسته انجام نشده است. خروجی psql برای هویت‌ها/ردیف‌ها کامل است؛ SELECT بریدهٔ PostgREST نباید absent تلقی شود. snapshot/state و blacklist کامل، فقط metadata و بدون lastEmptySample.body یا کلید، لازم‌اند. سرآیند واحد و تاریخ منبع نیز از سند رسمی ثبت شوند.
2. **شاهد تعطیلی/معامله/قابلیت:** calendar رسمی و metadata واقعی نماد/روز و ابزار از منابع مجازِ موجود جمع و به input اضافه شود. وجود نماد در snapshot امروز، معامله در همهٔ روزهای گذشته را ثابت نمی‌کند؛ unknownها نباید با حدس gap شوند.
3. **پیش‌نیاز178:** مصرف قبلی تمام مصرف‌کنندگان کلید و پنجرهٔ reset تأمین‌کننده با شاهد معتبر مشخص شود؛ remaining یا sentSinceRestart در debug شاهد baseline نیست. نصب هماهنگ migration/guard/enforcement و پذیرش تک‌نمونهٔ178 توسط مالک انتشار مطابق RELEASE-brsapi-budget.md لازم است. این بسته آن را نصب یا فعال نکرده است.
4. **تصویب دامنه و ظرفیت:** پس از سه مرحلهٔ قبل، plan دقیق نماد/روز، سقف تلاش، سهم هر consumer و ETA واقعی تهیه و بازبینی شود. اتصال plan به worker موجود، درج append-only با ignore-duplicates، checkpoint پایدار و بازآزمایی محدود واقعی، مرحلهٔ مستقل بعدی است؛ این CLI حتی بعد از پذیرفته‌شدن178 هم حالت live ندارد. NAV retest همچنان واگذاری مستقل لازم دارد و blacklist پاک نمی‌شود.
5. **پذیرش واقعی:** قبل/بعد پوشش نماد×روز، برابری ID-set قدیمی با cutoff ثابت، عدم duplicate، unit/source date، حفظ snapshot در توقف، و رفتار نمای عمومی/خصوصی ثبت شود. تا آن زمان ادعای «داده در سایت اصلاح شد» ممنوع است.

rollback این ابزار: استفادهٔ برنامهٔ محلی را متوقف و artifact/checkpoint/ledger را حفظ کنید؛ state واقعی تغییر نکرده است. rollback عملیات آینده نباید counter را صفر، blacklist را پاک یا تاریخچه را update/delete کند؛ در خطا worker متوقف و snapshot سالم حفظ شود. خرید هاست یا سهمیه از این شواهد توجیه یا انجام نشده است.

## ارتباط با گزارش دیده‌نشدن داده

گزارش incident موجود را حفظ کنید: دادهٔ عمومی سهام/صندوق روی Liara مشاهده شده، نقص پوشش تاریخی/NAV و تأخیر یک نمونهٔ /data حدود۲۶ثانیه جدا هستند. خطای Auth در middleware مسیر خصوصی، مسئلهٔ مستقلِ مالک ورود است. دو نقص مالی null/واحد در PR195 و بازبینی محدود196 آماده شده‌اند؛ اصلاح یا CI آن‌ها اثبات رفع Production نیست. همهٔ تغییرات این بسته محلی/PR draft هستند؛ محیط واقعی، سرویس، DB، دریافت اختیاری، خرید و انتشار تغییر نکرده‌اند.
