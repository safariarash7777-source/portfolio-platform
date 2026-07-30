# Arash Digital Platform — Command Center

> **نقشِ این سند: وضعیتِ عملیاتیِ زندهٔ کلِ پلتفرم.** اگر می‌خواهی در پنج دقیقه بفهمی
> «الان واقعاً کجاییم و چه چیزی گیر است»، فقط همین فایل را بخوان.
>
> این سند **تصمیم** ثبت نمی‌کند (آن کارِ `DECISION-LOG.md` است) و **معماری** را توضیح
> نمی‌دهد (آن کارِ `PRODUCTION-ARCHITECTURE.md` و ADRهاست). اینجا فقط **حالِ حاضر** است.
>
> هر ادعا یکی از این برچسب‌ها را دارد: `VERIFIED` · `INFERRED` · `UNKNOWN` · `DECISION_REQUIRED`.
> تعریف‌ها در بخش ۱۰.
>
> **جهتِ محصول اینجا نیست** — «چه می‌سازیم و چرا» در
> [`PRODUCT-BLUEPRINT.md`](./PRODUCT-BLUEPRINT.md) است. فهرستِ کاملِ اسناد و
> نقشِ هر کدام: [`README.md`](./README.md).

---

## 1. Current Program State

| مورد | مقدار | برچسب |
|---|---|---|
| **Current Phase** | **P2 — بازتعریفِ محصول و مسیرِ رونماییِ عمومی** | VERIFIED |
| **Current Gate** | **Gate 2 · Operational Foundation** (`G2-001`…`G2-009`) — **فعال**. **Gate 1 بسته شد**: `PRODUCT-BLUEPRINT` با تأییدِ نهاییِ آرش تصویب شد (`DD-025`)، معماریِ **Arash Intelligence Desk** پیش‌تر تأیید شده بود (`DD-024`) | VERIFIED |
| **Last Verified Date** | **2026-07-30** | — |
| **Portfolio main SHA** | `7ad084eb54f4e2d5c274d4df2bdbe571d2b09b8c` — **verified as of 2026-07-28**. منبعِ حقیقت `git rev-parse origin/main` است، نه این خانه. مسیر: `51ac8aa` (#79) → `1acc18e` (#84) → `def602f` (#85) → `7ad084e` (planning) | VERIFIED |
| **Mini App main SHA** | `b88f9353bbc2bf776c20d4dc3790fb0cd7a1d4db` | VERIFIED (GitHub API، `telegram-miniapp`) |
| **Active Supabase Ref** | `uooeygybrniptzdxuzhj` | VERIFIED (فهرست‌کردنِ فقط‌خواندنیِ جدول‌ها) |
| **Staging Supabase Ref** | `oqjcvkzyvhqnphopedpn` — پروژهٔ **ایزولهٔ رایگان**، ساخته‌شده در `G2-006` (۱۴۰۵/۰۵/۰۸). فقط دادهٔ مصنوعی؛ هیچ دادهٔ Production واردش نشد. جدولِ `leads` **فقط اینجا** اجرا شده | VERIFIED (ساخت + اجرای migration + پرس‌وجوهای راستی‌آزمایی) |
| **Deprecated Supabase Ref** | `lqfcyihuthdoqybwptxh` — **استفاده نشود**. ⚠️ این ref **Production نیست** (`SD-002`) — اگر جایی به‌عنوانِ Production معرفی شد، غلط است | VERIFIED (فقط یک ارجاعِ برچسب‌خوردهٔ تاریخی در اسناد) |
| **Portfolio hosting** | Vercel | INFERRED (`vercel.json` + چکِ Vercel روی PRها؛ دسترسیِ مستقیم به حساب نداشتیم) |
| **Current Mini App hosting** | **Manus (Legacy)** — `arash-teleapp-7shs2egu.manus.space` | INFERRED (در این سشن دوباره راستی‌آزمایی نشد؛ خلافش هم مدرکی ندارد) |
| **Mini App target hosting** | **Docker + Coolify روی VPS** | VERIFIED (کدِ هدف در `main` مینی‌اپ merge شده: `Dockerfile`, `docker-entrypoint.sh`, `DEPLOYMENT.md`) |
| **Mini App deployment state** | نسخهٔ جدید **مستقر نشده و cutover نشده** | VERIFIED (هیچ مدرکی بر استقرار نیست؛ ADR-001) |
| **Overall Health** | 🔴 **IMPAIRED** — سایت بالاست، ولی **دو مسیرِ درآمد و یک مسیرِ لید شکسته‌اند**: خطای `SUPABASE_SERVICE_ROLE_KEY` در Production (وبینار + همگام‌سازیِ تلگرام)، پرداختِ وبینار خطا می‌دهد، پرداخت به `entitlement` وصل نیست، و جدولِ `leads` وجود ندارد | VERIFIED |
| **Highest Active Risk** | **B-024** — خطای `SUPABASE_SERVICE_ROLE_KEY` در Production؛ سپس **B-025** (پرداخت دسترسی نمی‌دهد) و **B-003** (لید عملیاتی نیست) | VERIFIED |

---

## 1′. Capability States — چهار حالتِ متفاوت

> **«کد merge شد» ≠ «مستقر شد» ≠ «عملیاتی است» ≠ «اثبات شد».**
> هر ادعای این سند باید یکی از این چهار را صریح بگوید.

| حالت | تعریف |
|---|---|
| **BUILT** | کد در `main` هست و تست دارد |
| **DEPLOYED** | روی Production اجرا می‌شود |
| **OPERATIONAL** | مسیرِ واقعیِ کسب‌وکار سرتاسر کار می‌کند |
| **PROVEN** | با شواهدِ اجرای واقعی راستی‌آزمایی شده |

| قابلیت | BUILT | DEPLOYED | OPERATIONAL | PROVEN |
|---|:---:|:---:|:---:|:---:|
| صفحاتِ بازار / نماد / صندوق / کدال | ✅ | ✅ | ✅ | ✅ |
| رلهٔ داده (TSETMC/کدال/IME) | ✅ | ✅ | ✅ | ✅ |
| موتورهای `lib/core` (کوانت/رژیم/بک‌تست/تخصیص) | ✅ | ✅ | ✅ | ⚠️ فقط با تستِ واحد |
| احراز هویت · نقش · `entitlements` | ✅ | ✅ | ✅ | ✅ |
| همگام‌سازیِ تلگرام → `content_hub` | ✅ | ✅ | ⚠️ `B-024` | ❌ |
| کارنامه (`/analyses` + زنجیرهٔ هش) | ✅ | ✅ | ⚠️ محتوا تقریباً خالی | ❌ |
| پرداخت (زرین‌پال) | ✅ | ✅ | ⚠️ وبینار خطا می‌دهد (`B-026`) | ❌ |
| **پرداخت → دسترسیِ خودکار** | ❌ | ❌ | ❌ | ❌ |
| مسیرِ لید | ✅ | ✅ | ❌ جدول وجود ندارد (`B-001`) | ❌ |
| CI (‏۴ job) | ✅ | ✅ | ⚠️ اجباری نیست (`B-015`) | ✅ |
| میزِ آرش · مدلِ دادهٔ هوشمندی · ورودیِ خبر · AI | ❌ | ❌ | ❌ | ❌ |

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
| **G-007** | Product Definition Gate | **فقط Portfolio** | بازتعریفِ محصول نوشته شود | تأییدِ صریحِ آرش روی `PRODUCT-BLUEPRINT` بازنویسی‌شده | ✅ **SUPERSEDED توسطِ نقشهٔ ۷ گیتِ زیر** — دامنه‌اش به Portfolio محدود شد و از گیت‌های مینی‌اپ جدا شد (`DD-021`/`SD-008`) | ARASH | D-007 |

> ⚠️ **قانونِ قبلی تغییر کرد.** پیش‌تر `G-007` پشتِ «تمامِ گیت‌های بالا» — از جمله
> `G-003`/`G-005`/`G-006`ِ مینی‌اپ که هر سه `OWNER_UNASSIGNED`اند — قفل بود. یعنی
> تعریفِ محصولِ اصلی پشتِ مهاجرتی قفل شده بود که مالک ندارد. طبقِ **`DD-021`**
> (`SD-008`) این وابستگی برداشته شد: **گیت‌های مینی‌اپ مسیرِ مستقلِ خود را دارند و
> پیش‌شرطِ هیچ‌کدام از گیت‌های ۱ تا ۷ نیستند.**
>
> بقیهٔ `DD-004` معتبر می‌ماند: کارِ فیچری همچنان نیازمندِ تعریفِ محصول است — و آن
> تعریف در `Gate 1` نوشته شد و منتظرِ تأییدِ Command Center و آرش است.

### نقشهٔ ۷ گیتِ مسیرِ رونمایی (Portfolio)

| Gate | نام | Work Packages | Exit Criteria (خلاصه) | Status | Owner |
|---|---|---|---|---|---|
| **Gate 1** | Product Rebaseline | — | `PRODUCT-BLUEPRINT` بازنویسی‌شده · تصمیم‌های قدیمی superseded · مینی‌اپ جدا · PRِ فقط‌مستندات | ✅ **COMPLETE** (`DD-025`، PR #86) | COMMAND_CENTER → ARASH |
| **Gate 2** | Operational Foundation | `G2-001`…`G2-009` | package manager واحد · `B-024` رفع · پرداخت→entitlement طراحی+تست · لید سرتاسر · پاکسازیِ ادعاهای نادرست | 🔵 **ACTIVE** | ENGINEERING · ARASH (D-024) |
| **Gate 3** | Manual Intelligence Workflow | `G3-001`…`G3-007` | مدلِ دادهٔ هوشمندی · میزِ آرش (MVP) · **≥۱۰ روزِ کاریِ واقعیِ اجرای خصوصی** | ⚪ NOT_STARTED | ARASH |
| **Gate 4** | Assisted Intelligence | `Research & Market Monitoring Agent` (تک‌ایجنت) | ۷ معیارِ اجباری (منبع · confidence · Fact/Inference/Scenario · تأییدِ انسانی · ثبتِ اصلاح · عدمِ انتشارِ خودکارِ حساس · ردیابی) | ⚪ NOT_STARTED | ARASH (D-022، D-023) |
| **Gate 5** | Public Intelligence Experience | — | صفحهٔ اولِ هوشمندی‌محور · بدونِ دادهٔ ساختگی · RTL/موبایل · SEO حفظ‌شده | ⚪ NOT_STARTED | ARASH |
| **Gate 6** | Compliance, Security & Reliability | — | ۱۰ معیارِ اجباری (پرداخت/RLS/Language Guard/حریمِ خصوصی/رصدپذیری/خطا و دادهٔ بیات/rollback/تستِ درآمد/تمرینِ migration/branch protection) | ⚪ NOT_STARTED | ENGINEERING · ARASH |
| **Gate 7** | Controlled Public Launch | — | همهٔ گیت‌های قبلی PASS · تأییدِ صریحِ آرش برای cutover | ⚪ NOT_STARTED | ARASH |

> معیارهای کامل: `.planning/2026-07-28-public-intelligence-launch/acceptance_criteria.md`
>
> **گیت‌های `G-003`/`G-005`/`G-006` (مینی‌اپ) باز می‌مانند ولی دیگر مسدودکنندهٔ این نقشه نیستند.**

### ترتیبِ قطعیِ توسعه

```text
بسته‌شده:
Gate 1 — Product Rebaseline  ✅  (DD-025)

اکنون:
Gate 2 — Operational Foundation  ←  G2-001 نقطهٔ شروع است

سپس:
Gate 3 — Arash Desk + Manual Workflow
Gate 4 — First Assisted Agent
Gate 5 — Public Experience
Gate 6 — Hardening
Gate 7 — Controlled Launch
```

> ⚠️ **قاعدهٔ سخت: Arash Desk (`G3-002`) پیش از رفعِ ریسک‌های Gate 2 وارد توسعهٔ اجرایی
> نمی‌شود.** معماری‌اش تأیید شده (`DD-024`) ولی ساختش نه. میزِ فرماندهی روی پایه‌ای که
> پرداختش دسترسی نمی‌دهد (`B-025`)، سرویس‌رولش خطا می‌دهد (`B-024`) و لیدش ثبت نمی‌شود
> (`B-001`)، فقط نمای زیبایی روی دادهٔ غیرقابل‌اعتماد است.
>
> **تفکیک با Gate 6 تا تناقض نشود:** `G2-003` سلامت را **قابلِ مشاهده** می‌کند و
> `G2-009` branch protection را **روشن** می‌کند؛ Gate 6 آستانه، هشدار، رفتارِ
> اثبات‌شدهٔ دادهٔ بیات و **اثباتِ اینکه گیت هنوز اجباری است** را می‌خواهد.

---

## 3. Active Blockers

| Blocker ID | Blocker | Severity | Scope | Owner | Open Since | Blocks | Next Action | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| **B-001** | جدولِ `public.leads` در Supabase **Production** وجود ندارد | 🔴 CRITICAL | Portfolio / DB | ARASH | 2026-07-24 | B-003، G-004، D-001 | تصمیمِ D-001، سپس اجرای Production. **در `G2-006` روی staging اجرا و راستی‌آزمایی شد** (`oqjcvkzyvhqnphopedpn`) و یک نقصِ کمینه‌نبودنِ گرنت هم پیدا و اصلاح شد؛ Production همچنان دست‌نخورده | فهرست‌کردنِ فقط‌خواندنیِ جدول‌های `public` روی `uooeygybrniptzdxuzhj` — بازتأیید در P1-009 (۲۰۲۶-۰۷-۲۵، ۴۱ جدول، `leads` نبود). اجرای staging: `MIGRATION-LEDGER.md` | **OPEN برای Production** · staging VERIFIED |
| **B-002** | ناهم‌گامیِ نامِ سکرتِ لید: کد `PLATFORM_WEBHOOK_SECRET` می‌خواند، `.env.example` نامِ `LEADS_WEBHOOK_SECRET` را دارد | 🔴 CRITICAL | Portfolio | ENGINEERING | 2026-07-25 | B-003، D-001 | **در کد رفع شد** (DD-012: نامِ متعارف `PLATFORM_WEBHOOK_SECRET` + fallbackِ موقت + اصلاحِ `.env.example`). باز می‌ماند تا اپراتور متغیر را در هر دو سرویس ست کند و staging تأیید کند | هر دو سمت `PLATFORM_WEBHOOK_SECRET` می‌خوانند: `lib/leads/webhook.ts` و `telegram-miniapp` `server/routers.ts:196` | **OPEN** · کد VERIFIED / ست‌بودنِ متغیر UNKNOWN |
| **B-003** | جریانِ لید عملیاتی نیست — هر لیدِ miniapp در سطحِ DB شکست می‌خورد | 🔴 CRITICAL | Portfolio ↔ Mini App | ARASH | 2026-07-24 | درآمد/CRM | رفعِ B-001 + B-002 + B-020 با هم و تأییدِ staging؛ تا آن زمان لید از مسیرِ دیگری جمع شود | نتیجهٔ مستقیمِ B-001 + B-002 + B-020؛ ADR-003. **نکتهٔ P1-009:** حتی امروز هم لید در مینی‌اپ (MySQL) و اعلانِ تلگرام ثبت می‌شود؛ آنچه از دست می‌رود، نسخهٔ Supabase است. **`G2-006`:** نیمهٔ مینی‌اپ + احرازِ وبهوک روی staging اثبات شد؛ **هاپِ آخر (نوشتن در `public.leads`) هنوز اثبات نشده** | **OPEN** · VERIFIED |
| **B-024** | **خطای `SUPABASE_SERVICE_ROLE_KEY`** — وبینار، همگام‌سازیِ تلگرام و صفحاتِ ادمین را می‌شکند | 🔴 CRITICAL | Portfolio / Env | **ARASH** | 2026-07-28 | مسیرِ درآمدِ وبینار · `content_hub` · Gate 2 | **اقدامِ اپراتور (بدونِ افشای مقدار):** در Vercel → Settings → Environment Variables بررسی کن که `SUPABASE_SERVICE_ROLE_KEY` برای **هر سه** اسکوپِ Production و Preview و Development تعریف شده باشد. سپس `/admin/health` را روی هر محیط باز کن — ردیفِ «متغیرهای محیطی» فقط حاضر/غایب را نشان می‌دهد و مقدار را هرگز | **مکانیزم VERIFIED:** خطا دقیقاً `throw` در `lib/supabase/admin.ts:11` است، یعنی `process.env.SUPABASE_SERVICE_ROLE_KEY` در زمانِ اجرا falsy است. Vercel Runtime Errors: ۸ رخداد · ۳ کاربر · نخستین `2026-07-11T14:37:39Z` · آخرین `2026-07-29T15:46:24Z` · مسیرها `/api/webinars/list`، `/api/admin/content`، `/api/cron/telegram-sync`، `/admin/analyses`. **اسکوپ همچنان UNKNOWN:** در پنجرهٔ نگهداریِ لاگ (۲۴ ساعت) **همهٔ** خطاها از `dpl_8rpQvybhEHwc3smhUgQPdspedwRD` بودند که استقرارِ **Preview**ِ PR #87 است — ولی لاگِ Production در همان پنجره **کاملاً خالی** است (سقفِ نگهداریِ پلن)، پس نبودِ خطای Production **دلیلِ سلامتِ Production نیست**. هیچ ابزارِ MCPای متغیرهای محیطیِ Vercel را فهرست نمی‌کند | **OPEN** · مکانیزم VERIFIED / اسکوپ UNKNOWN — عمداً VERIFIED اعلام نشد |
| **B-025** | **پرداخت به `entitlement` وصل نیست** — مشتریِ پرداخت‌کرده خودکار دسترسی نمی‌گیرد | 🔴 CRITICAL | Portfolio / Revenue | **ARASH** (نگاشت) + ENGINEERING (پیاده‌سازی) | 2026-07-28 | مسیرِ درآمد · Gate 2 · Gate 6 | تصمیمِ `D-024` (هر محصول چه سطح و چه مدت)، سپس طراحی + تستِ پل. **هیچ اصلاحِ پرداختی در این مأموریت انجام نشد.** | هیچ‌کدام از `app/api/payment/callback/route.ts` و `app/api/webinars/payment/callback/route.ts` به `entitlements` نمی‌نویسند؛ تنها نویسنده `app/api/admin/entitlements/route.ts` (فقط‌ادمین) است. گیتِ `/terminal` در `middleware.ts` و `lib/access.ts` به همین جدول نگاه می‌کند | **OPEN — ⏸ `HOLD_BY_OWNER` (2026-07-30)**: آرش مسیرِ پرداخت/سیاستِ دسترسی را متوقف کرد. کدِ رفع در PR #91 آماده و **دست‌نخورده** منتظر است؛ نه تمام‌شده، نه لغوشده · VERIFIED |
| **B-026** | **پرداختِ وبینار در Production خطا می‌دهد** | 🔴 CRITICAL | Portfolio / Revenue | **ARASH** | 2026-07-28 | مسیرِ درآمد · Gate 2 · D-009 | بازتولیدِ خطا با شواهد، سپس تصمیمِ `D-009` دربارهٔ PR #75. **PR #75 پایهٔ کهنه دارد و مستقیم merge نمی‌شود.** | گزارشِ عملیاتی در `P2-G1-001`. احتمالاً با `B-024` هم‌ریشه است ولی **این ادعا راستی‌آزمایی نشده** | **OPEN** · گزارشِ عملیاتی VERIFIED / علت UNKNOWN |
| ~~**B-027**~~ | ~~**`ProductFacts` عددِ نادرست نمایش می‌دهد**~~ — «۵ دقیقه، چرخهٔ پایش قیمت و هشدار» در حالی که cron روزانه است | 🟠 HIGH | Portfolio / Truthfulness | ENGINEERING | 2026-07-28 | — | — | **متن به واقعیت اصلاح شد، زمان‌بندی دست نخورد** (متراکم‌کردنِ cron ارتقای پلنِ Vercel می‌خواهد و تصمیمِ جداست). دامنه از یک فایل بیشتر بود: `ProductFacts.tsx` به «۱ بار در روز» رفت و **`Capabilities.tsx:46` هم همان ادعای «هر ۵ دقیقه پایش می‌شود» را داشت** که در ممیزیِ اولیه دیده نشده بود. آن ۵ دقیقه اصلاً دورهٔ پایش نبود — `CACHE_MS` در `lib/market.ts:42` است، و مسیرِ `lib/market.ts:59` فقط با رسیدنِ ترافیک اجرا می‌شود. تنها پایشِ **تضمین‌شده** cronِ روزانه است | ✅ **CLOSED 2026-07-29** (`G2-008`) |
| **B-028** | **`/learn` شش درسِ منتشرنشده را عمومی نشان می‌دهد** | 🟡 MEDIUM | Portfolio / Truthfulness | ARASH (محتوا) | 2026-07-28 | Gate 5 | انتشارِ محتوا **تصمیمِ آرش است و باز می‌ماند**. تا آن زمان صداقتِ نمایش تأمین شد | هر شش درس `published: false`. کارت‌ها از قبل برچسبِ «به‌زودی» داشتند و `app/learn/[slug]` بدنه را صریحاً placeholder اعلام می‌کند — این بخش **درست بود**. آنچه کم بود، صداقتِ **سطحِ سکشن** بود: عنوانِ «مسیر یادگیری گام‌به‌گام» بالای شش کارت، وقتی هیچ درسی منتشر نشده، وعده‌ای می‌داد که پشتش چیزی نبود. یک خطِ صریح اضافه شد که تا انتشارِ اولین درس نمایش داده می‌شود | **OPEN (محتوا · ARASH)** · نمایش دیگر گمراه‌کننده نیست (`G2-008`) |
| **B-029** | **کلیدِ service-roleِ Staging با هیچ ابزارِ در دسترسی قابلِ دریافت نیست** | 🟠 HIGH | Ops / Staging | ARASH (اپراتور) | 2026-07-30 | B-003، G2-006 | آرش یک **Supabase Personal Access Token** به‌عنوانِ متغیرِ محیطیِ سشن (`SUPABASE_ACCESS_TOKEN`) بدهد **و** خروجیِ شبکه به `api.supabase.com` و `*.supabase.co` باز شود. آن‌وقت کلید بدونِ نمایش خوانده و مستقیم استفاده می‌شود | چهار مسیر واقعاً امتحان شد و هر چهار بسته بود: `get_publishable_keys` فقط `anon` و `sb_publishable_…` می‌دهد · `SUPABASE_ACCESS_TOKEN` در محیط نیست · `api.supabase.com` از پراکسی **403** می‌گیرد · روی خودِ DB: `jwt_secret_available=false` و `vault_secret_count=0` | **OPEN** · VERIFIED |
| **B-030** | **خروجیِ شبکهٔ محیطِ اجرا میزبان‌های Supabase و Vercel را مسدود می‌کند** — پس نه می‌توان کلید را گرفت، نه از اینجا به Supabase نوشت، نه Preview را پیکربندی کرد | 🟠 HIGH | Ops / Tooling | ARASH (اپراتور) | 2026-07-30 | B-029، G2-006 | باز کردنِ egress برای `*.supabase.co`, `api.supabase.com`, `api.vercel.com` در تنظیماتِ محیط. **دور زدنِ پراکسی ممنوع است** (دستورِ صریحِ `/root/.ccr/README.md`) | آزمونِ واقعی: هر شش میزبانِ `supabase.com`, `api.supabase.com`, `*.supabase.co`, `db.*.supabase.co`, `vercel.com`, `api.vercel.com` کدِ `000` (CONNECT 403) دادند · لاگِ خودِ اپلیکیشن: `Host not in allowlist: …` | **OPEN** · VERIFIED |
| **B-031** | **MCPِ Vercel هیچ ابزارِ متغیرِ محیطی ندارد** — نه خواندن، نه نوشتن. پس تنظیمِ `SUPABASE_SERVICE_ROLE_KEY` روی Preview از اینجا ممکن نیست حتی اگر کلید را داشتیم | 🟡 MEDIUM | Ops / Tooling | ARASH (اپراتور) | 2026-07-30 | B-029، B-030 | یا آرش متغیرها را یک‌بار در پنلِ Vercel روی اسکوپِ **Preview** ست کند، یا ابزارِ env به MCP اضافه شود | فهرستِ کاملِ ابزارهای Vercelِ این سشن: `list_teams`, `list_projects`, `get_project`, `get_/update_project_deployment_protection`, `list_deployments`, `get_deployment*`, `get_runtime_logs/errors`, `deploy_to_vercel`, خرید/آنالیتیکس — **هیچ ابزارِ env**. `list_teams` و `list_projects` واقعاً کار کردند، پس این محدودیتِ ابزار است نه دسترسی | **OPEN** · VERIFIED |
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
| ~~**B-013**~~ | ~~`npm ci` می‌شکند چون `package-lock.json` ناهم‌گام است~~ | 🟠 HIGH | Portfolio / Build | ENGINEERING | 2026-07-25 | — | — | علتِ ریشه‌ای: `xlsx@0.18.5` و ۸ وابستگیِ فرعی‌اش (`adler-32`, `cfb`, `codepage`, `crc-32`, `ssf`, `wmf`, `word`, `frac`) در lock نبودند. لاک‌فایل بازتولید شد؛ `npm ci` حالا **exit 0** | ✅ **CLOSED 2026-07-25** (P1-010) |
| ~~**B-014**~~ | ~~`npm run lint` غیرتعاملی اجرا نمی‌شود~~ | 🟡 MEDIUM | Portfolio / CI | ENGINEERING | 2026-07-25 | — | — | علتِ ریشه‌ای: مخزن **هیچ پیکربندی و هیچ وابستگیِ ESLint نداشت**، پس `next lint` نصبش را تعاملی می‌پرسید. `eslint.config.mjs` (flat config) + `eslint`/`eslint-config-next` اضافه شد؛ `npm run lint` → **۰ خطا، ۰ هشدار** | ✅ **CLOSED 2026-07-25** (P1-010) |
| **B-015** | CI وجود دارد ولی **اجباری نیست** — یک PRِ قرمز هنوز می‌تواند merge شود | 🟠 HIGH | Portfolio / CI | **ARASH** | 2026-07-25 | کیفیتِ هر merge | **اقدامِ اپراتور — فقط از کنسولِ گیت‌هاب:** Settings → Branches → Add rule روی `main` → Require status checks → **فقط `CI Gate`** را انتخاب کن. `Vercel` و `Supabase Preview` را الزامی **نکن** (اولی اینتگریشنِ بیرونی است، دومی `skipped` می‌ماند و PR را برای همیشه بلاک می‌کند). مسیرِ اضطراریِ maintainer را غیرفعال نکن. مراحلِ کامل: `RUNBOOK-branch-protection.md` | **بازتأییدِ 2026-07-29:** `list_branches` می‌گوید `main` → `protected: false`. سرورِ GitHub MCP **هیچ ابزارِ branch protection ندارد**، `gh` CLI در دسترس نیست و APIِ مستقیم در این سشن مسدود است — پس ایجنت نمی‌تواند این را روشن کند | **OPEN** · VERIFIED — نیازمندِ اقدامِ انسانی |
| ~~**B-016**~~ | ~~کامنتِ هشدارِ قیمت «هر ۵ دقیقه» می‌گوید، ولی `vercel.json` روزانه اجرا می‌کند~~ | 🟡 MEDIUM | Portfolio | ENGINEERING | 2026-07-25 | — | — | کامنتِ `app/api/cron/alerts/route.ts` به «روزانه» با ارجاع به `vercel.json` (`0 6 * * *`) اصلاح شد. هم‌ریشه با `B-027` بود و با هم بسته شدند | ✅ **CLOSED 2026-07-29** (`G2-008`) |
| ~~**B-017**~~ | ~~`docs/archive/content-hub.md` ارجاعاتِ کهنهٔ scheduler دارد~~ | 🟢 LOW | Portfolio / Docs | ENGINEERING | 2026-07-25 | — | — | بنرِ صریحِ «آرشیو — راهنمای فعال نیست» بالای سند اضافه شد و **هر دو ادعای نادرست را نام برد**: «هر ۶ ساعت» در برابرِ واقعیتِ `0 3 * * *`، و workflowهای حذف‌شدهٔ GitHub Actions. متنِ تاریخی عمداً دست‌نخورده ماند (قاعدهٔ ۵ `docs/README`) | ✅ **CLOSED 2026-07-30** (`G2-007`) |
| **B-018** | مالکِ نامشخص در سه ردیفِ `SERVICE-OWNERSHIP.md` | 🟠 HIGH | همه | ARASH | 2026-07-24 | پاسخ‌گوییِ عملیاتی | تعیینِ مالک برای: Mini App هدف (Docker/Coolify/VPS) · Domain/DNS · مالکِ اجراییِ Coolify | `SERVICE-OWNERSHIP.md` — سه ردیفِ `OWNER_UNASSIGNED` | **OPEN** · VERIFIED |
| ~~**B-021**~~ | ~~`build` به **Google Fonts** وابسته است~~ | 🟠 HIGH | Portfolio / Build | ENGINEERING | 2026-07-25 | — | — | فایلِ variableِ Vazirmatn (v33.0.3، SIL OFL) در `public/fonts/` سلف‌هاست شد و `app/layout.tsx` از `next/font/google` به `next/font/local` رفت. **اثباتِ رفتاری:** همان `npm run build` با محیطِ کاملاً تمیز و بدونِ پراکسی که قبلاً `Failed to fetch Vazirmatn from Google Fonts` می‌داد، حالا **exit 0** است. یک فایلِ ۱۱۱KB به‌جای شش وزن، و **هیچ وابستگیِ npmی اضافه نشد** (مهم برای B-023) | ✅ **CLOSED 2026-07-27** (B0) |
| **B-022** | ۴ آسیب‌پذیریِ **high** در وابستگی‌ها بدونِ رفعِ در دسترس | 🟠 HIGH | Portfolio / Supply chain | ARASH | 2026-07-25 | امنیتِ زنجیرهٔ تأمین | **`ADR/004-xlsx-supply-chain.md` نوشته شد** — چهار گزینه با هزینه‌ها. تصمیمِ `D-011` لازم است. اجرای هر گزینه‌ای **پیش از بسته‌شدنِ B-023** عمداً انجام نمی‌شود چون درختِ وابستگی را تغییر می‌دهد | `npm audit`: `xlsx@*` (Prototype Pollution + ReDoS، رفع فقط روی CDNِ SheetJS نه npm)، `sharp<0.35.0`/`postcss` (نیازمندِ `next@15.5.21`). critical = **۰**. دامنه: تنها مصرف‌کننده `app/api/admin/fx/seeds` است که **فقط‌ادمین** است | **OPEN** · VERIFIED |
| ~~**B-023**~~ | ~~**دو مسیرِ package manager در یک مخزن**~~ — `package-lock.json` و `pnpm-lock.yaml` هر دو tracked. Vercel به‌خاطرِ وجودِ `pnpm-lock.yaml` از **pnpm** استفاده می‌کند؛ هر PRی که `package.json` را عوض کند بدونِ بازتولیدِ `pnpm-lock.yaml` استقرار را با `ERR_PNPM_OUTDATED_LOCKFILE` می‌شکند | 🔴 CRITICAL | Portfolio / Deploy | ENGINEERING | 2026-07-26 | هر PRی که `package.json` را تغییر دهد | **مأموریتِ مستقل** برای انتخابِ **npm** به‌عنوانِ package managerِ رسمی و **حذفِ کنترل‌شدهٔ `pnpm-lock.yaml`** (+ افزودنِ `packageManager` به `package.json`). تا آن زمان دورزدنِ فعلی سرِ جایش می‌ماند: ابزارِ لینت در CI نصبِ موقت می‌شود و به `devDependencies` اضافه نمی‌شود — `D-018` | **علتِ ریشه‌ای تأیید شد.** استقرارِ `dpl_Dh2jw5ZXfGcTk5UroUzrZHKhqBAo` با `ERR_PNPM_OUTDATED_LOCKFILE` شکست. **bisect حالا مکانیزم دارد، نه فقط همبستگی:** هر اجرای سبز `pnpm-lock.yaml`ِ هم‌گام داشت و هر اجرای قرمز ناهم‌گام — `diag/vercel-lockonly` (۹ devDep، lock هم‌گام، ۲۳۲ بسته) → ✅ · `diag/vercel-deps` (۱۲ devDep با ESLint، **`pnpm-lock` بدونِ ESLint**، ۵۰۷ بسته) → ❌ · PR #80ِ کامل → ❌ دو بار. **پس عاملْ اندازهٔ درختِ وابستگی نبود.** به همین دلیل GitHub Actions در هر چهار حالت سبز ماند: CI با `npm ci` روی `package-lock.json` اجرا می‌شود که **بازتولید شده بود**. **رفع (2026-07-29):** `pnpm-lock.yaml` حذفِ ردیابی شد، `packageManager: npm@10.9.7` و `engines.node >=20` به `package.json` اضافه شد، و `pnpm-lock.yaml`/`yarn.lock` به `.gitignore` رفتند تا برنگردند. پیامدِ جانبی: دورزدنِ `lint:setup` هم برداشته شد و ESLint حالا `devDependency`ِ عادی است — چون فرضِ «اندازهٔ درختِ وابستگی» از اول غلط بود | ✅ **CLOSED 2026-07-29** (`D-018` اجرا شد) |
| **B-019** | فراخوانندهٔ لید در Mini App fire-and-forget است: `fetch` بدونِ `await`، فقط `.catch(console.error)` — بدونِ صف، تلاشِ مجدد یا نشانهٔ ماندگار | 🔴 CRITICAL | Mini App | OWNER_UNASSIGNED | 2026-07-25 | B-003، G-003 | افزودنِ ثبتِ ماندگارِ شکست (یا صفِ تلاشِ مجدد) در `telegram-miniapp`؛ خارج از دامنهٔ این مخزن | `telegram-miniapp@b88f935` `server/routers.ts:192-208` (خوانده‌شده فقط‌خواندنی) | **OPEN — رفعِ کد در PRِ بازبینی‌نشده** · VERIFIED · `telegram-miniapp` PR #3: `await` + `AbortSignal.timeout(5000)` + بررسیِ status + لاگِ ساختاریافته. **outbox عمداً اضافه نشد** — مسیرِ استقرار/migration پشتیبانی‌اش نمی‌کند. merge نشده |
| **B-020** | `.env.example`ِ مینی‌اپ نه `PLATFORM_WEBHOOK_SECRET` را مستند می‌کند نه `PLATFORM_WEBHOOK_URL`؛ کد `\|\| ""` می‌گذارد → هدرِ خالی → **همیشه ۴۰۱** | 🔴 CRITICAL | Mini App | OWNER_UNASSIGNED | 2026-07-25 | B-003، B-002 | افزودنِ هر دو متغیر به `.env.example`ِ مینی‌اپ و ست‌کردنشان در Coolify/Manus | `telegram-miniapp@b88f935` `.env.example` (هیچ‌کدام نیست) در برابر `server/routers.ts:193,196` | **OPEN — رفعِ کد در PRِ بازبینی‌نشده** · VERIFIED · `telegram-miniapp` PR #3: هر دو متغیر در `.env.example` مستند شدند و fallbackِ `\|\| ""` برداشته شد (سکرتِ غایب حالا صریح شکست می‌دهد به‌جای ۴۰۱ خاموش). **تنظیمِ مقدار در محیطِ اجرا هنوز اقدامِ اپراتور است** |

**قانون:** هیچ مالکی جعل نمی‌شود. جایی که مالکِ واقعی معلوم نیست، `OWNER_UNASSIGNED` می‌ماند
تا آرش تعیین کند.

---

## 4. Open Decisions

> خلاصه است. متنِ کامل، گزینه‌ها و شواهد در `DECISION-LOG.md`.

| Decision ID | Decision | Decision Owner | Open Since | Blocks | Options | Next Decision Point | Status |
|---|---|---|---|---|---|---|---|
| **D-001** | منبعِ نهاییِ حقیقتِ Lead چیست و `public.leads` کِی ساخته/فعال می‌شود؟ | ARASH | 2026-07-24 | B-001، B-003، G-004 | اجرای `phase8b_leads.sql` / حذفِ کدِ وبهوک / نگه‌داشتنِ لید فقط در مینی‌اپ | پیش از هر کارِ CRM. **`G2-006` شواهدِ فنی را فراهم کرد** (migration روی staging سالم اجرا می‌شود، مسیر تا احرازِ هویت کار می‌کند)، ولی تصمیمِ تجاری همچنان مالِ آرش است | **OPEN** |
| **D-002** | کدام migrationهای مینی‌اپ در staging و با چه ترتیبی اجرا شوند؟ | ENGINEERING | 2026-07-24 | B-004، G-003 | اجرای هر سه به‌ترتیب `drizzle-kit migrate` / اجرای دستیِ گزینشی | هنگام بالا آمدنِ staging | **OPEN** |
| **D-003** | cutover از Manus به Coolify از چه زمانی مجاز است؟ | ARASH | 2026-07-24 | G-006 | پس از تستِ دود / پس از اجرای موازی / موکول به بعد | پس از PASS شدنِ G-003 و G-005 | **OPEN** |
| **D-004** | مالکِ هر سرویس و پاسخ‌گوییِ عملیاتی کیست؟ | ARASH | 2026-07-24 | B-018 | آرش تنها مالک / تفویض به مجریِ مشخص | TBD | **OPEN** |
| **D-005** | Vercel Cron چگونه مستقلاً راستی‌آزمایی و مانیتور شود؟ | ENGINEERING | 2026-07-24 | B-009 | بررسیِ لاگِ Vercel / heartbeat در DB / مانیتورِ بیرونی | همراه با رفعِ B-016 | **OPEN** |
| **D-006** | `CRON_SECRET` باید کجا باشد و چه کسی تأیید می‌کند؟ | ARASH | 2026-07-24 | B-010، B-009 | فقط Vercel / همچنین GitHub (رد شد در ADR-002) | همراه با D-005 | **OPEN** |
| **D-007** | تعریفِ نهاییِ محصولِ Portfolio و Mini App پس از تثبیت چیست؟ | ARASH | 2026-07-24 | G-007 و هر کارِ فیچری | TBD | **پس از** پایانِ P1/P2 | **DEFERRED** |
| **D-008** | تکلیفِ PR #74 چیست؟ | ARASH | 2026-07-23 | شاخهٔ `develop` | merge به develop / نگه‌داشتن تا اعتبارِ PSY / بستن | پس از رفعِ بلاکرِ CPI ماهانه | **OPEN** |
| **D-009** | تکلیفِ PR #75 و پیش‌نویسِ schemaِ پرداخت چیست؟ | ARASH | 2026-07-23 | امنیتِ پرداختِ وبینار | merge / بازبینیِ بیشتر / merge همراه با سخت‌سازیِ CSP | زودتر از بقیه (اصلاحِ امنیتی است) | **OPEN** |
| **D-010** | Portfolio و Mini App بلندمدت دیتابیسِ مشترک، یکپارچگیِ محدود، یا bounded contextهای جدا؟ | ARASH | 2026-07-24 | معماریِ بلندمدت، D-001 | مشترک / یکپارچگیِ محدود از راهِ وبهوک (وضعِ فعلی) / کاملاً جدا | همراه با D-007 | **OPEN** |
| **D-021** | مرزِ رایگان/پرمیومِ نسخهٔ اول کجاست؟ | **ARASH** | 2026-07-28 | Gate 5، Gate 7 | بریفِ رایگان+عمقِ پرمیوم / همه رایگان تا رونمایی / ترکیب | پیش از `Gate 5` | **OPEN** — جانشینِ `D-015` |
| **D-022** | منابعِ خبریِ مجاز، و مجاز بودنِ خلاصهٔ خودکار زیرِ نامِ آرش | **ARASH** | 2026-07-28 | Gate 3، Gate 4 | فهرستِ محدودِ رسمی / فقط منابعِ داخلی / ترکیب | پیش از `Gate 3` | **OPEN** |
| **D-023** | تأمین‌کنندهٔ LLM و مسیرِ دسترسی زیرِ تحریم/شبکه | **ARASH** | 2026-07-28 | Gate 4 | از Vercel / از رله / واسط / بدونِ LLM | پیش از `Gate 4` | **OPEN** |
| **D-024** | هر محصولِ پولی چه سطح و چه مدت دسترسی می‌دهد؟ | **ARASH** | 2026-07-28 | Gate 2، مسیرِ درآمد | نگاشتِ صریح / نگاشتِ دیگر | **فوری** — پیش‌نیازِ رفعِ `B-025` | **OPEN** |
| ~~**D-012**~~ · ~~**D-013**~~ · ~~**D-014**~~ · ~~**D-015**~~ · ~~**D-016**~~ | تصمیم‌های محصولیِ نسخهٔ قبلیِ بلوپرینت | ARASH | 2026-07-20 | — | — | — | **SUPERSEDED** در `P2-G1-001` → `D-019`، `D-020`، `DD-019`، `D-021`، `DD-020` (نگاشت: `SD-003`…`SD-007`) |

> **نکتهٔ مهمِ فنی برای D-010:** مینی‌اپ روی **MySQL** با Drizzle کار می‌کند
> (`DATABASE_URL=mysql://…`)، درحالی‌که Portfolio روی **Postgres/Supabase** است. یعنی
> «دیتابیسِ مشترک» امروز عملاً روی میز نیست مگر با مهاجرتِ موتورِ دیتابیس. — VERIFIED

---

## 5. Pull Request Status

> وضعیت از GitHub در **2026-07-28** خوانده شد. حدس زده نشده.
>
> **#84 و #85 merge شدند** (`1acc18e` و `def602f`). **#74 و #75 در این مأموریت لمس نشدند.**

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
| Supabase / `leads` | جدول موجود باشد (کد به آن می‌نویسد) | **جدول وجود ندارد** | 🔴 بله | فهرستِ فقط‌خواندنیِ جدول‌ها — بازتأیید 2026-07-25 (P1-009) | تصمیمِ D-001، سپس اجرای `sql/phase8b_leads.sql` روی staging طبقِ runbook | ARASH | **NOT_APPLIED / READY_FOR_STAGING** |
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
| Portfolio | محلی (`.env`) | همان‌ها از `.env.example` | نام‌ها VERIFIED | drift در P1-009 رفع شد: `.env.example` حالا `PLATFORM_WEBHOOK_SECRET` را به‌عنوانِ نامِ متعارف دارد و نامِ قدیمی «منسوخ» برچسب خورده | B-002 (ست‌بودن در Vercel همچنان UNKNOWN) | **ALIGNED** |
| Supabase | پروژهٔ `uooeygybrniptzdxuzhj` | — (پیکربندی سمتِ پلتفرم) | ref و جدول‌ها VERIFIED | — | — | **OK** |
| Relay | Liara | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRSAPI_KEY`, `RELAY_TOKEN` (+ گروه‌های `CODAL_*`, `CANDLE_*`) | نام‌ها VERIFIED از کدِ رله | ست‌بودنِ مقادیر UNKNOWN | — | **UNKNOWN** |
| Mini App | Manus (Legacy، فعلی) | — | UNKNOWN | کلِ پیکربندیِ Manus راستی‌آزمایی نشد | G-006 | **UNKNOWN** |
| Mini App / Coolify | Coolify (هدف) — **REQUIRED** | `NODE_ENV`, `PORT`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `MINI_APP_URL` | هیچ‌کدام — محیط هنوز نیست | همه | B-005، B-006، G-005 | **NOT_READY** |
| Mini App / Coolify | Coolify — **RECOMMENDED** | `ADMIN_SECRET`, `JWT_SECRET`, `TELEGRAM_WEBHOOK_SECRET` | هیچ‌کدام | همه | B-007، B-008 | **NOT_READY** |
| Mini App / Coolify | Coolify — **OPTIONAL / build-time** | `VITE_APP_URL`, `DOMAIN`, `VITE_*` (گروهِ Forge/Analytics) | — | اختیاری | — | **OPTIONAL** |

---

## 8. Immediate Next Actions

> ترتیب از **`PRODUCT-BLUEPRINT` §۲۰** می‌آید. این جدول قبلاً دو بلوکِ تکراری داشت؛
> در `P2-G1-001` با یک فهرستِ واحدِ گیت‌محور جایگزین شد.

| # | Action | Owner | Dependency | Expected Output | Gate |
|---|---|---|---|---|---|
| **۱** | تأییدِ `PRODUCT-BLUEPRINT` بازنویسی‌شده | COMMAND_CENTER → **ARASH** | — | تأییدِ صریح یا CHANGES_REQUIRED | Gate 1 |
| **۲** | یکسان‌سازیِ package manager (`D-018` — npm، حذفِ `pnpm-lock.yaml`) | ENGINEERING | اقدام ۱ | یک PRِ مستقل + استقرارِ سبزِ Vercel روی PRی که وابستگی اضافه می‌کند | Gate 2 |
| **۳** | ترمیمِ `SUPABASE_SERVICE_ROLE_KEY` در Production (`B-024`) | **ARASH** | — | وبینار و همگام‌سازیِ تلگرام دوباره کار کنند (با شواهد) | Gate 2 |
| **۴** | تصمیمِ `D-024` — هر محصولِ پولی چه سطح و چه مدت دسترسی می‌دهد | **ARASH** | — | جدولِ مکتوبِ «محصول → سطح → مدت» | Gate 2 |
| **۵** | طراحی و تستِ پلِ پرداخت → `entitlement` (`B-025`) | ENGINEERING | اقدام ۳، ۴ | PR با تستِ رگرسیون؛ **بدونِ پرداختِ واقعی** | Gate 2 |
| **۶** | تصمیمِ `D-009` دربارهٔ PR #75 و رفعِ `B-026` | **ARASH** | اقدام ۳ | مسیرِ پرداختِ وبینار سالم | Gate 2 |
| **۷** | تصمیمِ `D-001` و اجرای `sql/phase8b_leads.sql` روی **staging** | **ARASH** | — | جدولِ `leads` + تستِ لیدِ مصنوعیِ سرتاسر | Gate 2 |
| **۸** | ست‌کردنِ `PLATFORM_WEBHOOK_SECRET` یکسان در هر دو سرویس (`B-002`) | **ARASH** | اقدام ۷ | وبهوک به‌جای ۴۰۱، ۲۰۰ بدهد | Gate 2 |
| **۹** | پاکسازیِ ادعاهای نادرست (`B-027` عددِ ۵ دقیقه · `B-028` دروسِ منتشرنشده) | ENGINEERING · ARASH | — | هیچ عددِ اثبات‌ناپذیری در مسیرِ عمومی | Gate 2 |
| **۱۰** | روشن‌کردنِ branch protection طبقِ `RUNBOOK-branch-protection.md` (`B-015`) | **ARASH** | — | چکِ لازمِ `CI Gate` روی `main` | Gate 6 |
| **۱۱** | تعیینِ مالک برای سه ردیفِ `OWNER_UNASSIGNED` (`B-018`) | **ARASH** | — | `SERVICE-OWNERSHIP.md` بدونِ خانهٔ خالی | Gate 6 |
| **۱۲** | تصمیم‌های `D-022` (منابعِ خبری) و `D-023` (مسیرِ LLM) | **ARASH** | اقدام ۱ | بدونِ این‌ها `Gate 4` شروع نمی‌شود | Gate 4 |
| **۱۳** | راستی‌آزماییِ Vercel Cron و `CRON_SECRET` (`B-009`، `B-010`) | **ARASH** | — | شواهدِ ثبت‌شده در همین سند | Gate 6 |

**مسیرِ مستقلِ Mini App** (دیگر مسدودکنندهٔ بالا نیست): تعیینِ مالک → تهیهٔ VPS و
Coolify (`B-005`) → اجرای migrationها در staging (`B-004`، `D-002`) → cutover (`D-003`).

---

## 9. Recently Closed

| Item | Result | Evidence | Closed Date |
|---|---|---|---|
| **مارکرِ merge conflictِ کامیت‌شده در `.gitignore`** | **FIXED** | خطوط ۳۱–۴۶ شاملِ `<<<<<<< HEAD` / `=======` / `>>>>>>> 4d2c68b` بود. دو طرف ادغام شد (الگوهای پایتون + `.env.deploy`) | 2026-07-29 |
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
