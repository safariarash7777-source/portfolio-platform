# دفترِ مهاجرت‌ها (Migration Ledger)

> منبع: ممیزیِ فقط‌خواندنیِ P0-002 روی `uooeygybrniptzdxuzhj` + مقایسه با `sql/` ریپو.
> **هیچ Migration در تولیدِ این سند اجرا نشد.**
>
> **این سند منبعِ حقیقتِ migrationهاست.** بخشِ ۶ در
> [`COMMAND-CENTER.md`](./COMMAND-CENTER.md) فقط یک **نمای خلاصهٔ drift** است و عمداً
> ناقص؛ در هر اختلاف، **همین دفتر معتبر است**. تصمیم‌های مرتبط:
> `D-001` (سرنوشتِ `leads`) و `D-002` (migrationهای مینی‌اپ) در
> [`DECISION-LOG.md`](./DECISION-LOG.md).
>
> وضعیت‌ها: `APPLIED` · `APPLIED_TO_STAGING_ONLY` · `NOT_APPLIED` · `SUPERSEDED` ·
> `UNTRACKED` · `DECISION_REQUIRED`
>
> ## ⚠️ دو محیط را با هم اشتباه نگیر (`G2-006`، ۱۴۰۵/۰۵/۰۸)
>
> | محیط | project ref | نقش |
> |---|---|---|
> | **Production** | `uooeygybrniptzdxuzhj` | محیطِ فعال (`DD-011`). **در `G2-006` هیچ SQLای روی آن اجرا نشد.** |
> | **Staging** | `oqjcvkzyvhqnphopedpn` | پروژهٔ ایزولهٔ رایگان، ساخته‌شده در `G2-006` فقط برای همین تمرین. بدونِ دادهٔ واقعیِ کاربر. |
> | ~~منسوخ~~ | `lqfcyihuthdoqybwptxh` | **Production نیست** (`SD-002`/`DD-011`) — ref قدیمیِ غیرقابل‌دسترس. استفاده نشود. |
>
> **`APPLIED_TO_STAGING_ONLY` هرگز به‌معنای `APPLIED` نیست.** اجرای staging دربارهٔ
> Production هیچ چیزی ثابت نمی‌کند و ردیفِ Production را تغییر نمی‌دهد.
>
> **بازبینیِ مجددِ P1-005 (۲۰۲۶-۰۷-۲۵) — فقط فهرست‌کردنِ جدول‌ها، بدونِ اجرای هیچ SQL:**
> ردیف‌های زیر دوباره تأیید شدند و **تغییری نکرده‌اند** →
> `leads` **missing** (NOT_APPLIED) · `screener_starred` **missing** (NOT_APPLIED) ·
> `ime_certificate_history` / `ime_physical_trades` **missing** (NOT_APPLIED/SUPERSEDED) ·
> `ime_snapshots` **موجود** (UNTRACKED) · `payments`, `entitlements`, `symbol_history`,
> `codal_reports`, `codal_feed`, `fx_rates`, `index_history`, `market_breadth`,
> `fx_heavy_analytics` **موجود** (APPLIED). همهٔ جدول‌های موجود `rls_enabled=true` بودند.

## خلاصهٔ تصمیم‌محور

| مورد | وضعیت واقعیِ DB | تصمیم |
|---|---|---|
| جدولِ `leads` | Production: **missing** (`to_regclass=null`؛ بازتأییدِ فقط‌خواندنی ۲۰۲۶-۰۷-۲۵ در P1-009 — ۴۱ جدولِ `public` فهرست شد، `leads` نبود) · Staging: **موجود** | **APPLIED_TO_STAGING_ONLY · PRODUCTION: NOT_APPLIED** — در `G2-006` (۱۴۰۵/۰۵/۰۸) روی پروژهٔ **staging** `oqjcvkzyvhqnphopedpn` اجرا شد. روی Production (`uooeygybrniptzdxuzhj`) **هیچ SQLای اجرا نشد**. ADR-003 |
| جدول‌های `phase19` IME (`ime_certificate_history`, `ime_physical_trades`) | **missing** | **DECISION_REQUIRED** — به‌جایش `ime_snapshots` وجود دارد (طرحِ متفاوت) |
| ستون/جدولِ `screener_starred` | **missing** (نه ستونِ `starred`، نه جدول) | **NOT_APPLIED / FEATURE_BLOCKED** — تا عرضهٔ UIِ «منتخب» |
| `ime_snapshots` | **existing** ولی نه در migrations نه در `sql/` | **UNTRACKED** — باید در migrationِ ردیابی‌شده رسمی شود |
| schema `payments` | موجود، سازگار | **APPLIED / COMPATIBLE_WITH_PR_75** (amount, authority UNIQUE, status pending|paid|failed، تریگرِ append-only، RPCهای DEFINER) |
| `entitlements` | موجود، RLS، تریگرِ گارد | **APPLIED** |
| ایندکسِ یکتای `symbol_history` (dedup) | موجود (`phase16`) | **APPLIED** |

## نگاشتِ فایل‌های SQL ریپو → DB

| فایل `sql/` | وضعیت | شواهد |
|---|---|---|
| phase5_payments_telegram, phase6, phase7, phase8_webinars, phase9, phase10, phase11, phase12, phase13_fx_rates, phase14_rosad, phase15_security (+15b), phase16_symbol_history_dedup, phase17_market_breadth, phase18_purge_subtickers, terminal_t0, admin_dashboard_stats, admin_users_module | **APPLIED** | ۲۹ migrationِ ثبت‌شده منطبق |
| `phase8b_leads.sql` | **APPLIED_TO_STAGING_ONLY** · **Production: NOT_APPLIED** | فایل در P1-009 **در همان مسیر بازنویسی شد** (نه فایلِ جدید — تا طرحِ رقیبِ دوم ساخته نشود). در `G2-006` روی staging (`oqjcvkzyvhqnphopedpn`) اجرا و راستی‌آزمایی شد: جدول ساخته شد، `relrowsecurity=true`، ۲ سیاست، ۵ ایندکس (PK + ۴)، ۴ قید، تریگرِ `updated_at` شلیک می‌کند. **تصحیحِ ناشی از همان اجرا:** بخشِ گرنت‌ها بازنویسی شد — رجوع به ردیفِ زیر. Production دست‌نخورده. |
| `phase8b_leads.sql` — بخشِ گرنت‌ها (اصلاحِ `G2-006`) | **CORRECTED_BEFORE_PRODUCTION** | اندازه‌گیریِ واقعی روی staging نشان داد `REVOKE ALL … FROM anon` کافی نیست: `authenticated` امتیازِ پیش‌فرضِ Supabase را نگه می‌داشت — `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`. چون **RLS روی `TRUNCATE` اعمال نمی‌شود**، هر کاربرِ لاگین‌کردهٔ عادی امتیازِ خالی‌کردنِ کلِ جدولِ لید را داشت (محرمانگی برقرار، یکپارچگی نه). Security Advisor این را **نگرفت**. فایل اصلاح شد (`REVOKE` از `PUBLIC`/`anon`/`authenticated`، سپس `GRANT` کمینه) و گاردِ `lib/leads/grants.test.ts` اضافه شد. |
| `phase18_screener_starred.sql` | **NOT_APPLIED** | نه ستونِ `starred`، نه جدولِ `screener_starred` |
| `phase19_ime_tables.sql` | **NOT_APPLIED / SUPERSEDED** | جدول‌هایش نیستند؛ `ime_snapshots` (طرحِ دیگر) هست |
| `archive/*.sql` | **SUPERSEDED** | نسخه‌های اولیهٔ portfolio |
| (بدونِ فایل، در migrations) `profile_signup_*`, `admin_users_list`, `phase15b`, `create_fx_heavy_analytics`, `fx_heavy_analytics_revoke_anon` | **APPLIED** | via migration/MCP |
| `ime_snapshots` (شیٔ DB) | **UNTRACKED** | جدول هست، migration/فایل ندارد |

## توابع/تریگرها (خلاصهٔ امنیتی)
- **۲۴ تابع SECURITY DEFINER** همگی `SET search_path` دارند (هاردن‌شده).
- **۷ تابع INVOKER** (گاردها) با `search_path=''`.
- append-only روی ~۲۰ جدول (`deny_mutation`/`fn_forbid_mutation`)؛ هش‌زنجیره‌ای روی `signals`/`signal_outcomes`/`weekly_*`؛ `payments_guard` روی `payments`.

> جزئیاتِ کاملِ RLS/Advisorها در گزارشِ مأموریت P0-002 (خارج از ریپو).
