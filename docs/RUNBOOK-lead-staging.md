# Runbook — فعال‌کردنِ مسیرِ لید روی Staging

> **وضعیت: اجرا نشده.** این سند یک دستورالعملِ اجراست، نه گزارشِ اجرا. تا امروز
> (۲۰۲۶-۰۷-۲۵) هیچ‌کدام از گام‌های زیر انجام نشده؛ نه SQLای اجرا شده، نه متغیری ست
> شده، نه استقراری رخ داده.
>
> پیش‌نیازِ سخت: **تصمیمِ `D-001`** (`DECISION-LOG.md`). اگر آرش گزینهٔ «حذفِ کدِ
> وبهوک» را انتخاب کند، این runbook کلاً منتفی است.
>
> مرتبط: [`ADR/003-lead-source-of-truth.md`](./ADR/003-lead-source-of-truth.md) ·
> [`MIGRATION-LEDGER.md`](./MIGRATION-LEDGER.md) ·
> [`ENVIRONMENT-MATRIX.md`](./ENVIRONMENT-MATRIX.md) ·
> [`COMMAND-CENTER.md`](./COMMAND-CENTER.md)

**هیچ مقدارِ سکرتی در این سند نوشته نمی‌شود.** هر جا «مقدار» آمده یعنی چیزی که فقط
در کنسولِ Vercel/Coolify وارد می‌شود.

---

## گامِ ۰ — پیش از هر چیز

| # | کار | معیارِ قبولی |
|---|---|---|
| 0.1 | تصمیمِ `D-001` گرفته و در `DECISION-LOG.md` ثبت شده باشد | ردیفِ D-001 دیگر `OPEN` نباشد |
| 0.2 | مشخص شود «staging» دقیقاً چیست | **`DECISION_REQUIRED`** — امروز پروژهٔ Supabaseِ جدایی برای staging وجود ندارد؛ فقط `uooeygybrniptzdxuzhj` می‌شناسیم. یا یک پروژه/برنچِ جدا ساخته شود، یا آرش صریحاً بپذیرد که اجرا مستقیماً روی همان پروژه است |
| 0.3 | مالکِ اجرا مشخص باشد | یک نامِ واقعی، نه `OWNER_UNASSIGNED` |

> ⚠️ گامِ ۰.۲ واقعاً بازدارنده است. **این runbook را روی Production اجرا نکنید** به
> این بهانه که «staging نداریم». اگر staging نیست، اول تصمیمِ صریح لازم است.

## گامِ ۱ — پشتیبان / اسنپ‌شات

1. از داشبوردِ Supabase یک **backup/snapshot** دستی از پروژهٔ هدف بگیرید و شناسه و
   ساعتش را یادداشت کنید.
2. تأیید کنید که backup **کامل شده** است، نه در حالِ اجرا.

> اگر جدولِ `leads` هنوز وجود ندارد، این migration ذاتاً افزایشی است؛ با این حال
> backup شرطِ عبور است، چون همین اسکریپت `REVOKE` و `CREATE POLICY` هم دارد.

## گامِ ۲ — تأییدِ پروژهٔ هدف

```
انتظار: project ref هدف را با چشم با آنچه در PRODUCTION-ARCHITECTURE.md آمده مقایسه کنید.
هرگز روی ref منسوخِ lqfcyihuthdoqybwptxh اجرا نکنید (DD-011).
```

راستی‌آزماییِ فقط‌خواندنی پیش از اجرا:

```sql
SELECT current_database(), to_regclass('public.leads');
-- انتظار پیش از اجرا: leads → NULL
```

## گامِ ۳ — تأییدِ نامِ متعارفِ سکرت

- نامِ متعارف: **`PLATFORM_WEBHOOK_SECRET`** (DD-012).
- بررسی کنید امروز کدام‌یک از دو نام روی Vercel ست است. هر دو حالت پشتیبانی می‌شود،
  ولی هدف رسیدن به نامِ متعارف است.
- **هنوز چیزی را تغییر ندهید** — تغییرِ متغیر گامِ ۶ است.

## گامِ ۴ — اجرای migration

```bash
# فایل: sql/phase8b_leads.sql  (idempotent — اجرای دوباره بی‌خطر است)
```

- کلِ فایل را در SQL Editorِ پروژهٔ **staging** اجرا کنید.
- اسکریپت خودش `BEGIN`/`COMMIT` دارد؛ آن را تکه‌تکه اجرا نکنید.
- اگر خطایی داد، **ادامه ندهید** — گامِ ۱۳ (برگشت).

## گامِ ۵ — راستی‌آزماییِ جدول و ایندکس‌ها

هفت پرس‌وجوی راستی‌آزمایی در انتهای `sql/phase8b_leads.sql` هست. هر هفت را اجرا و
نتیجه را ثبت کنید. حداقلِ قابل‌قبول:

| بررسی | انتظار |
|---|---|
| `to_regclass('public.leads')` | `public.leads` |
| `relrowsecurity` | `t` |
| تعدادِ سیاست‌ها | ۲ |
| ایندکس‌ها | PK + `idx_leads_created`, `idx_leads_status`, `idx_leads_phone_created`, `idx_leads_telegram_id` |
| تریگر | `trg_leads_set_updated_at` |
| `has_table_privilege('anon', …, 'SELECT')` | `f` |

## گامِ ۶ — تنظیمِ سکرتِ staging

1. در **Portfolio** (Vercel، محیطِ Preview/Staging): `PLATFORM_WEBHOOK_SECRET` را با یک
   مقدارِ تصادفیِ قوی ست کنید.
2. در **Mini App** (Coolify/Manus): **همان مقدار** را با **همان نام** ست کنید، و
   `PLATFORM_WEBHOOK_URL` را به URLِ همان محیطِ staging سایت اشاره دهید.
3. مقدارِ Production و staging باید **متفاوت** باشند.

> اگر گامِ ۶.۲ فراموش شود، مسیر روی ۴۰۱ می‌ماند — دقیقاً همان `B-020`.

## گامِ ۷ — استقرارِ preview/staging

- یک preview deployment از برنچِ `fix/lead-recovery` بسازید (یا پس از merge، از main).
- تأیید کنید deployment سبز است و متغیرهای گامِ ۶ را دارد.

## گامِ ۸ — لیدِ مصنوعیِ تست

**فقط روی staging.** هرگز روی Production و هرگز با دادهٔ یک شخصِ واقعی.

```
POST <STAGING_URL>/api/leads/webhook
Header: X-Webhook-Secret: <مقدارِ گامِ ۶>
Body:
{
  "source": "staging-smoke-test",
  "name": "تستِ مصنوعی — حذف شود",
  "phone": "09000000000",
  "topic": "other",
  "message": "smoke test P1-009"
}
```

انتظار: **۲۰۰** با `{"ok":true,"duplicate":false}`.

## گامِ ۹ — راستی‌آزماییِ ردیف

```sql
SELECT id, source, name, phone, topic, status, created_at, updated_at
FROM public.leads
WHERE source = 'staging-smoke-test'
ORDER BY created_at DESC LIMIT 5;
```

انتظار: یک ردیف · `status = 'new'` · `created_at` و `updated_at` هر دو پر.

## گامِ ۱۰ — رفتارِ تکراری

1. **همان** درخواستِ گامِ ۸ را بلافاصله دوباره بفرستید.
   انتظار: **۲۰۰** با `{"ok":true,"duplicate":true,"code":"duplicate_ignored"}`.
2. شمارشِ ردیف‌ها باید **همچنان ۱** باشد.
3. یک بار دیگر با `"topic": "gold"` بفرستید → باید `duplicate:false` و ردیفِ دوم بسازد.

> پنجرهٔ تشخیص ۱۰ دقیقه است (`DUPLICATE_WINDOW_MS`). پس از آن، همان شماره دوباره
> درج می‌شود — این عمدی است (DD-013).

## گامِ ۱۱ — لاگ‌ها

در لاگِ همان deployment بررسی کنید:

- [ ] هیچ‌کجا **مقدارِ سکرت** چاپ نشده باشد (نه مقدارِ درست، نه مقدارِ ارسالیِ اشتباه).
- [ ] اگر از نامِ قدیمی استفاده شده، هشدارِ منسوخ دیده شود.
- [ ] خطای درج (اگر رخ داد) با `[Leads webhook]` قابلِ ردیابی باشد.

## گامِ ۱۲ — مسیرهای شکست

| سناریو | چطور | انتظار |
|---|---|---|
| سکرتِ اشتباه | هدر را عوض کنید | `401` · `unauthorized` · هیچ ردیفِ تازه‌ای |
| بدونِ هدر | هدر را حذف کنید | `401` |
| بدنهٔ خراب | `"{"` بفرستید | `400` · `invalid_json` |
| بدونِ نام | `name` را بردارید | `400` · `name_required` |
| شمارهٔ خراب | `"phone": "12"` | `400` · `invalid_phone` |
| پیامِ بیش‌ازحد بلند | ۴۰۰۱ کاراکتر | `400` · `field_too_long` · `field: "message"` |

پس از هر شش مورد، شمارشِ ردیف‌های `staging-smoke-test` نباید تغییر کرده باشد.

## گامِ ۱۳ — برگشت (Rollback)

بلوکِ کاملِ برگشت در انتهای `sql/phase8b_leads.sql` است.

- اگر جدول **خالی/فقط دادهٔ تست** دارد → همان بلوک را اجرا کنید (trigger، function، table).
- اگر **لیدِ واقعی** دارد → **`DROP TABLE` نزنید.** فقط `PLATFORM_WEBHOOK_SECRET` را از
  محیط بردارید تا مسیر بسته شود؛ جدول را دست‌نخورده نگه دارید.
- برگشتِ کد: revert کردنِ همین PR. جدول را نمی‌شکند (جدولِ بی‌استفاده بی‌ضرر است).

## گامِ ۱۴ — معیارهای ارتقا به Production

همه باید برقرار باشند:

- [ ] گام‌های ۴ تا ۱۲ روی staging سبز، با شواهدِ ثبت‌شده.
- [ ] دادهٔ تست از staging پاک شده (`DELETE … WHERE source='staging-smoke-test'`).
- [ ] `D-001` تصمیم‌گیری‌شده و ثبت‌شده.
- [ ] `PLATFORM_WEBHOOK_SECRET` در **هر دو** سرویسِ Production آماده (مقدارِ متفاوت از staging).
- [ ] `B-020` رفع شده باشد — وگرنه Production همان ۴۰۱ را می‌دهد.
- [ ] برای `B-019` تصمیم گرفته شده باشد: تا وقتی فراخواننده fire-and-forget است،
      شکستِ آینده باز هم بی‌صدا خواهد بود. **رفعِ این PR مسیر را درست می‌کند، ولی
      مشاهده‌پذیریِ سمتِ فرستنده را نه.**
- [ ] backup از Production گرفته شده باشد.
- [ ] `MIGRATION-LEDGER.md` پس از اجرا از `NOT_APPLIED` به `APPLIED` **همراه با شواهد**
      به‌روز شود — نه زودتر.
