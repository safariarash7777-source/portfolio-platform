# نقشهٔ اسناد — از کجا شروع کنم؟

> **این تنها فهرستِ معتبرِ اسناد است.** اگر سندی اینجا نیست، یا آرشیو است یا باید
> اینجا اضافه شود.
>
> آخرین به‌روزرسانی: ۱۴۰۵/۰۵/۰۶ (2026-07-28)
>
> **شمارشِ فعلی:** ۲۱ سندِ فعال در `docs/` (۱۰ هسته + ۹ مرجعِ فنی + ۲ runbook) ·
> ۴ ADR · ۱۲ آرشیو. پیش از این پاکسازی، ۲۵ سند در `docs/` بود بدونِ نقشِ روشن.
> (‏`RUNBOOK-branch-protection` و `ADR/004` با merge شدنِ PR #84 اضافه شدند.)

## سه سؤال، سه سند

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
| [`PRODUCT-BLUEPRINT.md`](./PRODUCT-BLUEPRINT.md) | قطب‌نمای محصول | تعریفِ محصول، مقصدِ دوگانه، سه سطحِ تجربه، حلقهٔ کسب‌وکار، معماریِ «یک مغز چند رابط»، نقشهٔ ۷ گیت تا رونمایی · **بازنویسیِ کامل ۱۴۰۵/۰۵/۰۶ · تصویبِ نهاییِ آرش ۱۴۰۵/۰۵/۰۷ (`DD-025`)** |
| [`PRODUCT-MAP.md`](./PRODUCT-MAP.md) | نقشهٔ مسیرهای **موجود** | واقعیتِ امروزِ `app/` — نه برنامه |
| [`PRODUCTION-ARCHITECTURE.md`](./PRODUCTION-ARCHITECTURE.md) | معماریِ تولید | سرویس‌ها، جریانِ داده، مرزها |
| [`ONBOARDING.md`](./ONBOARDING.md) | ورودِ توسعه‌دهنده | دستورها، محیط، دام‌های شناخته‌شده |
| [`MIGRATION-LEDGER.md`](./MIGRATION-LEDGER.md) | دفترِ مهاجرت‌ها | `APPLIED` / `NOT_APPLIED` — **مرجعِ نهایی** |
| [`ENVIRONMENT-MATRIX.md`](./ENVIRONMENT-MATRIX.md) | نامِ متغیرهای محیطی | فقط **نام**، هرگز مقدار |
| [`SERVICE-OWNERSHIP.md`](./SERVICE-OWNERSHIP.md) | مالکِ هر سرویس | پاسخ‌گوییِ عملیاتی |

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

## ۳. آرشیو — `archive/`

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
