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
| `sql/phase24_payment_entitlement.sql` | ایندکسِ یکتای `entitlements(user_id, source)` + تابعِ `finalize_paid_access` |
| `lib/payments/finalize.ts` | تنها ماشینِ حالتِ پرداخت |
| دو `callback` | هر دو همان تابع را صدا می‌زنند |

**اضافه‌شونده است، نه مخرب.** هیچ جدول، ستون، سیاست یا داده‌ای حذف یا بازنویسی
نمی‌شود. `verify_payment` / `fail_payment` / `create_payment` دست‌نخورده‌اند.

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

### ۲.۱ آزمونِ رفتاری روی staging (چیزی که تستِ ایستا نمی‌تواند اثبات کند)

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
