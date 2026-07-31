# Runbook — تمرینِ stagingِ `phase21` (cron ledger) و `phase20` (intelligence)

> 🛑 **هیچ‌کدام از این دستورها اجرا نشده است.** این سند **برنامه** است، نه گزارشِ اجرا.
> اجرا مشروط به مجوزِ صریحِ آرش است و **فقط روی staging** (`oqjcvkzyvhqnphopedpn`).
> Production (`uooeygybrniptzdxuzhj`) در هیچ گامی لمس نمی‌شود.
>
> مرتبط: `docs/RUNBOOK-gate2-staging-rehearsal.md` (تمرینِ لید، اجراشده)،
> `docs/MIGRATION-LEDGER.md`، ADR-005.

---

## ۰. چرا ترتیب مهم است

دو migration مستقل‌اند — نه جدولِ مشترکی دارند، نه تابعِ مشترکی، و هیچ‌کدام به
دیگری ارجاع نمی‌دهد (بررسی‌شده در `P2-G2-013`). پس **وابستگیِ فنی** بینشان نیست.

ولی ترتیبِ پیشنهادی همچنان `phase21` → `phase20` است، به یک دلیلِ عملیاتی:

`phase21` کوچک است (یک جدول)، **قابلِ مشاهده‌شدن در نمای سلامت** است، و اگر
چیزی در فرضِ محیطیِ ما غلط باشد، آنجا با کمترین هزینه معلوم می‌شود. `phase20`
پانزده جدول دارد؛ اجرای آن پیش از اینکه بدانیم محیط همان‌طور رفتار می‌کند که
انتظار داریم، ریسکِ بی‌دلیلی است.

**پیش‌نیازِ هر دو:** `public.profiles` و `public.deny_mutation()` باید روی
staging موجود باشند. اولی هست (در `G2-006` ساخته شد)؛ دومی باید بررسی شود.

---

## ۱. پیش از هر چیز — تأییدِ هویتِ محیط

```sql
-- باید `oqjcvkzyvhqnphopedpn` باشد. اگر نبود، متوقف شو.
select current_database(), inet_server_addr();
select count(*) as intel_tables from pg_tables
 where schemaname='public' and tablename like 'intel\_%';   -- انتظار: 0
select to_regclass('public.cron_runs');                      -- انتظار: null
select to_regclass('public.deny_mutation');                  -- پیش‌نیازِ phase20
```

⚠️ درسِ `G2-006`: پیش از اجرا **ref را دوباره تأیید کن**، نه یک‌بار در ابتدای
جلسه. اشتباهِ محیط گران‌ترین اشتباهِ ممکن در این پروژه است.

---

## ۲. گامِ اول — `phase21_cron_runs.sql`

```bash
# فقط روی staging
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -f sql/phase21_cron_runs.sql
```

### راستی‌آزماییِ RLS و گرنت

```sql
select relrowsecurity from pg_class where oid='public.cron_runs'::regclass;   -- t
select policyname, cmd from pg_policies
 where schemaname='public' and tablename='cron_runs';                          -- 2 ردیف

-- گرنتِ کمینه — همان چیزی که تستِ CI اجبار می‌کند
select grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema='public' and table_name='cron_runs'
   and grantee in ('anon','authenticated','service_role')
 group by grantee;
-- انتظار: anon غایب · authenticated=SELECT · service_role=INSERT,SELECT,UPDATE

-- ⚠️ این دو مهم‌ترین‌اند: RLS جلوی TRUNCATE را نمی‌گیرد
select has_table_privilege('authenticated','public.cron_runs','TRUNCATE');     -- f
select has_table_privilege('service_role','public.cron_runs','TRUNCATE');      -- f
```

### دادهٔ آزمایشی — صریحاً برچسب‌خورده

```sql
-- job_key عمداً با پیشوندِ rehearsal تا از رکوردِ واقعی تفکیک‌پذیر باشد
insert into public.cron_runs (job_key) values ('rehearsal:alerts') returning id;
update public.cron_runs set status='succeeded', finished_at=now(),
       processed_count=0, duration_ms=42
 where job_key='rehearsal:alerts';

-- گذارِ غیرمجاز باید رد شود
update public.cron_runs set status='failed', error_code='x'
 where job_key='rehearsal:alerts';        -- انتظار: «اجرای تمام‌شده … تغییر نمی‌کند»
```

### پاک‌سازی

```sql
-- حذف با تریگر ممنوع است؛ همین درست است. پس رکوردِ تمرینی **می‌ماند** و با
-- پیشوندِ `rehearsal:` از دادهٔ واقعی تفکیک می‌شود. اگر باید برود، rollback کن.
select job_key, status from public.cron_runs where job_key like 'rehearsal:%';
```

---

## ۳. گامِ دوم — `phase20_intelligence_model.sql`

فقط **پس از** سبزشدنِ گامِ اول.

```bash
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -f sql/phase20_intelligence_model.sql
```

### راستی‌آزمایی

```sql
select count(*) from pg_tables where schemaname='public' and tablename like 'intel\_%';
select relname, relrowsecurity from pg_class
 where relname like 'intel\_%' and relkind='r' and not relrowsecurity;   -- انتظار: صفر ردیف

-- anon فقط روی تحلیلِ منتشرشده
select table_name, privilege_type from information_schema.role_table_grants
 where grantee='anon' and table_name like 'intel\_%';

-- قیدهای غیرقابل‌مذاکره
insert into public.intel_claims (analysis_id, kind, statement, confidence)
values (gen_random_uuid(),'FACT','x',50);            -- انتظار: evidence_id NOT NULL
insert into public.intel_analyses (domain,title,body_md,status)
values ('macro_ir','t','b','published');             -- انتظار: publish_needs_approval
```

### دادهٔ آزمایشی

هیچ. مدلِ هوشمندی **دادهٔ تحلیلی** نگه می‌دارد و دادهٔ ساختگی در آن دقیقاً
همان چیزی است که کارنامه را بی‌ارزش می‌کند. فقط قیدها آزموده می‌شوند (که با
`INSERT`های مردود انجام می‌شود و چیزی باقی نمی‌گذارد).

---

## ۴. Rollback

هر دو فایل بلوکِ rollback دارند. قاعدهٔ مشترک:

| وضعیت | اقدام |
|---|---|
| جدول خالی است | `DROP` بی‌خطر است — بلوکِ انتهای همان فایل |
| دادهٔ واقعی دارد | **`DROP` نزن.** مسیرِ نوشتن را ببند و جدول را نگه دار |

`phase21` استثنای نسبی است: تله‌متری است نه دادهٔ محصول، پس `DROP`ش کم‌خطرتر
است. ولی اگر برای ممیزیِ یک حادثه لازم باشد، همان تاریخچه دقیقاً چیزی است که
نباید از بین برود.

---

## ۵. چه چیزی این تمرین **اثبات نمی‌کند**

اجرای موفقِ staging دربارهٔ Production **هیچ چیز** ثابت نمی‌کند. ردیفِ
Production در `MIGRATION-LEDGER` دست‌نخورده می‌ماند و وضعیتِ هر دو فایل
`APPLIED_TO_STAGING_ONLY` می‌شود، نه `APPLIED`.

همچنین اجرای migration **اجرای واقعیِ cron را اثبات نمی‌کند**. تا وقتی یک
Vercel Cron واقعی روی محیطی با این جدول شلیک نکند، «آخرین اجرای موفق» همچنان
`UNKNOWN` است — فقط این بار نمای سلامت **می‌تواند** آن را بداند، که پیش‌تر
نمی‌توانست.
