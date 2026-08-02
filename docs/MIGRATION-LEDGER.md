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

## `phase22_manual_intelligence_workflow` — `G3-003`

| محیط | وضعیت | شاهد |
|---|---|---|
| Staging `oqjcvkzyvhqnphopedpn` | **APPLIED** ۱۴۰۵/۰۵/۱۱ | جدول‌های `intel_*` ۱۵ → **۱۷** · سیاست ۱۶ → **۱۸** · تریگر ۱۲ → **۱۵** · گرنت ۱۷۸ → **۲۰۲** · سطرها **۰ → ۰**. باتریِ ۲۰ کنترلِ رفتاری داخلِ زیرتراکنشِ rollback، هر ۲۰ پاس |
| Production `uooeygybrniptzdxuzhj` | **NOT_APPLIED** | و پیش‌نیازهایش هم اجرا نشده‌اند: `phase20` و `phase21` هر دو روی Production **غایب**‌اند (۰ جدولِ `intel_*`، `cron_runs` وجود ندارد) |

این migration **افزایشی** است: `phase20` را بازنویسی نمی‌کند، آن را **تنگ‌تر**
می‌کند. دو حالتِ `approved_internal` و `rejected` اضافه می‌شوند و مسیرِ
`pending_approval → published` که در `phase20` وجود داشت **بسته می‌شود**.

⚠️ چون `phase22` تابعِ `intel_guard_analysis_mutation` و `publish_intel_analysis`
را با `CREATE OR REPLACE` بازنویسی می‌کند، **ترتیب اجباری است**: `phase20` →
`phase21` → `phase22`. اجرای `phase20` پس از `phase22` بی‌صدا محدودیت‌ها را
برمی‌گرداند.

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
| `phase21_cron_runs.sql` | **APPLIED_TO_STAGING_ONLY** · **Production: NOT_APPLIED** | در `P2-G3-002` (۱۴۰۵/۰۵/۰۹) روی staging (`oqjcvkzyvhqnphopedpn`) اجرا و راستی‌آزمایی شد: جدول ساخته شد، `relrowsecurity=true`، ۲ سیاست، ۳ ایندکس، ۱ تریگرِ گارد، ۹ قید. گرنت‌ها **اندازه‌گیری شد** نه فرض: `anon` هیچ، `authenticated=SELECT`، `service_role=INSERT,SELECT,UPDATE`؛ `TRUNCATE` برای هر سه **f**. ۶ کنترلِ منفی (تغییرِ اجرای تمام‌شده، `DELETE`، شکستِ بی‌دلیل، `running` با زمانِ پایان، پایانِ بی‌زمان، خلاصهٔ بیش از ۳۰۰ نویسه) همگی رد شدند. یک ردیفِ تمرینی با پیشوندِ `rehearsal:` باقی است. Production دست‌نخورده. سطرِ زیرِ توضیحِ چرایی |
| `phase21_cron_runs.sql` — چراییِ وجود | — | «آخرین اجرای موفق» تا پیش از این از دیتابیس **قابل دانستن نبود**: چرا لازم است: «آخرین اجرای موفق» تا امروز از دیتابیس **قابل دانستن نبود** — `alerts` وقتی هشداری نباشد هیچ ردیفی نمی‌نویسد، و `telegram-sync` فقط با پستِ تازه درج می‌کند، پس «ردیفِ تازه نیست» با «اجرا نشد» یکسان به‌نظر می‌رسید. قابلِ اجرابودن روی **Postgresِ یک‌بارمصرفِ محلی** سنجیده شد و ۲۸ تستِ رفتاری روی دو پروفایلِ امتیاز سبز است (RLS، گرنت‌ها، گذارها، قیدها)؛ آن بررسی **اجرا روی محیطِ واقعی نیست** |
| `phase20_intelligence_model.sql` | **APPLIED_TO_STAGING_ONLY** · **Production: NOT_APPLIED** | مدلِ هوشمندی بازار (`G3-001`، ADR-005): **۱۵ جدول تازه**. در `P2-G3-002` روی staging اجرا شد: ۱۵ جدول، RLS روی هر ۱۵، ۱۶ سیاست، ۱۲ تریگر، ۶ تابع، ۶ ایندکسِ نام‌دار. ۱۷ کنترلِ رفتاری (گردشِ انتشار، چندشاهدی، تغییرناپذیری، FKِ سیگنال، نهایی‌سازیِ دقیقاً ۱۰۰٪، سازگاریِ provenance) درست رفتار کردند. **همهٔ دادهٔ آزمون داخلِ زیرتراکنشی اجرا شد که همیشه rollback می‌شود** — پس هیچ تحلیل/سبد/سیگنالِ ساختگی روی staging باقی نمانده (هر ۱۵ جدول: صفر ردیف). Production دست‌نخورده. ⚠️ رجوع به سطرِ زیر: همین اجرا یک نقصِ امنیتی را آشکار کرد |
| `phase20_intelligence_model.sql` — گرنتِ `service_role` (اصلاحِ `P2-G3-002`) | **CORRECTED_BEFORE_PRODUCTION** | فایل `GRANT ALL ON TABLE … TO service_role` داشت، پس `service_role` روی **هر ۱۵ جدول** `TRUNCATE` و `DELETE` داشت. چون **`TRUNCATE` تریگر را شلیک نمی‌کند**، کلِ گاردهای append-only این فایل — تحلیلِ منتشرشده، شاهد، ادعا، تصحیح — دور زدنی بود. با کاوشِ واقعیِ `SET ROLE service_role; TRUNCATE …` سنجیده شد: هر ۵ جدولِ آزموده `EXERCISABLE`، در حالی که `cron_runs` (که `REVOKE ALL … FROM service_role` دارد) `BLOCKED_BY_PRIVILEGE` بود — دو جدول فقط در همین یک خط فرق داشتند. **این همان درسِ `G2-006` است که phase21 آموخته بود و phase20 نه.** چرا تست نگرفت: تستِ موجود فقط `authenticated` را می‌آزمود، نه نقشی که سرور واقعاً با آن اجرا می‌شود. فایل اصلاح شد (`REVOKE ALL … FROM service_role`، سپس `GRANT SELECT, INSERT` + `UPDATE` فقط روی ۶ جدولِ دارای چرخهٔ دومرحله‌ای)، روی staging اعمال و **بازاندازه‌گیری** شد (TRUNCATE ۰/۱۵، DELETE ۰/۱۵)، و دو گاردِ تازه افزوده شد: یک تستِ ایستا در `contracts.test.ts` و یک تستِ واقعیِ Postgres روی هر ۱۵ جدول |
| `phase23_grant_hardening.sql` | **APPLIED_TO_STAGING_ONLY** · **Production: NOT_APPLIED** | بستنِ `B-044` در `P2-CLAUDE-MEGA-004` (۱۴۰۵/۰۵/۱۳). **اندازه‌گیریِ فقط‌خواندنیِ Production پیش از هر ادعا:** `anon` روی **۴۰ جدول** و `authenticated` روی **۴۱ جدول** هر شش امتیازِ نوشتن را داشتند — `DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE` — بدونِ آنکه هیچ migrationی آن را داده باشد (منشأ: `ALTER DEFAULT PRIVILEGES`). **اندازهٔ واقعیِ خطر، بدونِ بزرگ‌نمایی:** هر سیاستِ نوشتن روی Production خوانده و طبقه‌بندی شد؛ همه با `auth.uid()` یا `is_admin()` بسته‌اند، جز `waitlist` INSERT که `WITH CHECK (true)` است و همان فرمِ عمومیِ عمدی است. پس `DELETE` **حفرهٔ زنده نبود** — RLS آن را رد می‌کرد. ولی `TRUNCATE` را RLS **اصلاً فیلتر نمی‌کند** و تریگر هم شلیک نمی‌کند، یعنی هر گاردِ append-only این ریپو (`codal_reports`، `symbol_history`، `intel_workflow_events`) دور زدنی بود و تنها مانع این بود که PostgREST هرگز `TRUNCATE` نمی‌فرستد — یک نقطهٔ شکستِ واحد بدونِ لایهٔ دوم. **روی staging اجرا و بازاندازه‌گیری شد:** `anon` از ۶ امتیازِ نوشتن به **صفر**؛ `TRUNCATE`/`TRIGGER`/`REFERENCES` برای هر سه نقش ۰؛ `authenticated` INSERT ۱۹→۱۷ و UPDATE ۱۰→۸ و DELETE ۲→۰؛ `service_role` نوشتنِ لازمش دست‌نخورده (INSERT ۲۲، UPDATE ۱۲، DELETE ۳). شمارشِ ردیف‌ها **تغییر نکرد**. قاعدهٔ سختِ phase22 سالم ماند: `intel_workflow_events` همچنان فقط `INSERT, SELECT`. گارد: `lib/security/grants.integration.test.ts` (۲۲ تست، دو پروفایلِ امتیاز) که یکی از تست‌هایش ادعای «RLS جایگزینِ گرنت نیست» را **اجرا** می‌کند: `anon` با DELETE صفر ردیف می‌گیرد، با TRUNCATE کلِ جدول را می‌برد |
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

