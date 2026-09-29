# Runbook — فعال‌سازیِ مسیرِ «پرداخت → دسترسی»

> **این سند اجرا نشده است.** فقط رویه است. هیچ بخشی از آن بدونِ تأییدِ صریحِ
> آرش روی Production اجرا نمی‌شود.
>
> پیش‌نیازِ سختِ هر migration: بکاپِ سالمِ Production
> ([`RUNBOOK-backup-windows.md`](./RUNBOOK-backup-windows.md)). اگر بکاپ گرفته
> نشده، **هیچ SQLای اجرا نمی‌شود**.

---

## ۰. چه چیزی عوض می‌شود

| فایل | اثر |
|---|---|
| `sql/phase24_payment_entitlement.sql` | ستونِ `payments.purpose` · قیدِ یکتای `entitlements.payment_id` · قیدِ یکتای `webinar_registrations.payment_id` · جدولِ `entitlement_durations` · جدولِ `payment_settings` · توابعِ `create_payment/4` (فقط service_role)، `create_webinar_payment/4`، `finalize_paid_access` |
| `lib/payments/finalize.ts` | تنها ماشینِ حالتِ پرداخت |
| دو `callback` | هر دو همان تابع را صدا می‌زنند |

**اضافه‌شونده است، نه مخرب.** هیچ جدول، ستون، سیاست یا داده‌ای حذف یا بازنویسی
نمی‌شود. `verify_payment` و `fail_payment` دست‌نخورده‌اند.

> ⚠️ **`create_payment` تغییرِ شکسته دارد.** امضاهای قدیمی
> (`create_payment(integer,text)` و `create_payment(integer,text,text)`) و
> `create_webinar_payment(uuid,integer,text)` در این migration **حذف** می‌شوند،
> چون هر سه مبلغ را از فراخواننده می‌گرفتند و برای `authenticated` باز بودند.
> این تنها بخشِ غیرِ افزایشیِ فایل است. روی Production صفر ردیفِ پرداخت وجود
> دارد و هیچ کدِ مستقری این امضاها را صدا نمی‌زند، ولی باید **پیش از** استقرارِ
> کدِ PR #113 اجرا شود، نه بعد از آن.

---

## ۱. ترتیبِ اجبارِ اجرا

```
بکاپِ سالم  →  phase8b  →  phase21  →  phase23  →  phase24  →  استقرارِ کد
```

`phase24` **بعد از** `phase23` می‌آید و **پیش از** استقرارِ کد. اگر کد زودتر
برود، `finalize_paid_access` هنوز وجود ندارد و هر پرداخت به
`access_pending` می‌افتد — مشتری پول می‌دهد و دسترسی نمی‌گیرد.

پیش‌نیازِ خودِ `phase24`: `phase5` (payments + RPCها) · `phase8` (وبینار) ·
`phase11` (entitlements). هر سه روی Production موجودند.

---

## ۲. اجرا روی Staging — اول اینجا

```sql
-- در SQL Editor پروژهٔ staging، کلِ فایل را یک‌جا اجرا کن:
--   sql/phase24_payment_entitlement.sql
```

فایل خودش در انتها بلوکِ `DO $$` دارد و اگر هر کدام از این‌ها برقرار نباشد
**می‌شکند**، نه اینکه بی‌صدا موفق شود:

- ایندکسِ `uq_entitlements_user_source` ساخته شده
- تابعِ `finalize_paid_access` وجود دارد
- `anon` و `authenticated` اجازهٔ اجرا **ندارند**
- `service_role` اجازهٔ اجرا **دارد**

### ۲.۰ چه چیزی از قبل در CI اثبات شده

`lib/payments/finalize.integration.test.ts` همین فایلِ migration را روی یک
Postgresِ یک‌بارمصرف در CI اجرا می‌کند و **رفتار** را می‌سنجد، نه متن را. این
موارد پیش از رسیدن به staging سبز شده‌اند (۲۵ تست):

| ادعا | چطور اثبات می‌شود |
|---|---|
| اعطای دسترسی idempotent است | سه بار فراخوانی → دقیقاً یک ردیف |
| **یک authority دو دسترسی نمی‌سازد** | همان پرداخت از callbackِ دوم → خطای «نمی‌خواند» |
| **نوعِ محصول تغییرناپذیر است** | `UPDATE payments SET purpose` → رد |
| **وبینار بدونِ ثبت‌نام رد می‌شود** | خطای «بدونِ ثبت‌نامِ متصل» و پرداخت روی `pending` |
| **اتصالِ پرداخت↔ثبت‌نام اتمیک است** | شکستِ مالکیت → هیچ پرداختی ساخته نمی‌شود |
| **مدت از جدول می‌آید** | تغییر به ۷ ماه → انقضا ۷ ماه |
| هم‌زمانی امن است | چهار تراکنشِ **واقعاً موازی** → یک ردیف، بدونِ خطا |
| شکستِ اعطا پرداخت را برمی‌گرداند | تریگرِ ساختگی → `payments` روی `pending` می‌ماند |
| نوشتنِ بی‌صدا بی‌اثر هم می‌شکند | تریگری که `NULL` برمی‌گرداند → خطای صریح |
| مبلغ/کاربر/ثبت‌نامِ ناهمخوان رد می‌شود | هر سه با خطای مشخص |
| `authenticated` نمی‌تواند اجرا کند | `permission denied` واقعی، نه فقط کاتالوگ |

هر کدام از این گاردها با بازگرداندنِ همان نقصِ اصلی **آزموده شده که قرمز
می‌شود** — گاردی که نتواند بشکند ارزشی ندارد.

پس روی staging فقط چیزهایی می‌ماند که CI نمی‌تواند ببیند: امتیازهای واقعیِ
Supabase و مسیرِ واقعیِ زرین‌پال.

### ۲.۱ آزمونِ رفتاری روی staging (چیزی که CI نمی‌تواند اثبات کند)

```sql
-- الف) idempotency واقعی: درجِ دوم باید بی‌اثر باشد، نه خطا و نه ردیفِ دوم.
--     (روی یک کاربرِ آزمایشیِ staging، نه Production)
SELECT count(*) FROM public.entitlements
 WHERE user_id = '<TEST_USER>' AND source = 'payment:<TEST_AUTHORITY>';
-- انتظار پس از دو بار فراخوانیِ finalize_paid_access با همان ورودی: 1

-- ب) گذارِ ممنوع: پرداختِ نهایی‌شده نباید دوباره قابلِ تغییر باشد.
UPDATE public.payments SET status = 'failed'
 WHERE authority = '<TEST_AUTHORITY>';
-- انتظار: ERROR «پرداختِ نهایی‌شده قابل تغییر نیست.»

-- ج) بایندِ مالکیت: ثبت‌نامِ کاربرِ دیگر باید رد شود.
SELECT public.finalize_paid_access(
  '<TEST_AUTHORITY>', 'REF', <AMOUNT>, 'webinar',
  'webinar_payment:<TEST_AUTHORITY>', now() + interval '3 months',
  NULL, '<REGISTRATION_OF_ANOTHER_USER>');
-- انتظار: ERROR «ثبت‌نام به کاربرِ دیگری تعلق دارد.»

-- د) امتیازها — باید دقیقاً این باشد:
SELECT has_function_privilege('anon',
  'public.finalize_paid_access(text,text,integer,text,text,timestamptz,text,uuid)','EXECUTE') AS anon,
       has_function_privilege('authenticated',
  'public.finalize_paid_access(text,text,integer,text,text,timestamptz,text,uuid)','EXECUTE') AS authed,
       has_function_privilege('service_role',
  'public.finalize_paid_access(text,text,integer,text,text,timestamptz,text,uuid)','EXECUTE') AS svc;
-- انتظار: anon=false · authed=false · svc=true
```

**اگر هر کدام مطابق انتظار نبود، همین‌جا متوقف شو.** روی Production نرو.

---

## ۳. اجرا روی Production

فقط پس از سبز شدنِ کاملِ بخشِ ۲ و با تأییدِ صریحِ آرش.

1. **اسنپ‌شاتِ قبل** — این سه عدد را یادداشت کن:
   ```sql
   SELECT count(*) FROM public.payments;
   SELECT count(*) FROM public.entitlements;
   SELECT count(*) FROM public.entitlement_durations;   -- پس از migration باید ۲ باشد
   SELECT value FROM public.payment_settings
    WHERE key = 'webinar_retry_stale_minutes';                -- باید ۶۰ باشد

   -- امضاهای قدیمی نباید مانده باشند (هر سه باید t برگردانند)
   SELECT to_regprocedure('public.create_payment(integer,text)') IS NULL,
          to_regprocedure('public.create_payment(integer,text,text)') IS NULL,
          to_regprocedure('public.create_webinar_payment(uuid,integer,text)') IS NULL;

   -- کاربرِ واردشده نباید بتواند پرداخت بسازد (باید f برگرداند)
   SELECT has_function_privilege('authenticated',
            'public.create_payment(uuid,integer,text,text)','EXECUTE');
   SELECT count(*) FROM public.webinar_registrations;
   ```
2. کلِ `sql/phase24_payment_entitlement.sql` را یک‌جا اجرا کن.
3. بلوکِ `DO $$` باید بدونِ خطا رد شود.
4. **اسنپ‌شاتِ بعد** — هر سه عدد باید **دقیقاً همان** باشند. این migration
   داده نمی‌سازد و نمی‌خورد؛ هر تغییری در این اعداد یعنی چیزی اشتباه است.
5. سپس کد را روی Production مستقر کن (merge به `main` → استقرارِ خودکارِ Vercel).

### Rollback

```sql
DROP FUNCTION IF EXISTS public.finalize_paid_access(
  text, text, integer, text, text, timestamptz, text, uuid);
DROP INDEX IF EXISTS public.uq_entitlements_user_source;
```

هیچ داده‌ای از دست نمی‌رود — نه ایندکس و نه تابع داده نگه نمی‌دارند. ولی
**اگر کد مستقر شده باشد، اول کد را برگردان**، وگرنه هر پرداخت به
`access_pending` می‌افتد.

---

## ۴. آزمونِ دودِ Production — دقیقاً همین مراحل

> با یک کاربرِ واقعی ولی **کم‌ارزش‌ترین محصولِ ممکن** و مبلغِ واقعی. زرین‌پال
> sandbox رفتارِ کدِ ۱۰۱ را کامل بازتولید نمی‌کند، پس مسیرِ replay فقط با
> تراکنشِ واقعی اثبات می‌شود.

| # | کار | انتظار |
|---|---|---|
| ۱ | با یک حسابِ تازه ثبت‌نام کن، وارد شو | `/dashboard` باز می‌شود |
| ۲ | `/terminal` را باز کن | به `/dashboard` برمی‌گردی (هنوز دسترسی نداری) |
| ۳ | خرید را شروع کن | به زرین‌پال می‌روی |
| ۴ | پرداخت را **کامل** کن | به `/payment/result?status=success&ref=…` برمی‌گردی |
| ۵ | صفحهٔ نتیجه | سبز، بدونِ `access=pending` |
| ۶ | `/terminal` را باز کن | **باز می‌شود** — این معیارِ اصلیِ مأموریت است |
| ۷ | همان URLِ callback را دوباره باز کن (replay) | باز هم موفق، بدونِ خطا |
| ۸ | ردیف‌ها را بشمار | `payments` +۱ · `entitlements` **+۱ نه +۲** |

```sql
-- گامِ ۸ — با authorityِ همان تراکنش:
SELECT p.status, p.ref_id, p.amount,
       (SELECT count(*) FROM public.entitlements e
         WHERE e.user_id = p.user_id AND e.source = 'payment:' || p.authority) AS ent_count
  FROM public.payments p WHERE p.authority = '<AUTHORITY>';
-- انتظار: status='paid' · ref_id ناتهی · ent_count=1
```

### آزمونِ لغو (جدا، با تراکنشِ دوم)

| # | کار | انتظار |
|---|---|---|
| ۱ | خرید را شروع کن | به زرین‌پال می‌روی |
| ۲ | در درگاه **انصراف** بزن | به صفحهٔ نتیجه با `status=failed` برمی‌گردی |
| ۳ | ردیف را بررسی کن | `payments.status='failed'` · هیچ `entitlements` جدیدی نه |
| ۴ | `/terminal` | همچنان بسته |

### اگر `access=pending` دیدی

یعنی پول گرفته شده و دسترسی ساخته نشده. این حالت **طراحی‌شده** است، نه خرابی
پنهان:

```sql
SELECT after->>'authority' AS authority, after->>'stage' AS stage,
       after->>'message' AS message, created_at
  FROM public.audit_log
 WHERE action = 'payment.finalize_failed'
 ORDER BY created_at DESC LIMIT 20;
```

پس از رفعِ علت، کافی است کاربر همان لینکِ بازگشت را دوباره باز کند — مسیر
خودترمیم‌شونده است و دسترسیِ دوم نمی‌سازد.

---

## ۵. آنچه این رویه اثبات **نمی‌کند**

- **بازپرداخت (refund).** هیچ مسیرِ خودکاری وجود ندارد. لغوِ دسترسی فقط دستی
  با `revoked_at` است.
- **انقضا.** هیچ کارِ زمان‌بندی‌شده‌ای دسترسیِ منقضی را پاک نمی‌کند؛
  `lib/access.ts` و `middleware.ts` هر بار `expires_at > now()` را می‌سنجند.
  یعنی انقضا کار می‌کند، ولی ردیفِ منقضی در جدول می‌ماند (عمدی، برای ممیزی).
- **مبلغِ متفاوت برای محصولاتِ آینده.** الان قیمتِ دوره از
  `NEXT_PUBLIC_COURSE_PRICE_TOMAN` و قیمتِ وبینار از `webinars.price_toman`
  می‌آید. محصولِ سوم به تصمیمِ جدید نیاز دارد.

## ترتیبِ اجرا — از وابستگیِ واقعیِ SQL، نه از تاریخ

ترتیب با خواندنِ خودِ فایل‌ها استخراج شد: چه جدولی را هر migration **می‌سازد** و
به چه جدولی **ارجاع** می‌دهد. ارجاع به تابعی که هر دو فایل
`CREATE OR REPLACE` می‌کنند وابستگی نیست — بازتعریف است — و اگر شمرده شود یک
حلقهٔ کاذبِ `phase20 ↔ phase22` می‌سازد.

**تنها پیش‌نیازِ جدول‌محورِ واقعی:**

```
phase20_intelligence_model  →  phase22_manual_intelligence_workflow
        (intel_analyses · intel_claims · intel_claim_evidence)
```

بقیه از نظرِ ارجاع مستقل‌اند.

### قیدی که تحلیلِ ایستا نمی‌بیند

`phase23_grant_hardening` هیچ جدولی نمی‌سازد و به هیچ جدولی ارجاع نمی‌دهد، پس
مرتب‌سازیِ توپولوژیک آن را وسط می‌گذارد. **این غلط است.** آن فایل روی
جدول‌هایی که *در لحظهٔ اجرا* وجود دارند `REVOKE` می‌زند؛ هر جدولی که بعدش
ساخته شود پوششی نمی‌گیرد و امتیازهای سخاوتمندانهٔ `ALTER DEFAULT PRIVILEGES`
را به ارث می‌برد.

اندازه‌گیری‌شده روی Postgresِ یک‌بارمصرف با پروفایلِ
`sql/test/profile_legacy_default_privileges.sql`:

| ترتیب | امتیازِ خطرناک روی جدول‌های تازه |
|---|---|
| `phase23` آخر | ۱ |
| `phase23` اول | ۴ |

هر دو عدد **پیش از اصلاحِ زیر** گرفته شدند.

### نقصی که همین اندازه‌گیری پیدا کرد

آن «۱» تصادفی نبود: `phase24` امتیازِ `entitlement_durations` را فقط از
`public, anon` پس می‌گرفت و `authenticated` را جا انداخته بود، پس **UPDATE روی
جدولِ مدتِ دسترسی** برایش می‌ماند. RLS جلویش را می‌گرفت، ولی درسِ `B-044` همین
است: گرنت لایهٔ دوم است و `TRUNCATE` اصلاً از RLS رد نمی‌شود.

پس از اصلاح (افزودنِ `authenticated` به REVOKE و `FORCE ROW LEVEL SECURITY`
روی هر دو جدولِ پیکربندی) هر سه سناریو **صفر** امتیازِ خطرناک می‌دهند —
`phase23` آخر، `phase23` اول، و حتی بدونِ `phase23`. یعنی `phase24`/`phase25`
دیگر برای امنیتِ جدول‌های خودشان به ترتیب وابسته نیستند.

⚠️ ولی `phase23` همچنان باید **آخر** اجرا شود، چون ۴۱ جدولِ از پیش موجودِ
Production را پوشش می‌دهد.

### ترتیبِ پیشنهادی

```
phase8b_leads · phase20_intelligence_model · phase21_cron_runs
      ↓
phase22_manual_intelligence_workflow      (پس از phase20)
      ↓
phase24_payment_entitlement · phase25_geopolitical_intake
      ↓
phase23_grant_hardening                   (همیشه آخر)
```

### بازگشت (Rollback)

هر شش فایل idempotent و افزایشی‌اند؛ اجرای دوباره بی‌خطر است. بازگشتِ واقعی
**بازگردانی از بکاپ** است، نه اسکریپتِ معکوس — `phase23` امتیازهایی را پس
می‌گیرد که هیچ migrationی نداده بود، پس «معکوسش» تعریفِ روشنی ندارد.

⚠️ به همین دلیل هیچ‌کدام تا وقتی بکاپِ بازگردانی‌شده PASS نگیرد اجرا نمی‌شوند.
