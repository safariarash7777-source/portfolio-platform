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

⚠️ و `phase23_grant_hardening` باید **آخرین** migration باشد. کلِ اسکیمای
`public` را جارو می‌کند، پس اگر پیش از `phase20`/`phase22` اجرا شود، ۱۷ جدولی
که آن‌ها می‌سازند اصلاً پوشش داده نمی‌شوند و با امتیازِ پیش‌فرضِ باز می‌مانند —
یعنی همان `B-044` روی جدول‌های تازه. ترتیبِ کاملِ اجرا و بستهٔ تصمیم در
[`PRODUCTION-ACTIVATION.md`](./PRODUCTION-ACTIVATION.md).

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
| `phase30_contain_create_payment.sql` | ✅ **APPLIED — Production، ۲۰۲۶-۰۹-۱۴ ۰۸:۴۸ UTC** (از راهِ MCP، ثبت‌شده در `supabase_migrations`) | فقط یک `REVOKE EXECUTE`. نه جدول، نه ستون، نه ردیف، نه امضای تابع عوض می‌شود؛ بازگشت **یک `GRANT`** است و `payments` امروز **صفر ردیف** دارد. **چرا لازم است:** اندازه‌گیریِ فقط‌خواندنیِ ۱۴۰۵/۰۶/۲۲ نشان داد ACLِ `create_payment` روی Production `authenticated=X` دارد، در حالی که دو خواهرش (`verify_payment`، `fail_payment`) فقط `service_role=X` دارند — یعنی یک **استثنا**، نه یک طرح. **دامنهٔ اثرِ واقعی (بدونِ بزرگ‌نمایی):** `user_id` از `auth.uid()` می‌آید پس جعلِ هویت ممکن نیست؛ `authority` یکتا و غیرقابلِ‌حدس است؛ callback مبلغ را از همان ردیف به زرین‌پال می‌دهد و زرین‌پال مبلغِ نامنطبق را تأیید نمی‌کند؛ و هیچ‌چیز در Production از روی پرداخت دسترسی صادر نمی‌کند (`finalize_paid_access` نیست، `entitlements` صفر). پس امروز **ارتقای دسترسیِ زنده نیست** — یک مسیرِ نوشتنِ کنترل‌نشده در دفترِ مالی است که **لحظهٔ merge شدنِ #113 به حفرهٔ واقعی تبدیل می‌شود**. روی **Postgres 16.13 یک‌بارمصرف** اجرا و رفتارش سنجیده شد (`lib/security/create-payment-containment.integration.test.ts`، ۸ تست): حفره **پیش از** مهار اجرا و اثبات شد (`amount=1` واقعاً ثبت شد)، پس از مهار همان فراخوانی `permission denied` گرفت و **هیچ ردیفی نساخت**، مسیرِ `service_role` و خواندنِ کاربر سالم ماند، اجرای دوباره no-op بود، و تستِ شکست‌پذیری نشان داد بازگرداندنِ گرنت راستی‌آزماییِ فایل را می‌اندازد. **سازگاری:** `app/api/payment/request/route.ts` در همین کامیت `permission denied` را از خطای عمومی جدا می‌کند و ۵۰۳ صادق می‌دهد، پس برنامه با **هر دو** حالتِ دیتابیس کار می‌کند و ترتیبِ انتشار اجباری نیست. **شاهدِ پس از اجرا (خواندنِ مجوزها، بدونِ هیچ پرداختِ آزمایشی):** ACL از `postgres=X | authenticated=X | service_role=X` به **`postgres=X | service_role=X`** رفت؛ `auth_x=f` · `anon_x=f` · `pub_x=f` · `svc_x=t` — یعنی دقیقاً هم‌ترازِ `verify_payment` و `fail_payment`. `payments` همچنان صفر ردیف. **پیش‌نیازِ ترتیبی رعایت شد:** نسخهٔ برنامه‌ای که `permission denied` را می‌شناسد پیش از این اجرا مستقر شده بود (Vercel Production، SHA `1d7e8f1`، وضعیتِ `success` در ۰۸:۴۶ UTC). ⚠️ **بازگشت بی‌خطر نیست:** `GRANT EXECUTE ... TO authenticated` همان مسیرِ نوشتنِ کنترل‌نشده را دوباره باز می‌کند — یک تصمیمِ صریح است، نه یک rollbackِ معمولی. |
| `phase29_symbol_liveness.sql` | **NOT_APPLIED** · **آمادهٔ اجرا** | تابعِ فقط‌خواندنیِ `symbol_last_trade_dates()` — بدونِ هیچ تغییری در جدول، ستون، ایندکس یا سیاست؛ بازگشت با یک `DROP FUNCTION`. روی **Postgres 16.13 یک‌بارمصرفِ محلی** اجرا و رفتارش سنجیده شد (`lib/core/symbolLiveness.integration.test.ts`، ۸ تست): یک ردیف به‌ازای هر نماد (۷ ردیفِ خام → ۳ نماد)، `prosecdef=f`، و **اثباتِ توخالی‌نبودنِ ادعای INVOKER** — با سیاستِ محدودکننده `anon` از راهِ تابع فقط ۱ نماد می‌بیند در حالی که مالکِ جدول هر ۳ را. گرنت‌ها اندازه‌گیری شد نه فرض: `PUBLIC` هیچ (پیش‌فرضِ Postgres پس گرفته شد)، یک نقشِ بی‌ربط `permission denied`، سه نقشِ برنامه `EXECUTE`. اجرای دوباره no-op است. یک تستِ **شکست‌پذیری** نشان می‌دهد بلوکِ راستی‌آزماییِ خودِ فایل با `SECURITY DEFINER` شدن اجرا را می‌اندازد. چرا لازم است: بدونِ آن «آخرین `trade_date` هر نماد» از PostgREST درنمی‌آید (نه `GROUP BY` دارد نه `DISTINCT ON`) و ۶۹ نمادِ عقب‌مانده مثلِ نمادِ زنده رندر می‌شوند. **Production دست‌نخورده** — پشتِ همان دروازهٔ بکاپ (ردیفِ `C`). |
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

---

## دروازهٔ دیتابیس برای بسته‌های #139 و #140 — اندازه‌گیریِ ۱۴۰۵/۰۶/۲۶

اتصالِ فقط‌خواندنی به **پروژهٔ اصلی `uooeygybrniptzdxuzhj`** برقرار بود و وضعیت
مستقیم از کاتالوگ خوانده شد (نه از گزارشِ مجری). پروژهٔ قدیمیِ
`lqfcyihuthdoqybwptxh` جایگزینِ آن نیست و هیچ پرس‌وجویی روی آن انجام نشد.

| فایل | روی Production | اثباتِ محلی |
|---|---|---|
| `sql/phase31_announcement_revocation.sql` | **NOT_APPLIED** | ۱۴ تست روی Postgres 16.13 واقعی |
| `sql/phase20_intelligence_model.sql` | **NOT_APPLIED** | یکپارچه روی کلاسترِ نو اجرا شد؛ تنها دو وابستگیِ بیرونی (`profiles`, `signals`) و هر دو روی Production **موجودند** |
| `sql/phase32_member_holdings.sql` | **NOT_APPLIED** | ۲۴ تست روی Postgres 16.13 واقعی |
| `sql/phase33_rebalance_alerts.sql` | **NOT_APPLIED** | ۱۷ تست روی Postgres 16.13 واقعی؛ وابستگیِ بیرونی فقط `auth.users` و `deny_mutation()` — هر دو روی Production موجودند. مستقل از phase20/phase32 اجرا می‌شود. ⚠️ فایل در همین بستهٔ ادغام‌نشده **بازنویسی شد** (وضعیت‌های `pending`/`unknown` و قیدِ `rad_attempt_once`)؛ چون هیچ‌جا جز دیتابیسِ یک‌بارمصرفِ محلی اجرا نشده، ویرایشِ درجا مجاز و از افزودنِ phase34 تمیزتر است |

### دو فهرستِ متفاوت — تعارض نیست، دامنهٔ متفاوت است

بازبینی پرسید چرا این جدول سه (حالا چهار) فایل دارد ولی جای دیگرِ همین دفتر
`phase21_cron_runs` و `phase23_grant_hardening` را هم `NOT_APPLIED` نشان می‌دهد.
هر دو درست‌اند و دربارهٔ دو چیزِ متفاوت حرف می‌زنند:

| فهرست | دامنه |
|---|---|
| همین جدول و جدولِ `RUNBOOK-backup-windows.md` | **پیش‌نیازِ همین انتشار** — فقط فایل‌هایی که بسته‌های باز (#139، #140/#144) بدونشان کار نمی‌کنند |
| بخشِ «وضعیتِ فایل‌به‌فایل» بالاتر در همین سند | **هر فایلی که تا امروز روی Production اجرا نشده** — شاملِ موج‌های قدیمی‌تر |

پس `phase21` و `phase23` واقعاً معطل‌اند، ولی **پیش‌نیازِ این انتشار نیستند**.
وابستگی از کد بررسی شد، نه از شمارهٔ فایل: هیچ‌کدام از `phase31`، `phase32` و
`phase33` به `cron_runs` ارجاع نمی‌دهند و `phase23` فقط گرنت‌ها را سخت می‌کند
(اجرا نشدنش چیزی را نمی‌شکند، فقط سخت‌سازی را عقب می‌اندازد).

⚠️ وضعیتِ اجرای واقعیِ هیچ‌کدام در این نوبت تغییر نکرد و بدونِ دسترسی به محیط
اصلی قابلِ تغییر نیست. این تفکیک یک **تصمیمِ فنیِ مستند** است، نه داوری‌ای که
به آرش واگذار شود.

### دقیقاً چه شاهدی کم است

دروازه دو چیز می‌خواهد و **هیچ‌کدام هنوز نیست**:

1. **یک بکاپِ معتبرِ تازه از پروژهٔ اصلی.** مسیرش آماده است:
   `docs/RUNBOOK-backup-windows.md` + `scripts/backup-production.ps1`.
2. **تمرینِ بازیابی روی همان بکاپ** — اسکریپت خودش `restore` را در یک
   دیتابیسِ یک‌بارمصرف اجرا و ساختار را دوطرفه مقایسه می‌کند.

⚠️ این کار **فقط از دستِ آرش برمی‌آید**، چون به رشتهٔ اتصالِ دیتابیس نیاز دارد
که یک سکرت است. هیچ کلید یا رمزی در چت خواسته نشد و نمی‌شود.

#### دقیقاً چه چیزی در محیطِ عامل هست و چه چیزی نیست (۱۴۰۵/۰۶/۲۶)

| ابزار | وضعیت |
|---|---|
| `docker` | ✅ موجود |
| `pg_dump` | ✅ موجود (نسخهٔ ۱۶) |
| `supabase` CLI | ❌ نصب نیست |
| رشتهٔ اتصالِ Production | ❌ موجود نیست (`.env` نیست، متغیرِ محیطی نیست) |
| پرس‌وجوی فقط‌خواندنیِ کاتالوگ | ✅ از راهِ کانکتور |

یعنی **تنها قطعهٔ گم‌شده رشتهٔ اتصال است**. ابزارها آماده‌اند. تا وقتی آن نباشد،
بکاپ و تمرینِ بازیابی در این محیط اجراشدنی نیست و «انجام شد» اعلام نمی‌شود.
اختلافِ نسخه هم بماند: `pg_dump` اینجا ۱۶ است و Production روی ۱۷٫۶، پس dump
باید با ابزارِ هم‌نسخه یا بالاتر گرفته شود.

### محدودیتِ شناخته‌شدهٔ خودِ تمرین

تطبیقِ داده با «snapshotِ مشترک» انجام نمی‌شود؛ وضعیتش **نامشخص** ثبت شده، نه
ناممکن. هرکس CLI را در دسترس دارد با `supabase db dump --help | grep -i snapshot`
در یک خط بررسی‌اش می‌کند.

### تا آن زمان

توسعه و آزمونِ مستقل متوقف نمی‌شود و نشده. اختلافِ نسخه هم ثبت می‌شود:
آزمون‌های محلی روی PostgreSQL 16.13 اجرا شده‌اند و Production روی 17.6 است.
