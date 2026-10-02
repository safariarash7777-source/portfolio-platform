# نقشهٔ اسناد — از کجا شروع کنم؟

> **جاری ۲۰۲۶-۱۰-۰۲:** [برنامهٔ مصوب مسیر راه](./product-plan-v0.1/00-start-here.md)، [مبنا/مالکیتP00](./product-plan-v0.1/P00-BASELINE.md)، [release manifest](./product-plan-v0.1/P00-RELEASE-MANIFEST.json) و [inventory](./product-plan-v0.1/P00-INVENTORY.json). مبنای195 ثابت؛ patch197 تکرار نشود. [sandbox مستقل لیارا](./ops/seasonal-program/integration-195-20261002/ENVIRONMENT-HANDOFF.md) انتخاب و backend با۱۸migration نصب شد؛ source۶۲۹فایل مطابقGit،۳۲بررسی ورود واقعی و۸بررسی مرورگر مالی موفق؛ [جدول۱۴ مستقلDEV07:۱۳PASS/۰FAIL/۱BLOCKED؛ تأیید انسانی هنوز باز](./ops/seasonal-program/integration-195-20261002/LIARA-SANDBOX-RESULT.md). مطالب «مقصد هنوز انتخاب نشده/نصب نشده» زیر سابقهٔ قبل از دستور جدیدند. [تحویل مستقلP11 درPR203](https://github.com/safariarash7777-source/portfolio-platform/pull/203) و [P04 درPR205](https://github.com/safariarash7777-source/portfolio-platform/pull/205) ساخته شده‌اند؛ پذیرش/نصب/انتشار آن‌ها از این لینک نتیجه نمی‌شود.

> **این تنها فهرستِ معتبرِ اسناد است.** اگر سندی اینجا نیست، یا آرشیو است یا باید
> اینجا اضافه شود.
>
> آخرین به‌روزرسانی: ۸ مهر ۱۴۰۵ (2026-09-30)
>
> **شمارشِ تاریخی در 2026-09-06:** ۲۲ سندِ فعال در `docs/` (۱۱ هسته + ۹ مرجعِ فنی + ۲ runbook) ·
> ۴ ADR · ۱۲ آرشیو. (`CAPABILITY-INVENTORY` در ۱۴۰۵/۰۶/۱۵ اضافه شد.) پیش از این پاکسازی، ۲۵ سند در `docs/` بود بدونِ نقشِ روشن.
> (‏`RUNBOOK-branch-protection` و `ADR/004` با merge شدنِ PR #84 اضافه شدند.)

## سه سؤال، سه سند

شواهد تحویل DEV-01…06 و دستور پذیرش مستقل/انتشار: [`ops/PRODUCT-V1-ACCEPTANCE.md`](./ops/PRODUCT-V1-ACCEPTANCE.md). این سند شاهد و runbook است؛ وضعیت جاری فقط در Command Center نگهداری می‌شود.

پروژه سه سؤالِ متفاوت دارد و هر کدام **دقیقاً یک** مرجع:

| سؤال | سند | چه چیزی **نیست** |
|---|---|---|
| **چه می‌سازیم و چرا؟** | [`PRODUCT-BLUEPRINT.md`](./PRODUCT-BLUEPRINT.md) | وضعیتِ امروز را نمی‌گوید |
| **الان کجاییم و چه گیر است؟** | [`COMMAND-CENTER.md`](./COMMAND-CENTER.md) | تصمیم ثبت نمی‌کند، جهت نمی‌دهد |
| **چه تصمیمی گرفته/نگرفته‌ایم؟** | [`DECISION-LOG.md`](./DECISION-LOG.md) | داشبورد نیست |

اگر تازه وارد شده‌اید: **اول `COMMAND-CENTER` را بخوانید** تا بفهمید چه چیزی همین
حالا شکسته است، بعد `PRODUCT-BLUEPRINT` را تا بفهمید به کجا می‌رویم.

---

## ۱. اسنادِ فعال (هستهٔ نگهداری‌شده)

| سند | نقش | مرجعِ چه چیزی است |
|---|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | قواعدِ سختِ کد | RTL، توکنِ رنگ، سه‌گانهٔ Supabase، واژگانِ ممنوع |
| [`COMMAND-CENTER.md`](./COMMAND-CENTER.md) | وضعیتِ عملیاتیِ زنده | گیت‌ها (`G-…`)، بلاکرها (`B-…`)، اقداماتِ بعدی |
| [`DECISION-LOG.md`](./DECISION-LOG.md) | دفترِ دائمیِ تصمیم | `D-…` (باز) · `DD-…` (گرفته‌شده) · `SD-…` (منسوخ) |
| [`PRODUCT-BLUEPRINT.md`](./PRODUCT-BLUEPRINT.md) | قطب‌نمای محصول | مسیر اصلی دو سمت محصول، سه جریان A/C/F، پنج مرحله و بسته‌های قابل واگذاری؛ DD-030 مصوب، دامنهٔ تفصیلی نسخهٔ اول باز |
| [`PRODUCT-MAP.md`](./PRODUCT-MAP.md) | نقشهٔ مسیرهای **موجود** | واقعیتِ امروزِ `app/` — نه برنامه |
| [`PRODUCTION-ARCHITECTURE.md`](./PRODUCTION-ARCHITECTURE.md) | معماریِ تولید | سرویس‌ها، جریانِ داده، مرزها |
| [`ONBOARDING.md`](./ONBOARDING.md) | ورودِ توسعه‌دهنده | دستورها، محیط، دام‌های شناخته‌شده |
| [`ops/PRODUCT-DELIVERY-TASKS.md`](./ops/PRODUCT-DELIVERY-TASKS.md) | پرامپت‌های عملیاتی نسخهٔ اول | DEV-01…07، دامنه، فایل‌ها، وابستگی و آزمون پذیرش؛ تابع Blueprint و DD-030 |
| [`ops/PERSONAL-BALANCE-SHEET.md`](./ops/PERSONAL-BALANCE-SHEET.md) | قرارداد و پذیرش ترازنامهٔ شخصی | دارایی/بدهی/خالص ثروت روی نسخه و رضایت موجود، phase37، شواهد ساختگی و محدودیت پذیرش؛ DD-031 |
| [`ops/RELEASE-payment-containment.md`](./ops/RELEASE-payment-containment.md) | بستهٔ انتشارِ مهارِ `create_payment` | ترتیبِ انتشار، اثرِ authorityِ بی‌رکورد، پذیرش، بازگشت |
| [`RUNBOOK-relay-deploy.md`](./RUNBOOK-relay-deploy.md) | استقرارِ رله + `B-053` | پیش‌پروازِ پرچم‌ها، مسیرِ استقرار، پذیرشِ دو چرخه |
| [`ops/RELEASE-history-sections.md`](./ops/RELEASE-history-sections.md) | بستهٔ انتشارِ توقفِ نوشتنِ بخش‌های بی‌خواننده | شاهدِ قبل/بعد، مصرف‌کننده‌ها، بازگشت |
| [`ops/RELEASE-brsapi-budget.md`](./ops/RELEASE-brsapi-budget.md) | سهمیهٔ مشترک رله در لیارا | آزمون ایزوله، baseline نامعلوم، نصب و بازگشت ایمن |
| [`MIGRATION-LEDGER.md`](./MIGRATION-LEDGER.md) | دفترِ مهاجرت‌ها | `APPLIED` / `NOT_APPLIED` — **مرجعِ نهایی** |
| [`ENVIRONMENT-MATRIX.md`](./ENVIRONMENT-MATRIX.md) | نامِ متغیرهای محیطی | فقط **نام**، هرگز مقدار |
| [`SERVICE-OWNERSHIP.md`](./SERVICE-OWNERSHIP.md) | مالکِ هر سرویس | پاسخ‌گوییِ عملیاتی |
| [`MARKET-CORE-AUDIT.md`](./MARKET-CORE-AUDIT.md) | وضعیتِ **هستهٔ تحلیل بازار** | پنج قابلیت (صندوق، نماد، رادار، میز، پنلِ عضو) با برچسبِ وضعیت + ممیزیِ مصرفِ داده + ترتیبِ اجرا · اندازه‌گیریِ زندهٔ ۲۰۲۶-۰۹-۰۶ |
| [`BRSAPI-CLIENT-DESIGN.md`](./BRSAPI-CLIENT-DESIGN.md) | ممیزیِ مصرفِ BrsApi + کلاینت/صفِ مرکزی | ۱۵ مسیرِ مصرف · ۹ producerِ مستقل · سقفِ ۱۱٬۵۶۵ در برابرِ سهمیهٔ ۱۰٬۰۰۰ · کلاینت و **بودجهٔ ماندگار** پیاده شد، **مستقر نشد** (ضمیمهٔ ب) |
| [`CAPABILITY-INVENTORY.md`](./CAPABILITY-INVENTORY.md) | توانمندی‌های **محیطِ کارِ عامل** | چه ابزاری هست، چه چیزی آزموده شده، چه چیزی نیست — با شاهد. **در هر جلسه بازآزمایی می‌شود** |

### تصمیم‌های معماری (ADR)

| ADR | موضوع |
|---|---|
| [`ADR/001`](./ADR/001-miniapp-hosting.md) | میزبانیِ Mini App — Manus در برابر Coolify |
| [`ADR/002`](./ADR/002-scheduler-ownership.md) | مالکیتِ زمان‌بندی — Vercel Cron در برابر GitHub Actions |
| [`ADR/003`](./ADR/003-lead-source-of-truth.md) | منبعِ حقیقتِ Lead |
| [`ADR/004`](./ADR/004-xlsx-supply-chain.md) | زنجیرهٔ تأمینِ `xlsx` — **`DECISION_REQUIRED`**، تصمیمِ `D-011` |

### دستورالعمل‌های اجرا (Runbook)

| Runbook | کِی لازم می‌شود |
|---|---|
| [`RUNBOOK-lead-staging.md`](./RUNBOOK-lead-staging.md) | فعال‌کردنِ مسیرِ لید روی staging |
| [`RUNBOOK-branch-protection.md`](./RUNBOOK-branch-protection.md) | اجباری‌کردنِ CI روی `main` — **هنوز اجرا نشده** (`B-015` باز) |
| [`RUNBOOK-gate2-staging-rehearsal.md`](./RUNBOOK-gate2-staging-rehearsal.md) | تمرینِ stagingِ مسیرِ لید — **متوقف پیش از اجرا**، منتظرِ `AUTHORIZE_GATE2_STAGING` |
| [`PRODUCTION-ACTIVATION.md`](./PRODUCTION-ACTIVATION.md) | اجرای پنج migrationِ باقی‌مانده روی Production — **منتظرِ تصمیمِ صریحِ آرش**، تنها گلوگاهِ Gate 2 |
| [`RUNBOOK-backup-windows.md`](./RUNBOOK-backup-windows.md) | **گرفتنِ بکاپ از Production روی ویندوز** — یک دستور، پیش‌نیازِ اجباریِ هر migration |

---

## ۲. مرجعِ فنی (خوانده می‌شود، ولی جهت نمی‌دهد)

این‌ها **طراحی و مشخصات** هستند، نه برنامه. برای فهمیدنِ «این تکه چطور کار می‌کند»
مفیدند؛ برای «بعد چه بسازیم» به `PRODUCT-BLUEPRINT` مراجعه کنید.

| سند | موضوع |
|---|---|
| [`SPEC-agent-research-monitoring.md`](./SPEC-agent-research-monitoring.md) | مشخصاتِ Agent شمارهٔ ۱ و بستهٔ ارزیابی‌اش (`Gate 4`) + وضعیتِ آمادگیِ Gateهای ۵ تا ۷ — **`SPEC_READY`، هیچ Agentی ساخته نشده** |
| [`TERMINAL-ANALYST-RULES.md`](./TERMINAL-ANALYST-RULES.md) | قواعدِ تحلیل‌گرِ ترمینال |
| [`CODAL-ENGINE-V3.md`](./CODAL-ENGINE-V3.md) | طراحیِ موتورِ کدال |
| [`codal-ingestion-notes.md`](./codal-ingestion-notes.md) | یادداشت‌های دریافتِ کدال |
| [`SPEC-admin-market-radar.md`](./SPEC-admin-market-radar.md) | مشخصاتِ پنلِ رصد |
| [`SPEC-symbol-fundamental-card.md`](./SPEC-symbol-fundamental-card.md) | مشخصاتِ کارتِ بنیادی |
| [`SPEC-learning-hub.md`](./SPEC-learning-hub.md) | مشخصاتِ ناحیهٔ یادگیری |
| [`INTELLIGENCE-DESK-RATIONALIZATION.md`](./INTELLIGENCE-DESK-RATIONALIZATION.md) | ماتریسِ یکپارچه‌سازیِ تجربهٔ داخلی، جریان شش‌سؤالی و مرز مخاطب |
| [`ROADMAP-TERMINAL.md`](./ROADMAP-TERMINAL.md) | معماریِ ترمینال — **تاریخی**، جهتش را `PRODUCT-BLUEPRINT` گرفته |
| [`QUANT-EXECUTION-PLAN.md`](./QUANT-EXECUTION-PLAN.md) | معماریِ ۹ لایهٔ کوانت — **تاریخی**، همان‌طور |
| [`DSS-STATE.md`](./DSS-STATE.md) | وضعیتِ فازهای T0–T8 — **تاریخی**؛ «کجاییم» حالا `COMMAND-CENTER` است |

> ⚠️ سه سندِ آخر زمانی «سندِ زنده» بودند. از مرداد ۱۴۰۵ نقشِ «کجاییم» به
> `COMMAND-CENTER` و نقشِ «به کجا می‌رویم» به `PRODUCT-BLUEPRINT` منتقل شد. محتوای
> فنی‌شان معتبر است؛ **ادعای وضعیت و اولویتشان نه**.

---

## ۳. آرشیو — archive/
[Blueprint پیشین، مصوب 2026-07-29](./archive/PRODUCT-BLUEPRINT-20260729.md): سابقهٔ جهت قبلی؛ جانشین DD-030. کارهای باز و معیارها در بخش ۹ Blueprint جاری نگاشت شده‌اند.

دستورکارها و ممیزی‌های **تمام‌شده یا جایگزین‌شده**. برای تاریخ نگه داشته می‌شوند و
**هرگز مبنای کارِ جدید نیستند**.

| سند | چرا آرشیو شد |
|---|---|
| `MEGATASK-ROSAD-BAZAR` | `M1`–`M5` تمام شد؛ `M6`–`M9` به `PRODUCT-BLUEPRINT` §۷ منتقل شد |
| `MEGATASK-CLEANUP` | `C1`–`C5` تمام شد |
| `BRIEF-MANUS` · `BRIEF-MANUS-execution` | دستورکارِ سازندهٔ بیرونی؛ مسیرِ Manus طبقِ `DD-002` **legacy** است |
| `BUGS` | اسنپ‌شاتِ QAِ تیر ۱۴۰۵؛ باگ‌های زنده حالا در `COMMAND-CENTER` §۳ |
| `MASTER-PLAN` · `ROADMAP` (v1) | جایشان را `PRODUCT-BLUEPRINT` گرفت |
| `AUDIT-FIX-BRIEF` · `TASK-relay-deploy` | ممیزی/تسکِ تمام‌شده |
| `competitor-notes` · `i1-fameli-1404` · `content-hub` | پیوستِ تحقیقاتی/تاریخی |

> هنگامِ آرشیو، **هر موردِ بازِ داخلِ سند اول منتقل می‌شود** و بعد فایل جابه‌جا.
> هیچ کارِ بازی نباید با آرشیو ناپدید شود.

---

## ۳′. نمونه‌های طراحی — `assets/design-review/`

نمونه‌های **تصویب‌نشده** برای بازبینیِ آرش. سند نیستند و مرجعِ هیچ‌چیز نیستند؛ فقط پیشنهادِ بصری‌اند.
وضعیتشان در `COMMAND-CENTER` §۱۳ دنبال می‌شود.

| نمونه | پوشش |
|---|---|
| [`market-core-prototype.html`](./assets/design-review/market-core-prototype.html) | خانهٔ عضو · صفحهٔ صندوق · صفحهٔ نماد — دسکتاپ/موبایل، تمِ روشن/تیره، چهار حالتِ داده |

---

## ۴. اسکیل‌ها — `.claude/skills/`

| اسکیل | کِی اجباری است |
|---|---|
| `iran-market-data/SKILL.md` | **هر** کارِ داده/رله/نماد/صندوق/NAV/کدال/BrsApi |
| `ui-ux-pro-max/SKILL.md` | کارِ UI |

---

## قواعدِ نگهداریِ این نقشه

1. **سندِ جدید بدونِ ردیف در این جدول ساخته نمی‌شود.** اگر جایش در هیچ دسته‌ای نیست،
   احتمالاً نباید ساخته شود.
2. **دو سند نمی‌توانند مرجعِ یک چیز باشند.** اگر هم‌پوشانی پیدا شد، یکی باید نقشش را
   واگذار کند و بنرِ «تاریخی» بگیرد.
3. **ادعای «تنها منبع حقیقت» فقط دامنه‌دار مجاز است** — مثل «مرجعِ migrationها».
   ادعای سراسری ممنوع؛ سه سند این ادعا را داشتند و هر سه اصلاح شدند.
4. **تصمیم فقط در `DECISION-LOG` ثبت می‌شود.** هیچ سندِ دیگری جدولِ «تصمیم‌های باز»
   ندارد؛ فقط ارجاع می‌دهد.
5. سندی که کارش تمام شد → `archive/` با `git mv`. **حذف نمی‌شود.**
