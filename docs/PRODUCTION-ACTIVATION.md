# بستهٔ فعال‌سازیِ Production

> مأموریت: `P2-CLAUDE-MEGA-004` · تاریخ تهیه: ۱۴۰۵/۰۵/۱۳
> · `main` = `a8a686eec6e129de37f909cf0c6ef8132b73df0e`
> · Production `uooeygybrniptzdxuzhj` — **در تهیهٔ این سند فقط خوانده شد**
>
> ⚠️ **هیچ‌کدام از این پنج migration روی Production اجرا نشده است.** این سند
> اجازه نمی‌دهد؛ فقط اجرا را قابلِ تصمیم‌گیری می‌کند. اجرا منوط به پاسخِ صریحِ
> «بله» از آرش است.

---

## چرا این بسته لازم است

Gate 2 روی سه بسته گیر کرده و **هر سه یک دلیل دارند**: کدشان روی Production
مستقر است، جدولشان نیست.

| بسته | کد روی Production | جدول روی Production | نتیجهٔ امروز |
|---|---|---|---|
| `G2-006` لید | ✅ مستقر | ❌ `leads` وجود ندارد | هر لیدِ واقعی شکست می‌خورد |
| `G2-007` Cron | ✅ مستقر | ❌ `cron_runs` وجود ندارد | هر نوشتنِ دفترِ اجرا شکست می‌خورد |
| `G2-003` سلامت | ✅ مستقر | ❌ دو مورد از سه شاخص | صفحه صادق است ولی چیزی برای سنجیدن ندارد |

پس این بسته «کارِ تازه» نیست — **برداشتنِ تنها مانعِ مشترکِ Gate 2** است.

---

## ۱) ترتیب اجرا — از وابستگیِ واقعی، نه از نامِ فایل

```
۱. phase8b_leads.sql          ← مستقل. فقط به public.profiles نیاز دارد (موجود)
۲. phase21_cron_runs.sql      ← مستقل. فقط به public.profiles نیاز دارد (موجود)
۳. phase20_intelligence_model.sql
                              ← به public.profiles و public.signals نیاز دارد
                                (هر دو موجود؛ FK از intel_analysis_signals)
۴. phase22_manual_intelligence_workflow.sql
                              ← **باید بعد از phase20 باشد.** توابعِ
                                intel_guard_analysis_mutation و
                                publish_intel_analysis را CREATE OR REPLACE
                                می‌کند؛ اجرای معکوس بی‌صدا محدودیت‌ها را
                                برمی‌گرداند
۵. phase23_grant_hardening.sql
                              ← **باید آخر باشد.** کلِ اسکیمای public را جارو
                                می‌کند؛ اگر زودتر اجرا شود، ۱۷ جدولی که
                                مرحله‌های ۱ تا ۴ می‌سازند پوشش داده نمی‌شوند
```

تنها دو قیدِ سختِ ترتیب: **۳ پیش از ۴** و **۵ در پایان**. ۱ و ۲ نسبت به بقیه و
به یکدیگر آزادند. این ترتیب همان است که روی Staging تمرین شد.

## ۲) هشِ فایل‌ها

پیش از اجرا این‌ها را دوباره بگیر و مقایسه کن. اگر یکی نخواند، فایل عوض شده و
**نباید اجرا شود**.

```bash
sha256sum sql/phase8b_leads.sql sql/phase21_cron_runs.sql \
          sql/phase20_intelligence_model.sql \
          sql/phase22_manual_intelligence_workflow.sql \
          sql/phase23_grant_hardening.sql
```

| فایل | sha256 (۱۶ نویسهٔ اول) |
|---|---|
| `phase8b_leads.sql` | `b4f864e0e03f9e32` |
| `phase21_cron_runs.sql` | `a1dd604938a9ca6f` |
| `phase20_intelligence_model.sql` | `f766178df472d8cf` |
| `phase22_manual_intelligence_workflow.sql` | `b4a3fef68eb19fe8` |
| `phase23_grant_hardening.sql` | `d08bbf412c9c8767` |

## ۳) پرسش‌های پیش از اجرا (Before)

```sql
-- الف) وضعیتِ جدول‌ها — انتظار: هر پنج false
SELECT t, (to_regclass('public.'||t) IS NOT NULL) AS exists_now
  FROM unnest(ARRAY['leads','cron_runs','intel_analyses',
                    'intel_workflow_events','intel_rehearsal_days']) t;

-- ب) شمارشِ پایه — هر عددی که اینجا هست باید بعداً **دقیقاً همان** بماند
SELECT 'profiles' t, count(*) n FROM public.profiles
UNION ALL SELECT 'payments',      count(*) FROM public.payments
UNION ALL SELECT 'entitlements',  count(*) FROM public.entitlements
UNION ALL SELECT 'waitlist',      count(*) FROM public.waitlist
UNION ALL SELECT 'symbol_history',count(*) FROM public.symbol_history
UNION ALL SELECT 'codal_reports', count(*) FROM public.codal_reports;

-- ج) نقشهٔ امتیازها — مبنای سنجشِ phase23
SELECT grantee, privilege_type, count(*) n
  FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
 GROUP BY 1,2 ORDER BY 1,2;

-- د) تعدادِ کلیِ اشیا
SELECT count(*) FILTER (WHERE relkind='r') tables FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';
```

### مقادیرِ اندازه‌گیری‌شدهٔ امروز (۱۴۰۵/۰۵/۱۳، فقط‌خواندنی)

| مورد | مقدار |
|---|---|
| جدول‌های `public` | **۴۱** |
| `leads` · `cron_runs` · `intel_*` | **هیچ‌کدام وجود ندارند** |
| `profiles` | ۲ ردیف (۱ `admin`، ۱ `user`) |
| `payments` · `entitlements` | **۰ ردیف** |
| `waitlist` | ۱ ردیف |
| `symbol_history` | ≈ ۱٬۹۶۷٬۴۲۰ ردیف |
| `anon` امتیازهای نوشتن | `DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE` روی **۴۰ جدول** |
| `authenticated` امتیازهای نوشتن | همان شش‌تا روی **۴۱ جدول** |
| `pg_cron` | نصب است |
| توابعِ `SECURITY DEFINER` | ۲۵ |

## ۴) تغییرِ مورد انتظار

| مرحله | چه می‌سازد | چه چیزی را تغییر **نمی‌دهد** |
|---|---|---|
| `phase8b` | `leads` (+ ایندکس، ۲ سیاست، تریگرِ `updated_at`) | هیچ جدولِ موجودی |
| `phase21` | `cron_runs` (+ ۳ ایندکس، ۲ سیاست، تریگرِ گارد، ۹ قید) | هیچ جدولِ موجودی |
| `phase20` | **۱۵ جدولِ `intel_*`** + ۱۶ سیاست + ۱۲ تریگر + ۶ تابع | هیچ جدولِ موجودی |
| `phase22` | ۲ جدولِ دیگر (۱۵→۱۷) + ۲ سیاست + ۳ تریگر؛ چرخهٔ حیات را **تنگ‌تر** می‌کند | دادهٔ موجود ندارد چون جدول‌ها تازه‌اند |
| `phase23` | **هیچ جدولی نمی‌سازد.** فقط امتیاز پس می‌گیرد | `SELECT` هیچ نقشی · نوشتن‌های لازمِ `service_role` · هیچ ردیفی |

### تفاوتِ امتیازها پس از `phase23` — پیش‌بینی از روی اجرای Staging

| نقش | قبل | بعد |
|---|---|---|
| `anon` — `TRUNCATE`/`TRIGGER`/`REFERENCES` | ۴۰ جدول | **۰** |
| `anon` — `INSERT`/`UPDATE`/`DELETE` | ۴۰ جدول هرکدام | **فقط `INSERT` روی `waitlist`** |
| `authenticated` — `TRUNCATE`/`TRIGGER`/`REFERENCES` | ۴۱ جدول | **۰** |
| `authenticated` — `INSERT`/`UPDATE`/`DELETE` | ۴۱ جدول هرکدام | فقط جایی که سیاستِ متناظر وجود دارد |
| `service_role` — `TRUNCATE`/`TRIGGER`/`REFERENCES` | همه | **۰** |
| `service_role` — `INSERT`/`UPDATE`/`DELETE` | — | **بدون تغییر** |

> ⚠️ `phase23` روی Production یک نکتهٔ عملیاتی دارد که Staging نشان نداد:
> Staging ۲۲ جدولِ خالی دارد، Production ۴۱ جدول که یکی‌شان ~۲ میلیون ردیف
> دارد. `REVOKE` فقط فراداده را عوض می‌کند و به اندازهٔ جدول کاری ندارد، ولی
> روی هر جدول قفل می‌گیرد و **تا پایانِ تراکنش نگه می‌دارد**. اگر پرس‌وجوی
> بلندی روی `symbol_history` در جریان باشد، migration پشتِ آن صف می‌کشد و
> در همان حال ۴۰ جدولِ دیگر را قفل نگه داشته. برای همین:
>
> ```sql
> SET lock_timeout = '5s';   -- شکستِ سریع، نه صفِ طولانی
> ```
>
> شکست بی‌خطر است: کلِ فایل در یک تراکنش است و rollback می‌شود. دوباره اجرا کن.

## ۵) پرسش‌های پس از اجرا (After) — بعد از **هر** مرحله

```sql
-- ۱) جدول ساخته شد و RLS روشن است؟
SELECT c.relname, c.relrowsecurity,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname) policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND c.relname IN ('leads','cron_runs') OR c.relname LIKE 'intel\_%'
 ORDER BY 1;

-- ۲) هیچ سطرِ ساختگی وارد نشده؟ انتظار: صفر، در همهٔ جدول‌های تازه
SELECT relname, n_live_tup FROM pg_stat_user_tables
 WHERE schemaname='public' AND (relname LIKE 'intel\_%' OR relname IN ('leads','cron_runs'));

-- ۳) شمارشِ جدول‌های قدیمی دست‌نخورده مانده؟ با بندِ (ب) بالا مقایسه کن

-- ۴) فقط پس از phase23 — قید اصلی
SELECT count(*) must_be_zero FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
   AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES');

SELECT has_table_privilege('anon','public.symbol_history','TRUNCATE') AS must_be_false;
SELECT has_table_privilege('anon','public.waitlist','INSERT')        AS must_be_true;
```

**در اولین اختلاف متوقف شو.** خودِ `phase23` هم بلوکِ assert دارد و اگر
invariant برقرار نباشد `RAISE EXCEPTION` می‌کند و تراکنش برمی‌گردد.

## ۶) Smoke test پس از هر پنج مرحله

| # | آزمون | انتظار |
|---|---|---|
| ۱ | `GET /api/admin/health` با حسابِ ادمین | سه شاخص از `unavailable` به عددِ واقعی می‌روند |
| ۲ | فرمِ waitlist روی صفحهٔ عمومی | ثبت می‌شود (اثباتِ اینکه `phase23` گرنتِ anon را نشکسته) |
| ۳ | ورود با حسابِ ادمین → `/admin` | باز می‌شود |
| ۴ | `SELECT count(*) FROM public.leads` | ۰ — جدول هست و خالی است |
| ۵ | اجرای دستیِ یک مسیرِ cron | یک ردیف در `cron_runs` می‌نویسد |
| ۶ | صفحهٔ عمومیِ تحلیل‌ها | بدون تغییر — `phase20` هیچ تحلیلِ منتشرشده‌ای نمی‌سازد |

آزمون ۲ **مهم‌ترین** است: تنها گرنتِ نوشتنی است که `phase23` عمداً نگه می‌دارد،
و اگر اشتباهی برداشته شود، تنها فرمِ عمومیِ سایت بی‌صدا می‌شکند.

## ۷) بازگشت (Rollback)

| مرحله | بازگشت | خطر |
|---|---|---|
| `phase8b`, `phase21`, `phase20`, `phase22` | جدول‌های تازه را `DROP` کن | **کم، تا وقتی چیزی ننوشته‌ای.** این جدول‌ها امروز روی Production وجود ندارند، پس هر چه در آن‌ها باشد پس از فعال‌سازی نوشته شده. اگر لیدِ واقعی رسیده باشد، `DROP` یعنی **از دست دادنِ دادهٔ واقعی** — آنجا فقط بازیابی از بکاپ درست است |
| `phase23` | امتیازها را دوباره `GRANT` کن | **بازگشتش خودش یک نقص است.** برگرداندنِ `TRUNCATE` یعنی برگرداندنِ `B-044`. اگر چیزی شکست، درست‌ترین کار محدودکردنِ همان یک گرنتِ لازم است، نه برگرداندنِ همه |

`phase23` تنها مرحله‌ای است که **هیچ داده‌ای را لمس نمی‌کند**، پس بازگشتش هم
هرگز دادهٔ کسی را برنمی‌گرداند یا از بین نمی‌برد.

### پیش‌نیازِ بکاپ — این را قبل از شروع تأیید کن

هر پنج مرحله DDL هستند. **پیش از مرحلهٔ ۱** باید بدانی نقطهٔ بازگشت کجاست:

- در داشبورد Supabase → Database → Backups، تاریخِ آخرین بکاپِ موفق را ببین.
- اگر PITR فعال است، لحظهٔ پیش از شروع را یادداشت کن.
- ⚠️ **این را من تأیید نکردم.** خواندنِ وضعیتِ بکاپ از این سشن ممکن نبود؛
  ادعای «بکاپ داریم» بدونِ دیدنش، دقیقاً همان نوع ادعایی است که این پروژه
  از آن پرهیز می‌کند.

## ۸) زمانِ تخمینیِ قطعی

**عملاً صفر.** هیچ‌کدام از این پنج فایل جدولِ موجود را قفلِ طولانی نمی‌کند و
هیچ‌کدام داده جابه‌جا نمی‌کند. مراحل ۱ تا ۴ فقط جدولِ تازه می‌سازند —
اپلیکیشنِ در حالِ اجرا اصلاً متوجه نمی‌شود. مرحلهٔ ۵ روی جدول‌های موجود قفلِ
کوتاه می‌گیرد؛ با `lock_timeout` بالا، بدترین حالت **شکستِ سریع و تلاشِ دوباره**
است، نه قطعیِ طولانی.

تخمینِ واقع‌بینانه: **کمتر از ۳۰ ثانیه** برای هر پنج مرحله، به‌علاوهٔ زمانی که
برای خواندنِ خروجیِ هر مرحله صرف می‌کنی.

## ۹) خطرِ دقیق — بدون کم و زیاد

| خطر | احتمال | اثر | مهار |
|---|---|---|---|
| `phase23` گرنتی را ببرد که واقعاً لازم بود | کم | یک قابلیت بی‌صدا می‌شکند | قاعده‌اش «سیاستی نیست ⇒ گرنت مرده است» — روی هر دو پروفایلِ امتیاز و روی Staging سنجیده شد. Smoke test ۲ همان تک‌موردِ استثنا را می‌آزماید |
| قفل‌گیریِ `phase23` پشتِ پرس‌وجوی بلند | متوسط | migration کند می‌شود یا صف می‌کشد | `SET lock_timeout='5s'`؛ شکست بی‌خطر و قابلِ تکرار |
| `phase20` پس از `phase22` اجرا شود | کم | **بی‌صدا محدودیت‌ها را برمی‌گرداند** | ترتیبِ بندِ ۱؛ این تنها خطای «بی‌صدا»ی این بسته است |
| بکاپ در دسترس نباشد و بعداً لازم شود | ناشناخته | بالا | بندِ ۷ — پیش از شروع تأیید شود |
| ترافیکِ واقعی حین اجرا | کم (پلتفرم هنوز عرضه نشده؛ `payments` صفر ردیف) | کم | پنجرهٔ اجرا آزاد است |

**آنچه این بسته خطرش را ندارد:** هیچ ستونی حذف نمی‌شود، هیچ جدولی تغییرِ نام
نمی‌دهد، هیچ `DELETE`ی اجرا نمی‌شود، و هیچ‌کدام از ۴۱ جدولِ موجود از نظر ساختار
لمس نمی‌شود.

## ۱۰) شواهدِ تمرین

| فایل | تمرین‌شده روی Staging | شاهد |
|---|---|---|
| `phase8b_leads.sql` | ✅ `G2-006` | `docs/RUNBOOK-lead-staging.md` |
| `phase21_cron_runs.sql` | ✅ `P2-G3-002` | `docs/RUNBOOK-staging-rehearsal-phase20-21.md` |
| `phase20_intelligence_model.sql` | ✅ `P2-G3-002` | همان — ۱۷ کنترلِ رفتاری |
| `phase22_manual_intelligence_workflow.sql` | ✅ `P2-CLAUDE-MEGA-003` | `docs/RUNBOOK-manual-intelligence.md` — ۲۰ کنترل |
| `phase23_grant_hardening.sql` | ✅ `P2-CLAUDE-MEGA-004` | `docs/MIGRATION-LEDGER.md` + `lib/security/grants.integration.test.ts` |

هر پنج فایل علاوه بر Staging، روی **Postgresِ واقعی در CI** هم اجرا می‌شوند:
`test:db` = ۱۸۷ تست، ۱۴ suite، دو پروفایلِ امتیاز، صفر skip.

⚠️ **آنچه تمرینِ Staging ثابت نمی‌کند** (`B-035`): Staging ۲۲ جدولِ خالی دارد و
Production ۴۱ جدول با داده. اجرای موفقِ Staging دربارهٔ رفتارِ Production
**استنتاج** است، نه اثبات. برای همین بندهای ۵ و ۶ پس از هر مرحله لازم‌اند.

---

## تصمیمِ لازم

> **آیا اجرای بستهٔ فعال‌سازی Production با همین پنج migration و همین ترتیب
> تأیید می‌شود؟**
>
> `Authority = ARASH`. بدونِ پاسخِ صریحِ «بله»، هیچ SQL، هیچ متغیرِ محیطی و هیچ
> سکرتی روی Production تغییر نمی‌کند.

تصمیم را می‌شود شکست: مثلاً «بله برای ۱ و ۲ و ۵ (بستنِ Gate 2 و `B-044`)، فعلاً
نه برای ۳ و ۴ (موتورِ هوشمندی)». در آن حالت ترتیب می‌شود `phase8b` → `phase21`
→ `phase23` و قیدِ «۵ در پایان» همچنان برقرار است.
