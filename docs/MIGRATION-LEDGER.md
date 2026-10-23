# دفترِ مهاجرت‌ها (Migration Ledger)

## نصب جریان نقد — ۲۰۲۶-۱۰-۲۳

مقصد PostgreSQL17.6 عملیاتی لیارا، `portfolio-stage-db-1` است. فایل اتمیک با SHA256 `ba4048f9b6136dc81e14a717c9632c1b523a6de5ba94313a83a25e99f0cb3dd8` پس از تازه‌سازی هویت/سلامت مبدأ و تأیید نبود اشیای جدید، **APPLIED** شد. تمام کنترل‌های ساختاری پس از نصب موفق‌اند: دو جدول FORCE RLS، خواندن مالک، wrapper با هش مصوب و EXECUTE فقط authenticated، هشت تابع خصوصی بسته، دو policy خواندن و چهار trigger تاریخچه؛ اعلان reload schema نیز ارسال شد. این نصب به معنی انتشار برنامه یا پذیرش عضو نیست.

پشتیبان `20261023T125904Z` با SHA256 `e188b943328c5ddad30521ab2f130f5d85bcf34d8e283706cd4434896c2593d0` در کپی جدا بازیابی شد؛ ۱۸۴۸ مورد برابر و مبدأ سالم/بدون تغییر. [رسید بازیابی](../scripts/ops/cashflow-checkpoint/restore-receipt-20261023.json) اصلاح خودکار پنج ACL صرفاً روی کپی را صریح ثبت می‌کند. Capture هفت فایل و Verify در فرایند تازه موفق شدند؛ [رسید رمزگذاری](../scripts/ops/cashflow-checkpoint/verified-receipt-20261023.json)، manifest `99ee70eeea2be0648882d18f5e415ce33170be70c1eca10d73503474597ac14b`. بازیابی DPAPI همچنان وابسته به همین پروفایل ویندوز است. پشتیبان اولیه با رسید خطا و اصلاح دستی و انتقال ناقص نخست جدا حفظ شده‌اند.

پذیرش ۱۴ سناریوی native API و مرورگر موبایل پس از اصلاح ابزار محلی و اتصال Preview موفق شد. دو عضو مصنوعی با حفظ تاریخچه بازنشسته شدند؛ نشست‌ها و refresh tokenها صفر، نشست قبلی مرورگر به login هدایت شد و ورود تازه رد شد. جزئیات در [رسید نهایی پذیرش](ops/cashflow-release-20261023/browser-retirement-receipt.json) و مرکز فرمان است. رسید نصب، snapshot زمان نصب پیش از پذیرش است؛ با رسید پذیرش اشتباه نشود.

## تنظیم رسانه و پیش‌نیاز عضو — ۲۰۲۶-۱۰-۱۷

مقصد هر سه مورد، PostgreSQL17.6 عملیاتی لیارا در `portfolio-stage-db-1` است؛ نام stage تاریخی است. بکاپ تازه `20261017T174657Z` با SHA256 `3d000898706687c47b08aaeb37d37c18d4cdc9369842091df5b038709040623c` خصوصی محفوظ است. اجرای اولیه ابزار restore شکست خورد؛ پس از اصلاح آماده‌سازی کپی بدون شبکه، بازیابی همان dump و تطبیق 1781/1781 مورد موفق شد. این گزارش موفقیت full-script اولیه را ادعا نمی‌کند.

| بسته | وضعیت و شاهد |
|---|---|
| `sql/media_layout_settings_20261017.sql` | **APPLIED**؛ SHA256 `2d99f121a297835b3f411cfdc51139c73b1d9892dcfec5eca43c84b08e060b2c`، نصب18:05:46Z؛ فقط اشیای افزایشی، RLS اجباری و مجوزهای صریح. REST واقعی و سپس ذخیره۱/۲/۳ مدیر و رد عضو پذیرفته شدند. [پذیرش](ops/release-audit-20261017/MEDIA-GLOBAL-ACCEPTANCE.md) |
| `sql/recovery_signup_profile_trigger_20261011.sql` | **APPLIED**؛ SHA256 `c36a8c3e9c2a5aed58921a10b99cbcb2ef0da08db331abe76a75c5e9603c715c`، نصب18:13:33Z؛ تابع/trigger فقط، RLS و guard نقش حفظ؛ شمار حساب‌ها و پروفایل‌های قبلی ثابت. تعریف و ACL قبلی برای rollback خصوصی محفوظ؛ ساخت حساب B واقعی پس از نصب، profile role=user تولید کرد. |
| `scripts/acceptance/restore-member-financial-execute.sql` در بسته پذیرش عضو | **APPLIED**؛ SHA256 `47ac49ed37e03cbc71af8b54f55be8194abac5a0532f708845b921ed770cd919`؛ فقط چهار EXECUTE مصوب authenticated بازگردانده شدند. پنج بدنه/مالک تابع با main برابر بودند؛ anon و kernel خصوصی همچنان بسته، RLS و منع نوشتن مستقیم ثابت. تمرین نصب، ثبت ساختگی، منع B و rollback دقیق ACL/inventory روی کپی PASS؛ سپس v1/v2 و جداسازی روی حساب‌های ساختگی اصلی PASS شدند. |

تنظیم حساب میز نیز **APPLIED** شد: `sql/admin_desk_account_preferences_20261017.sql` با SHA256 `fa55c4cb410a42a9945340703a4b5d65a8ddafdeb46611dd0fb0b4138d4b3e5e`؛ preflight بدون برخورد، تاریخچه اولیه صفر، RLS اجباری، فقط SELECT مالک مدیر و getter/setter محدود، جدول/sequence بدون نوشتن عضو. 21 مدخل جدید اضافه شد و هیچ مدخل قبلی تغییر نکرد. آزمون جداسازی دو مدیر/CAS/رد عضو و rollback پیش‌تر روی کپی PASS بود؛ پذیرش رابط اصلی جداست. `phase21_cron_runs.sql` پس از تمرین کپی، روی primary در 18:41:43Z نصب و PASS شد؛ SHA256 `c75ebb54a891f2f2d35cf57fe1ae9f7c1de243ea45ac19ca0c1bf677996edae6`، history0، RLS فعال، anon بدونSELECT، عضو فقطSELECT تحتpolicyمدیر و service_role فقطSELECT/INSERT/UPDATE؛ 1728مدخل قدیمی بدونتغییر و29مدخل تازه. این نصب شاهد اجرای cron نیست؛ envاختصاصیهنوزتنظیم‌نشده. M2 نصب نشده است. مقدار یا اعتبارنامه‌ای از DB در این دفتر نگهداری نمی‌شود.

## نصب مخزن پایش داخلی — ۲۰۲۶-۱۰-۱۷

`sql/site_agent_runs_20261017.sql` روی Supabase واقعی لیارا **APPLIED** است. پیش از نصب، بکاپ تازه با SHA `60f67fa41ccb2737023466dbceb052d8639276cdd151c9c01c390455f006188a` بازیابی و ۱۷۶۱ مورد تطبیق داده شد. اجرای دوبارهٔ migration و آزمون نقش‌ها روی کپی بدون شبکه موفق بود. مقایسهٔ ساختار قبلی فقط افزودن صریح USAGE برای `site_monitor_writer` را مجاز دانست و PASS شد. جدول جدید FORCE RLS دارد؛ مدیر فقط خواندن، نویسندهٔ NOLOGIN فقط INSERT/SELECT؛ anon و service_role مجوز جدول ندارند. هیچ JWT یا دسترسی مدل اضافه نشد. [رسید](ops/api-to-page-20261013/operational-agents-receipt.json).


## مخزن پژوهش Hermes — ۲۰۲۶-۱۰-۱۷

`sql/research_agent_drafts_20261017.sql` در `portfolio-stage-db-1` لیارا، **APPLIED** در `2026-10-17T12:04:16Z`. بکاپ ۲٫۳۸ گیگابایتی با SHA256 `1ed1428213f5e70d60c211984b4b1b1f661962dfe30912992ba3e0fc3059250f` خارج از Git محفوظ است؛ بازیابی بدون شبکه/پورت/cron و تطبیق ۱۷۳۷ مورد موفق شد. نقش نویسنده بدون LOGIN، بدون ارث‌بری و بدون عضویت authenticator است؛ postgres فقط امکان SET ROLE صریح دارد. جدول RLS اجباری، خواندن مدیر از نقش DB، ثبت append-only، digest یکتا و وضعیت صرفاً draft دارد. آزمون عضو عادی، جعل metadata، مدیر، نویسنده، منع تغییر/حذف/TRUNCATE و ورودی نامعتبر روی کپی بازیابی‌شده PASS شد. اضافه‌شدن USAGE نقش جدید به public تنها تغییر مجوز schema بود؛ اشیای قبلی تغییر نکردند. [رسید نصب و اجرای واقعی](ops/api-to-page-20261013/research-live-receipt.json).

## نصب اصلی IME — ۲۰۲۶-۱۰-۱۴

وضعیت phase19 در دیتابیس عملیاتی لیارا **APPLIED** است. پس از انتشار رلهٔ `c50f2fc` و تطبیق هش نویسندهٔ اصلاح‌شده، فایل بازبینی‌شده اجرا شد؛ کنترل مجوزها و نگهبان‌های append-only و خواندن REST موفق بودند. ۸۹ ورودی inventory مربوط به اشیای جدید افزوده شد و ساختار و شمارش‌های قبلی تغییری نکردند. [رسید نصب](ops/api-to-page-20261013/live-ime-install-receipt.json). نصب در ابتدای روز، شاهد اجرای طبیعی نویسنده‌های ساعت ۱۵/۱۹ نیست؛ دادهٔ نمونه یا backfill اجباری ثبت نشد. این ردیف جای وضعیت NOT_APPLIED مرحلهٔ قبلی را می‌گیرد.

## تمرین IME — ۲۰۲۶-۱۰-۱۳؛ نصب اصلی انجام نشده

وضعیت `phase19_ime_tables.sql` در دیتابیس عملیاتی لیارا همچنان **NOT_APPLIED** است. در این نوبت، dump واقعی و inventory از snapshot مشترک گرفته شد و بازیابی در کانتینرِ بدون شبکه/پورت/volume و با cron خاموش انجام شد؛ ۲۳۹۱ مورد با inventory مبدأ یکسان بود. نصب phase19، کنترل ACL/RLS و مقایسهٔ بدون تغییرِ اشیای قبلی فقط روی همین کپی موفق شد. کانتینر آزمایشی حذف و بکاپ خصوصی حفظ شد. [شاهد و محدودیت‌ها](ops/api-to-page-20261013/FOLLOWUP.md#backup-and-isolated-installation-rehearsal). این تمرین وضعیت محیط‌های تاریخیِ زیر را تغییر نمی‌دهد.

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

