# یافته‌ها — با شاهد

> هر ردیف یا شاهد دارد یا `UNVERIFIED` است. تاریخ: ۱۴۰۵/۰۶/۰۲.

## F-01 · لایهٔ ورودِ داده **داخلِ همین مخزن** است

`relay/` یک سرویسِ Node مستقل است که روی **لیارا (داخل ایران)** اجرا می‌شود،
چون منابعِ ایرانی به IPِ خارج ۴۰۳ می‌دهند و سایت روی Vercel است.

```
tgju/fipiran/brsapi ─▶ relay (ایران) ─push─▶ Supabase ◀─read─ سایت (Vercel)
```

شاهد: `relay/README.md` · `relay/liara.json` (`platform: node, port: 3400`).

**چرا مهم است:** گزارش‌های قبلی نوشته بودند «رله بیرون از این مخزن است و
دوره‌اش تضمین‌شده نیست». **نادرست است.** کدِ رله اینجاست و تناوب‌هایش در کد
عدد دارند (F-02). این تفاوت، پایهٔ کلِ Source Registry را عوض می‌کند.

## F-02 · تناوبِ واقعی — از کد، نه از حدس

| کار | تناوب | شاهد |
|---|---|---|
| اسنپ‌شاتِ بازار | **۵ دقیقه** | `relay/server.mjs:47` `CACHE_MS = 5*60*1000` |
| NAV صندوق‌ها | **۱ ساعت** | `relay/server.mjs:272` `NAV_REFRESH_MS` |
| متادیتای نماد | **هفتگی** | `relay/server.mjs:434` `META_REFRESH_MS` |
| پلِ کدال | **۴۵ ثانیه** | `relay/server.mjs:1144` |
| بک‌فیلِ کندل | **۱۰ دقیقه** | `relay/server.mjs:1150` |
| تاریخچهٔ بازار | **۳۰ دقیقه** | `relay/server.mjs:630` `HISTORY_INTERVAL_MS` |
| هشدارها (Vercel) | روزانه ۰۶:۰۰ | `vercel.json` |
| همگام‌سازیِ تلگرام | روزانه ۰۳:۰۰ | `vercel.json` |

## F-03 · سیاستِ نگه‌داری از قبل وجود دارد — و فقط برای یک جدول

`ir_market_history` هر ۳۰ دقیقه یک ردیف می‌گیرد و **به ۱۸۰ روز هرس می‌شود**
(`relay/server.mjs:667` `HISTORY_RETENTION_DAYS`, پیش‌فرض ۱۸۰؛ حذف در خطِ ۶۷۵).

هیچ جدولِ دیگری سیاستِ نگه‌داری ندارد. این یعنی پرسشِ «چه چیزی را نگه داریم»
برای بقیهٔ جدول‌ها **هرگز پاسخ داده نشده**، نه اینکه پاسخش «همه‌چیز» باشد.

## F-04 · دادهٔ نوشته‌شده که هیچ‌کس نمی‌خوانَد

| جدول | نویسنده | خواننده | حکم |
|---|---|---|---|
| `ime_physical_trades` | `relay/ime.mjs` | **هیچ** | دادهٔ یتیم |
| `ime_certificate_history` | `relay/ime.mjs` | **هیچ** | دادهٔ یتیم |
| `ime_snapshots` | **هیچ** | **هیچ** | جدولِ مرده (فقط DDL) |
| `macro_first_print` | **هیچ** | **هیچ** | جدولِ مرده (فقط DDL) |
| `macro_revisions` | **هیچ** | **هیچ** | جدولِ مرده (فقط DDL) |

روشِ سنجش: `grep -rn "<table>" app/ lib/ components/` بدونِ فایل‌های تست، و
`grep -l "rest/v1/<table>" relay/*.mjs`.

⚠️ «یتیم» یعنی امروز مصرف‌کننده ندارد — **نه** اینکه باید حذف شود. بورسِ کالا
(IME) ورودیِ طبیعیِ Sleeveِ کالایی است؛ حکمِ درست «مصرف‌کننده بساز یا نوشتن را
متوقف کن» است، و این تصمیمِ مالک است.

## F-05 · تصحیحِ اشتباهِ خودم — دو الگوی دسترسیِ داده وجود دارد

اولین اسکنِ من فقط `.from("table")` را شمرد و نتیجه گرفت `symbol_history`،
`index_history`، `ir_market_history` و `fx_rates` خوانده نمی‌شوند. **غلط بود.**
این چهار جدول با `fetch` مستقیم به `/rest/v1/<table>` خوانده می‌شوند:

- `lib/core/trend.ts:96` → `ir_market_history`
- `lib/core/indexTrend.ts:71` → `index_history`
- `lib/fx/dataLoader.ts` → `fx_rates`
- ۶ ارجاع به `/rest/v1/symbol_history`

هر ممیزیِ بعدی باید **هر دو** الگو را بشمارد، وگرنه جدولِ زنده را مرده اعلام
می‌کند. F-04 پس از این تصحیح بازشماری شد.

## F-06 · شِمای مخزن ناقص است — ولی نه آن‌طور که به‌نظر می‌رسد

هشت جدولِ در حالِ استفاده در `sql/*.sql` تعریف نشده‌اند:
`portfolios`, `portfolio_versions`, `portfolio_snapshots`, `holdings`,
`transactions`, `risk_assessments`, `audit_log`, `waitlist`.

هر هشت‌تا در `sql/archive/` هستند (`supabase_schema.sql` و سه فایلِ پرتفوی).
پس شِما **کامل است**، ولی در پوشه‌ای که نامش می‌گوید متروک است. `sql/` از
`phase5` شروع می‌شود؛ فازهای ۱ تا ۴ همان‌هایی‌اند که در archive نشسته‌اند.

**ریسک:** تستِ قراردادیِ `lib/desk/sources.test.ts` (روی شاخهٔ #115) فقط
`sql/*.sql` را می‌خواند و `archive/` را نمی‌بیند — یعنی یک جدولِ کاملاً واقعی
از نظرِ آن تست «وجود ندارد».

## F-07 · سطحِ کارِ سیستم

| شمارش | مقدار | شاهد |
|---|---|---|
| صفحه (`page.tsx`) | ۴۴ | `find app -name page.tsx` |
| مسیرِ API (`route.ts`) | ۲۸ | `find app/api -name route.ts` |
| جدولِ تعریف‌شده در `sql/` | ۵۳ | `grep create table` |
| جدولِ ارجاع‌شده در کد | ۳۸ (`.from`) + ۷ (REST) | F-05 |
| منبعِ بیرونی | ۳ بازار + ۲ سرویس | F-08 |

## F-08 · منابعِ بیرونیِ واقعی

| منبع | چه می‌دهد | مصرف | شاهد |
|---|---|---|---|
| `tgju.org` (`ajax.json`) | طلا، سکه، ارز (ریال→تومان) | `ir_market_snapshots`, `fx_rates` | `relay/README.md` |
| `fund.fipiran.ir` (`fundcompare`) | NAV و بازدهِ ۸ صندوقِ طلا | `ir_market_snapshots` | `relay/README.md` |
| `Api.BrsApi.ir` (کلیددار) | سهام، کدال، آپشن، IME، کندل | ۶ جدول | `relay/server.mjs`, `codal.mjs`, `ime.mjs`, `options.mjs`, `candle-backfill.mjs` |
| `api.telegram.org` | ارسال/وبهوک | `telegram_links`, `content_hub` | `grep fetch` |
| `api.resend.com` | ایمیل | — | `grep fetch` |

⚠️ محدودیتِ ثبت‌شده در `relay/README.md`: فایروالِ brsapi به User-Agent حساس
است و UAی پیش‌فرضِ Python/Go را با **بنِ حداقل دوساعتهٔ IP** پاسخ می‌دهد.

## F-09 · وضعیتِ زنده — `UNVERIFIED`

این محیط `.env` واقعی ندارد و به Supabase، لیارا یا Vercel وصل نیست. پس این
موارد **اندازه‌گیری نشده‌اند** و حدس هم زده نمی‌شوند:

- آیا رله همین حالا روی لیارا بالاست
- آخرین `captured_at` هر جدول
- حجمِ واقعیِ ردیف‌ها و رشدِ ذخیره‌سازی
- اینکه آیا سهمیهٔ روزانهٔ brsapi مصرف می‌شود یا نه
- اینکه آیا دو cronِ Vercel واقعاً اجرا می‌شوند

هر کدام یک بستهٔ کاریِ «اندازه‌گیری» لازم دارد، نه یک فرض.

## F-10 · بزرگ‌ترین گیتِ کلِ طرح: چهار migration روی Production اجرا نشده‌اند

| فایل | وضعیت طبقِ `docs/MIGRATION-LEDGER.md` |
|---|---|
| `phase20_intelligence_model.sql` | **Production: NOT_APPLIED** |
| `phase21_cron_runs.sql` | **Production: NOT_APPLIED** |
| `phase22_manual_intelligence_workflow.sql` | **Production: NOT_APPLIED** |
| `phase23_grant_hardening.sql` | **Production: NOT_APPLIED** |
| `phase8b_leads.sql` | **Production: NOT_APPLIED** (`B-001`) |
| `phase18_screener_starred.sql` | **NOT_APPLIED** |
| `phase19_ime_tables.sql` | **NOT_APPLIED / SUPERSEDED** |

یعنی روی Production هیچ‌کدام از این‌ها وجود ندارند: کلِ مدلِ `intel_*`
(رخداد، منبع، شاهد، ادعا، تحلیل، سبدِ مرجع)، دفترِ `cron_runs`، و جدولِ
تمرینِ ۱۰روزه.

**نتیجهٔ طراحی:** هر چیزی که در Waveهای ۲، ۳ و ۵ طراحی می‌شود، پشتِ **یک**
تصمیم است. این تصمیم مالکِ انسانی دارد و در این مأموریت گرفته نمی‌شود، ولی
باید سرِ فهرست باشد وگرنه بقیهٔ برنامه روی زمینِ نامرئی ساخته می‌شود.

## F-11 · تولیدکننده‌ای که به مقصدِ ناموجود می‌نویسد

`relay/ime.mjs` به `ime_physical_trades` و `ime_certificate_history` می‌نویسد
(`grep 'rest/v1/ime_' relay/*.mjs`). هر دو جدول فقط در
`sql/phase19_ime_tables.sql` تعریف شده‌اند، و دفترِ migration دربارهٔ آن فایل
می‌گوید: **«NOT_APPLIED / SUPERSEDED — جدول‌هایش نیستند»**.

پس یکی از این دو درست است، و هر دو اقدام‌پذیرند:
1. جدول‌ها واقعاً نیستند و **نوشتنِ IME بی‌صدا شکست می‌خورد** (فلسفهٔ رله:
   «هر خطا بی‌صدا به `null` ختم شود» — `relay/README.md`)، یا
2. دفتر کهنه است و جدول‌ها اجرا شده‌اند.

`UNVERIFIED` — کدام‌یک. بدونِ اتصالِ زنده قابلِ تفکیک نیست، و همین خودش
اولین بستهٔ کاریِ «اندازه‌گیری» را توجیه می‌کند.

این F-04 را هم تصحیح می‌کند: دادهٔ IME «یتیم» نیست، احتمالاً **اصلاً فرود
نمی‌آید**.

## F-12 · موتورِ سنجشِ سبد از قبل ساخته شده است

`lib/core/allocation.ts` → `runAllocation(assets, rebalanceEvery = 63)`:

- وزنِ هدف چنددارایی، ریبالانسِ ادواری (پیش‌فرض ۶۳ روزِ معاملاتی ≈ فصلی)
- مدلِ هزینهٔ معامله (`IRAN_EQUITY_COSTS` از `lib/core/backtest.ts`)
- سنجه‌ها: بازدهٔ کل، CAGR، حداکثر افت، نوسانِ سالانه، شارپ
- مقایسه با خرید-و-نگه‌داری (`holdValue`)
- **قاعدهٔ سخت:** «دادهٔ ناموجود = حذفِ تاریخ؛ هرگز پرکردنِ مصنوعی»
- دارایی‌های حذف‌شده به‌خاطرِ دادهٔ ناکافی در `dropped` گزارش می‌شوند

**نتیجهٔ طراحی:** برای سبدِ ۷۰/۱۵/۱۵ هیچ موتورِ تازه‌ای لازم نیست. آنچه
نیست، **نگاشتِ ابزار** است: «طلا» کدام نماد است؟ این تصمیمِ مالک است، نه
کمبودِ مهندسی.

## F-13 · ابزارهای نامزد — با شاهد، نه ساختگی

`app/(protected)/terminal/allocation/page.tsx` سه پریست دارد و در کامنتش
می‌گوید نمادها «از universe دارای تاریخچهٔ ۲۰ ساله در `symbol_history`»
انتخاب شده‌اند:

| Sleeve | نمادهایی که مخزن **همین حالا** به‌کار می‌برد |
|---|---|
| طلا | `طلا`, `عیار` (صندوقِ طلا) |
| درآمد ثابت | `اعتماد` |
| سهام ایران | `فولاد`, `فملی`, `شپنا` |

به‌علاوه `relay/README.md`: «۸ صندوقِ طلای بزرگ» از `fund.fipiran.ir` با NAV
و بازدهٔ روزانه. فهرستِ نمادها **پویا** از BrsApi می‌آید و در کد hardcode
نیست (`relay/server.mjs:172`).

⚠️ این‌ها **نامزد** اند چون داده دارند — نه انتخابِ سبد. انتخاب تصمیمِ مالک است.

## F-14 · مدلِ سه‌مخاطبه از قبل پیاده شده است

`lib/access.ts` → `getAccess(): AccessInfo` با سه سطح:

```
visitor    → بدون لاگین
registered → لاگین‌کرده
full       → مشاوره (۳ ماه) | وبینار فصلی | ادمین
```

منبعِ حقیقت جدولِ `entitlements` (`sql/phase11_access_tiers.sql`, **APPLIED**).
رفتارِ fail-safe در خودِ فایل مستند است: اگر جدول نباشد فقط ادمین `full`
می‌گیرد و بقیه `registered` — «سایت هرگز نمی‌شکند».

**ولی فقط دو مصرف‌کننده دارد:** `app/(protected)/terminal/layout.tsx` و
`app/(protected)/dashboard/page.tsx`. یعنی مدل هست، اتصالش به خروجی‌ها نیست.
Wave 4 باید نگاشتِ «کدام خروجی به کدام سطح» را بسازد، نه مدلِ تازه.

## F-15 · تمرینِ ۱۰روزه ساخته شده — فقط اجرا نشده

`sql/phase22_manual_intelligence_workflow.sql` جدولِ `intel_rehearsal_days`
را با دقیقاً همان سنجه‌هایی می‌سازد که یک تمرینِ واقعی لازم دارد:

```
rehearsal_date · day_index · brief_produced · minutes_to_approval
absent_sources · stale_sources · human_corrections
rejected_conclusions · missed_events
```

مسیرِ ثبت هم هست: `POST /api/admin/intelligence/rehearsal` — و کامنتش
تأکید می‌کند «ثبتِ یک روزِ **واقعی**». نما در
`app/(protected)/admin/intelligence/page.tsx` رندر می‌شود.

پس تمرینِ ۱۰روزه یک کارِ ساختنی نیست؛ کارِ **اجراکردنی** است — و پشتِ همان
گیتِ F-10 (phase22 روی Production نیست).

## F-16 · گیتِ انسانیِ انتشار امروز واقعاً وجود دارد

`app/api/admin/analyses/route.ts` → `POST { action: "publish" }` در `signals`
درج می‌کند و **متنِ تحلیلِ نوشتهٔ انسان را اجباری می‌کند**:
«متن تحلیل الزامی است (انسان در حلقه).» جدولِ `signals` تریگرِ زنجیرهٔ هش
دارد (`fn_signals_hash_chain`) و append-only است.

یعنی حلقهٔ «تأیید انسانی → انتشار» **از قبل بسته است** و طراحی باید روی آن
بنشیند، نه کنارش یکی تازه بسازد.
