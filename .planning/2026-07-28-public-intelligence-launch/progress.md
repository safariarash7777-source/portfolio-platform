# Progress — Public Intelligence Launch

> Running log. One entry per mission. Newest last.

---

## 2026-07-28 · Gate 0 — Baseline Stabilization ✅

- PR #84 merged (`1acc18e`) — self-hosted Vazirmatn, CI-gate runbook, ADR-004
- PR #85 merged (`def602f`) — governed documentation set
- `7ad084e` — Gate 0 audit and planning files added
- Full audit recorded in `findings.md`: routes, tables, data sources, crons,
  payment→entitlement gap, placeholders, package manager, LLM absence

---

## 2026-07-28 · Gate 1 — Product Rebaseline 🔵 IN_REVIEW

**Mission:** `P2-G1-001` · **Baseline:** `7ad084eb54f4e2d5c274d4df2bdbe571d2b09b8c`
(verified equal to the declared baseline; worktree clean; branch cut from `main`;
no direct commit to `main`).

### Done

- ✅ **`docs/PRODUCT-BLUEPRINT.md` rewritten**, not patched. Product is now the
  Arash Safari market-intelligence and investment-guidance system. All 19 required
  sections present, plus an execution order (§20).
- ✅ **Old direction retired without deletion.** "Complete home for the retail investor",
  the 7-needs model and the free-floor rule are no longer the destination; the reasoning
  is recorded in `SD-003`…`SD-008`.
- ✅ **Existing assets preserved and reclassified** (`PRODUCT-BLUEPRINT` §7): relay,
  `lib/core` engines, market/symbol/fund/codal pages, track record, Telegram sync,
  auth/roles/entitlements, CI. Market pages explicitly retained as SEO and acquisition
  assets — a caution against over-correcting away from them.
- ✅ **Four capability states** (BUILT / DEPLOYED / OPERATIONAL / PROVEN) defined in both
  the Blueprint and `COMMAND-CENTER` §1′, with a per-capability matrix.
- ✅ **Mini App decoupled** — `DD-021` / `SD-008`. `G-007` no longer sits behind three
  `OWNER_UNASSIGNED` Mini App gates.
- ✅ **Decision log:** 6 rows superseded with successors, 6 new open decisions
  (`D-019`…`D-024`), 5 new decided rows (`DD-019`…`DD-023`), `D-018` closed as
  `APPROVED_PENDING_EXECUTION`. No ID deleted. No duplicate ID.
- ✅ **Command Center:** SHA, phase, Gate 1 current / Gate 2 next, 7-gate map,
  5 new blockers (`B-024`…`B-028`), and §8 rewritten — it had contained two duplicate
  action blocks, now replaced by one gate-aligned list.
- ✅ **Gate 4 and Gate 6 criteria written in full** (7 and 10 mandatory criteria).
- ✅ Three factual corrections recorded in `findings.md` (`C-01`…`C-03`), including one
  that corrects an earlier *incorrect* review claim rather than the audit.

### Deliberately not done

- ❌ No product code, `package.json`, or lockfile touched
- ❌ No SQL, migration, Supabase, Vercel, environment variable or secret change
- ❌ No payment fix, no new page, no agent, no Mini App change
- ❌ PR #74 and PR #75 untouched
- ❌ No commercial decision made on Arash's behalf — `D-021`, `D-022`, `D-023`, `D-024`
  are all left OPEN with `Authority=ARASH`

### Open items carried forward

| Item | Owner | Why it blocks |
|---|---|---|
| `B-024` service-role error in Production | ARASH | highest active risk; blocks Gate 2 |
| `B-025` payment → entitlement | ARASH (`D-024`) + ENGINEERING | revenue path |
| `B-026` webinar payment failure | ARASH | revenue path |
| `D-001` lead migration | ARASH | lead path not operational |
| `D-022` news sources · `D-023` LLM access | ARASH | Gate 4 cannot start |
| `DD-021` ratification | ARASH | supersedes a clause of an ARASH-owned decision |

### Note on authority

`DD-021` supersedes the Mini-App-coupling clause of `DD-004`, which carried
`Authority=ARASH`. Restructuring gate criteria is within Command Center's remit, so the
row is recorded as `DECIDED — PENDING_ARASH_RATIFICATION` rather than silently closed.
The rest of `DD-004` remains in force.

**Next:** Command Center review of Gate 1, then Gate 2 — starting with package manager
normalization and the Production service-role repair.

---

## 2026-07-29 · Gate 1 — Arash Desk architecture ratified  (`P2-G1-002`) ✅

**Baseline:** PR #86 head verified `655e7cf20973e32a300ce281377006be7592fef6` — open,
draft, mergeable clean, docs/planning only, worktree clean, `origin/main` untouched at
`7ad084e`. Second commit on the same branch; PR stays draft.

### Done

- ✅ **`DD-024` recorded** — Arash Intelligence Desk architecture, `Authority=ARASH`,
  the five ratified points. Scope of the ratification stated explicitly: **architecture
  and development order only**, not pricing, news sources, LLM or access duration.
- ✅ **`PRODUCT-BLUEPRINT` §11 rewritten** — role (eight questions), the nine-item
  structure, the five internal areas, the layering principle, and a **13-row matrix**
  placing every existing dashboard.
- ✅ **No dashboard removed.** The matrix assigns a future role to each surface; the only
  new build is `Agent Inbox`, and it is explicitly conditional on Gate 3 rehearsal.
- ✅ **Work packages** `G2-001`…`G2-009` and `G3-001`…`G3-007` defined in the Blueprint,
  Command Center gate table, acceptance criteria and task plan — consistently.
- ✅ **Gate 4 scoped to exactly one agent** (`Research & Market Monitoring Agent`) with
  its seven duties and five prohibitions.
- ✅ **Definitive development order** recorded in `COMMAND-CENTER` §2, with the hard rule
  that **Arash Desk does not enter execution before Gate 2 risks are cleared**.

### One contradiction resolved rather than duplicated

The mission places Branch Protection (`G2-009`) and the health view (`G2-003`) in
Gate 2, while the existing criteria had both in Gate 6. Copying them verbatim into both
would have left three documents disagreeing. Split instead:

- **Gate 2** — turn branch protection *on*; make health *visible*.
- **Gate 6** — prove the gate is *still enforced*; thresholds, alerting and proven
  stale-data behaviour.

Recorded in both `PRODUCT-BLUEPRINT` §15 and `acceptance_criteria.md`.

### Deliberately not done

- ❌ No product code · no UI · no dashboard deleted
- ❌ No SQL, migration, Supabase, Vercel, environment variable or secret change
- ❌ No agent started
- ❌ PR #74 and PR #75 untouched · PR #86 not merged, still draft
- ❌ `D-021`…`D-024` all still `OPEN` with `Authority=ARASH`

**Next:** Command Center final review of Gate 1, then Gate 2 starting at `G2-001`.

---

## 2026-07-29 · Gate 1 CLOSED — Blueprint approved and merged  (`P2-G1-003`) ✅

**Baseline:** PR #86 head `bdd8802e0760fedcbad43ddde8469914881ce700` — matched the declared
SHA exactly. `origin/main` still `7ad084e` at mission start.

### The head had moved — and it mattered

A **third commit, authored by Arash himself**, had landed on the branch between missions:
`bdd8802e` "docs: connect intelligence product to business and customer experience"
(48+/1−, `docs/PRODUCT-BLUEPRINT.md` only). It supplied exactly the three items this
mission's checklist asked for and the previous mission had not written:

- **§1′ dual destination** — internal leverage for Arash **and** a different experience for
  the audience/customer; webinar, Masir-e Rah, membership and advisory are **outputs and
  access levels of one brain**, not separate projects
- **§3′ three experience levels** — public · member (Masir-e Rah / webinar) · private
  client, all reading from **one engine and one memory**
- **the business loop** — data/news → quant & analysis → Arash's judgement → brief,
  analysis, reference portfolio and products → audience → member → customer → feedback and
  track record → back into the brain

So the content checklist was already satisfied on arrival. This mission only had to record
gate status and merge.

### Done

- ✅ **`DD-025` recorded** — Blueprint approved by Arash, Gate 1 closed. `Authority=ARASH`.
  Consequences state explicitly that the approval settles the product definition, the dual
  destination, the three levels and the business loop — and closes **no** commercial
  decision and **no** operational blocker.
- ✅ **Gate 1 → COMPLETE, Gate 2 → ACTIVE** in Command Center, acceptance criteria and task
  plan. Development order block updated: Gate 2 starts at `G2-001`.
- ✅ **Blueprint banner** marks the document as the approved product direction, with the
  four still-open commercial decisions named inline so approval is not read as broader
  than it is.
- ✅ **PR #86 taken out of draft and squash-merged** into `main` with the exact title
  `docs: ratify product blueprint and controlled launch roadmap`. Branch **not** deleted.

### Deliberately not done

- ❌ No product code · no feature · no UI · no dashboard deleted
- ❌ No SQL, migration, database, Supabase, Vercel, environment variable or secret change
- ❌ No manual deployment — Vercel deployed `main` automatically via its GitHub integration
- ❌ PR #74 and PR #75 untouched
- ❌ **`G2-001` not started** — this mission closes a gate, it does not open work
- ❌ `D-021`…`D-024` still `OPEN` with `Authority=ARASH`

**Next:** Gate 2 · Operational Foundation, starting at `G2-001` (package manager
normalization, `D-018` already decided), then `G2-002` — the Production service-role
repair, which remains the highest active risk (`B-024`).

---

## 2026-07-29 · Gate 2 — Operational Foundation, waves 1–4  (`P2-G2-MEGA-001`) 🔵

**Baseline:** `505f1862dce480473cdfa1f9388fa3a0af885dec` → **main پس از موج ۱:**
`ecfc21a349e94aa8b172546b47ab6ec5b3e64fc0`

### موج ۱ — merge شد

- ✅ **`G2-001`** (PR #88) — npm تنها package manager. `pnpm-lock.yaml` حذفِ ردیابی،
  `packageManager`+`engines`، گیتِ CI با `git ls-files` (چون `.gitignore` جلوی
  `git add -f` را نمی‌گیرد و لاکِ tracked را پاک نمی‌کند)، ESLint به devDependencyِ
  عادی برگشت، و مارکرهای merge conflictِ کامیت‌شده در `.gitignore` ادغام شد.
  **`B-023` بسته · `D-018` اجرا شد** — شواهدش استقرارِ سبزِ همین PR است که عمداً
  سه وابستگی اضافه می‌کند.
- ✅ **`G2-008`** (PR #89) — دامنه‌اش از ثبتِ اولیه بیشتر بود: `Capabilities.tsx:46`
  همان ادعای «هر ۵ دقیقه» را داشت و دیده نشده بود. آن ۵ دقیقه اصلاً دورهٔ پایش نبود
  (`CACHE_MS` است و فقط با ترافیک اجرا می‌شود). `B-016`+`B-027` بسته.
  `/learn` بیشترش درست بود؛ فقط صداقتِ سطحِ سکشن اضافه شد. `B-028` (محتوا) باز ماند.
- ❌ **Branch Protection روشن نشد** — `main` هنوز `protected: false`. MCP ابزارش را
  ندارد، `gh` نیست، API مسدود است. `B-015` با دستورالعملِ دقیقِ اپراتور باز ماند.
- ✅ **PR #87 بسته شد** پس از اینکه **هر ۱۵ فایلش** ردیابی شد. برنچ حذف نشد.

### موج ۲ — PR #90، merge نشد

- **`B-024` مکانیزم VERIFIED، اسکوپ UNKNOWN.** خطا `throw` در
  `lib/supabase/admin.ts:11` است. ۸ رخداد · ۳ کاربر · ۲۰۲۶-۰۷-۱۱ تا ۲۰۲۶-۰۷-۲۹.
  در پنجرهٔ نگهداریِ لاگ همهٔ خطاها از استقرارِ **Preview**ِ PR #87 بودند — ولی لاگِ
  Production در همان پنجره **خالی** است، پس نبودِ خطا دلیلِ سلامت نیست.
  **عمداً VERIFIED اعلام نشد.**
- **`G2-003`** — `lib/health/status.ts` موتورِ خالص با ۲۳ تست، و `/admin/health`.
  `unknown` از `failed` جدا نگه داشته شد.

### موج ۳ — PR #91، merge نشد

- زنجیرهٔ وبینار (هر سه حلقه) + پلِ پرداخت→دسترسی، از PR #87 پورت و راستی‌آزمایی شد.
- **قالبِ `entitlements.source` قطعی شد** — `{prefix}:{authority}` است نه
  `payments.id`. فرضِ اشتباه یک هشدارِ کاذبِ دائمی می‌ساخت؛ در همان روز در کدِ
  نمای سلامت هم گرفته و اصلاح شد.
- **مسیرِ بازیابی** که در #75 و #87 نبود: `recordGrantFailure` → `audit_log` ·
  `access=pending` برای مشتری · `/api/admin/entitlements/reconcile` (GET dry-run،
  POST idempotent). بدونِ migration.
- **`D-024` باز** — `docs/DECISION-D-024-access-matrix.md`. عددِ ۳ ماه از کامنتِ SQL
  آمده و تصمیمِ تجاری نیست.

### موج ۴

- **`telegram-miniapp` PR #3** — `B-019`/`B-020`. outbox عمداً اضافه نشد.
- **تمرینِ staging آماده و متوقف** — `docs/RUNBOOK-gate2-staging-rehearsal.md`.
  مجوزِ `AUTHORIZE_GATE2_STAGING` **داده نشد**، پس هیچ SQLای اجرا نشد.

### Gate 2 — وضعیتِ صادقانه: **PARTIALLY_READY**

| WP | وضعیت |
|---|---|
| `G2-001` | ✅ merged |
| `G2-008` | ✅ merged (بخشِ محتوایی `B-028` با ARASH) |
| `G2-002` | ⚠️ تشخیص شد، **رفع نشد** — نیازمندِ اقدامِ اپراتور |
| `G2-003` | 🔵 PR #90، merge نشده |
| `G2-005` | 🔵 PR #91، منتظرِ `D-024` |
| `G2-006` | 🔵 مینی‌اپ PR #3 + تمرینِ اجرانشده؛ `D-001` باز |
| `G2-009` | ❌ اقدامِ انسانی |
| `G2-004` · `G2-007` | ⏸ شروع نشد |

**Gate 2 PASS اعلام نمی‌شود.**

---

## 2026-07-30 · Gate 2 — independent work while payment is held  (`P2-G2-NEXT-001`) 🔵

**تصمیمِ حاکم:** آرش مسیرِ پرداخت/سیاستِ دسترسی را **متوقف کرد**.
`PR #91` و `D-024` وضعیتِ **`HOLD_BY_OWNER`** دارند — نه تمام‌شده، نه لغوشده.
در این مأموریت PR #91 اصلاً لمس نشد.

**main:** `ecfc21a3` → `e69cdfb9` (PR #90) → `581035d2` (PR #93)
**miniapp main:** `b88f9353` → `8cd1e023` (PR #3)

### گام ۱ — PR #90 نمای سلامت ✅ merged (`e69cdfb9`)

بازبینیِ امنیتی روی هر هشت بند انجام شد و همه پاس شدند:

| بند | نتیجه |
|---|---|
| فقط ادمین | ✅ هم در layout هم مستقلاً در روت |
| هیچ مقدارِ سکرت | ✅ فقط `Boolean(process.env[key])` |
| هیچ دادهٔ شخصی | ✅ فقط شمارشِ تجمیعی |
| هیچ افشای URLِ وبهوک | ✅ فقط بله/خیر — URL می‌تواند توکنِ مسیر داشته باشد |
| تفکیکِ unknown/stale/failed | ✅ با ترتیبِ `ok < stale < unknown < failed` |
| مهارِ ایزولهٔ خطا | ✅ هر شاخص try/catchِ خودش |
| تفسیرِ درستِ `entitlements.source` | ✅ `{prefix}:{authority}` نه `payments.id` |
| تفکیکِ صادقانهٔ Production/Preview | ✅ **هشدارِ صریح اضافه شد** |

موردِ آخر افزودهٔ همین گام بود: اسکوپ‌های محیطیِ Vercel از هم جدا هستند، پس
اپراتوری که `/admin/health` را روی Preview سبز می‌بیند نباید نتیجه بگیرد
Production سالم است — همان استنتاجِ غلطی که در تشخیصِ `B-024` عمداً از آن
پرهیز شد. هیچ داشبوردی حذف نشد.

### گام ۲ — `G2-007` ✅ merged (`581035d2`)

`B-016` و `B-027` هر دو **دستی** پیدا شده بودند و دومی در ممیزیِ اول دیده نشد.
`lib/core/cadence.test.ts` با پنج تست همان درفت را ماشینی کرد.

**گارد راستی‌آزمایی شد:** با برگرداندنِ عمدیِ متنِ قدیمی، تست مردود شد و
`Capabilities.tsx:51` را نام برد؛ پس از برگرداندن دوباره سبز شد.

چهار مفهومِ جداشده در `PRODUCTION-ARCHITECTURE` §۳: عمرِ کش · تازه‌سازیِ
ترافیک‌محور · cronِ زمان‌بندی‌شده · آخرین اجرای موفقِ واقعی.

هیچ زمان‌بندی‌ای تغییر نکرد. `B-017` بسته شد.

### گام ۳ — مینی‌اپ PR #3 ✅ merged (`8cd1e023`)

۲۴ تست روی همهٔ حالت‌های شکست. **اولین CIِ این مخزن** اضافه شد — قبلاً
**هیچ** workflowی نداشت، یعنی هر PR با صفر راستی‌آزماییِ خودکار merge می‌شد.

اجرای اولِ CI **مردود شد** و درست مردود شد: `cache: npm` لاک‌فایل می‌خواهد و
این مخزن **هیچ لاک‌فایلِ کامیت‌شده‌ای ندارد**. گزینه حذف شد و یافته ثبت شد:
نصب در این مخزن **بازتولیدپذیر نیست**. اصلاحش تغییرِ جداگانه‌ای است.

### وضعیتِ Gate 2 — همچنان `PARTIALLY_READY`

| WP | وضعیت |
|---|---|
| `G2-001` package manager | ✅ merged |
| `G2-003` نمای سلامت | ✅ merged |
| `G2-007` صداقتِ زمان‌بندی | ✅ merged |
| `G2-008` صداقتِ ادعاها | ✅ merged (`B-028` محتوا با ARASH) |
| `G2-006` مینی‌اپ | ✅ merged · **ولی مسیرِ لید عملیاتی نیست** |
| `G2-002` service role | ⚠️ تشخیص شد، **رفع نشد** — اقدامِ اپراتور |
| `G2-005` پرداخت | ⏸ **`HOLD_BY_OWNER`** — PR #91 باز و دست‌نخورده |
| `G2-009` branch protection | ❌ اقدامِ انسانی |
| `G2-004` بازبینیِ PR #75 | ⏸ در دامنهٔ توقفِ پرداخت |

### موارد باز — هیچ‌کدام با شواهد بسته نشد

اسکوپِ service-role در Production · branch protection · پروژهٔ staging ·
migrationِ لید · تستِ سرتاسرِ لید · پرداخت/دسترسی · **شواهدِ اجرای واقعیِ
زمان‌بندی‌شده**.

⚠️ دربارهٔ آخری: زمان‌بندی **پیکربندی‌شده** است ولی هیچ اجرای موفقِ تاریخ‌داری
مشاهده نشد. نگهداریِ لاگِ Vercel کوتاه‌تر از آن است، و طبقِ قیدِ
«No SQL execution» هیچ پرس‌وجویی — حتی فقط‌خواندنی — اجرا نشد.

**Gate 2 PASS اعلام نمی‌شود.**

