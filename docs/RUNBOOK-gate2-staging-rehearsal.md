# Runbook — تمرینِ stagingِ مسیرِ لید (`G2-006`)

> 🛑 **هیچ‌کدام از این دستورها اجرا نشده است.** اجرا مشروط به مجوزِ صریحِ
> `AUTHORIZE_GATE2_STAGING` است که **در مأموریتِ `P2-G2-MEGA-001` داده نشد**.
>
> **این runbook برای staging است، نه Production.** هیچ SQLای روی Production
> اجرا نمی‌شود — نه در این تمرین، نه بعدش بدونِ تصمیمِ جداگانه.

---

## چرا این تمرین لازم است

جدولِ `public.leads` **وجود ندارد** (`to_regclass = null`، بازتأییدِ فقط‌خواندنی
در P1-009: ۴۱ جدولِ `public` فهرست شد و `leads` نبود). یعنی مسیرِ لید از سه جا
شکسته است و هیچ‌کدام تا حالا سرتاسر آزمایش نشده:

```
مینی‌اپ → MySQLِ محلی ✅ → اعلانِ تلگرام ✅ → وبهوکِ Portfolio ⚠️ → Supabase `leads` ❌
```

- ✅ ردیفِ MySQL و اعلانِ تلگرام کار می‌کنند و **لیدِ معتبر همان است**
- ⚠️ فراخوانندهٔ وبهوک تازه در PR #3ِ مینی‌اپ کران‌دار و قابلِ مشاهده شد (`B-019`)؛
  متغیرهایش هنوز در محیطِ اجرا تنظیم نشده‌اند (`B-020`)
- ❌ مقصد اصلاً وجود ندارد

## پیش‌نیازها

| # | شرط | وضعیت |
|---|---|---|
| ۱ | مجوزِ `AUTHORIZE_GATE2_STAGING` از آرش | ❌ **داده نشده** |
| ۲ | `D-001` (سرنوشتِ `leads`) بسته شده باشد | ❌ باز · `Authority=ARASH` |
| ۳ | پروژه/برنچِ **staging**ِ Supabase مشخص باشد | ❓ تعیین‌نشده |
| ۴ | `PLATFORM_WEBHOOK_SECRET` روی هر دو سمتِ staging یکسان | ❓ |
| ۵ | PR #3ِ مینی‌اپ merge و روی staging مستقر | ❌ draft |

> **بدونِ بندِ ۱ هیچ دستوری اجرا نمی‌شود.** بندهای ۲ تا ۵ پیش‌نیازِ معنادار
> بودنِ نتیجه‌اند: تمرین روی محیطی که سکرتش تنظیم نیست فقط ۴۰۱ تولید می‌کند.

---

## گام ۱ — اجرای migration روی **staging**

فایل: [`sql/phase8b_leads.sql`](../sql/phase8b_leads.sql)

خواصِ راستی‌آزمایی‌شدهٔ فایل (فقط‌خواندنی، بدونِ اجرا):

| خاصیت | شاهد |
|---|---|
| idempotent | `CREATE TABLE IF NOT EXISTS` · `DROP POLICY IF EXISTS` · `CREATE INDEX IF NOT EXISTS` |
| غیرمخرب | هیچ `DROP TABLE`، هیچ `DROP COLUMN`، هیچ تغییرِ نامِ شیٔ دیگر |
| RLS | `ENABLE ROW LEVEL SECURITY` + سیاستِ `service_role` + سیاستِ `admin` |
| قفلِ anon | `REVOKE ALL ON public.leads FROM anon` |
| اعتبارسنجی | `CHECK` روی `status` و طولِ `name` |
| ایندکس | `created_at DESC` · `status` · `(phone, created_at)` · `telegram_id` |
| rollback | بلوکِ صریح در انتهای فایل |

**dedup عمداً UNIQUE ندارد** — کامنتِ خودِ فایل: یک قیدِ یکتای دائمی، درخواستِ
مجددِ مشروعِ همان شخص را برای همیشه رد می‌کند. تشخیصِ تکرار در `lib/leads/webhook.ts`
با پنجرهٔ ۱۰ دقیقه‌ای انجام می‌شود.

```bash
# فقط روی پروژه/برنچِ staging — هرگز روی Production
# با ابزارِ انتخابی (Supabase SQL editor روی برنچِ staging یا CLI)
```

## گام ۲ — چک‌لیستِ شواهد

هر بند باید **خروجیِ واقعی** داشته باشد، نه فرض:

- [ ] `select to_regclass('public.leads');` → غیرِ `null`
- [ ] `select relrowsecurity from pg_class where relname='leads';` → `true`
- [ ] چهار ایندکس موجودند
- [ ] `anon` هیچ grantی روی `leads` ندارد
- [ ] یک لیدِ **مصنوعیِ صریحاً برچسب‌خورده** از مینی‌اپِ staging فرستاده شد
      (`name` با پیشوندِ `TEST_`, شمارهٔ رزروشدهٔ آزمایشی — **هیچ دادهٔ واقعیِ مشتری**)
- [ ] ردیفِ MySQLِ محلی ساخته شد
- [ ] وبهوک **۲۰۰** برگرداند (نه ۴۰۱ — این همان چیزی است که `B-020` می‌شکست)
- [ ] ردیفِ متناظر در Supabase `leads` هست
- [ ] در پنلِ ادمین دیده می‌شود
- [ ] ارسالِ دوبارهٔ همان لید در پنجرهٔ ۱۰ دقیقه‌ای **تکراری** تشخیص داده شد
- [ ] `/admin/health` ردیفِ «آمادگیِ جدولِ لید» را `ok` نشان می‌دهد

## گام ۳ — رفتار با رکوردِ مصنوعی

طبقِ سیاستِ آزمونِ تأییدشده حذف یا نگه داشته می‌شود. **پیش‌فرض: حذف** —
`delete from public.leads where name like 'TEST\_%';` روی **staging**.
(جدول append-only نیست، پس حذفِ رکوردِ آزمایشی مانعِ سیاستی ندارد.)

## گام ۴ — rollback

بلوکِ انتهای `sql/phase8b_leads.sql`:

```sql
-- DROP TRIGGER  IF EXISTS trg_leads_set_updated_at ON public.leads;
-- DROP FUNCTION IF EXISTS public.leads_set_updated_at();
-- DROP TABLE    IF EXISTS public.leads;
```

⚠️ هشدارِ خودِ فایل: **اگر جدول دادهٔ واقعی دارد `DROP TABLE` نزن** — لیدِ واقعی
از بین می‌رود. روی staging پس از تمرین بی‌خطر است.

## گام ۵ — ثبت

`MIGRATION-LEDGER.md` فقط پس از اجرای واقعی به‌روز می‌شود، با تفکیکِ صریحِ
**staging از Production**. اجرای staging **به‌هیچ‌وجه** ردیفِ Production را
`APPLIED` نمی‌کند.

---

## وضعیتِ فعلی

**متوقف پیش از گامِ ۱.** مجوزِ `AUTHORIZE_GATE2_STAGING` داده نشده، پس دستورها
آماده‌اند و اجرا نشده‌اند. هیچ SQLای اجرا نشد، هیچ migrationی اعمال نشد، و هیچ
لیدِ واقعی‌ای ساخته یا فرستاده نشد.
