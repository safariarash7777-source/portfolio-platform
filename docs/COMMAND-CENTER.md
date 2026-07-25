# Arash Digital Platform — Command Center

> **نقشِ این سند: وضعیتِ عملیاتیِ زندهٔ کلِ پلتفرم.** اگر می‌خواهی در پنج دقیقه بفهمی
> «الان واقعاً کجاییم و چه چیزی گیر است»، فقط همین فایل را بخوان.
>
> این سند **تصمیم** ثبت نمی‌کند (آن کارِ `DECISION-LOG.md` است) و **معماری** را توضیح
> نمی‌دهد (آن کارِ `PRODUCTION-ARCHITECTURE.md` و ADRهاست). اینجا فقط **حالِ حاضر** است.
>
> هر ادعا یکی از این برچسب‌ها را دارد: `VERIFIED` · `INFERRED` · `UNKNOWN` · `DECISION_REQUIRED`.
> تعریف‌ها در بخش ۱۰.

---

## 1. Current Program State

| مورد | مقدار | برچسب |
|---|---|---|
| **Current Phase** | P1 — پاکسازی و تثبیت (Cleanup & Stabilization) | VERIFIED |
| **Current Gate** | **G-004 · Database Migration Readiness** (BLOCKED) — گیت‌های حاکمیتِ `G-001`/`G-002` بسته شدند | VERIFIED |
| **Last Verified Date** | **2026-07-25** | — |
| **Portfolio main SHA** | `1261383cb46308d3c15d08534d65b3171a1dba66` (پس از merge شدنِ PR #76 و #77؛ مسیر: `aaf9974` → `57100c5` → `1261383`) | VERIFIED (`git rev-parse origin/main`، 2026-07-25) |
| **Mini App main SHA** | `b88f9353bbc2bf776c20d4dc3790fb0cd7a1d4db` | VERIFIED (GitHub API، `telegram-miniapp`) |
| **Active Supabase Ref** | `uooeygybrniptzdxuzhj` | VERIFIED (فهرست‌کردنِ فقط‌خواندنیِ جدول‌ها) |
| **Deprecated Supabase Ref** | `lqfcyihuthdoqybwptxh` — **استفاده نشود** | VERIFIED (فقط یک ارجاعِ برچسب‌خوردهٔ تاریخی در اسناد) |
| **Portfolio hosting** | Vercel | INFERRED (`vercel.json` + چکِ Vercel روی PRها؛ دسترسیِ مستقیم به حساب نداشتیم) |
| **Current Mini App hosting** | **Manus (Legacy)** — `arash-teleapp-7shs2egu.manus.space` | INFERRED (در این سشن دوباره راستی‌آزمایی نشد؛ خلافش هم مدرکی ندارد) |
| **Mini App target hosting** | **Docker + Coolify روی VPS** | VERIFIED (کدِ هدف در `main` مینی‌اپ merge شده: `Dockerfile`, `docker-entrypoint.sh`, `DEPLOYMENT.md`) |
| **Mini App deployment state** | نسخهٔ جدید **مستقر نشده و cutover نشده** | VERIFIED (هیچ مدرکی بر استقرار نیست؛ ADR-001) |
| **Overall Health** | 🟠 **DEGRADED** — سایت بالاست، ولی مسیرِ لید شکسته و چند مجهولِ عملیاتی باز است | VERIFIED |
| **Highest Active Risk** | **B-003** — جریانِ لید عملیاتی نیست (ازدست‌رفتنِ بی‌صدای لید) | VERIFIED |

---

## 2. Active Gates

| Gate ID | Gate | Scope | Entry Criteria | Exit Criteria | Status | Owner | Blocking Items |
|---|---|---|---|---|---|---|---|
| **G-001** | Portfolio PR #76 Review Gate | Portfolio | PR باز، diff محدود به حذفِ دو workflow | بازبینی PASS · mergeable=clean · تأییدِ آرش · merge | ✅ **CLOSED** — merge شد (squash `57100c5`، 2026-07-25) | ARASH | — |
| **G-002** | Portfolio PR #77 Review Gate | Portfolio | PR باز، فقط docs | بازبینی PASS · اسناد منطبق بر واقعیت · تأییدِ آرش · merge | ✅ **CLOSED** — merge شد (squash `1261383`، 2026-07-25) | ARASH | — |
| **G-003** | Mini App Staging Readiness | Mini App | کدِ فاز ۰ در `main` (انجام شد) | محیطِ staging بالا · migrationها اجرا · تستِ دود سبز | **NOT_STARTED** | OWNER_UNASSIGNED | B-004، B-005، B-006، B-007، B-008 |
| **G-004** | Database Migration Readiness | هر دو | فهرستِ migrationهای NOT_APPLIED مشخص باشد (انجام شد) | تصمیمِ آرش برای هر migration · اجرا با شواهد · به‌روزرسانیِ MIGRATION-LEDGER | **BLOCKED** | ARASH | B-001، B-004، D-001، D-002 |
| **G-005** | Coolify Environment Readiness | Mini App | VPS تهیه شده باشد | Coolify نصب · متغیرها ست · دیتابیس MySQL بالا · healthcheck سبز | **NOT_STARTED** | OWNER_UNASSIGNED | B-005، B-006، B-007، B-008 |
| **G-006** | Mini App Cutover Gate | Mini App | G-003 و G-005 هر دو PASS | نسخهٔ Docker پایدار · `setWebhook` به دامنهٔ جدید · اجرای موازی · تأییدِ آرش | **NOT_STARTED** | ARASH | G-003، G-005، D-003 |
| **G-007** | Product Definition Gate | هر دو | پایانِ پاکسازی و تثبیت (P1/P2) | تعریفِ نهاییِ محصولِ Portfolio و Mini App توسط آرش | **DEFERRED / NOT STARTED** | ARASH | تمامِ گیت‌های بالا · D-007 |

> **قانون سخت:** `G-007` تا وقتی پاکسازی و تثبیت تمام نشده **باز نمی‌شود**. هیچ کارِ
> فیچری قبل از آن آغاز نمی‌شود (`DECISION-LOG.md` → `DD-004`).

---

## 3. Active Blockers

| Blocker ID | Blocker | Severity | Scope | Owner | Open Since | Blocks | Next Action | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| **B-001** | جدولِ `public.leads` در Supabase وجود ندارد | 🔴 CRITICAL | Portfolio / DB | ARASH | 2026-07-24 | B-003، G-004، D-001 | تصمیم دربارهٔ اجرای `sql/phase8b_leads.sql` (یا حذفِ کدِ وبهوک) | فهرست‌کردنِ فقط‌خواندنیِ جدول‌های `public` روی `uooeygybrniptzdxuzhj` در 2026-07-25 → `leads` نیست | **OPEN** · VERIFIED |
| **B-002** | ناهم‌گامیِ نامِ سکرتِ لید: کد `PLATFORM_WEBHOOK_SECRET` می‌خواند، `.env.example` نامِ `LEADS_WEBHOOK_SECRET` را دارد | 🔴 CRITICAL | Portfolio | ENGINEERING | 2026-07-25 | B-003، D-001 | یکی‌سازیِ نام در کد و `.env.example` (تغییرِ کد، خارج از دامنهٔ P1-006) | `app/api/leads/webhook/route.ts:12` در برابر `.env.example`؛ `LEADS_WEBHOOK_SECRET` در هیچ کدی خوانده نمی‌شود | **OPEN** · VERIFIED |
| **B-003** | جریانِ لید عملیاتی نیست — هر لیدِ miniapp در سطحِ DB شکست می‌خورد | 🔴 CRITICAL | Portfolio ↔ Mini App | ARASH | 2026-07-24 | درآمد/CRM | رفعِ B-001 و B-002 با هم؛ تا آن زمان لید از مسیرِ دیگری جمع شود | نتیجهٔ مستقیمِ B-001 + B-002؛ ADR-003 | **OPEN** · VERIFIED |
| **B-004** | migrationِ نقش/ایندکسِ مینی‌اپ اجرا نشده است | 🟠 HIGH | Mini App / DB | OWNER_UNASSIGNED | 2026-07-24 | G-003، G-004، G-006 | اجرای `drizzle-kit migrate` روی دیتابیسِ staging پس از آماده‌شدنِ محیط | `drizzle/0002_perpetual_sally_floyd.sql` (افزودنِ `role` به `telegram_users` + دو ایندکس روی `telegramId`) در `main` هست ولی فقط هنگامِ اجرای کانتینر اعمال می‌شود؛ کانتینر مستقر نشده | **OPEN** · فایل VERIFIED / اعمال‌نشدن INFERRED |
| **B-004a** | اجرای migration در `docker-entrypoint.sh` **best-effort و غیرمهلک** است | 🟠 HIGH | Mini App | ENGINEERING | 2026-07-25 | G-003، G-006 | تصمیم: آیا شکستِ migration باید استارتِ سرور را متوقف کند؟ | `docker-entrypoint.sh` — پس از ۵ تلاشِ ناموفق `break` می‌کند و سرور را بالا می‌آورد؛ یعنی اپ می‌تواند روی schemaِ قدیمی بالا بیاید و چکِ نقشِ ادمین در زمانِ اجرا بشکند | **OPEN** · VERIFIED |
| **B-005** | آمادگیِ محیطِ Coolify نامعلوم/ناتمام است | 🟠 HIGH | Mini App / Infra | OWNER_UNASSIGNED | 2026-07-24 | G-005، G-006 | تهیهٔ VPS و نصبِ Coolify؛ سپس ثبتِ شواهد اینجا | VPS هنوز provision نشده (ADR-001)؛ در این سشن دسترسی به Coolify نداشتیم | **OPEN** · UNKNOWN |
| **B-006** | آمادگیِ `MINI_APP_URL` نامعلوم است | 🟠 HIGH | Mini App / Env | OWNER_UNASSIGNED | 2026-07-24 | G-005، G-006 | پس از تعیینِ دامنهٔ Coolify، مقدار ست و اینجا تأیید شود | `.env.example` مینی‌اپ آن را **REQUIRED** می‌داند؛ `set-webhook` آدرس را فقط از همین می‌سازد | **OPEN** · UNKNOWN |
| **B-007** | آمادگیِ `ADMIN_SECRET` نامعلوم است | 🟡 MEDIUM | Mini App / Env | OWNER_UNASSIGNED | 2026-07-24 | G-005 | ست‌کردنِ یک مقدارِ تصادفیِ بلند در Coolify | `.env.example`: «endpointِ `set-webhook` تا وقتی این ست نشده کاملاً غیرفعال است». دسترسیِ ادمینِ داخلِ اپ از `TELEGRAM_ADMIN_CHAT_ID` می‌آید، نه این | **OPEN** · UNKNOWN |
| **B-008** | آمادگیِ سکرتِ JWT/نشست نامعلوم است | 🟡 MEDIUM | Mini App / Env | OWNER_UNASSIGNED | 2026-07-24 | G-005 | تصمیم: `JWT_SECRET` صریح ست شود یا مشتق‌شدن از توکنِ بات پذیرفته شود | `.env.example`: اگر `JWT_SECRET` خالی بماند کلید از `TELEGRAM_BOT_TOKEN` مشتق می‌شود — کار می‌کند ولی چرخشِ توکنِ بات همهٔ نشست‌ها را باطل می‌کند | **OPEN** · UNKNOWN |
| **B-009** | اجرای واقعیِ Vercel Cron مستقلاً راستی‌آزمایی نشده | 🟡 MEDIUM | Portfolio | OWNER_UNASSIGNED | 2026-07-24 | اعتماد به زمان‌بندی | بررسیِ لاگ‌های اجرای cron در داشبوردِ Vercel و ثبتِ شواهد | `vercel.json` مسیرها را تعریف می‌کند، ولی «تعریف‌شده» ≠ «اجرا شده». دسترسیِ عملیاتی به Vercel در این سشن نبود | **OPEN** · UNKNOWN |
| **B-010** | وجودِ `CRON_SECRET` روی Vercel مستقلاً راستی‌آزمایی نشده | 🟡 MEDIUM | Portfolio / Env | OWNER_UNASSIGNED | 2026-07-24 | B-009 | تأییدِ ست‌بودنِ متغیر در Vercel (فقط نام، بدون افشای مقدار) | کد بدونِ آن **۴۰۱** می‌دهد (`app/api/cron/*/route.ts`)؛ ست‌بودنش راستی‌آزمایی نشد | **OPEN** · UNKNOWN |
| ~~**B-011**~~ | ~~PR #76 هنوز merge نشده~~ | 🟢 LOW | Portfolio | ARASH | 2026-07-24 | — | — | GitHub: `merged=true`، `state=closed`، `merged_at=2026-07-25T09:46:17Z`، squash SHA `57100c5` | ✅ **CLOSED 2026-07-25** |
| ~~**B-012**~~ | ~~PR #77 هنوز merge نشده~~ | 🟢 LOW | Portfolio | ARASH | 2026-07-24 | — | — | GitHub: `merged=true`، `state=closed`، `merged_at=2026-07-25T09:51:20Z`، squash SHA `1261383` | ✅ **CLOSED 2026-07-25** |
| **B-013** | `npm ci` می‌شکند چون `package-lock.json` ناهم‌گام است | 🟠 HIGH | Portfolio / Build | ENGINEERING | 2026-07-25 | بازتولیدپذیریِ build | بازسازیِ لاک‌فایل (`npm install` + کامیتِ لاک) در یک PR جدا | `npm ci` → `Missing: frac@1.1.2 from lock file` روی `main` در 2026-07-25 | **OPEN** · VERIFIED |
| **B-014** | `npm run lint` غیرتعاملی اجرا نمی‌شود | 🟡 MEDIUM | Portfolio / CI | ENGINEERING | 2026-07-25 | کیفیتِ کد | مهاجرت از `next lint` به ESLint CLI | `next lint` منسوخ شده و promptِ تعاملیِ پیکربندیِ ESLint می‌دهد | **OPEN** · VERIFIED |
| **B-015** | مخزن **هیچ GitHub Actions workflowی ندارد** (پس از merge شدنِ PR #76 محقق شد) | 🟡 MEDIUM | Portfolio / CI | ARASH | 2026-07-25 | پوششِ CI | تصمیم: آیا یک workflowِ واقعیِ CI (build/typecheck/test) اضافه شود؟ | `git ls-tree origin/main .github/workflows/` پس از merge → خروجیِ خالی. تنها چک‌های PR، اینتگریشن‌های بیرونیِ Vercel/Supabase هستند | **OPEN (محقق‌شده)** · VERIFIED |
| **B-016** | کامنتِ هشدارِ قیمت «هر ۵ دقیقه» می‌گوید، ولی `vercel.json` روزانه اجرا می‌کند | 🟡 MEDIUM | Portfolio | ENGINEERING | 2026-07-25 | صحتِ رفتارِ هشدار | تصمیم: کامنت اصلاح شود یا زمان‌بندی واقعاً متراکم‌تر شود (احتمالاً نیازمندِ ارتقای پلنِ Vercel) | `app/api/cron/alerts/route.ts:7` در برابر `vercel.json` (`0 6 * * *`) | **OPEN** · VERIFIED |
| **B-017** | `docs/archive/content-hub.md` ارجاعاتِ کهنهٔ scheduler دارد | 🟢 LOW | Portfolio / Docs | ENGINEERING | 2026-07-25 | — | یا اصلاحِ سند یا افزودنِ بنرِ «آرشیو — معتبر نیست» | همان فایل هنوز `cron-telegram-sync.yml` را فعال و زمان‌بندیِ Vercel را «هر ۶ ساعت» می‌گوید | **OPEN** · VERIFIED |
| **B-018** | مالکِ نامشخص در سه ردیفِ `SERVICE-OWNERSHIP.md` | 🟠 HIGH | همه | ARASH | 2026-07-24 | پاسخ‌گوییِ عملیاتی | تعیینِ مالک برای: Mini App هدف (Docker/Coolify/VPS) · Domain/DNS · مالکِ اجراییِ Coolify | `SERVICE-OWNERSHIP.md` — سه ردیفِ `OWNER_UNASSIGNED` | **OPEN** · VERIFIED |

**قانون:** هیچ مالکی جعل نمی‌شود. جایی که مالکِ واقعی معلوم نیست، `OWNER_UNASSIGNED` می‌ماند
تا آرش تعیین کند.

---

## 4. Open Decisions

> خلاصه است. متنِ کامل، گزینه‌ها و شواهد در `DECISION-LOG.md`.

| Decision ID | Decision | Decision Owner | Open Since | Blocks | Options | Next Decision Point | Status |
|---|---|---|---|---|---|---|---|
| **D-001** | منبعِ نهاییِ حقیقتِ Lead چیست و `public.leads` کِی ساخته/فعال می‌شود؟ | ARASH | 2026-07-24 | B-001، B-003، G-004 | اجرای `phase8b_leads.sql` / حذفِ کدِ وبهوک / نگه‌داشتنِ لید فقط در مینی‌اپ | پیش از هر کارِ CRM | **OPEN** |
| **D-002** | کدام migrationهای مینی‌اپ در staging و با چه ترتیبی اجرا شوند؟ | ENGINEERING | 2026-07-24 | B-004، G-003 | اجرای هر سه به‌ترتیب `drizzle-kit migrate` / اجرای دستیِ گزینشی | هنگام بالا آمدنِ staging | **OPEN** |
| **D-003** | cutover از Manus به Coolify از چه زمانی مجاز است؟ | ARASH | 2026-07-24 | G-006 | پس از تستِ دود / پس از اجرای موازی / موکول به بعد | پس از PASS شدنِ G-003 و G-005 | **OPEN** |
| **D-004** | مالکِ هر سرویس و پاسخ‌گوییِ عملیاتی کیست؟ | ARASH | 2026-07-24 | B-018 | آرش تنها مالک / تفویض به مجریِ مشخص | TBD | **OPEN** |
| **D-005** | Vercel Cron چگونه مستقلاً راستی‌آزمایی و مانیتور شود؟ | ENGINEERING | 2026-07-24 | B-009 | بررسیِ لاگِ Vercel / heartbeat در DB / مانیتورِ بیرونی | همراه با رفعِ B-016 | **OPEN** |
| **D-006** | `CRON_SECRET` باید کجا باشد و چه کسی تأیید می‌کند؟ | ARASH | 2026-07-24 | B-010، B-009 | فقط Vercel / همچنین GitHub (رد شد در ADR-002) | همراه با D-005 | **OPEN** |
| **D-007** | تعریفِ نهاییِ محصولِ Portfolio و Mini App پس از تثبیت چیست؟ | ARASH | 2026-07-24 | G-007 و هر کارِ فیچری | TBD | **پس از** پایانِ P1/P2 | **DEFERRED** |
| **D-008** | تکلیفِ PR #74 چیست؟ | ARASH | 2026-07-23 | شاخهٔ `develop` | merge به develop / نگه‌داشتن تا اعتبارِ PSY / بستن | پس از رفعِ بلاکرِ CPI ماهانه | **OPEN** |
| **D-009** | تکلیفِ PR #75 و پیش‌نویسِ schemaِ پرداخت چیست؟ | ARASH | 2026-07-23 | امنیتِ پرداختِ وبینار | merge / بازبینیِ بیشتر / merge همراه با سخت‌سازیِ CSP | زودتر از بقیه (اصلاحِ امنیتی است) | **OPEN** |
| **D-010** | Portfolio و Mini App بلندمدت دیتابیسِ مشترک، یکپارچگیِ محدود، یا bounded contextهای جدا؟ | ARASH | 2026-07-24 | معماریِ بلندمدت، D-001 | مشترک / یکپارچگیِ محدود از راهِ وبهوک (وضعِ فعلی) / کاملاً جدا | همراه با D-007 | **OPEN** |

> **نکتهٔ مهمِ فنی برای D-010:** مینی‌اپ روی **MySQL** با Drizzle کار می‌کند
> (`DATABASE_URL=mysql://…`)، درحالی‌که Portfolio روی **Postgres/Supabase** است. یعنی
> «دیتابیسِ مشترک» امروز عملاً روی میز نیست مگر با مهاجرتِ موتورِ دیتابیس. — VERIFIED

---

## 5. Pull Request Status

> وضعیت از GitHub در **2026-07-25** خوانده شد. حدس زده نشده.

| Repository | PR | Title | Head SHA | Draft | Mergeable | Review State | Blocks | Recommended Action |
|---|---|---|---|---|---|---|---|---|
| portfolio-platform | **#74** | feat(fx): فعال‌سازی GARCH و PSYِ ماهانه | `6aaadc587f76d9a6eddcbb7a9972aab38dec46ef` | YES | `clean` | باز، base=`develop` | D-008 | **دست نزن** — خارج از دامنهٔ P1؛ منتظرِ تصمیمِ آرش |
| portfolio-platform | **#75** | fix(security): وبینار RPC + یافته‌های بازبینیِ امنیتی | `2bd82eb9753b56456f445caa2d1b09594c721e57` | YES | `clean` | باز، base=`main` | D-009 | **دست نزن** — اصلاحِ امنیتی؛ اولویتِ بازبینیِ جداگانه |
| portfolio-platform | **#76** | chore: remove misleading duplicate cron workflows | `8dd0f6d6bc7e82b56c6b1a2cbb1ed9b15270d6c4` → squash `57100c50c1c2fd027ee9d336b3af573691398de2` | NO | — | ✅ **MERGED** 2026-07-25T09:46:17Z (P1-007) | — | بسته — برنچ حذف نشد |
| portfolio-platform | **#77** | docs: establish production architecture baseline | `2c4f1e92b0856d11e7290294d9176471bc6036a4` (پس از rebase) → squash `1261383cb46308d3c15d08534d65b3171a1dba66` | NO | — | ✅ **MERGED** 2026-07-25T09:51:20Z (P1-007) | — | بسته — برنچ حذف نشد |
| telegram-miniapp | **#2** | فاز ۰: امنیت + استقلال از Manus + Coolify | `e80edf7e01dfa13a703e1fe7d0e507ef2d4d3f66` | NO | — | **MERGED** 2026-07-24 | — | بسته — کارِ باقی‌مانده استقرار است، نه کد |

> ⚠️ **merge شدنِ PR #2 یعنی «کد در `main` است»، نه «مستقر شده».** استقرار و cutover
> هنوز انجام نشده (G-006).

---

## 6. Database and Migration Drift

> فقط نمای خلاصه. **منبعِ حقیقتِ کاملِ migrationها `MIGRATION-LEDGER.md` است.**
>
> تفکیکِ سخت: «فایلِ migration وجود دارد» ≠ «اجرا شده». هیچ ردیفی بدونِ شواهد
> `APPLIED` علامت نمی‌خورد.

| System | Expected State | Verified State | Drift | Evidence | Required Action | Owner | Status |
|---|---|---|---|---|---|---|---|
| Supabase / `leads` | جدول موجود باشد (کد به آن می‌نویسد) | **جدول وجود ندارد** | 🔴 بله | فهرستِ فقط‌خواندنیِ جدول‌ها 2026-07-25 | تصمیمِ D-001، سپس اجرای `sql/phase8b_leads.sql` | ARASH | **NOT_APPLIED** |
| Supabase / `screener_starred` | فایل `sql/phase18_screener_starred.sql` موجود | نه ستون، نه جدول | 🟡 بله | همان فهرست | تا عرضهٔ UIِ «منتخب» بلاک بماند | ENGINEERING | **NOT_APPLIED** |
| Supabase / phase19 IME | `ime_certificate_history`, `ime_physical_trades` | هیچ‌کدام نیست؛ به‌جایش `ime_snapshots` با طرحِ متفاوت | 🟡 بله | همان فهرست | تصمیم: طرحِ کدام یک درست است؟ | ENGINEERING | **NOT_APPLIED / SUPERSEDED** |
| Supabase / `ime_snapshots` | باید در migrationِ ردیابی‌شده باشد | جدول هست، فایل/migration ندارد | 🟡 بله | همان فهرست | رسمی‌کردن در یک migrationِ ردیابی‌شده | ENGINEERING | **UNTRACKED** |
| Supabase / هستهٔ سایت | `payments`, `entitlements`, `symbol_history`, `codal_*`, `fx_*`, `index_history`, `market_breadth` | همه موجود، همه با `rls_enabled=true` | ✅ خیر | همان فهرست | — | — | **APPLIED / VERIFIED** |
| Mini App MySQL / 0000، 0001 | schemaِ پایه | **UNKNOWN** — به دیتابیسِ زندهٔ مینی‌اپ دسترسی نداریم | ❔ نامعلوم | فایل‌ها در `main` هستند | راستی‌آزمایی هنگام بالا آمدنِ staging | OWNER_UNASSIGNED | **UNKNOWN** |
| Mini App MySQL / 0002 (`role` + ایندکس‌ها) | اعمال‌شده | **اعمال‌نشده** (کانتینر اجرا نشده) | 🟠 بله | `drizzle/0002_perpetual_sally_floyd.sql` + `docker-entrypoint.sh` | اجرا در staging (D-002) | OWNER_UNASSIGNED | **NOT_APPLIED** |
| معماریِ هدفِ داده | Portfolio=Postgres/Supabase · Mini App=MySQL | همین است | — | `.env.example` مینی‌اپ + `drizzle.config.ts` | تصمیمِ بلندمدتِ D-010 | ARASH | **DECISION_REQUIRED** |

---

## 7. Environment Readiness

> **فقط نامِ متغیرها.** هیچ مقدار، توکن، کلید یا رشتهٔ اتصالی اینجا ثبت نمی‌شود.
> فهرستِ کاملِ متغیرهای Portfolio در `ENVIRONMENT-MATRIX.md`.

| Service | Environment | Required Variables | Verified Presence | Missing/Unknown | Blocks | Status |
|---|---|---|---|---|---|---|
| Portfolio | Vercel (production) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ZARINPAL_MERCHANT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PLATFORM_WEBHOOK_SECRET` | **هیچ‌کدام مستقلاً تأیید نشد** (دسترسیِ عملیاتی به Vercel نداشتیم) | همه UNKNOWN؛ به‌ویژه `CRON_SECRET` (B-010) و `PLATFORM_WEBHOOK_SECRET` (B-002) | B-009، B-010، B-003 | **UNKNOWN** |
| Portfolio | محلی (`.env`) | همان‌ها از `.env.example` | نام‌ها VERIFIED | `.env.example` نامِ اشتباهِ `LEADS_WEBHOOK_SECRET` را دارد | B-002 | **DRIFT** |
| Supabase | پروژهٔ `uooeygybrniptzdxuzhj` | — (پیکربندی سمتِ پلتفرم) | ref و جدول‌ها VERIFIED | — | — | **OK** |
| Relay | Liara | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRSAPI_KEY`, `RELAY_TOKEN` (+ گروه‌های `CODAL_*`, `CANDLE_*`) | نام‌ها VERIFIED از کدِ رله | ست‌بودنِ مقادیر UNKNOWN | — | **UNKNOWN** |
| Mini App | Manus (Legacy، فعلی) | — | UNKNOWN | کلِ پیکربندیِ Manus راستی‌آزمایی نشد | G-006 | **UNKNOWN** |
| Mini App / Coolify | Coolify (هدف) — **REQUIRED** | `NODE_ENV`, `PORT`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `MINI_APP_URL` | هیچ‌کدام — محیط هنوز نیست | همه | B-005، B-006، G-005 | **NOT_READY** |
| Mini App / Coolify | Coolify — **RECOMMENDED** | `ADMIN_SECRET`, `JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET` | هیچ‌کدام | همه | B-007، B-008 | **NOT_READY** |
| Mini App / Coolify | Coolify — **OPTIONAL / build-time** | `VITE_APP_URL`, `DOMAIN`, `VITE_*` (گروهِ Forge/Analytics) | — | اختیاری | — | **OPTIONAL** |

---

## 8. Immediate Next Actions

| Priority | Action | Owner | Dependency | Expected Output | Gate |
|---|---|---|---|---|---|
| ~~۱~~ | ~~بازبینی و merge کردنِ PR #76~~ | ARASH | — | ✅ **انجام شد** 2026-07-25 (squash `57100c5`) | G-001 ✅ |
| ~~۲~~ | ~~بازبینی و merge کردنِ PR #77~~ | ARASH | — | ✅ **انجام شد** 2026-07-25 (squash `1261383`) | G-002 ✅ |
| **1** | تصمیم دربارهٔ D-001 (سرنوشتِ `leads`) — **بالاترین ریسکِ باز** | ARASH | — | یا اجرای migration یا حذفِ کدِ وبهوک | G-004 |
| **2** | یکی‌سازیِ نامِ سکرتِ وبهوکِ لید (B-002) | ENGINEERING | اقدام ۱ | یک PRِ کوچکِ کد + به‌روزرسانیِ `.env.example` | G-004 |
| **3** | بازبینیِ PR #75 (اصلاحِ امنیتیِ پرداخت) | ARASH | — | تصمیمِ D-009 | — |
| **4** | بازسازیِ `package-lock.json` تا `npm ci` کار کند (B-013) | ENGINEERING | — | buildِ بازتولیدپذیر | — |
| **5** | تعیینِ مالک برای سه ردیفِ `OWNER_UNASSIGNED` (B-018) | ARASH | — | `SERVICE-OWNERSHIP.md` بدونِ خانهٔ خالی | — |
| **6** | راستی‌آزماییِ اجرای Vercel Cron و وجودِ `CRON_SECRET` (B-009، B-010) | ARASH | — | شواهدِ ثبت‌شده در همین سند | — |
| **7** | تصمیم دربارهٔ افزودنِ یک workflowِ واقعیِ CI (B-015) | ARASH | اقدام ۴ | build/typecheck/test روی هر PR | — |
| **8** | تهیهٔ VPS و نصبِ Coolify (B-005) | OWNER_UNASSIGNED | اقدام ۵ | محیطِ staging بالا | G-005 |
| **9** | اجرای migrationهای مینی‌اپ در staging (B-004، D-002) | OWNER_UNASSIGNED | اقدام ۸ | schemaِ به‌روز + تستِ دودِ سبز | G-003 |

---

## 9. Recently Closed

| Item | Result | Evidence | Closed Date |
|---|---|---|---|
| Mini App PR #2 (فاز ۰ امنیت + استقلال از Manus + Coolify) | **MERGED** | GitHub: `merged=true`، `merged_at=2026-07-24T11:52:02Z`، ۳۶ فایل، +۱۹۵۹/−۳۷۳ | 2026-07-24 |
| مأموریت P1-005 — بازبینیِ نهاییِ PR #76 و #77 | **COMPLETED** — هر دو READY_FOR_MERGE | کامیت `f79f14e` روی شاخهٔ PR #77؛ گزارشِ P1-005 | 2026-07-25 |
| راستی‌آزماییِ نبودِ `public.leads` | **CONFIRMED** — جدول وجود ندارد | فهرست‌کردنِ فقط‌خواندنیِ جدول‌های `public` | 2026-07-25 |
| راستی‌آزماییِ ادعاهای `MIGRATION-LEDGER` | **CONFIRMED** — همه منطبق | همان فهرست | 2026-07-25 |
| کشفِ ناهم‌گامیِ نامِ سکرتِ لید | **DOCUMENTED** به‌عنوان B-002 | `route.ts` در برابر `.env.example` | 2026-07-25 |
| ریشه‌یابیِ هشدارِ `docs/ONBOARDING.md` | **RESOLVED** — عدمِ تطابقِ شاخه، نه نقصِ مخزن | بخشِ ۱۴ در `ONBOARDING.md` | 2026-07-25 |
| **PR #76 — حذفِ workflowهای تکراریِ cron** | **MERGED** (squash) — `main` از `aaf9974` به `57100c5` رفت؛ `.github/workflows/` حالا خالی است | GitHub: `merged=true`، `merged_at=2026-07-25T09:46:17Z`؛ `git ls-tree origin/main .github/workflows/` → خالی | 2026-07-25 |
| **بلاکرِ B-011** | **CLOSED** — با merge شدنِ PR #76 | همان بالا | 2026-07-25 |
| **تصمیمِ DD-008** | از `APPROVED_PENDING_MERGE` به **`DECIDED / IMPLEMENTED`** رفت | `DECISION-LOG.md` → `DD-008` | 2026-07-25 |
| **گیتِ G-001 (PR #76 Review Gate)** | **CLOSED** | همان بالا | 2026-07-25 |
| **PR #77 — لایهٔ اسناد و حاکمیت** | **MERGED** (squash) — `main` از `57100c5` به `1261383` رفت؛ هر ۱۰ سند حالا روی `main` هستند | GitHub: `merged=true`، `merged_at=2026-07-25T09:51:20Z`؛ کامیت +۱۰۹۷ افزوده، ۰ حذف، فقط زیر `docs/` | 2026-07-25 |
| **بلاکرِ B-012** | **CLOSED** — با merge شدنِ PR #77 | همان بالا | 2026-07-25 |
| **گیتِ G-002 (PR #77 Review Gate)** | **CLOSED** | همان بالا | 2026-07-25 |
| **Governance Documentation Gate** | **CLOSED** — COMMAND-CENTER و DECISION-LOG حالا روی `main` هستند و منبعِ رسمیِ وضعیت و تصمیم‌اند | `git cat-file -e origin/main:docs/COMMAND-CENTER.md` و `…:docs/DECISION-LOG.md` | 2026-07-25 |

---

## 10. Update Protocol

### چه وقت این سند **باید** به‌روزرسانی شود

به‌روزرسانی **اجباری** است بعد از هر یک از این‌ها:

1. **merge شدنِ هر PR** (در هر دو مخزن) — بخش ۵ و ۹.
2. **اجرای هر migration** — بخش ۶ و `MIGRATION-LEDGER.md`.
3. **هر deploy یا cutover** — بخش ۱ و گیتِ مربوطه.
4. **هر تغییر در بلاکرها** (باز شدن، بسته شدن، تغییرِ شدت) — بخش ۳.
5. **هر تصمیمِ معماری** — بخش ۴ + `DECISION-LOG.md` (و ADR اگر عمیق باشد).
6. **هر تغییر مالکیت** — بخش ۳/۷ + `SERVICE-OWNERSHIP.md`.
7. **پایانِ هر مأموریتِ P1/P2** — کلِ سند + `Last Verified Date`.

### برچسب‌های شواهد

| برچسب | معنا | شرطِ استفاده |
|---|---|---|
| **VERIFIED** | با اجرای واقعیِ یک دستور/فراخوانی در تاریخِ ذکرشده دیده شده | باید بگویی **چطور** دیده شد |
| **INFERRED** | از شواهدِ غیرمستقیم نتیجه گرفته شده | باید بگویی از **چه** نتیجه گرفتی |
| **UNKNOWN** | راستی‌آزمایی نشده و حدس هم زده نمی‌شود | باید بگویی **چرا** نشد |
| **DECISION_REQUIRED** | واقعیتِ فنی روشن است ولی انتخابِ انسانی لازم است | باید به یک `D-xxx` وصل شود |

> **هرگز** `UNKNOWN` را به `VERIFIED` ارتقا نده مگر با اجرای واقعی. «احتمالاً درست است»
> یعنی `INFERRED`، نه `VERIFIED`.

### قاعدهٔ دادهٔ کهنه (stale)

- هر ردیفِ `VERIFIED` **تاریخِ راستی‌آزمایی** دارد. اگر تاریخ بیش از **۳۰ روز** قدیمی باشد،
  آن ردیف **کهنه** حساب می‌شود و باید به `INFERRED` تنزل کند تا دوباره دیده شود.
- `Last Verified Date` در بخش ۱ فقط وقتی جلو می‌رود که **کلِ بخشِ ۱** دوباره راستی‌آزمایی
  شده باشد — نه با یک اصلاحِ جزئی.
- SHAها و وضعیتِ PR **سریع‌الفساد**اند: قبل از هر تصمیمی که به آن‌ها وابسته است، تازه بخوان.
- اگر یک ردیف کهنه شد و راستی‌آزماییِ مجدد ممکن نبود، **حذفش نکن** — به `UNKNOWN` تغییرش
  بده و دلیل را بنویس. حذفِ بی‌صدا، تاریخ را از بین می‌برد.

### نقشِ اسناد (مرزها را قاطی نکن)

| سند | نقش |
|---|---|
| `COMMAND-CENTER.md` | **وضعیتِ عملیاتیِ زنده** (همین فایل) |
| `DECISION-LOG.md` | دفترِ دائمیِ تصمیم‌های باز و بسته |
| `docs/ADR/*.md` | تصمیم‌های عمیقِ معماری با گزینه‌ها و برنامهٔ بازگشت |
| `MIGRATION-LEDGER.md` | منبعِ حقیقتِ migrationها |
| `SERVICE-OWNERSHIP.md` | منبعِ حقیقتِ مالکیت |
| `ENVIRONMENT-MATRIX.md` | نام و محلِ متغیرهای محیطی |
| `PRODUCTION-ARCHITECTURE.md` | معماریِ کلان |
| `ONBOARDING.md` | راهنمای ورود + نقشهٔ اسناد |
