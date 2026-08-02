# راستی‌آزماییِ Staging — `P2-G3-003` Wave 1

> تاریخ: ۱۴۰۵/۰۵/۱۱ · Staging: `oqjcvkzyvhqnphopedpn` (`portfolio-staging-g2006`)
> · Production: `uooeygybrniptzdxuzhj` — **فقط خوانده شد، هیچ SQLای اجرا نشد**
>
> هر ردیفِ این سند نتیجهٔ یک **اندازه‌گیریِ واقعی** روی همان پروژه است، نه
> استنتاج از فایلِ migration.

---

## ۰) هویت‌ها — تأییدِ دوباره پیش از هر تغییر

| نقش | project id | نام | ساخته‌شده |
|---|---|---|---|
| Production | `uooeygybrniptzdxuzhj` | `safariarash7777-source's Project` | ۲۰۲۶-۰۴-۱۴ |
| Staging | `oqjcvkzyvhqnphopedpn` | `portfolio-staging-g2006` | ۲۰۲۶-۰۷-۳۰ |

---

## ۱) `phase20` و `phase21` واقعاً روی Staging اجرا شده‌اند

هر ۱۵ جدولِ `intel_*` به‌علاوهٔ `cron_runs` موجودند و **RLS روی هر ۱۶ جدول
روشن** است.

| جدول | RLS | سیاست | ایندکس | تریگر | قید | ستون |
|---|---|---|---|---|---|---|
| `cron_runs` | ✅ | ۲ | ۳ | ۱ | ۱۰ | ۱۱ |
| `intel_analyses` | ✅ | ۲ | ۲ | ۱ | ۶ | ۱۲ |
| `intel_analysis_signals` | ✅ | ۱ | ۱ | ۱ | ۴ | ۴ |
| `intel_claim_evidence` | ✅ | ۱ | ۱ | ۱ | ۴ | ۴ |
| `intel_claims` | ✅ | ۱ | ۲ | ۱ | ۸ | ۹ |
| `intel_corrections` | ✅ | ۱ | ۱ | ۱ | ۵ | ۷ |
| `intel_effects` | ✅ | ۱ | ۱ | ۱ | ۹ | ۱۱ |
| `intel_events` | ✅ | ۱ | ۲ | ۱ | ۵ | ۹ |
| `intel_evidence` | ✅ | ۱ | ۳ | ۱ | ۶ | ۹ |
| `intel_portfolio_effects` | ✅ | ۱ | ۲ | ۱ | ۸ | ۹ |
| `intel_reference_portfolios` | ✅ | ۱ | ۲ | ۰ | ۴ | ۶ |
| `intel_reference_positions` | ✅ | ۱ | ۱ | ۱ | ۴ | ۴ |
| `intel_reference_versions` | ✅ | ۱ | ۳ | ۱ | ۱۰ | ۱۱ |
| `intel_run_inputs` | ✅ | ۱ | ۱ | ۱ | ۷ | ۶ |
| `intel_runs` | ✅ | ۱ | ۲ | ۰ | ۷ | ۱۳ |
| `intel_sources` | ✅ | ۱ | ۱ | ۰ | ۶ | ۱۰ |

**هیچ Migrationِ نیمه‌اجرا یا driftی داخلِ خودِ `phase20`/`phase21` پیدا نشد.**
Migration دوباره اجرا **نشد** — اول drift اندازه گرفته شد.

### گرنت‌ها — اصلاحِ `B-034` سرِ جایش است

`service_role` روی هیچ‌کدام از ۱۵ جدول `DELETE` یا `TRUNCATE` ندارد:
`INSERT,SELECT` روی همه، به‌اضافهٔ `UPDATE` فقط روی همان ۶ جدولی که چرخهٔ
دومرحله‌ای دارند (`intel_analyses`, `intel_runs`, `intel_sources`,
`intel_reference_portfolios`, `intel_reference_versions`,
`intel_reference_positions`).

**کنترلِ رفتاری:** `SET ROLE service_role; TRUNCATE …` روی **هر ۱۵ جدول**
⟵ `permission denied`. ۱۵ از ۱۵.

---

## ۲) دو نقصِ واقعیِ Staging که با اندازه‌گیری پیدا شد

هیچ‌کدام نقصِ `phase20` نیست؛ هر دو نتیجهٔ ناقص‌بودنِ **fixtureهای پیش‌نیازِ
staging** است — یعنی همان `B-036`.

### `B-041` — ادمین بی‌صدا از نوشتن قفل بود

`profiles` روی staging: **RLS روشن، صفر سیاست**. پس `authenticated` هیچ
سطری از `profiles` نمی‌دید، و سیاستِ همهٔ جدول‌های `intel_*`:

```sql
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
```

**همیشه false** می‌شد. نتیجه: ادمین می‌توانست بخواند (چون جدول‌ها خالی‌اند و
«اجازه دارم ولی خالی است» از «اجازه ندارم» قابلِ تفکیک نبود) ولی **هیچ‌وقت
نمی‌توانست بنویسد**.

> **اعترافِ روشِ کار:** کنترلِ اولِ من «ادمین SELECT» را `PASS` اعلام کرد، در
> حالی که جدول صفر سطر داشت. آن `PASS` بی‌معنا بود — دقیقاً همان ادغامِ
> «خالی» با «نمی‌بینم» که کلِ این محصول علیه‌اش ساخته شده، این‌بار در تستِ
> خودم. چیزی که واقعاً خبر داد، شکستِ `INSERT` بود.

`sql/test/supabase_bootstrap.sql:84` این تله را از قبل توضیح داده بود، ولی
آن فایل هرگز روی پروژهٔ واقعیِ staging اجرا نشده بود.

### `B-042` — `anon` روی `profiles` گرنتِ حذف داشت

`profiles` گرنتِ پیش‌فرضِ کامل داشت: `anon` و `authenticated` هر دو
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`.

**کنترلِ رفتاری، پیش از اصلاح:**

| کنترل | نتیجه | تفسیر |
|---|---|---|
| `anon DELETE FROM profiles` | **ACCEPTED** | امتیاز واقعاً در اختیارِ `anon` بود |
| `anon TRUNCATE profiles` | رد شد — ولی با پیامِ *cannot truncate a table referenced in a foreign key* | **نه `permission denied`.** یعنی امتیاز هست و فقط یک FKِ تصادفی جلویش را گرفته |

پوششِ فعلی دو چیزِ تصادفی بود، نه کنترلِ امنیتی: RLSای که هیچ سیاستی نداشت،
و یک کلیدِ خارجی. **اگر فقط سیاستِ خواندن اضافه می‌شد** — کارِ به‌ظاهر بدیهیِ
«مثلِ Production کن» — همان لحظه `DELETE` برای `anon` از پوشیده به **زنده**
می‌رفت.

---

## ۳) اصلاح، و اندازه‌گیریِ دوباره

`sql/staging/g3003_staging_profiles_prereq.sql` روی **staging** اجرا شد:
اول `REVOKE`، بعد حداقلِ `GRANT`، بعد سیاستِ خواندنِ سطرِ خود.

| کنترل | پیش از اصلاح | پس از اصلاح |
|---|---|---|
| `anon DELETE profiles` | **ACCEPTED** ❌ | `permission denied` ✅ |
| ادمین سطرِ پروفایلِ خودش را می‌خواند | ۰ سطر ❌ | ۱ سطر ✅ |
| ادمین `INSERT` در `intel_events` | RLS رد می‌کرد ❌ | پذیرفته شد ✅ |
| ادمین `DELETE` در `intel_events` | — | `permission denied` ✅ |
| کاربر عادی `INSERT` در `intel_events` | RLS رد کرد ✅ | RLS رد کرد ✅ |
| کاربر عادی `SELECT` روی `intel_events` | ۰ سطر ✅ | ۰ سطر ✅ |
| کاربر عادی پروفایلِ ادمین را می‌خواند | — | ۰ سطر ✅ |
| `anon SELECT` روی `intel_events` | `permission denied` ✅ | `permission denied` ✅ |

مسیرِ رسیدن به «پذیرفته شد» خودش شاهد است: خطاها به‌ترتیب از **RLS** به
**NOT NULL** به **CHECK** جابه‌جا شدند — یعنی لایهٔ مجوز واقعاً باز شد و
لایه‌های اعتبارسنجی دست‌نخورده ماندند.

### هیچ دادهٔ ساختگی باقی نماند

همهٔ fixtureها (کاربرِ auth، پروفایل، رخدادِ آزمایشی) داخلِ زیرتراکنشی اجرا
شدند که **همیشه rollback می‌شود**. اندازه‌گیریِ پایانی:

```
auth.users = 0 · profiles = 0 · مجموعِ ۱۵ جدول intel_* = 0 سطر · cron_runs = 1
```

آن یک ردیفِ `cron_runs` همان ردیفِ تمرینیِ پیشوند‌دارِ `rehearsal:` از
`P2-G3-002` است و تازه ساخته نشده.

---

## ۴) تفاوت‌های Staging با Production (به‌روزرسانیِ `B-036`)

| جدول | Staging | Production |
|---|---|---|
| `profiles` | RLS ✅ · **۰ سیاست** ⟵ حالا ۱ | RLS ✅ · ۴ سیاست |
| `signals` | RLS ✅ · **۰ سیاست** | RLS ✅ · ۱ سیاست |
| `signal_drafts` | RLS ✅ · **۰ سیاست** | RLS ✅ · ۳ سیاست |
| `weekly_outlooks` | **جدول وجود ندارد** | موجود · ۱ سیاست |
| `audit_log` | **جدول وجود ندارد** | موجود · ۱ سیاست |

⚠️ **تعمیم ندهید.** این‌ها نقصِ Production نیستند — Production همهٔ این
سیاست‌ها را دارد. این فهرست فقط می‌گوید تمرینِ staging دربارهٔ Production
**چه چیزی را اثبات نمی‌کند**. (درسِ `B-035`: «staging هشدار داد» تا وقتی
staging کپیِ Production نیست، دربارهٔ Production هیچ نمی‌گوید.)

`weekly_outlooks` و `audit_log` روی staging نبودنشان یعنی ناحیهٔ
«تصمیم‌ها» و مسیرِ audit در تمرینِ staging کاملاً آزمودنی نیست.

---

## ۵) آنچه این سند اثبات نمی‌کند

- **تستِ HTTPِ احرازشده نیست.** همهٔ کنترل‌ها در سطحِ دیتابیس با `SET ROLE`
  و claimهای JWTِ شبیه‌سازی‌شده اجرا شدند.
- **دربارهٔ Production چیزی نمی‌گوید** جز آنچه در بخشِ ۴ فقط‌خواندنی سنجیده شد.
- **Gate 3 را پاس نمی‌کند** و تمرینِ ده‌روزه را شروع نمی‌کند.
