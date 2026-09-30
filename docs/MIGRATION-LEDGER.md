# دفترِ مهاجرت‌ها (Migration Ledger)

## شاهد جاری DEV-07: APPLIED_SANDBOX_ONLY

phase37 بعد از زنجیرهٔ phase32→34→35→36 فقط در `dev07-1978-local` نصب شد؛ COMMIT موفق. شاهد ثبت‌شده در 2026-09-30T17:21:23.670Z، SHA برنامه `3462f0178ebed6b7a9966b465ba0756119ce267a`، hash فایل phase37 `b817192469b4f66937f009bf9a9dbb75f4acea41760be1e6be6306b6682834b9`. preflight:14/14 جدول حاضر،11/11 جدول RLS، چهار RPC دارای PT409 و فاقد40001، شاخهٔ status-only برقرار. [گزارش نهایی](./ops/DEV07-FINAL-3462F01.md)؛ manifest/خروجی catalog محلی `.task/dev07-migrations.json` و `.task/dev07-preflight-3462f01.txt`. Production و DB بازیابی‌شدهٔ لیارا مقصد نصب نیستند. NOT_APPLIED زیر، وضعیت پیش از این شاهد است. این ثبت پس از آزمون محلی است؛ head آزمون‌شده تغییر نکرد.

## DEV-07 / اصلاح یافتهٔ مستقل (2026-09-30T17:04Z)

`sql/phase37_nonretryable_version_conflicts.sql`: **NOT_APPLIED در زمان ثبت این commit**. پیش‌نیاز و ترتیب: phase32→phase34→phase35→phase36→phase37؛ phase37 بعد از هر اجرای مجدد migrationهای قبلی باید آخر نصب شود. نصب بعدی فقط در sandbox دادهٔ ساختگی مجاز است و شاهد آن در صورت‌جلسهٔ بازآزمایی با SHA/hash/time ثبت می‌شود. وضعیت Production و Preview دارای بکاپ از این سند قابل استنتاج نیست. علت DEV07-F01: تعارض منطقی نسخه نباید serialization_failure قابل retry باشد. rollback عملی این اصلاح، بازاجرای 32/35/36 و بازگشت رفتار قبلیِ معیوب است؛ برای بازگشت برنامه، schema اصلاح‌شده سازگار است و بازنصب قبلی توصیه نمی‌شود.

## sandbox پذیرش DEV-07 — 2026-09-30

روی DB تازه و مستقل `dev07-1978-local` از تصویر Supabase/PostgreSQL 17.6، بدون restore یا دادهٔ واقعی، پیش‌نیازهای مخزن و زنجیرهٔ **phase32→phase34→phase35→phase36** اجرا شدند: **APPLIED_SANDBOX_ONLY**. Auth/roles از سرویس واقعی‌اند؛ `sql/test/*` bootstrap استفاده نشد. preflight پس از نصب: ۱۴/۱۴ پیش‌نیاز موجود، ۱۱/۱۱ جدول مرتبط RLS و status-only phase36 موجود. فایل‌ها/hash و جزئیات وابستگی در [شاهد sandbox](./ops/DEV07-SANDBOX-1978BF5.md). نقش مشاور فقط با UUID واقعیِ حساب Auth آزمایشی این sandbox ثبت شد؛ رابطه را A باید در محصول اعطا کند. هیچ migration روی DB بازیابی‌شدهٔ Preview لیارا یا Production اجرا نشد؛ NOT_APPLIED تاریخیِ آن محیط‌ها بدون شاهد تازه به APPLIED تبدیل نمی‌شود.
## phase38 — ترازنامهٔ شخصی (2026-09-30)

`sql/phase38_personal_balance_sheet.sql`؛ scaffold CLI: `20260930153150_personal_balance_sheet.sql`، منتقل به قرارداد phase مخزن. [قرارداد و نصب](./ops/PERSONAL-BALANCE-SHEET.md). staging/Production: **NOT_APPLIED**. ترتیب phase32→34→35→36→37→38؛ پس از بازاجرای پیش‌نیازها، اصلاحات جدید نیز دوباره اعمال شوند.

ستون‌های مالکیت/عنوان/ارزش‌گذاری روی `member_holding_positions`، مقدار nullable فقط برای ارزش اظهارشده، جدول `member_debt_positions` با FK به **همان** `member_holding_versions`. RPC اصلی دارایی با امضای قبلی، RPC بدهی و هستهٔ مشترک با قفل موجود؛ بدهی و دارایی هنگام اصلاح طرف دیگر حفظ می‌شوند. خواندن مستقیم owner-only، مشاور با helper رضایت موجود و RPC آخرین/نسخهٔ انتخابی. تریگر/ACL/RLS و retry legacy در دو پروفایل PostgreSQL مصنوعی، شامل نصب دوباره، آزموده شدند. هیچ دفتر نسخه یا رضایت موازی نیست؛ تاریخچه بازنویسی نشد. بازگشت بدون حذف داده؛ محدودیت برنامهٔ قدیمی برای مقدار null/بدهی در سند قرارداد آمده است.

## رفع بازبینی PR #168 — 2026-09-30

`phase36_consultation_review_fixes.sql`: **NOT_APPLIED** در staging/Production این مأموریت؛ فقط در PostgreSQL مصنوعی روی دو پروفایل آزموده شد. وابستگی: phase35 پس از phase32/34. تابع اقدام status-only برای هر دو actor با حفظ مشخصات و نسخهٔ پایه؛ RPC جدید فهرست metadata پژوهش تأییدشده با مجوز رابطه. ترتیب نهایی phase32→34→35→36 است؛ اجرای دوبارهٔ phase35 باید با phase36 دنبال شود. آزمون regression شکست phase35 و موفقیت ارتقا را اثبات می‌کند. [محیط موجود، مانع و دستورکار DEV-07](./ops/DEV07-PR168-REVIEW.md)؛ [preflight فقط‌خواندنی](../sql/staging/dev07_preflight.sql). نصب واقعی در محیط لیارا هنوز اندازه‌گیری نشده است.

## تحویل DEV-01…06 — 2026-09-30

این سه فایل در این مأموریت فقط روی PostgreSQL 17 محلی با دادهٔ مصنوعی و دو پروفایل گرنت اجرا شدند. **در این مأموریت روی Production یا staging اجرا نشدند.** وضعیت نصب واقعی آن‌ها روی دیتابیسِ اکنون متصل به سایت لیارا هنوز تطبیق داده نشده است؛ وضعیت‌های قدیمی پایین، مربوط به ممیزی تاریخی Supabase هستند. بکاپ و تمرین بازیابی ۲۱۵۲ مقایسه در چت دیگر کامل شد و اینجا تکرار نشد.

| فایل | وابستگی واقعی و آزمون |
|---|---|
| `phase32_member_holdings.sql` | auth/profiles، تابع موجود `deny_mutation` و جدول `portfolio_versions`؛ اتصال FK به `intel_reference_versions` اختیاری است و با اجرای دوباره پس از phase20 بسته می‌شود. مستقل از phase20/22 آزموده شد؛ phase20 نیز در آزمون holdings جدا بررسی شد. RPC چهارآرگومانی با `p_base_version` اختیاری جای امضای قدیمی را می‌گیرد؛ فراخوانی سه‌آرگومانی با default سازگار است. محدودیت خواندن به مالک عمداً جای دسترسی عمومی admin را می‌گیرد. |
| `phase34_research_workbook_versions.sql` | auth/profiles؛ بدون phase20/22؛ دو جدول نسخه/بازبینی append-only، RLS ادمین، نویسنده از نشست و تأیید انسانی دارای شاهد. |
| `phase35_consultation.sql` | پس از phase32 و phase34؛ registry مشاور، رابطه/لغو، جلسه/یادداشت خصوصی/انتشار و اقدام append-only؛ مجوز از رابطه و نشست؛ registry تولید هنوز خالی/نامعلوم، آرش به‌طور خودکار ثبت نشده است. |

ترتیب: تطبیق auth/profiles/deny_mutation/portfolio_versions روی staging → phase32 → phase34 → phase35 → ثبت **UUID احرازشدهٔ آرش** توسط اپراتور → آزمون DEV-07. [دستور انتشار و بازگشت](./ops/PRODUCT-V1-ACCEPTANCE.md). فایل‌های `sql/test/*` فقط fixture هستند و هرگز migration محیط واقعی نیستند.

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

