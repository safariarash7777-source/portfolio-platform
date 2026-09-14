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

## 0. مالکیتِ اجرایی — چه کسی روی چه چیزی کار می‌کند

> بدونِ این بخش، دو جلسه در یک روز **همان** کار را کردند و یکی دور ریخته شد
> (`§۵`، درسِ ۱۴۰۵/۰۶/۲۱). نبودِ مرز هزینه‌اش چند ساعت کارِ مهندسی بود.

| محدوده | مالک | از | خروجیِ بعدی |
|---|---|---|---|
| backend · `relay/` · `sql/` · migration · انتشار | **جلسهٔ `session_016QEPURvKvuAk1TEhNfdiQJ`** (PR #121) | ۱۴۰۵/۰۶/۲۲ · ۰۷:۰۰ UTC | بسته‌های A، B، F در §۸ — منتظرِ مجوز/استقرار |
| UI و تجربهٔ بازار | **Codex** (PR #124) | — | رفعِ تعارضِ تک‌خطیِ `AccountBridge.tsx` |
| پرداخت → دسترسی | PR #113 — **کدش تمام است**؛ مالکِ ادغام همین جلسه | — | مسدود پشتِ بستهٔ E |

**قاعده:** جلسه‌های دیگرِ Claude روی این محدوده تغییرِ تازه ندهند؛ فقط
checkpoint و لینکِ branch/PR بدهند. پیش از هر ویرایشِ مشترک، push یا merge،
وضعیتِ `main` و PRها دوباره خوانده شود — خواندنِ ابتدای جلسه کافی نیست، چون
#127 **بعد از** آن merge شد.

---

## 0′. مرزِ تحویل — چهار بستهٔ مستقل روی یک برنچ

> بازبینیِ مستقل خواست بکاپ و مهارِ پرداخت جدا و قابلِ‌بررسی باشند و
> `liveness` مانعشان نشود. **هیچ وابستگیِ کدی بینِ این چهار بسته نیست**
> (`grep` روی import‌ها: صفر ارجاع)، پس هرکدام مستقل قابلِ cherry-pick،
> بازبینی و اجراست.

| بسته | فایل‌ها | کامیت | مسدودکنندهٔ بقیه؟ |
|---|---|---|---|
| **B — مهارِ پرداخت** | `sql/phase30_*.sql` · `app/api/payment/request/route.ts` · `lib/supabase/errors*.ts` · `lib/security/create-payment-containment.integration.test.ts` · `docs/ops/RELEASE-payment-containment.md` | `d2f0e83` | نه |
| **D′ — اعتبارسنجیِ بکاپ** | `scripts/backup/compare.mjs` · `scripts/backup-production.{sh,ps1}` · `lib/ops/backup-scripts.test.ts` · `docs/RUNBOOK-backup-windows.md` | `bb6ddb7`، `2420fe3` | نه |
| **A — توقفِ نوشتنِ تاریخچه** | `relay/server.mjs` · `relay/history-sections.test.mjs` · `docs/ops/RELEASE-history-sections.md` | `798928f` | نه |
| **F — زندگیِ نماد** | `lib/core/symbolLiveness*.ts` · `lib/core/livenessData.ts` · `sql/phase29_*.sql` | `304194e`، `184d614` | **نه** — نه چیزی از آن import می‌کند و نه چیزی را import می‌کند |

`package.json` و `.github/workflows/ci.yml` تنها فایل‌های مشترک‌اند (ثبتِ تست و
کفِ شمارش). اگر بسته‌ها به PRهای جدا تقسیم شوند، همان دو خط تنها جایی است که
باید هماهنگ شود.

---

## 1. Current Program State

| مورد | مقدار | برچسب |
|---|---|---|
| **Current Phase** | **P2 — بازتعریفِ محصول و مسیرِ رونماییِ عمومی** | VERIFIED |
| **Current Gate** | **Gate 2 · Operational Foundation** (`G2-001`…`G2-009`) — **فعال**. **Gate 1 بسته شد**: `PRODUCT-BLUEPRINT` با تأییدِ نهاییِ آرش تصویب شد (`DD-025`)، معماریِ **Arash Intelligence Desk** پیش‌تر تأیید شده بود (`DD-024`) | VERIFIED |
| **Last Verified Date** | **2026-09-12** — پنج merge به `main` در همین روز (#123، #120، #122، #125، #126). اندازه‌گیریِ این جلسه: SHAِ `main`، وضعیتِ ۱۰ PRِ باز، توابع و گرنت‌های Production، و کلِ زنجیرهٔ آزمون شاملِ `test:db` روی Postgresِ محلی | VERIFIED (`git rev-parse` + `list_pull_requests` + پرس‌وجوی فقط‌خواندنیِ Production) |
| **Portfolio main SHA** | `2344179d6463dbc7958484e2e6ec409de1b79a01` — **verified 2026-09-12**. منبعِ حقیقت `git rev-parse origin/main` است، نه این خانه. مسیرِ امروز: `1d0759f` → `4a82b60` (#123، وصلهٔ امنیتیِ Next) → `3bf120d` (#120، حبابِ صندوق و رادار و ورودِ اعضا) → `ae0d451` (#122، کلاینتِ مرکزیِ BrsApi + بودجهٔ ماندگار) → `549f9af` (#125، میزِ بازار روی مسیرِ واقعی) → `2344179` (#126، پرچمی که بودجه را کور نکند) | VERIFIED |
| **Mini App main SHA** | `8cd1e023167a0102d173eb7a751fe188ed428928` — **verified 2026-07-30**. ⚠️ این خانه تا `P2-G2-010` روی `b88f935` مانده بود در حالی که PR #3ِ مینی‌اپ merge شده بود | VERIFIED (`git rev-parse origin/main` روی `telegram-miniapp`) |
| **Active Supabase Ref** | `uooeygybrniptzdxuzhj` | VERIFIED (فهرست‌کردنِ فقط‌خواندنیِ جدول‌ها) |
| **Staging Supabase Ref** | `oqjcvkzyvhqnphopedpn` — ⚠️ **امروز `INACTIVE` است** (متوقف‌شده؛ شاهد: `list_projects`، ۲۰۲۶-۰۹-۰۶). تا فعال‌نشدنش هیچ تمرینِ migrationی ممکن نیست. پروژهٔ **ایزولهٔ رایگان**، ساخته‌شده در `G2-006` (۱۴۰۵/۰۵/۰۸). فقط دادهٔ مصنوعی؛ هیچ دادهٔ Production واردش نشد. جدولِ `leads` **فقط اینجا** اجرا شده | VERIFIED (ساخت + اجرای migration + پرس‌وجوهای راستی‌آزمایی) |
| **Deprecated Supabase Ref** | `lqfcyihuthdoqybwptxh` — **استفاده نشود**. ⚠️ این ref **Production نیست** (`SD-002`) — اگر جایی به‌عنوانِ Production معرفی شد، غلط است | VERIFIED (فقط یک ارجاعِ برچسب‌خوردهٔ تاریخی در اسناد) |
| **Portfolio hosting** | Vercel | INFERRED (`vercel.json` + چکِ Vercel روی PRها؛ دسترسیِ مستقیم به حساب نداشتیم) |
| **Current Mini App hosting** | **Manus (Legacy)** — `arash-teleapp-7shs2egu.manus.space` | INFERRED (در این سشن دوباره راستی‌آزمایی نشد؛ خلافش هم مدرکی ندارد) |
| **Mini App target hosting** | **Docker + Coolify روی VPS** | VERIFIED (کدِ هدف در `main` مینی‌اپ merge شده: `Dockerfile`, `docker-entrypoint.sh`, `DEPLOYMENT.md`) |
| **Mini App deployment state** | نسخهٔ جدید **مستقر نشده و cutover نشده** | VERIFIED (هیچ مدرکی بر استقرار نیست؛ ADR-001) |
| **Overall Health** | 🟠 **PARTIALLY IMPAIRED** — نسبت به ۲۰۲۶-۰۸-۰۴ بهتر شده ولی مسیرِ درآمد هنوز بسته است. **رفع‌شده:** آسیب‌پذیریِ criticalِ Next (#123) و قفلِ CI که همهٔ PRها را قرمز نگه داشته بود. **تازه در `main` ولی مستقر نشده:** حبابِ صندوق و مقایسهٔ هم‌نوع (#120)، کلاینتِ مرکزیِ BrsApi با بودجهٔ ماندگار (#122، پرچم خاموش). **هنوز باز:** پرداخت به `entitlement` وصل نیست (#113 هنوز merge نشده و به `phase24` روی Production وابسته است)، و `SUPABASE_SERVICE_ROLE_KEY` در Production در این سشن **راستی‌آزمایی نشد** | VERIFIED برای بخشِ merge · UNKNOWN برای وضعیتِ Production |
| **Highest Active Risk** | **B-024** — خطای `SUPABASE_SERVICE_ROLE_KEY` در Production؛ سپس **B-025** (پرداخت دسترسی نمی‌دهد) و **B-003** (لید عملیاتی نیست) | VERIFIED |

---

> ### ⚠️ آنچه در ۲۰۲۶-۰۹-۱۲ از این محیط **دیدنی نبود** — و نباید سبز فرض شود
>
> این سه مورد نه «سالم»‌اند و نه «خراب»؛ **UNKNOWN** هستند، و تفاوتش مهم است:
>
> | مورد | چه اتفاقی افتاد | برچسب |
> |---|---|---|
> | استقرارِ Vercel | `portfolio-platform-fawn.vercel.app` از این کانتینر با `connect_rejected` (۴۰۳ روی CONNECT) بسته است — **سیاستِ خروجیِ محیط، نه قطعیِ سایت**. پس merge شدنِ `main` ≠ رسیدن به Production | UNKNOWN |
> | رلهٔ Liara | `arsadata.liara.run`، `api.iran.liara.ir` و `console.liara.ir` هر سه `000` برمی‌گردانند و **هیچ توکنِ `LIARA*` در محیط نیست**. تعدادِ replica همچنان از **استنتاجِ الگوی نوشتنِ دیتابیس** است، نه از کنسول | UNKNOWN |
> | سلامتِ `SUPABASE_SERVICE_ROLE_KEY` در Production | در این سشن اصلاً آزموده نشد | UNKNOWN |

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
| مسیرِ لید — نیمهٔ مینی‌اپ | ✅ | ✅ | ✅ MySQL + اعلانِ تلگرام | ✅ روی staging |
| مسیرِ لید — احرازِ وبهوک | ✅ | ✅ | ✅ روی staging (نه ۴۰۱) | ✅ روی staging |
| مسیرِ لید — نوشتن در `public.leads` | ✅ | ✅ | ❌ جدول در Production نیست (`B-001`) | ❌ عبورِ واقعی اثبات نشده (`B-030`) |
| امنیتِ جدولِ لید (RLS + گرنت) | ✅ | — | ✅ | ✅ **در CI روی Postgresِ واقعی** (`G2-006`) |
| CI (‏۵ job) | ✅ | ✅ | ⚠️ اجباری نیست (`B-015`) | ✅ |
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

### ۲′. وضعیتِ واقعیِ نه بستهٔ Gate 2 (بازبینیِ `P2-G2-010`، ۲۰۲۶-۰۷-۳۰)

> این جدول **تنها** جای معتبرِ وضعیتِ بسته‌هاست. اگر جایی از این سند یا اسنادِ
> planning چیزِ دیگری گفت، همین جدول معتبر است.

| بسته | وضعیت | چه چیزی واقعاً اثبات شده | چه چیزی نشده |
|---|---|---|---|
| `G2-001` package manager | ✅ **DONE** | npm رسمی است (`packageManager: npm@10.9.7`)، `engines.node >= 20`، **تنها لاک‌فایلِ tracked** `package-lock.json` است، و گاردِ CI برگشتِ لاکِ pnpm/yarn را می‌شکند. `B-023` بسته شد | — |
| `G2-002` service role | ⚠️ **DIAGNOSED, NOT FIXED** | مکانیزمِ خطا شناخته شد | اسکوپِ واقعیِ متغیر در Production راستی‌آزمایی نشده — **اقدامِ اپراتور** (`B-024`) |
| `G2-003` نمای سلامت | ✅ **BUILT & DEPLOYED** | `/admin/health` + `/api/admin/health`، گیتِ دوگانهٔ ادمین، env فقط `present: boolean`، هشدارِ اسکوپِ محیط | «آخرین اجرای موفقِ واقعی» هنوز مشاهدهٔ تاریخ‌دار ندارد → `OPERATIONAL` بله، `PROVEN` نه |
| `G2-004` بازبینیِ PR #75 | ⏸ **در دامنهٔ توقفِ پرداخت** | — | `D-009` باز |
| `G2-005` پرداخت→دسترسی | ⏸ **`HOLD_BY_OWNER`** | طراحی و تست در PR #91 | `D-024` باز · PR #91 دست‌نخورده |
| `G2-006` لید | ⚠️ **DB PROVEN, E2E NOT** | migration روی staging سالم اجرا شد · **RLS و گرنت‌ها روی Postgresِ واقعی در CI اجباری‌اند** · نیمهٔ مینی‌اپ و احرازِ وبهوک روی staging کار کرد · تمرینِ شکست و بازیابی انجام شد | **عبورِ واقعیِ یک ردیف از اپلیکیشن به `public.leads` اثبات نشده** (`B-029`, `B-030`) · `D-001` باز |
| `G2-007` زمان‌بندی | ✅ **DONE** | `vercel.json` منبعِ حقیقت شد؛ `B-016` و `B-027` بسته؛ گاردِ `lib/core/cadence.test.ts` | ادعایی دربارهٔ **اجرای واقعیِ** cron نمی‌کند — آن `UNVERIFIED` است |
| `G2-008` ادعاهای اثبات‌ناپذیر | ⚠️ **PARTIAL** | `ProductFacts` و `Capabilities` اصلاح شدند؛ `B-016`/`B-027` بسته | `B-028` (`/learn`) — انتشارِ محتوا تصمیمِ آرش است |
| `G2-009` branch protection | ❌ **NOT DONE** | runbook آماده است و `CI Gate` سبز است | روشن‌کردنش اقدامِ انسانی در تنظیماتِ GitHub است (`B-015`) |

**Gate 2 = `PARTIALLY_READY`. PASS اعلام نشده و نمی‌شود.**

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
| **B-028** | **`/learn` شش درسِ منتشرنشده را عمومی نشان می‌دهد** | 🟡 MEDIUM | Portfolio / Truthfulness | ARASH (محتوا) | 2026-07-28 | Gate 5 | انتشارِ محتوا **تصمیمِ آرش است و باز می‌ماند**. تا آن زمان نمایش با واقعیت خوانده می‌شود | هر شش درس `published: false`. **`G2-008`** خطِ صریحِ سطحِ سکشن را اضافه کرد. **`P2-G2-010`** یک قدم جلوتر رفت: تا انتشارِ اولین درس، سرفصل‌ها دیگر **کارتِ کلیک‌پذیر** نیستند (چیزی که کلیک می‌شود و صفحه باز می‌کند در عمل «محتوای در دسترس» خوانده می‌شود) و صفحهٔ درسِ منتشرنشده `noindex` شد. **هیچ پیش‌نویسی حذف نشد** و رفتار به `published` گره خورده، پس با انتشار خودبه‌خود برمی‌گردد. گاردِ `lib/learn.test.ts` | **OPEN (محتوا · ARASH)** · نمایش دیگر گمراه‌کننده نیست |
| **B-029** | **کلیدِ service-roleِ Staging با هیچ ابزارِ در دسترسی قابلِ دریافت نیست** | 🟠 HIGH | Ops / Staging | ARASH (اپراتور) | 2026-07-30 | B-003، G2-006 | آرش یک **Supabase Personal Access Token** به‌عنوانِ متغیرِ محیطیِ سشن (`SUPABASE_ACCESS_TOKEN`) بدهد **و** خروجیِ شبکه به `api.supabase.com` و `*.supabase.co` باز شود. آن‌وقت کلید بدونِ نمایش خوانده و مستقیم استفاده می‌شود | چهار مسیر واقعاً امتحان شد و هر چهار بسته بود: `get_publishable_keys` فقط `anon` و `sb_publishable_…` می‌دهد · `SUPABASE_ACCESS_TOKEN` در محیط نیست · `api.supabase.com` از پراکسی **403** می‌گیرد · روی خودِ DB: `jwt_secret_available=false` و `vault_secret_count=0` | **OPEN** · VERIFIED |
| **B-030** | **خروجیِ شبکهٔ محیطِ اجرا میزبان‌های Supabase و Vercel را مسدود می‌کند** — پس نه می‌توان کلید را گرفت، نه از اینجا به Supabase نوشت، نه Preview را پیکربندی کرد | 🟠 HIGH | Ops / Tooling | ARASH (اپراتور) | 2026-07-30 | B-029، G2-006 | باز کردنِ egress برای `*.supabase.co`, `api.supabase.com`, `api.vercel.com` در تنظیماتِ محیط. **دور زدنِ پراکسی ممنوع است** (دستورِ صریحِ `/root/.ccr/README.md`) | آزمونِ واقعی: هر شش میزبانِ `supabase.com`, `api.supabase.com`, `*.supabase.co`, `db.*.supabase.co`, `vercel.com`, `api.vercel.com` کدِ `000` (CONNECT 403) دادند · لاگِ خودِ اپلیکیشن: `Host not in allowlist: …` | **OPEN** · VERIFIED |
| **B-032** | **شاخصِ «تازگیِ رلهٔ بازارِ ایران» برای همیشه کور بود** — روت سلامت روی `ir_market_snapshots.created_at` پرس‌وجو می‌کرد، ولی آن جدول فقط `key`, `payload`, `updated_at` دارد | 🟠 HIGH | Portfolio / Observability | ENGINEERING | 2026-07-30 | G2-003 | — | **بدتر از کوری: دلیلِ غلط می‌داد.** تشخیصِ خطا فقط `/does not exist/` را می‌دید و پیامِ Postgres برای **ستونِ** ناموجود هم همان عبارت را دارد، پس شاخص گزارش می‌کرد «جدولِ `ir_market_snapshots` پیدا نشد» — اپراتور دنبالِ جدولی می‌گشت که سالم بود. اثباتِ واقعی روی Postgres محلی با همان DDL: `select created_at` → `column "created_at" does not exist`؛ `select updated_at` → موفق. اصلاح: ستونِ درست + `classifyQueryError` که `42P01` را از `42703` جدا می‌کند و ستونِ اشتباه را `failed` اعلام می‌کند نه `unknown` (باگِ خودمان باید سر و صدا کند). گاردِ ۳ تست در `lib/health/status.test.ts` | **FIX READY — PR #98** · اصلاح نوشته و تست شده ولی **هنوز merge نشده**؛ تا merge، شاخص در Production همچنان کور است |
| **B-034** | **`GRANT ALL` به `service_role` گاردهای append-only مدلِ هوشمندی را دور زدنی کرده بود** — `phase20` روی هر ۱۵ جدولِ `intel_*` به `service_role` امتیازِ `TRUNCATE` و `DELETE` می‌داد، و **`TRUNCATE` تریگر را شلیک نمی‌کند** | 🔴 CRITICAL | Portfolio / DB Security | ENGINEERING | 2026-07-31 | G3-001، ADR-005 | — | **با کاوش پیدا شد، نه با بازبینی.** در تمرینِ stagingِ `P2-G3-002` با `SET ROLE service_role; TRUNCATE …` سنجیده شد: هر ۵ جدولِ آزموده `EXERCISABLE`، ولی `cron_runs` (که `REVOKE ALL … FROM service_role` دارد) `BLOCKED_BY_PRIVILEGE` — همان دیتابیس، همان نقش، نتیجهٔ متضاد؛ تفاوت فقط یک خط. **این سومین تکرارِ درسِ `G2-006` است** (پس از `phase8b_leads`). چرا تست نگرفت: تستِ موجود فقط `authenticated` را می‌آزمود، نه نقشی که سرور واقعاً با آن اجرا می‌شود. رفع: `REVOKE ALL … FROM service_role` سپس `GRANT SELECT, INSERT` + `UPDATE` روی ۶ جدولِ دارای چرخهٔ دومرحله‌ای؛ روی staging اعمال و **بازاندازه‌گیری** شد (TRUNCATE ۰/۱۵، DELETE ۰/۱۵). دو گاردِ تازه: تستِ ایستا در `contracts.test.ts` و تستِ Postgres روی هر ۱۵ جدول — هر دو failable بودنشان اثبات شد | **FIX READY — PR #100** · روی Staging اعمال شده · Production هرگز `phase20` نداشته پس در معرض نبوده |
| ~~**B-035**~~ | ~~`fn_signals_hash_chain()` روی Production برای `anon` قابل اجراست~~ — **ادعای من غلط بود** | — | Portfolio / DB Security | ENGINEERING | 2026-07-31 | — | — | **ممیزیِ فقط‌خواندنیِ Production (۱۴۰۵/۰۵/۰۹) ادعا را رد کرد.** اندازه‌گیریِ مستقیم: `anon_execute=false` · `auth_execute=false` · ACL = `postgres=X/postgres | service_role=X/postgres`. هر چهار تابعِ زنجیرهٔ هش (`fn_signals_`, `fn_signal_outcomes_`, `fn_weekly_outlooks_`, `fn_weekly_outlook_results_`) یکسان سخت‌شده‌اند و همه `search_path` دارند. **چرا اشتباه کردم:** advisor روی *staging* هشدار داد و من از آن به Production تعمیم دادم. ولی fixtureِ پیش‌نیازِ من فقط بریدهٔ `terminal_t0.sql` را اعمال کرده بود — و آن فایل **هیچ `REVOKE`ای ندارد** (صفر REVOKE در ۲۶۸ خط). سخت‌سازی در `sql/phase15_security.sql` خط ۱۰۵ است، که Production آن را دارد (migrationهای `terminal_t0_harden_functions` و `phase15_security`). **پس این یافته مصنوعِ fixtureِ ناقصِ خودم بود، نه نقصِ Production** — و دقیقاً همان چیزی است که `B-036` هشدار می‌داد. درسِ عملی: «staging هشدار داد» تا وقتی staging کپیِ Production نیست، دربارهٔ Production **هیچ** نمی‌گوید | ✅ **CLOSED 2026-07-31** — ردشده با اندازه‌گیری · Production بدونِ تغییر |
| **B-037** | `is_admin()` و `can_see_announcement()` روی Production برای `anon` قابلِ اجرا هستند (`SECURITY DEFINER`) | 🔵 LOW | Portfolio / DB Security | ENGINEERING | 2026-07-31 | — | فقط بازبینی — احتمالاً عمدی است | در همان ممیزیِ فقط‌خواندنی دیده شد. هر دو `search_path=public` دارند و داخلِ سیاست‌های RLS استفاده می‌شوند، پس `anon` برای ارزیابیِ سیاست به `EXECUTE` نیاز دارد؛ `is_admin()` برای `anon` مقدارِ false برمی‌گرداند چون `auth.uid()` تهی است. **هیچ آسیبی اثبات نشد** — به‌عنوان مشاهده ثبت می‌شود نه نقص. ۱۶ تابعِ دیگر فقط برای `authenticated` باز‌اند. یافته‌های دیگرِ همان ممیزی: `pg_net` در schema عمومی، سیاستِ همیشه‌درستِ `waitlist.wl_public_insert` (عمدی — فرمِ عمومیِ لیستِ انتظار)، و غیرفعال‌بودنِ محافظتِ رمزِ فاش‌شده در Auth | **OPEN** · VERIFIED · اقدام لازم نیست مگر آرش بخواهد |
| **B-038** | **میزِ آرش پنج ستونِ زمانیِ ناموجود را می‌خواند و هر پنج شاخص را «به‌روز» گزارش می‌کرد** | 🟠 HIGH | Portfolio / Observability | ENGINEERING | 2026-08-01 | G3-002 | — | `ir_market_snapshots.captured_at`، `fx_rates.date`، `market_breadth.date`، `codal_reports.created_at`، `weekly_outlooks.created_at` — **هیچ‌کدام در DDL وجود ندارند**. دو نقص روی هم افتاده بود: `probe()` خطای ستون را بی‌صدا می‌بلعید و بدونِ زمان برمی‌گشت، و `classifyPanel` هم «زمان ندارد» را `ready` تفسیر می‌کرد. نتیجه: شاخصِ مرده‌ای که همیشه سبز است — از نبودِ شاخص بدتر. **این چهارمین تکرارِ همان درس است** (پس از گرنت‌های لید، `B-032` تازگیِ رله، و آخرین اجرای cron). رفع: ستون‌های درست + `timestampBroken` که صریحاً `unavailable` می‌شود + `lib/desk/sources.test.ts` که هر ستونِ اعلام‌شده را با `sql/*.sql` تطبیق می‌دهد. **شکست‌پذیری اثبات شد:** بازگرداندنِ `captured_at` → `pass 6 / fail 2` | **FIX READY — PR #101** · Production هرگز این کد را نداشته |
| **B-039** | **`--text-1` یک توکنِ وجودنداشته است** که در ۱۰+ کامپوننت استفاده می‌شود | 🔵 LOW | Portfolio / Design System | ENGINEERING | 2026-08-01 | — | جایگزینی با `--text` در بقیهٔ کامپوننت‌ها (خارج از دامنهٔ PR #101) | در `globals.css` فقط `--text`, `--text-2`, `--text-3` تعریف شده‌اند؛ `--text-1` هرگز. چون CSS برای متغیرِ تعریف‌نشده رنگ را از والد به ارث می‌برد، **تصادفاً** درست به‌نظر می‌رسد و هیچ‌وقت لو نمی‌رود. فایل‌های متأثر: `HealthBoard`, `FxBacktestTab`, `AdminMarketRadar`, `AdminFxDashboard`, `SymbolFundamentalCard`, `GlossarySearch`, `FxSeedManager`, `app/(protected)/admin/webinars/page.tsx`, `app/webinars/page.tsx`. در `DeskBoard` رفع شد + گاردِ «هر توکنِ ارجاع‌شده باید تعریف شده باشد» | **OPEN** (بقیهٔ فایل‌ها) · DeskBoard ✅ |
| **B-040** | **متنِ ادمین با `--navy-deep` رنگ می‌شود ولی تمِ تیره آن را بازنویسی نمی‌کند** — عنوان‌ها روی پس‌زمینهٔ تیره تقریباً نامرئی‌اند | 🟡 MEDIUM | Portfolio / Design System | ENGINEERING | 2026-08-01 | — | استفاده از `--text` برای متن در بقیهٔ کامپوننت‌های ادمین (خارج از دامنهٔ PR #101) | بلوکِ `.dark` در `globals.css` فقط `--bg`, `--surface*`, `--line*`, `--text*` را بازنویسی می‌کند — **نه `--navy*` را**. با اسکرین‌شاتِ واقعیِ تمِ تیره دیده شد، نه با بازبینیِ کد. `AdminFxDashboard` ۱۰+ مورد دارد. در میز رفع شد + گاردِ صریح | **OPEN** (بقیهٔ فایل‌ها) · میز ✅ |
| **B-041** | **ادمین روی Staging بی‌صدا از هر نوشتنی در مدلِ هوشمندی قفل بود** — `profiles` با RLSِ روشن و **صفر سیاست** ساخته شده بود | 🟠 HIGH | Ops / Staging | ENGINEERING | 2026-08-02 | تمرینِ خصوصیِ Gate 3 | — | سیاستِ همهٔ ۱۵ جدولِ `intel_*` روی `EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')` تکیه دارد. وقتی `authenticated` هیچ سطری از `profiles` نمی‌بیند، آن زیرپرس‌وجو **همیشه false** است. `sql/test/supabase_bootstrap.sql:84` این تله را از قبل توضیح داده بود ولی به پروژهٔ واقعیِ staging اعمال نشده بود. **چرا دیر پیدا شد:** کنترلِ اولِ خودم «ادمین SELECT» را PASS اعلام کرد در حالی که جدول صفر سطر داشت — «اجازه دارم ولی خالی است» از «اجازه ندارم» جدا نشده بود؛ همان ادغامی که کلِ محصول علیه‌اش ساخته شده، این‌بار در تستِ خودم. چیزی که واقعاً خبر داد شکستِ `INSERT` بود. رفع در `sql/staging/g3003_staging_profiles_prereq.sql` (staging-only) و **بازاندازه‌گیری شد**: ادمین INSERT پذیرفته، ادمین DELETE همچنان `permission denied`، کاربر عادی همچنان مسدود | ✅ **CLOSED 2026-08-02** روی Staging · Production این سیاست‌ها را از قبل دارد (۴ سیاست) پس در معرض نبود |
| **B-042** | **`anon` روی `profiles`ِ Staging امتیازِ `DELETE` و `TRUNCATE` داشت** | 🟠 HIGH | Ops / Staging | ENGINEERING | 2026-08-02 | B-041 | — | گرنتِ پیش‌فرضِ کاملِ Supabase هرگز روی این fixture پس گرفته نشده بود. **با اندازه‌گیری:** `anon DELETE FROM profiles` **پذیرفته شد**؛ `anon TRUNCATE profiles` رد شد ولی با پیامِ *cannot truncate a table referenced in a foreign key* — یعنی **نه `permission denied`**؛ امتیاز واقعاً در اختیارش بود و فقط یک FKِ تصادفی جلویش را گرفته بود. پوشش دو چیزِ تصادفی بود نه کنترلِ امنیتی: RLSای که هیچ سیاستی نداشت، و همان FK. **نکتهٔ خطرناک:** اگر صرفاً سیاست‌های Production کپی می‌شد (کارِ به‌ظاهر بدیهی)، همان لحظه گرنتِ `DELETE`ِ `anon` از پوشیده به **زنده** می‌رفت. پس ترتیبِ REVOKE → GRANTِ حداقلی → POLICY خودش بخشی از درستی است و در `lib/intelligence/staging-fixture.test.ts` قفل شد | ✅ **CLOSED 2026-08-02** روی Staging · پس از رفع: `anon DELETE` ⟵ `permission denied` |
| **B-043** | **جهتِ معکوسِ `B-040`: پس‌زمینهٔ ثابت با متنِ تم‌آگاه — روشن روی روشن در تمِ تیره** | 🟡 MEDIUM | Portfolio / Design System | ENGINEERING | 2026-08-02 | — | جایگزینیِ `--text-2` با `--navy-deep` روی هر پس‌زمینهٔ `--gold-tint` در بقیهٔ کامپوننت‌ها (خارج از دامنهٔ PR-C) | `--gold-tint` (#F5E6B8) را بلوکِ `.dark` بازنویسی **نمی‌کند** ولی `--text-2` را می‌کند (#CBD5E1). نتیجه: بنری که در تمِ روشن خواناست، در تمِ تیره ناخوانا می‌شود. **با اسکرین‌شاتِ واقعی پیدا شد، نه با بازبینیِ کد.** قاعدهٔ عمومی‌ای که از آن آمد: «پس‌زمینهٔ بازنویسی‌نشده باید متنِ بازنویسی‌نشده داشته باشد» و در `lib/intelligence/ui-tokens.test.ts` قفل شد (شکست‌پذیری اثبات شد: pass 4 / fail 1). فایلِ شناخته‌شدهٔ دیگر: `app/(protected)/admin/desk/page.tsx` | **OPEN** (بقیهٔ فایل‌ها) · صفحهٔ هوشمندی ✅ |
| **B-044** | **`anon` روی ۴۰ جدولِ Production امتیازِ `DELETE` و `TRUNCATE` دارد** | 🟠 HIGH | Ops / Production Security | ARASH (مجوزِ SQL لازم) | 2026-08-02 | B-034 | یک مأموریتِ کوچکِ مجزا با مجوزِ صریح: `REVOKE DELETE, TRUNCATE … FROM anon, authenticated` با بازهٔ کنترل‌شده و اندازه‌گیریِ پیش/پس | گرنتِ **پیش‌فرضِ Supabase** است نه چیزی که کسی اضافه کرده باشد. **ارزیابیِ بدونِ بزرگ‌نمایی:** مسیرِ `DELETE` از PostgREST به RLS برخورد می‌کند و `profiles` چهار سیاست دارد، پس عملاً بسته است. ولی **`TRUNCATE` را RLS فیلتر نمی‌کند** (`B-034`) و تنها محافظتش جانبی است: PostgREST آن را در معرض نمی‌گذارد و `anon` نقشِ NOLOGIN است. هر تابعِ `SECURITY INVOKER` با SQL پویا این را زنده می‌کند. جدول‌های append-only (`codal_reports`, `symbol_history`) بیشترین آسیب را می‌بینند چون گاردشان تریگر است و **تریگر با TRUNCATE اجرا نمی‌شود**. فقط‌خواندنی دیده شد؛ **هیچ SQLای روی Production اجرا نشد** | **MITIGATED_ON_STAGING** · Production همچنان **OPEN** |
| **B-044** — پیگیری (`P2-CLAUDE-MEGA-004`، ۱۴۰۵/۰۵/۱۳) | اصلاحیه نوشته و اجرا شد؛ Production منتظرِ تصمیم | 🟠 HIGH | Ops / Production Security | ARASH (مجوزِ SQL لازم) | 2026-08-04 | B-034 | بندِ ۹ سند `PRODUCTION-ACTIVATION.md` — `phase23` باید **آخرین** migration باشد، وگرنه جدول‌های تازه پوشش داده نمی‌شوند | اندازه‌گیریِ زندهٔ دوم روی Production تأیید کرد یافته پابرجاست: `anon` روی **۴۰ جدول** و `authenticated` روی **۴۱ جدول**، هر شش امتیازِ نوشتن. **ارزیابی دقیق‌تر شد:** هر سیاستِ نوشتن روی Production خوانده و طبقه‌بندی شد — همه با `auth.uid()` یا `is_admin()` بسته‌اند، جز `waitlist` INSERT که `WITH CHECK (true)` است و فرمِ عمومیِ عمدی. پس `DELETE` **حفرهٔ زنده نبود**؛ ادعای بیشتر از این بزرگ‌نمایی بود. `TRUNCATE` یافتهٔ واقعی است. `sql/phase23_grant_hardening.sql` قاعده را از کاتالوگ **استخراج** می‌کند نه از فهرستِ جدول‌ها، و در پایان invariant را دوباره می‌خواند و `RAISE EXCEPTION` می‌کند. روی Staging: `anon` از ۶ امتیازِ نوشتن به **۰**؛ `TRUNCATE`/`TRIGGER`/`REFERENCES` برای هر سه نقش **۰**؛ شمارشِ ردیف‌ها بدونِ تغییر؛ قاعدهٔ `phase22` سالم (`intel_workflow_events` همچنان فقط `INSERT, SELECT`). گارد: `lib/security/grants.integration.test.ts` — یکی از تست‌ها ادعای «RLS جایگزینِ گرنت نیست» را **اجرا** می‌کند: `anon` با `DELETE` صفر ردیف می‌گیرد و تریگر شلیک نمی‌شود، با `TRUNCATE` کلِ جدول می‌رود. **روی Production هیچ SQLای اجرا نشد** | **READY_FOR_PRODUCTION** · منتظرِ تصمیمِ مالک |
| **B-036** | **پروژهٔ staging کپیِ Production نیست** — فقط `leads` و `profiles` داشت؛ `signals` که `phase20` به آن FK دارد وجود نداشت | 🟡 MEDIUM | Ops / Staging | ENGINEERING | 2026-07-31 | هر تمرینِ migration | ثبتِ صریحِ اینکه staging چه چیزی را بازتولید می‌کند و چه چیزی را نه | در `P2-G3-002` هنگام اجرای `phase20` معلوم شد. `signals`/`signal_drafts` عیناً از `sql/terminal_t0.sql` به‌عنوانِ fixtureِ پیش‌نیاز اعمال شد (همان الگوی `g2006_prereq_profiles_…`). **پیامد برای صداقت:** موفقیتِ تمرینِ staging دربارهٔ Production کمتر از آنچه به‌نظر می‌رسد ثابت می‌کند — هر جدولی که Production دارد و staging ندارد، یک تفاوتِ نادیده است | **OPEN** · VERIFIED |
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

### ۳′. بلاکرهای کشف‌شده در ۱۴۰۵/۰۶/۱۵ (`MARKET-CORE-002`)

> هر سه با خواندنِ مستقیمِ Production کشف شدند، نه از روی اسناد.

| Blocker ID | Blocker | Severity | Scope | Owner | Blocks | Evidence | Status |
|---|---|---|---|---|---|---|---|
| **B-045** | ستونِ `codal_reports.published_at` برای **هر ۷٬۸۰۵ ردیف** `NULL` است | 🟠 HIGH | Portfolio / داده | ENGINEERING | `R-011`، هر ادعای «تازگیِ گزارش» | `count(*) filter (where published_at is null)` = ۴٬۸۰۰ (ن‑۳۰) + ۳٬۰۰۵ (ن‑۱۰) = کلِ جدول | **OPEN** · VERIFIED |
| **B-046** | **ترکیب دارایی صندوق‌ها هیچ منبع و هیچ جدولی ندارد** | 🟠 HIGH | Portfolio / داده | ARASH (تصمیمِ منبع) | `R-005`، صفحهٔ صندوق | `list_tables` روی Production: ۴۱ جدول، هیچ‌کدام ترکیبِ دارایی ندارد؛ `lib/market-ir.ts` فقط قیمت/NAV/خالص دارایی می‌آورد | **OPEN** · VERIFIED |
| **B-047** | پروژهٔ **staging** (`oqjcvkzyvhqnphopedpn`) وضعیتش `INACTIVE` است | 🟠 HIGH | Portfolio / زیرساخت | ARASH | `G2-006`، هر تمرینِ migration، `D-001` | `list_projects` (۲۰۲۶-۰۹-۰۶) → `"status":"INACTIVE"` | **OPEN** · VERIFIED |
| **B-048** | **`Tsetmc/Index.php` و `IME/Certificate` روی مسیرِ قدیمی هیچ شمارنده‌ای نداشتند** — پرمصرف‌ترین چرخهٔ روز (هر ۵ دقیقه) با پرچمِ خاموش از بودجه **نامرئی** بود، در حالی که جدولِ `BRSAPI-CLIENT-DESIGN` ادعا می‌کرد شمرده می‌شود | 🟠 HIGH | Relay / سهمیه | ENGINEERING | 2026-09-12 | سقفِ روزانهٔ BrsApi | — | شاخهٔ `else` در `relay/server.mjs` و `relay/ime.mjs` `countLegacy` نداشت؛ پرچم در Production **خاموش** است. سند و کد یکی نبودند و **سند باور شده بود**. ⚠️ **دو جلسهٔ مستقل در یک روز همین را پیدا کردند** — یعنی نقص واقعی و قابلِ‌کشف بود، ولی هماهنگی نبود | ✅ **CLOSED در #127** (merge روی `main`، ۱۴۰۵/۰۶/۲۱). گاردِ `relay/brsapi-coverage.test.mjs` فهرستِ نقاطِ تماس را با خودِ سورس تطبیق می‌دهد |
| **B-049** | **در حالتِ `enforce` بدونِ انبارِ ماندگار، مصرف نامحدود بود** — شمارنده آن را `unmetered` ثبت می‌کرد و **عبور می‌داد**، یعنی دقیقاً در حالتی که هدفش سقف گذاشتن است سقفی نبود | 🟠 HIGH | Relay / سهمیه | ENGINEERING | 2026-09-12 | فعال‌سازیِ `BRSAPI_BUDGET_ENFORCE_LEGACY` | — | ترکیبِ «پرچمِ اجرا روشن + `SUPABASE_URL` غایب» | ✅ **CLOSED در #127** — رله در آن حالت **می‌ایستد** و `BudgetUnavailableError` می‌دهد؛ چرخهٔ متوقف‌شده کشِ سالم را با خالی بازنویسی نمی‌کند. (این برنچ همان مسئله را با سقفِ درون‌فرایندی حل کرده بود؛ راه‌حلِ #127 محافظه‌کارانه‌تر است و **کدِ این برنچ کنار گذاشته شد** — نسخهٔ دوم نگه نداشتیم) |
| **B-050** | **۶۹ نماد از ۱٬۱۳۴ آخرین روزِ معاملاتی را ندارند و مثلِ نمادِ زنده رندر می‌شوند** — قدیمی‌ترین `2018-10-29` | 🟠 HIGH | Portfolio / داده | ENGINEERING (موتور ✅) · ARASH (اجرای `phase29`) | 2026-09-12 | هر صفحه‌ای که قیمتِ نماد نشان می‌دهد | اجرای `sql/phase29_symbol_liveness.sql` پس از دروازهٔ بکاپ (`C`) | اندازه‌گیریِ زندهٔ ۱۴۰۵/۰۶/۲۱ روی Production: ۱٬۰۶۵ زنده · ۶۹ عقب. **تفکیک با منبعِ زنده:** ۲۱ تا در منبع هستند ⇒ عقب‌ماندگیِ **لولهٔ ما**؛ ۴۸ تا **در منبعِ فعلی مشاهده نشدند** ⇒ علتش نامشخص است. ⚠️ **تصحیحِ ۱۴۰۵/۰۶/۲۲:** نسخهٔ اول این ۴۸ تا را «متوقف/حذف‌شده» نوشته بود. آن یک **ادعای رسمی** دربارهٔ وضعیتِ نماد است و شاهدش فقط از ناشرِ بازار می‌آید، نه از غیبت در یک اسنپ‌شاتِ واسطه | **موتور آماده** (`lib/core/symbolLiveness.ts`، ۲۱ تست) · **`phase29` NOT_APPLIED** · تا اجرا، لایهٔ داده `rpc_missing` می‌گوید نه «همه زنده» |
| **B-053** | **خطِ استقرارِ رله شکسته است — اتصالِ مستقیمِ مخزن با `"port" is required` رد می‌شود** | 🔴 CRITICAL | Relay / استقرار | **ARASH** (کنسول + سکرت) | 2026-09-14 | بستهٔ A · #126 · #127 — هیچ‌کدام روی رله زنده نیستند | **۱)** اتصالِ مخزن را در کنسولِ `arsadata` قطع کن (وگرنه دو منتشرکننده). **۲)** API Token بساز و در GitHub با نامِ `LIARA_API_TOKEN` ثبت کن (توصیه: `RELAY_TOKEN` هم، وگرنه پذیرش «در انتظار» می‌ماند). **۳)** Actions → **Deploy relay** → `sha=1d7e8f1`. جزئیات: [`RUNBOOK-relay-deploy.md`](./RUNBOOK-relay-deploy.md) | **✅ تصحیحِ دو ادعای قبلیِ من:** «هیچ استقراری موفق نبوده» و «نسخهٔ زنده شناسه ندارد» **هر دو غلط بودند**. کنسول: `v46` · `6570aaf` · `main` · `#58` · موفق و «استقرارِ فعلی» · platform `node` · پورتِ نسخه `3400`. نمونه‌گیریِ من از رکوردهای *شکستِ اتصالِ مخزن* بود، نه فهرستِ release‌ها. ⚠️ **تصحیحِ سوم:** نوشته بودم «چون `relay/liara.json` ثابت مانده، پس علت قطعاً بیرونِ مخزن است» — این استدلال معتبر نیست و **علتِ ریشه‌ای هنوز تأیید نشده**. لاگِ بیلد خوانده نشده؛ «بیلد از ریشهٔ مخزن» هم فرضیه است. **آنچه اثبات شد:** (۱) خطا مالِ اتصالِ مخزن است نه Actions. (۲) `relay/liara.json` در `6570aaf` و `main@1d7e8f1` بایت‌به‌بایت یکی است و `liara.json` ریشه‌ای هرگز وجود نداشته. (۳) نسخهٔ زنده `6570aaf` است — دو شاهدِ مستقل (`history push ok: 4 sections` و پرس‌وجوی ۱۰:۳۴Z). (۴) **`6570aaf` هیچ اجرای موفقِ `CI` ندارد** (`ci.yml` در ۲۰۲۶-۰۷-۲۶ اضافه شد، کامیت مالِ ۲۰۲۶-۰۷-۱۸) — پس خودش هدفِ بازگشت نیست. **✅ مسیرِ بازگشتِ آماده و گِیت‌شده: `45e25b91e1372581487aa58230b708f745750b1b`** — درختِ `relay/` بایت‌به‌بایت برابرِ نسخهٔ زنده (`tree e4b6c40e`، `git diff` خالی)، جدِ `main`، و **CI روی همان SHA `success`**. دستور: `gh workflow run "Deploy relay" -f sha=45e25b9… -f allow_older=true`. `allow_older` فقط دروازهٔ ترتیب را باز می‌کند؛ SHA/main/CI/پیش‌پرواز همچنان اجرا می‌شوند. پذیرش روی بازگشت `not-applicable` است (نسخهٔ قدیمی `historySections` ندارد). **رفع:** `.github/workflows/deploy-relay.yml` + `scripts/deploy/relay-gate.mjs` (۲۶ تستِ رفتاری در CI). دروازه‌ها به‌ترتیب: اعتبارسنجیِ SHA → تعلق به `main` → CIِ موفقِ همان SHA → مبنای «آخرین انتشارِ موفق» (تگِ `relay-deployed`، نه `HEAD^`) → ردِ SHAِ قدیمی‌تر از نسخهٔ مستقر → **سپس** توکن → پیش‌پروازِ fail-closed → انتشار از `git archive` → زنده‌بودن → پذیرشِ جدا. پیش‌پرواز **هر دو** پرچم را می‌بندد: `BRSAPI_BUDGET_ENFORCE_LEGACY=1` (`BudgetUnavailableError`) و `BRSAPI_CLIENT_ENABLED=1` (`rpc(brsapi_budget_lease)` که وجود ندارد) — `phase28` اجرا نشده | **OPEN** · VERIFIED |
| **B-051** | **`xlsx@0.18.5` سه آسیب‌پذیریِ بدونِ وصله دارد** (۲ high: Prototype Pollution و ReDoS · ۱ moderate) | 🟡 MEDIUM | Portfolio / Dependencies | ENGINEERING | 2026-09-12 | — | **بستهٔ مستقل، نه اینجا.** `npm audit fix` جواب نمی‌دهد ("No fix available") چون SheetJS نسخهٔ وصله‌شده را از npm بیرون برده؛ گزینه‌ها: نصب از رجیستریِ خودِ SheetJS، جایگزینیِ کتابخانه، یا پارسِ اکسل در یک فرایندِ جدا | **مسیرِ مصرف اندازه‌گیری شد، فرض نشد:** تنها واردکننده `lib/fx/excelParse.ts` است و تنها فراخوانش `app/api/admin/fx/seeds/route.ts` که پشتِ `profiles.role='admin'` (بررسیِ سمتِ سرور) است. پس **ورودیِ عمومی ندارد** — مهاجم باید ادمینِ لاگین‌کرده باشد و فایلِ مخرب آپلود کند | **OPEN** · VERIFIED · «صفر critical» به‌معنای «بی‌ریسک» نیست |
| **B-052** | **نشتیِ `ir_market_history` هنوز باز است و امروز هم رشد کرد** | 🟠 HIGH | Relay / ذخیره‌سازی | **ARASH** (استقرارِ رله) | 2026-09-12 | هزینهٔ ذخیره‌سازی | استقرارِ گامِ ۱ سندِ #119 — **بدونِ بکاپ هم مجاز است** چون دیتابیس لمس نمی‌شود؛ بازگشت فقط یک متغیرِ محیطی | اندازه‌گیریِ ۱۴۰۵/۰۶/۲۱: جدول **۴۶۹ MB** (شش روز پیش ۳۹۵ MB بود). در ۲۴ ساعتِ گذشته ۷٬۲۰۳ kB نوشته شد که **۷٬۱۰۱ kB‌اش (۹۸.۶٪) `stocks`+`funds` است — بخش‌هایی که هیچ خواننده‌ای ندارند** (تنها مصرف‌کننده `lib/core/trend.ts` فقط `gold` و `currency` می‌خواهد) | **OPEN** · VERIFIED · کد در #119 آماده است، #119 پنج کامیت از `main` عقب است |
| **B-025** — اندازه‌گیریِ مستقلِ ۱۴۰۵/۰۶/۲۱ | **حفرهٔ مبلغِ جعلی امروز روی Production باز است** | 🔴 CRITICAL | Portfolio / Revenue | ARASH (مجوزِ migration) | 2026-09-12 | مسیرِ درآمد | همان دروازهٔ بکاپ → `phase20`…`phase25` → merge شدنِ #113 | پرس‌وجوی فقط‌خواندنیِ کاتالوگ: `create_payment(p_amount integer, p_authority text)` — **دو آرگومان**، `SECURITY DEFINER`، و `authenticated` **می‌تواند اجرایش کند**؛ یعنی مبلغ از سمتِ کلاینت می‌آید. `finalize_paid_access` **وجود ندارد**. `verify_payment` برای `authenticated` بسته است (درست) | **OPEN** · VERIFIED · رفعش در #113 نوشته و آزموده شده، **اجرا نشده** |

> **چرا `B-045` مهم است:** صفحهٔ نماد نمی‌تواند بگوید «این گزارش کِی منتشر شد» — فقط می‌تواند بگوید
> «کِی ما آن را گرفتیم». این دو چیزِ متفاوت‌اند و در طراحی باید صریح تفکیک شوند، وگرنه یک ادعای
> اثبات‌ناپذیرِ تازه ساخته‌ایم (همان دستهٔ `B-027`).

---

## 4. Open Decisions

> خلاصه است. متنِ کامل، گزینه‌ها و شواهد در `DECISION-LOG.md`.

| Decision ID | Decision | Decision Owner | Open Since | Blocks | Options | Next Decision Point | Status |
|---|---|---|---|---|---|---|---|
| **D-001** | منبعِ نهاییِ حقیقتِ Lead چیست و `public.leads` کِی ساخته/فعال می‌شود؟ | ARASH | 2026-07-24 | B-001، B-003، G-004 | اجرای `phase8b_leads.sql` / حذفِ کدِ وبهوک / نگه‌داشتنِ لید فقط در مینی‌اپ | پیش از هر کارِ CRM. **`G2-006` شواهدِ فنی را فراهم کرد** (migration روی staging سالم اجرا می‌شود، مسیر تا احرازِ هویت کار می‌کند)، ولی تصمیمِ تجاری همچنان مالِ آرش است | **OPEN** |
| **D-025** | آیا کانکتورِ Vercel برای محیطِ کارِ عامل احراز شود؟ | ARASH | 2026-09-06 | راستی‌آزماییِ استقرار، `B-024` | احراز / احراز نکردن / احرازِ موقت | **فوری** — تا آن‌وقت هر ادعای استقرار `UNKNOWN` است | **OPEN** |
| **D-026** | منبعِ ترکیب دارایی صندوق‌ها چه باشد؟ | ARASH | 2026-09-06 | `R-005`، `B-046` | کدال (صورت‌وضعیت پرتفوی) / منبع ثالث / صرفِ‌نظر | پیش از شروعِ `MC-02` | **OPEN** |
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

> وضعیت در **2026-09-12** از GitHub خوانده شد (`list_pull_requests` + `get_check_runs`).
>
> ⚠️ **`main` در همان چند ساعت دو بار تکان خورد** (#127 و #128). خانهٔ SHA بالا
> عمداً به `2344179` اشاره می‌کند چون پایهٔ اندازه‌گیری‌های این جلسه همان بود.
> حدس زده نشده. ⚠️ نسخهٔ قبلیِ این بخش تاریخِ **۲۰۲۶-۰۷-۲۸** داشت و ۱۰ PRِ باز را
> نمی‌دید — یعنی شش هفته کهنه بود.

| PR | عنوان | Head | Base | CI | وضعیتِ واقعی | اقدام |
|---|---|---|---|---|---|---|
| **#113** | پرداخت → دسترسی | `b64ec25` | `2344179` (به‌روز) | ✅ هر ۵ چکِ لازم سبز | **آماده‌ترین PRِ باز.** بستهٔ انتشار در `docs/ops/RELEASE-113-PAYMENT.md` | **مسدود پشتِ بکاپ (`C`) و migrationهای `phase20`→`phase25`** — نه پشتِ کد |
| **#124** | میز و مسیرِ صندوق (Codex) | `97b97c8` | `2344179` | — | مالکِ UI؛ **این مسیر لمس نشد** | مالک: Codex |
| **#127** | پوششِ کاملِ نقاطِ تماسِ BrsApi + تکمیلِ مسیرِ اجرا | — | — | ✅ | **MERGED ۱۴۰۵/۰۶/۲۱** — ۱۴ نقطهٔ تماس / ۱۱ endpoint / ۲ کلید. همان دو حفره‌ای که این برنچ هم مستقلاً پیدا کرده بود | بسته |
| **#128** | سرور بگوید **چرا** دسترسی نیست | — | — | ✅ | **MERGED ۱۴۰۵/۰۶/۲۱** | بسته |
| **#121** | فهرستِ توانمندی + نمونهٔ طراحی + تفکیکِ نمادِ متوقف | `2565cb8` | `614b59d` (به‌روز) | ✅ **CI سبز روی همان SHA** (run `34718209870`) — شاملِ job دیتابیس روی Postgresِ واقعی | بستهٔ بودجهٔ این برنچ **با #127 هم‌پوشان شد و کنار گذاشته شد**؛ آنچه ماند `symbolLiveness` + `phase29` + اسناد | بازبینی |
| **#119** | اندازه‌گیری و مهارِ رشدِ سهمیه | `47bf861` | `1d0759f` (**۵ کامیت عقب**) | — | گامِ ۱ (سوئیچِ رله) هنوز اجرا نشده — ردیفِ `A` در `MARKET-CORE-AUDIT` | با `main` هم‌تراز شود |
| **#117** | طراحیِ عملیاتیِ سامانهٔ هوشمندی | `e1b1189` | `1b4ca75` (**عقب**) | — | فقط سند | بازبینی یا بستن |
| **#115** | یکپارچه‌سازیِ میزِ هوشمندی (Codex) | `230afec` | `1b4ca75` (**عقب**) | — | مالکِ UI | مالک: Codex |
| **#104** | ممیزیِ تجربهٔ عمومی | `0eb9968` | `0b2c230` (**خیلی عقب**) | — | ممیزیِ ۱۴۰۵/۰۵ | بستن یا بازپایه‌گذاری |
| **#91** | پلِ پرداخت → entitlement (نسخهٔ قدیمی) | `6f1dec0` | `ecfc21a` (**خیلی عقب**) | — | **جانشینش #113 است** | بستن — دو مسیرِ موازیِ پرداخت نگه ندارید |
| **#75** | اصلاحِ امنیتیِ RPCِ وبینار | `2bd82eb` | `aaf9974` (**خیلی عقب**) | — | `D-009` هنوز باز | تصمیمِ آرش |
| **#74** | GARCH/PSYِ ماهانه | `6aaadc5` | `develop` | — | خارج از دامنه | دست نزن |

> **درسِ امشب، گران‌تر از یک PR:** دو جلسهٔ مستقل در یک روز **همان** دو حفرهٔ
> شمارندهٔ BrsApi را پیدا کردند و هر دو رفعش را نوشتند. کارِ #127 merge شد و کارِ
> این برنچ **دور ریخته شد** — نه چون بدتر بود، چون دومی بود. هزینه‌اش چند ساعت
> کارِ مهندسی است. علتش هم روشن است: هیچ‌جا نوشته نبود چه کسی روی `relay/` کار
> می‌کند. مرزِ «Codex مالکِ UI است» هست؛ مرزِ معادلش بینِ **جلسه‌های Claude**
> نیست. پیش از شروعِ هر بستهٔ چندساعته، `list_pull_requests` و شاخه‌های تازهٔ
> `origin` باید خوانده شوند — همین جلسه در شروع خوانده بود، ولی #127 **بعد از**
> آن merge شد؛ پس خواندنِ ابتدایی کافی نیست، **قفلِ موضوع** لازم است.

> **الگویی که این جدول نشان می‌دهد:** ۱۰ PRِ باز که ۵تایشان از پایهٔ خودشان
> چند هفته عقب‌اند. PRی که با پایه‌اش هم‌تراز نیست، CIِ سبزش دربارهٔ `main`
> امروز چیزی نمی‌گوید. #91 و #113 هم دو مسیرِ موازی برای **یک** مسئله‌اند.

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

## 8. بسته‌های انتشار — هرکدام با دروازه و معیارِ پذیرشِ خودش

> **بازنویسیِ ۱۴۰۵/۰۶/۲۲.** فهرستِ قبلی یک صفِ خطی بود و همه‌چیز را پشتِ بکاپ
> نشان می‌داد. بازبینیِ وابستگی‌ها نشان داد این درست نیست: **سه بسته اصلاً
> پشتِ بکاپ نیستند** چون هیچ جدول، ستون، ردیف یا امضایی را عوض نمی‌کنند.
> ترتیب از وابستگیِ واقعی می‌آید، نه از شمارهٔ phase.
>
> **مالکِ اجرایی backend / relay / migration / انتشار: همین جلسه.**
> UI مالکِ جدا دارد (Codex، #124).

| بسته | دروازه | معیارِ پذیرش | وضعیت |
|---|---|---|---|
| **A — توقفِ نوشتنِ تاریخچهٔ بی‌خواننده** | استقرارِ رله روی لیارا | ⏳ **کد آماده، مسیرِ استقرار ساخته شد، منتظرِ اقدامِ کنسول.** کد در `main` (`1d7e8f1`) است ولی رله هنوز `6570aaf` (v46) را اجرا می‌کند. خطِ استقرار با `.github/workflows/deploy-relay.yml` جایگزین شد (`--app arsadata --path relay --port 3400`، پس از CI سبز روی همان SHA). سه اقدامِ باقی‌مانده دستِ آرش است: قطعِ اتصالِ مخزن · ثبتِ `LIARA_API_TOKEN` · اجرای دستیِ اولین انتشار. مبنای پذیرش (۲۰۲۶-۰۹-۱۴ ۱۰:۳۴Z): هر چهار بخش ۴ ردیف در ۲ ساعت، `newest` هر چهار `10:22:33Z`؛ `snapshots.latest` روی `10:32:27Z` | **منتظرِ کنسول** |
| **B — مهارِ `create_payment`** (`phase30`) | — | ✅ **اجرا شد روی Production، ۲۰۲۶-۰۹-۱۴ ۰۸:۴۸ UTC.** ACL از `postgres=X \| authenticated=X \| service_role=X` به `postgres=X \| service_role=X` رفت (`auth_x=f`, `anon_x=f`, `pub_x=f`, `svc_x=t`). تأیید فقط با **خواندنِ مجوزها** — هیچ پرداختِ آزمایشی و هیچ تراکنشِ جعلی ساخته نشد. `payments` همچنان صفر ردیف. ترتیب رعایت شد: نسخهٔ دارای ۵۰۳ (`1d7e8f1`) در ۰۸:۴۶ UTC مستقر شده بود. ⚠️ **اثرِ عملیاتی: مسیرِ پرداختِ تازه تا #113 بسته است** — این توقفِ کنترل‌شده است، نه حفظِ قابلیت. ⚠️ **بازگشت با `GRANT` بی‌خطر نیست**؛ همان مسیرِ نوشتنِ کنترل‌نشده را باز می‌کند | ✅ **DONE** |
| **C — پوششِ کاملِ بودجهٔ BrsApi** | فقط استقرارِ رله | `/debug → brsapiLegacy` هر ۱۴ نقطهٔ تماس را بشمارد و `hook.unregistered` خالی بماند · یک روز مشاهده پیش از `enforce` | **merged در `main` (#127)** · منتظرِ استقرار |
| **D — بکاپِ اثبات‌شدهٔ Production** | ماشینی با Docker + رمزِ دیتابیس دستِ اپراتور | ⛔ **مسدود — بازآزماییِ ۲۰۲۶-۰۹-۱۴ ۰۸:۴۹ UTC.** سه عملیاتِ دقیقاً مسدود: (۱) `supabase db dump` — CLI نصب نیست؛ (۲) `pg_dump` به میزبانِ Production — باینری **هست** (۱۶٫۱۳) ولی TCP/5432 به `db.*.supabase.co` و `aws-0-*.pooler.supabase.com` هر دو **BLOCKED**؛ (۳) استکِ ایزولهٔ راستی‌آزمایی — `/var/run/docker.sock` وجود ندارد. پس هیچ‌کدام از پنج وضعیت (dump · restore · ساختار · شمارشِ ردیف · تطبیق با snapshotِ مشترک) **قابلِ تولید نیست**. ❌ مسیرِ جایگزینِ «خروجیِ منطقی از راهِ MCP» عمداً انتخاب **نشد**: دادهٔ واقعیِ کاربران را از چت عبور می‌دهد و آرتیفکتِ قابلِ بازگردانی هم نیست. اقدامِ مالک: `RUNBOOK-backup-windows.md` روی دستگاهِ خودت | **مسدود — دستِ آرش** |
| **E — زنجیرهٔ `phase20`→`phase22`→`phase25`→`phase24`→`phase23`** | **D** | هر فایل بلوکِ راستی‌آزماییِ خودش را رد کند. `phase23` **حتماً آخر** وگرنه جدول‌های تازه پوشش نمی‌گیرند | **مسدود پشتِ D** |
| **F — `phase29` (زندگیِ نماد)** | **D** — ولی مستقل از E؛ پیش‌نیازش فقط `symbol_history` است که از قبل هست | `symbol_last_trade_dates()` یک ردیف به‌ازای هر نماد بدهد و `prosecdef = f` بماند | **کد آماده (#121)** · مسدود پشتِ D |
| **G — merge شدنِ #113** | **E** | حفرهٔ مبلغِ جعلی بسته، `finalize_paid_access` موجود، بستهٔ `ops/RELEASE-113-PAYMENT.md` اجرا شده | **مسدود پشتِ E** |
| **H — merge شدنِ #124 (UI)** | هیچ — **به هیچ migrationِ اعمال‌نشده‌ای وابسته نیست** | یک تعارضِ تک‌خطی در `AccountBridge.tsx` رفع شود (سمتِ `main`)، سپس CI روی SHAِ تازه | **دستِ Codex** — تحلیل و شواهد در کامنتِ #124 |

### سازگاریِ B با G — بررسی‌شده، نه فرض‌شده

`phase24` در #113 خطِ ۶۲۰ به‌صورتِ شرطی همان امضای دوآرگومانی را هم `REVOKE`
و `DROP` می‌کند و در خطِ ۶۸۰ اگر باقی مانده باشد `RAISE EXCEPTION` می‌دهد. پس:

- اجرای `phase30` **پیش از** `phase24` تداخل ندارد: تابع هنوز وجود دارد، فقط
  گرنتش رفته، و شاخهٔ شرطیِ `phase24` همچنان اجرا و حذفش می‌کند.
- شاخهٔ ۵۰۳ در روت پس از `phase24` هرگز شلیک نمی‌شود (روت آنجا با
  `service_role` و امضای چهارآرگومانی صدا می‌زند) و بی‌ضرر می‌ماند.

⚠️ **تصحیحِ یک نگرانیِ اولیهٔ خودم:** اول به‌نظر رسید `phase24` فقط امضای
سه‌آرگومانی را `DROP` می‌کند و امضای دوآرگومانیِ زندهٔ Production را جا
می‌گذارد. خواندنِ کلِ فایل این را رد کرد. ثبتش اینجاست تا کسی دوباره همان
نتیجهٔ غلط را نگیرد.

### مسیرِ مستقلِ Mini App

مسدودکنندهٔ هیچ‌کدام از بالا نیست: تعیینِ مالک → VPS و Coolify (`B-005`) →
migrationها روی staging (`B-004`، `D-002`) → cutover (`D-003`).

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

---

## 11. توانمندی‌های محیط — کجا نگاه کنم

فهرستِ کاملِ ابزارها، اتصال‌ها، شواهد و محدودیت‌ها در سندِ اختصاصی است:
**[`CAPABILITY-INVENTORY.md`](./CAPABILITY-INVENTORY.md)** (راستی‌آزماییِ ۱۴۰۵/۰۶/۱۵).

خلاصهٔ آنچه بر **کارِ امروز** اثر می‌گذارد:

| توانمندی | وضعیت | اثر بر برنامه |
|---|---|---|
| ساخت و تست پروژه (`typecheck`/`test:core`/`lint`/`build`) | ✅ **همه سبز، آزموده‌شده** | کارِ فرانت‌اند و هسته بدون مانع پیش می‌رود |
| خواندنِ Supabase **Production** | ✅ آزموده | ادعاهای داده قابلِ راستی‌آزمایی‌اند — `B-045`…`B-047` و `B-050` و اندازه‌گیریِ `create_payment` از همین راه آمدند |
| **Postgresِ یک‌بارمصرفِ محلی** | ✅ آزموده ۱۴۰۵/۰۶/۲۱ — نسخهٔ ۱۶٫۱۳ | `npm run test:db` **۳۱۶ تست سبز** در همین محیط اجرا شد. ادعای قبلیِ «نامشخص» غلط بود. دستورِ راه‌اندازی و دو تلهٔ آن در `CAPABILITY-INVENTORY` §۲ |
| **Vercel** | ❌ **احراز هویت نشده** — `list_projects` خطا داد | «مستقر شد» و «لاگِ Production» از این محیط **اثبات‌پذیر نیست**. هر ادعای استقرار تا اطلاع ثانوی `UNKNOWN` است |
| **staging** Supabase | ❌ `INACTIVE` (`B-047`) | تمرینِ migration ممکن نیست ⇒ `G2-006` جلو نمی‌رود |
| متغیرهای محیطی / `.env` | ❌ وجود ندارد | **تستِ سرتاسرِ مسیرِ کاربر در این محیط ناممکن است** — فقط تستِ واحد و نمونهٔ ایستا |
| مرورگرِ Chromium | ✅ آزموده (۷ اسکرین‌شات) | بازبینیِ بصری ممکن است؛ تعامل (کلیک/فرم) خودکار نه |
| افزونه‌ها (plugins) | هیچ‌کدام نصب نیست | — |

> **تصمیمی که آرش باید بگیرد:** احراز هویتِ کانکتورِ Vercel. بدون آن، این پلتفرم یک نقطهٔ کورِ دائمی
> دارد: **هیچ‌وقت نمی‌توانیم بگوییم چیزی واقعاً مستقر و سالم است.** ثبت‌شده به‌عنوان `D-025`.

---

## 12. نقشهٔ نیاز → تسک → معیار پذیرش → شاهد

> **نقشِ این جدول:** بندِ گم‌شدهٔ زنجیره. تا امروز گیت و بلاکر داشتیم ولی **نیازِ شناسه‌دار** نداشتیم،
> برای همین «کارِ تمام‌شده» تعریفِ روشنی نداشت.
>
> **هیچ‌کدام از این نیازها هنوز تصویب نشده‌اند.** حالتِ همه `PROPOSED` است تا آرش بازبینی کند.
> نیازِ تصویب‌نشده مجوزِ ساخت نیست.

| ID | نیاز | تسک | معیارِ پذیرش | شاهدِ تحویل | وضعیت |
|---|---|---|---|---|---|
| **R-001** | خانهٔ عضو باید خلاصهٔ بازار را **کنارِ** پرتفوی نشان دهد، نه در صفحه‌ای جدا | `MC-01` طراحیِ خانهٔ عضو | کاربر بدون ترکِ صفحه، ۵ قلمِ نبضِ بازار + ارزش و بازدهٔ پرتفوی را می‌بیند | نمونه: `01-home-desktop-full.png` | PROPOSED |
| **R-002** | هر عددِ امتیازی/خلاصه باید **driver** («چرا») داشته باشد | `MC-01` | هیچ KPIی بدون یک‌خط توضیحِ منبع/علت منتشر نشود | همان نمونه — سطرِ «چرا:» زیرِ هر KPI | PROPOSED |
| **R-003** | فاصلهٔ پرتفوی با **پروفایل ریسکِ ثبت‌شده** نمایش داده شود | `MC-01` | جدولِ «طبقه / فعلی / بازهٔ پروفایل / فاصله»؛ **بدونِ هیچ تجویز** | همان نمونه | PROPOSED |
| **R-004** | صفحهٔ صندوق باید حباب را **در برابر بازهٔ تاریخیِ خودش** نشان دهد | `MC-02` صفحهٔ صندوق | عددِ حباب همیشه با بازهٔ ۹۰ روزه و یک **باندِ کیفی** بیاید؛ عددِ تنها ممنوع | `02-fund-desktop-full.png` | PROPOSED |
| **R-005** | صفحهٔ صندوق باید **ترکیب دارایی** را نشان دهد | `MC-02` | ترکیب از منبعِ رسمی، با تاریخِ دوره | — | ⛔ **BLOCKED توسطِ `B-032`** — هیچ منبعی وجود ندارد. در نمونه عمداً **حالتِ خالیِ توضیح‌دار** طراحی شد، نه نمودارِ ساختگی |
| **R-006** | صفحهٔ صندوق باید صندوق را با **هم‌گروهش** مقایسه کند | `MC-02` | جدولِ هم‌گروه با ردیفِ خودِ صندوق برجسته؛ صندوقِ بدونِ NAV در میانه شمرده نشود | `02-fund-desktop-full.png` | PROPOSED |
| **R-007** | صفحهٔ نماد باید **حاشیه سود** (ناخالص/عملیاتی/خالص) را در ۸ فصل نشان دهد | `MC-03` صفحهٔ نماد | موتور موجود است (`lib/core/quarterly.ts`)؛ فقط نمایش لازم است. با کمتر از ۳ فصل نمودار رسم نشود | `03-symbol-desktop-full.png` | PROPOSED · **دادهٔ لازم هست** (ن‑۱۰ برای ۴۳۹ نماد) |
| **R-008** | صفحهٔ نماد باید **فروش ماهانه و محصولات** را نشان دهد | `MC-03` | مبلغ، رشدِ سالانه، سهمِ صادرات، جدولِ محصولات با نرخِ فروش | همان نمونه | PROPOSED · **دادهٔ لازم هست** (ن‑۳۰ برای ۳۱۶ نماد) |
| **R-009** | هر صفحه باید **چهار حالتِ داده** را طراحی‌شده داشته باشد: کامل / ناقص / کهنه / خطا | `MC-01`…`MC-03` | هر بخش در هر چهار حالت متنِ مشخص دارد؛ جای خالی `—` است نه تخمین | کلیدِ حالت در نوارِ بالای نمونه + `04`، `06`، `07` | PROPOSED |
| **R-010** | دادهٔ نمونه باید **برچسبِ صریح** بخورد | همه | برچسبِ «نمونهٔ نمایشی» روی هر بخشِ ساختگی | نمونه سراسر برچسب دارد | PROPOSED |
| **R-011** | تفاوتِ «تاریخِ انتشارِ رسمی» و «زمانِ دریافتِ ما» باید صریح باشد | `MC-03` | تا رفعِ `B-031` هیچ‌جا «تاریخِ انتشار» نوشته نشود | کارتِ «منبع و تاریخ» در `03-…png` + یادداشتِ محدودیت | PROPOSED |
| **R-012** | هر سه صفحه روی موبایل باید کامل و بدونِ سرریزِ افقی کار کنند | همه | تک‌ستونه، جدول‌ها با اسکرولِ داخلی، بدونِ اسکرولِ افقیِ صفحه | `04-home-mobile-error.png` · `05-fund-mobile-stale-dark.png` | PROPOSED |

| **R-013** | **هر تلاشِ واقعیِ BrsApi باید در یک بودجه شمرده شود، مستقلِ از هر پرچم** | `OPS-01` | هر ۱۴ نقطهٔ تماس (۱۱ endpointِ یکتا، ۲ کلید) در هر دو حالتِ پرچم | **#127 (merged)** — `relay/brsapi-coverage.test.mjs` فهرست را با سورس تطبیق می‌دهد · `test:relay` ۱۵۱ سبز | ✅ **DONE در `main`** · فعال‌سازیِ `enforce` تصمیمِ مالک است |
| **R-014** | **حالتِ `enforce` نباید با نبودِ انبار به مصرفِ نامحدود تبدیل شود** | `OPS-01` | ماتریسِ (پرچم × اجرا × انبار) کامل تست شده باشد | **#127 (merged)** — `relay/brsapi-stop-behaviour.test.mjs`؛ رله می‌ایستد به‌جای فرستادنِ نشمرده | ✅ **DONE در `main`** |
| **R-015** | **نمادی که در منبعِ ما دیده نمی‌شود نباید مثلِ نمادِ زنده رندر شود** | `DATA-01` | پنج حالتِ جدا (`live`/`lagging`/`not_in_source`/`undetermined`/`never_seen`)؛ «معامله‌ای دیده نشد» از «فیدِ خراب» جدا و **هیچ‌کدام تعطیلیِ بازار را ادعا نمی‌کنند**؛ هیچ ادعای «توقف/حذف» بدونِ شاهدِ رسمی؛ تا اجرای `phase29` پاسخ «نمی‌دانم» باشد نه «زنده» | `lib/core/symbolLiveness.ts` + ۲۱ تست · `lib/core/symbolLiveness.integration.test.ts` ۸ تست روی Postgres 16.13 واقعی · `sql/phase29_symbol_liveness.sql` | **موتور ✅ · `phase29` NOT_APPLIED (`B-050`)** |

**قاعده:** تسکی وارد توسعه نمی‌شود که نیازش تصویب نشده و معیارِ پذیرشش نوشته نشده باشد.

---

## 13. مسیرِ طراحی و فرانت‌اند — وضعیت

> این مسیر **پشتِ ممیزیِ داده قفل نیست** و به‌صورت موازی پیش می‌رود. ولی توسعه‌اش تا تصویبِ نمونه شروع نمی‌شود.

**نمونهٔ قابل‌مشاهده:** [`assets/design-review/market-core-prototype.html`](./assets/design-review/market-core-prototype.html)
— یک فایلِ مستقل. با کلیدهای بالای صفحه می‌شود صفحه، اندازه (دسکتاپ/موبایل)، حالتِ داده و تم را عوض کرد.
لینکِ مستقیم به یک حالت هم کار می‌کند: `…prototype.html#fund/mobile/stale/dark`.

| صفحه | چه چیزی **حفظ** می‌شود | چه چیزی **اصلاح** می‌شود | چه چیزی **جدید** است |
|---|---|---|---|
| **الف · خانهٔ عضو** | `AccessStatusCard`، `AllocationDonut`، `KpiCard`، `Announcements` | داشبورد امروز **فقط شخصی** است و هیچ نمایی از بازار ندارد | نوارِ نبضِ بازار (`R-001`)، جدولِ فاصله با پروفایلِ ریسک (`R-003`)، رویدادهای کدالِ نمادهای من |
| **ب · صندوق** | `FundsFullBoard` (NAV و حباب همین حالا دارد)، `Term`، `Sparkline` | حباب امروز **عددِ تنها** است؛ باید بازهٔ تاریخی و باندِ کیفی بگیرد (`R-004`) | صفحهٔ اختصاصیِ هر صندوق، مقایسهٔ هم‌گروه (`R-006`)، کادرِ ترکیبِ دارایی که فعلاً **خالیِ توضیح‌دار** است (`R-005`) |
| **ج · نماد** | `SymbolFundamentalCard`، `MonthlySalesCharts`، `QuarterlyCharts`، `CodalReportsTab`، `PriceNavChart` | حاشیه‌های سود محاسبه می‌شوند ولی **در UI برجسته نیستند** | نوارِ حاشیهٔ ۸ فصل (`R-007`)، کارتِ «منبع و تاریخ» با تفکیکِ انتشار/دریافت (`R-011`) |

**آنچه در نمونه اثبات شد (با اسکرین‌شات):** RTL سالم، تمِ روشن و تیره، چهار حالتِ داده، موبایل و دسکتاپ.

**نقص‌های واقعیِ پیداشده حینِ ساختِ نمونه و رفع‌شده:** وارونه‌شدنِ بازه‌های عددی در RTL
(`۳۰–۴۰٪` → `۳۰ تا ۴۰٪`)، ناهماهنگیِ جهتِ محورِ زمان میانِ نمودارِ خطی و میله‌ای
(هر دو به **چپ→راست** یکسان شد، هم‌راستا با `lightweight-charts`)، و وارونه‌شدنِ برچسبِ فصل‌ها
(`unicode-bidi: isolate`).

### چه چیزی هنوز تصویب نشده

| # | پرسشِ باز | چرا خودم تصمیم نگرفتم |
|---|---|---|
| ۱ | آیا خانهٔ عضو (`/dashboard`) باید نمای بازار بگیرد، یا خانه شخصی بماند و بازار جدا؟ | تغییرِ نقشِ یک صفحهٔ موجود است، نه یک افزودنی |
| ۲ | منبعِ **ترکیب دارایی صندوق** چه باشد؟ (`B-032`) | نیازمندِ کارِ تازهٔ دریافتِ داده و سهمیهٔ API |
| ۳ | جهتِ محورِ زمان در نمودارها: چپ→راست (انتخابِ فعلیِ نمونه) یا راست→چپ؟ | یک قراردادِ سراسریِ محصول است |
| ۴ | ترتیبِ ساخت: کدام صفحه اول؟ | وابسته به اولویتِ تجاریِ آرش |

> **ETFباز فقط مرجعِ «چه قابلیت‌هایی ممکن است» است، نه طراحیِ تصویب‌شده.**
> مشاهدهٔ کاملِ داخلِ سایت‌های مرجع در این جلسه انجام **نشده** و ادعایی درباره‌اش نمی‌شود.

---
