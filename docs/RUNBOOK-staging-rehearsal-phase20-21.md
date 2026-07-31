# Runbook — تمرینِ stagingِ `phase21` (cron ledger) و `phase20` (intelligence)

> ✅ **اجرا شد** — `P2-G3-002`، ۱۴۰۵/۰۵/۰۹، فقط روی staging (`oqjcvkzyvhqnphopedpn`).
> Production (`uooeygybrniptzdxuzhj`) در هیچ گامی لمس نشد.
>
> این سند دیگر «برنامه» نیست؛ **گزارشِ اجرا** است. آنچه پیش‌بینی شده بود و آنچه
> واقعاً رخ داد هر دو نگه داشته شده‌اند، چون تفاوتشان مهم‌ترین بخشِ این تمرین است.
>
> مرتبط: `docs/RUNBOOK-gate2-staging-rehearsal.md`، `docs/MIGRATION-LEDGER.md`، ADR-005.

---

## ۰. آنچه این تمرین پیدا کرد — خلاصه در یک بند

`phase21` بی‌عیب از آب درآمد. `phase20` **یک نقصِ امنیتی داشت که هیچ بازبینیِ چشمی
نگرفته بود**: `GRANT ALL ON TABLE … TO service_role` روی هر ۱۵ جدول، که چون
`TRUNCATE` تریگر را شلیک نمی‌کند، همهٔ گاردهای append-only را دور زدنی می‌کرد.
اصلاح شد، بازاندازه‌گیری شد، و دو گاردِ رگرسیون افزوده شد.

**همان درسِ `G2-006`، بارِ سوم:** امتیازِ نقشی که سرور واقعاً با آن اجرا می‌شود را
باید **سنجید**، نه از روی متنِ migration حدس زد.

---

## ۱. تأییدِ هویت و پیش‌نیازها — و یک انحرافِ واقعی

```sql
select (select count(*) from pg_tables where schemaname='public' and tablename like 'intel\_%'),
       to_regclass('public.cron_runs'), to_regclass('public.signals'), to_regclass('public.profiles');
```

نتیجهٔ واقعی: `intel_* = 0` · `cron_runs = null` · `profiles = leads, profiles` …
و **`signals = null`**.

⚠️ **انحراف از برنامه.** `phase20` سطرِ
`signal_id uuid NOT NULL REFERENCES public.signals(id)` دارد، ولی این پروژهٔ staging
در `G2-006` **کمینه** ساخته شده بود و فقط دو جدول داشت (`leads`, `profiles`).
برنامه این را ندیده بود.

**اقدام:** `signal_drafts` + `signals` + زنجیرهٔ هش، **عیناً از
`sql/terminal_t0.sql`**، به‌عنوانِ fixtureِ پیش‌نیاز اعمال شد — همان الگویی که
`G2-006` برای `profiles` به کار برده بود (`g2006_prereq_profiles_from_repo_archive_schema`).

> 🛑 **این را باید صریح گفت:** staging **کپیِ Production نیست**. پس موفقیتِ اینجا
> دربارهٔ رفتارِ Production کمتر از آنچه به‌نظر می‌رسد ثابت می‌کند. هر جدولی که
> Production دارد و staging ندارد، یک تفاوتِ نادیده است.

---

## ۲. گامِ اول — `phase21_cron_runs.sql` ✅

| بررسی | انتظار | نتیجهٔ واقعی |
|---|---|---|
| جدول | موجود | ✅ |
| `relrowsecurity` | `t` | ✅ |
| سیاست‌ها | ۲ | ✅ ۲ |
| ایندکس | ۳ (PK + ۲) | ✅ ۳ |
| تریگرِ گارد | ۱ | ✅ ۱ |
| قیدهای CHECK | — | ✅ ۹ |
| گرنت‌ها | `anon` هیچ · `authenticated=SELECT` · `service_role=INSERT,SELECT,UPDATE` | ✅ دقیقاً همین |
| `TRUNCATE` برای هر سه نقش | `f` | ✅ هر سه `f` |
| `EXECUTE` تابعِ گارد برای `anon` | `f` | ✅ |

### کنترل‌های منفی — هر ۶ رد شدند

| کنترل | نتیجه |
|---|---|
| تغییرِ اجرای تمام‌شده | ✅ رد |
| `DELETE` ردیف | ✅ رد |
| `failed` بدونِ `error_code` | ✅ رد |
| `running` با `finished_at` | ✅ رد |
| وضعیتِ پایانی بدونِ `finished_at` | ✅ رد |
| `safe_error_summary` بیش از ۳۰۰ نویسه | ✅ رد |

### دادهٔ تمرینی

یک ردیف با `job_key='rehearsal:alerts'` (`succeeded`, `processed_count=0`,
`duration_ms=42`) **باقی است** — حذف با تریگر ممنوع است و همین درست است. پیشوندِ
`rehearsal:` آن را از هر رکوردِ واقعی تفکیک می‌کند.

---

## ۳. گامِ دوم — `phase20_intelligence_model.sql` ⚠️ اجرا شد، نقص پیدا شد، اصلاح شد

### ساختار ✅

۱۵ جدول · RLS روی **هر ۱۵** · ۱۶ سیاست · ۱۲ تریگر · ۶ تابع · ۶ ایندکسِ نام‌دار.
`anon` فقط روی `intel_analyses` `SELECT` دارد (سیاستِ `status='published'`) و هیچ
`INSERT`ی ندارد. `authenticated` نه `TRUNCATE` دارد نه `DELETE`.

### ۱۷ کنترلِ رفتاری ✅

| کنترل | نتیجه |
|---|---|
| انتشارِ مستقیم با `UPDATE` بدونِ گردشِ کار | رد |
| انتشار بدونِ هیچ ادعا | رد |
| انتشار با ادعای بدونِ شاهد | رد |
| ادعا با چند شاهدِ مستقل | ✅ پذیرفته |
| انتشار توسطِ غیرِادمین | رد |
| گردشِ کاملِ انتشار + مهرِ تأییدکننده و زمان‌ها | ✅ درست |
| تغییرِ تحلیلِ منتشرشده | رد |
| `DELETE` تحلیل | رد |
| `UPDATE` شاهد | رد |
| `DELETE` پیوندِ ادعا↔شاهد | رد |
| شناسهٔ سیگنالِ نامعتبر | رد (FK) |
| نهایی‌سازیِ تخصیصِ خالی | رد |
| نهایی‌سازیِ ۷۰٪ | رد |
| نهایی‌سازیِ دقیقاً ۱۰۰٪ | ✅ پذیرفته |
| تغییرِ نسخهٔ نهایی‌شده | رد |
| افزودنِ موقعیت به نسخهٔ نهایی‌شده | رد |
| `intel_runs` انسانی با فیلدهای مدل | رد |

### دادهٔ آزمایشی — هیچ

کلِ این ۱۷ کنترل داخلِ **زیرتراکنشی اجرا شد که همیشه `ROLLBACK` می‌شود**
(بلوکِ `EXCEPTION` در plpgsql؛ متغیرهای plpgsql tranسактionی نیستند، پس نتیجه‌ها
بیرون می‌آیند ولی ردیف‌ها نه). راستی‌آزماییِ پس از اجرا: **هر ۱۵ جدول صفر ردیف**،
`profiles` صفر، `auth.users` صفر.

مدلِ هوشمندی **دادهٔ تحلیلی** نگه می‌دارد؛ دادهٔ ساختگی در آن دقیقاً همان چیزی است
که کارنامه را بی‌ارزش می‌کند.

---

## ۴. 🛑 نقصِ امنیتی — `service_role` روی هر ۱۵ جدول `TRUNCATE` داشت

### چه بود

```sql
EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);   -- ⬅ اینجا
```

`GRANT ALL` یعنی `TRUNCATE` و `DELETE`. و **`TRUNCATE` تریگر را شلیک نمی‌کند** —
پس `intel_deny_mutation()` و گاردهای انتشار/نهایی‌سازی، همه، از این مسیر بی‌اثر
بودند. تحلیلِ منتشرشده، شاهد، ادعا و تصحیح — کلِ چیزی که «کارنامهٔ غیرقابل‌دستکاری»
نامیده می‌شود — با یک دستور پاک‌شدنی بود.

### چگونه پیدا شد — با کاوش، نه با بازبینی

```sql
set local role service_role;
truncate table public.intel_corrections;   -- جدولِ خالی؛ سؤال فقط «آیا امتیاز اجراشدنی است»
```

| جدول | پیش از اصلاح | پس از اصلاح |
|---|---|---|
| `intel_corrections` | `EXERCISABLE` | `BLOCKED_BY_PRIVILEGE` |
| `intel_claim_evidence` | `EXERCISABLE` | `BLOCKED_BY_PRIVILEGE` |
| `intel_analysis_signals` | `EXERCISABLE` | `BLOCKED_BY_PRIVILEGE` |
| `intel_run_inputs` | `EXERCISABLE` | `BLOCKED_BY_PRIVILEGE` |
| `intel_portfolio_effects` | `EXERCISABLE` | `BLOCKED_BY_PRIVILEGE` |
| **`cron_runs`** (phase21) | **`BLOCKED_BY_PRIVILEGE`** | `BLOCKED_BY_PRIVILEGE` |

سطرِ آخر مهم‌ترین است: **همان دیتابیس، همان نقش، نتیجهٔ متضاد.** دو جدول فقط در یک
خط فرق داشتند — `phase21` درسِ `G2-006` را داشت، `phase20` نداشت.

### چرا تست نگرفت

تستِ موجود این بود:

```ts
test("ordinary user has neither DELETE nor TRUNCATE", () => { … "authenticated" … });
```

فقط `authenticated`. اما نقشی که سرور واقعاً با آن اجرا می‌شود `service_role` است.
**تستی که نقشِ اشتباه را می‌آزماید، سبزیِ خودش را اثبات می‌کند، نه امنیت را.**

### اصلاح

```sql
EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', table_name);
EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO service_role', table_name);
-- UPDATE فقط روی ۶ جدولی که چرخهٔ دومرحله‌ای واقعی دارند
```

پس از اصلاح، بازاندازه‌گیری: `TRUNCATE` ۰/۱۵ · `DELETE` ۰/۱۵ · `SELECT` ۱۵ ·
`INSERT` ۱۵ · `UPDATE` ۶. و هر ۱۷ کنترلِ رفتاری **دوباره** اجرا شد تا مطمئن شویم
سخت‌گیریِ تازه چیزی را نشکسته: ۳ مسیرِ مثبت `OK`، ۱۴ کنترلِ منفی `REJECTED`.

### گاردهای رگرسیون

۱. `lib/intelligence/contracts.test.ts` — گاردِ ایستا روی متنِ SQL (بدونِ دیتابیس اجرا می‌شود).
۲. `lib/intelligence/intelligence.integration.test.ts` — `service_role` روی **هر ۱۵ جدول** آزموده می‌شود، به‌علاوهٔ یک کنترلِ failability که ثابت می‌کند برگرداندنِ گرنت همان دستور را دوباره موفق می‌کند.

هر دو **failable بودنشان اثبات شد**: با بازگرداندنِ `GRANT ALL`، تستِ ایستا قرمز می‌شود.

---

## ۵. یافتهٔ جانبی — `fn_signals_hash_chain` برای `anon` قابل اجراست

`get_advisors` پس از اعمالِ fixtureِ پیش‌نیاز دو `WARN` داد:

> `public.fn_signals_hash_chain()` can be executed by the `anon` role as a
> `SECURITY DEFINER` function via `/rest/v1/rpc/…`

این **مالِ `phase20` نیست** — از `sql/terminal_t0.sql` می‌آید، که روی Production
**`APPLIED`** است. یعنی به احتمالِ زیاد Production هم همین را دارد.

⚠️ اینجا هیچ اقدامی روی Production انجام نشد و نباید انجام شود. این یافته باید
جداگانه بررسی و تصمیم‌گیری شود. ثبت شد تا گم نشود.

---

## ۶. Rollback

| وضعیت | اقدام |
|---|---|
| جدول خالی است | `DROP` بی‌خطر است — بلوکِ انتهای همان فایل |
| دادهٔ واقعی دارد | **`DROP` نزن.** مسیرِ نوشتن را ببند و جدول را نگه دار |

وضعیتِ فعلیِ staging: هر ۱۵ جدولِ `intel_*` **خالی**‌اند، پس rollbackشان امروز
بی‌خطر است. `cron_runs` یک ردیفِ `rehearsal:` دارد؛ تله‌متری است نه دادهٔ محصول،
ولی اگر برای ممیزیِ یک حادثه لازم شود، همان تاریخچه دقیقاً چیزی است که نباید برود.

fixtureهای پیش‌نیاز (`signals`, `signal_drafts`, `profiles`) **نباید** rollback شوند
مگر کلِ پروژهٔ staging دور ریخته شود؛ آن‌ها بازسازیِ محیط‌اند، نه بخشی از این دو migration.

---

## ۷. چه چیزی این تمرین **اثبات نمی‌کند**

- **دربارهٔ Production هیچ.** ردیفِ Production در `MIGRATION-LEDGER` دست‌نخورده است
  و وضعیتِ هر دو فایل `APPLIED_TO_STAGING_ONLY` است، نه `APPLIED`. و چون staging
  کپیِ Production نیست (بندِ ۱)، این حتی از یک تمرینِ معمولی هم کمتر می‌گوید.
- **اجرای واقعیِ cron را.** تا وقتی یک Vercel Cron واقعی روی محیطی با این جدول
  شلیک نکند، «آخرین اجرای موفق» همچنان `UNKNOWN` است — فقط این بار نمای سلامت
  **می‌تواند** آن را بداند، که پیش‌تر نمی‌توانست.
- **که دیگر نقصی نمانده.** یک نقص با کاوش پیدا شد؛ این دربارهٔ نقص‌هایی که کاوش
  نشدند چیزی نمی‌گوید.
