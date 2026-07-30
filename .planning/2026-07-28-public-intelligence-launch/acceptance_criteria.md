# Acceptance Criteria — Gates 1 → 7

**Last updated:** 2026-07-30 (mission `P2-G2-010` — truth reconciliation; lead DB gate hardened)
**Baseline:** `7ad084eb54f4e2d5c274d4df2bdbe571d2b09b8c`

> A gate is PASS only when **every** box is ticked with **real evidence**.
> Fabricated, sample or assumed data can never satisfy a criterion.
> "code merged" ≠ "deployed" ≠ "operational" ≠ "proven".

---

## Gate 0 — Baseline Stabilization ✅ COMPLETE

- [x] PR #84 merged (`1acc18e`) and PR #85 merged (`def602f`)
- [x] CI green on new main · Vercel green on new main
- [x] Full route inventory · DB tables catalogued · data sources mapped · cron health checked
- [x] Payment → Entitlement gap documented
- [x] Placeholder issues identified · package manager gap documented · LLM absence confirmed
- [x] No code changes · no migrations executed · no production changes

---

## Gate 1 — Product Rebaseline  ✅ COMPLETE

Closed 2026-07-29 by `DD-025` — Arash's explicit approval. PR #86 squash-merged into `main`.

- [x] `PRODUCT-BLUEPRINT.md` **rewritten** (not patched) around the intelligence product
- [x] Old "complete home for the retail investor" and "free floor for 7 needs" retired as
      the primary destination — recorded as `SUPERSEDED`, **not deleted**
- [x] Existing market / quant / relay assets **preserved and reclassified**, none discarded
- [x] `DECISION-LOG.md`: no ID deleted · no duplicate ID · every superseded row mapped to a successor
- [x] `COMMAND-CENTER.md`: SHA recorded · Gate 1 recorded **COMPLETE** · Gate 2 recorded **ACTIVE**
- [x] Built / Deployed / Operational / Proven distinguished explicitly
- [x] Mini App decoupled from the Portfolio product-definition gate
- [x] Service-role error, payment, entitlement, lead and PR #75 all remain **open**
- [x] No claim that lead or payment is operational
- [x] Path to launch understandable at a glance
- [x] Diff is documentation + planning only · no feature · no migration · no lockfile
- [x] PR held **draft** through Command Center review; taken out of draft only at merge

### Added during review, on Arash's own commit `bdd8802e`

- [x] **Dual destination** recorded — internal leverage for Arash **and** a different
      experience for the audience/customer (`PRODUCT-BLUEPRINT` §1′)
- [x] **Three experience levels** — public · member (Masir-e Rah / webinar) · private client,
      all reading from **one engine and one memory** (§3′)
- [x] **Business loop** recorded — data/news → analysis → Arash's judgement → product →
      customer → feedback/track record, and every product must attach to it
- [x] Commercial decisions **not** closed by this approval — `D-021`…`D-024` still `OPEN`

## Gate 2 — Operational Foundation  🔵 ACTIVE

Nine work packages. A gate is PASS only when every package has an owner and a result.

### `G2-001` — Package manager normalization ✅ DONE
- [x] Single package manager (npm) chosen and enforced; second lockfile removed in its own PR.
      Verified 2026-07-30: `git ls-files` shows **only** `package-lock.json`, and a CI guard
      fails the build if a pnpm/yarn lock ever returns to the git tree
- [x] `packageManager: npm@10.9.7` present, plus `engines.node >= 20`
- [x] A PR that deliberately added three dependencies deployed **green on Vercel** — closes `B-023`

### `G2-002` — Production Service Role repair
- [ ] `SUPABASE_SERVICE_ROLE_KEY` corrected in Production, with evidence — **no secret value ever printed**
- [ ] Telegram sync runs successfully again (real, dated run)
- [ ] Webinar admin paths reachable again (closes `B-024`)

### `G2-003` — System health view
- [ ] Existing `/api/admin/health` **extended, not replaced**
- [ ] Shows: version/commit, DB reachability, market-snapshot freshness, relay freshness
- [ ] Shows **last successful run** per scheduled service (`B-009`, `B-010`)
- [ ] Honest limits: anything not independently verifiable is labelled self-reported
- [ ] Visible from the admin surface — this is the seed of Desk area 5

### `G2-004` — Fresh review of PR #75 / webinar payment security
- [ ] PR #75 reviewed line by line against **current** `main`; **not merged directly** (stale base)
- [ ] Still-valid findings re-implemented on a fresh branch
- [ ] Webinar payment failure reproduced and fixed (`B-026`)
- [ ] `D-009` answered by Arash

### `G2-005` — Payment → Entitlement
- [ ] `D-024` answered by Arash in writing: product → access level → duration
- [ ] Bridge implemented **with regression tests**; idempotent and replay-safe
- [ ] **No real payment executed** at any point
- [ ] Closes `B-025`

### `G2-006` — Lead migration, staging, end-to-end
- [ ] `D-001` answered by Arash
- [x] `sql/phase8b_leads.sql` applied to **staging** per the runbook — staging project
      `oqjcvkzyvhqnphopedpn`, isolated from Production `uooeygybrniptzdxuzhj`.
      Verified: table present · RLS on · 2 policies · 5 indexes · 4 constraints ·
      `updated_at` trigger fires · `anon` has no privilege
- [x] **Least-privilege defect found and corrected before Production** — the measured
      grant set gave `authenticated` `TRUNCATE`/`INSERT`/`DELETE`, and **RLS does not
      apply to `TRUNCATE`**. Security Advisor did not catch it. Guarded by
      `lib/leads/grants.test.ts`
- [x] `PLATFORM_WEBHOOK_SECRET` identical in both staging services; webhook **does not**
      return 401 — authentication proven by reaching `db_insert_failed` instead
      (`B-020` behaviour reproduced and cleared on staging)
- [x] Mini App half proven on staging: MySQL row is authoritative and survives webhook
      failure · exactly one outbound attempt · non-2xx logged as failure (`B-019`) ·
      no name/phone/message/secret in either service's logs
- [x] Controlled failure rehearsed: wrong staging secret → 401, lead retained, recovery
      on restore. Three observable states (401 / 500 / success) are distinguishable
- [x] **RLS and grant behaviour proven against a real Postgres, in CI, with no network** —
      `lib/leads/leads.integration.test.ts` + `sql/test/supabase_bootstrap.sql` reproduce
      Supabase's roles and default privileges, apply the real migration, and assert:
      `anon` denied outright · plain `authenticated` user sees **0 rows** (RLS) and cannot
      `TRUNCATE`/`INSERT`/`DELETE` · admin sees rows · constraints and trigger correct.
      The final test deliberately builds the **pre-fix** migration and shows a plain user
      *can* wipe the table — so the guard is proven non-vacuous. CI job `Lead RLS · Grants
      (Postgres)`, required via `CI Gate`
- [ ] **Synthetic lead does NOT yet reach `public.leads` end-to-end** — the final hop is
      unproven. Blocked by environment, not by code: the Staging service-role key is not
      obtainable through available tooling, and the sandbox network policy denies
      `*.supabase.co`, `api.supabase.com`, `api.vercel.com` and `*.vercel.app`.
      `B-001`, `B-002`, `B-003` stay **open**. Note this is now the *only* unproven part:
      the database-behaviour half moved from "measured once on staging" to "enforced on
      every PR"

### `G2-007` — Cron schedule vs. public claims ✅ DONE (with one honest limit)
- [x] `vercel.json` established as the single source of truth for cadence
- [x] Code comment claiming "every 5 minutes" corrected (`B-016` closed)
- [x] Public cadence claims match reality — the audit found a **second** instance
      (`Capabilities.tsx`) the first pass missed (`B-027` closed)
- [x] Machine-checkable guard `lib/core/cadence.test.ts`, proven able to fail
- [ ] ⚠️ **Makes no claim that cron actually runs.** No dated successful run has been
      observed, so real execution stays `UNVERIFIED` — a separate question from cadence honesty

### `G2-008` — Unprovable claims and placeholders
- [x] `ProductFacts` shows only numbers provable from the product itself
- [x] `/learn` **display** resolved (`P2-G2-010`): unpublished lessons are no longer
      clickable cards leading to empty pages, and their detail pages are `noindex`.
      **No draft was deleted** and the behaviour is driven by the `published` flag, so it
      reverts by itself on publication. Guarded by `lib/learn.test.ts`
- [ ] **Publishing the content itself stays with Arash** — `B-028` remains open on content
- [ ] Any sample data anywhere carries an explicit «نمونهٔ نمایشی» badge

### `G2-009` — Branch Protection and Release Gate
- [ ] Branch protection **enabled** on `main` per `RUNBOOK-branch-protection.md` (`B-015`)
- [ ] Required check is `CI Gate` only — not `Vercel`, not `Supabase Preview` (skipped never passes)
- [ ] Release gate documented

### Gate 2 exit
- [ ] **No operational P1 left without a plan and an owner**
- [ ] Payment, lead and access all exercised **on staging**
- [ ] Health and freshness **visible**
- [ ] **No false public claim remains**
- [ ] No production change without explicit Arash approval

> **Boundary with Gate 6 — deliberately not duplicated.** Gate 2 makes health *visible*
> (`G2-003`) and turns branch protection *on* (`G2-009`). Gate 6 requires something
> different: thresholds, alerting, proven stale-data behaviour, and proof the gate is
> still enforced.

## Gate 3 — Manual Intelligence Workflow  (Arash must pass this)

Seven work packages. **Arash Desk is architecturally approved (`DD-024`) but does not
enter execution until Gate 2 risks are cleared.**

### `G3-001` — Intelligence data model
- [ ] Event · evidence · analysis · scenario · effect modelled
- [ ] Append-only where history matters; corrections recorded, never erased
- [ ] Every claim can carry `FACT` / `INFERENCE` / `SCENARIO` and a source

### `G3-002` — Arash Desk MVP
- [ ] Five internal areas present: Today · Market Intelligence · Decisions & Scenarios · Clients & Products · Operations & System Health
- [ ] Built as an **aggregation layer over existing engines**, not new engines
- [ ] **No existing dashboard removed** — radar, FX, terminal, codal, portfolio, analyses, content all still reachable
- [ ] Admin overview evolves toward the Desk **gradually**, not in one cut

### `G3-003` — Manual Daily Brief
- [ ] Arash can compose and publish a brief without engineering help
- [ ] Draft → review → publish flow works end to end

### `G3-004` — Scenario Board
- [ ] Regime changes and scenarios visible and editable
- [ ] Assumptions explicit; ranges not single price targets

### `G3-005` — Approval Inbox
- [ ] Drafts queue for Arash; nothing sensitive publishes without his approval (`DD-023`)

### `G3-006` — Reference portfolio linked to events and scenarios
- [ ] Effect of an event on the reference portfolio expressible and recorded
- [ ] Weight changes append-only with a stated reason

### `G3-007` — Private rehearsal
- [ ] **≥10 real working days** of internal daily workflow, dated and recorded
- [ ] Daily brief achievable on **≥80%** of working days
- [ ] Arash's minutes-per-brief measured, and trending down
- [ ] Draft correction rate recorded
- [ ] **≥5–10 real analyses** exist in the track record
- [ ] Open vs closed positions labelled correctly

### Gate 3 exit
- [ ] Arash can produce a brief on ≥80% of working days
- [ ] ≥5–10 real analyses recorded
- [ ] Production time and correction rate measured
- [ ] **PASS may NOT be declared with sample or fabricated data**

## Gate 4 — Assisted Intelligence

Seven mandatory criteria — all required:

- [ ] **Source and visible evidence** attached to every claim
- [ ] **Confidence** stated explicitly
- [ ] **Fact / Inference / Scenario** separated and labelled
- [ ] **Human approval** required before publication
- [ ] **Corrections recorded** after publication; history never erased
- [ ] **No automatic publication of sensitive analysis** (`DD-023`)
- [ ] **Output traceability** — which input, which model/version, when

### Scope — exactly one agent

**`Research & Market Monitoring Agent`** — no second agent in this gate.

Duties: gather news and events · extract evidence · separate Fact/Inference/Scenario ·
produce a draft · propose probable effect on markets and the reference portfolio ·
record confidence · send to the Approval Inbox.

Forbidden:
- [ ] Automatic publication of sensitive analysis
- [ ] **Direct buy/sell recommendation**
- [ ] Erasing correction history
- [ ] Using a source without recording it
- [ ] Making the final decision in Arash's place

Prerequisites: `D-022` (approved news sources) and `D-023` (LLM access path under
sanctions and network constraints) both answered by Arash. Existing repo rules still
bind: raw financial numbers never reach an LLM — only `qualitativeMask`.

## Gate 5 — Public Intelligence Experience

- [ ] Homepage redesigned around **Arash's persona and analytical method**
- [ ] Daily / Weekly Intelligence displayed
- [ ] Linked to track record, notes and market pages
- [ ] Homepage is the intelligence desk, visible on a Preview deployment
- [ ] Mobile and RTL healthy
- [ ] **No fabricated data**; any sample explicitly badged
- [ ] No public placeholder (`/learn` resolved either way)
- [ ] All links healthy
- [ ] Stale data carries a freshness indicator
- [ ] Failure states honest — no silently empty section
- [ ] **SEO of existing market/symbol pages preserved** — no redirect without a Search Console check
- [ ] `D-019`, `D-020`, `D-021` answered
- [ ] Arash's explicit approval of image, tone and order

## Gate 6 — Compliance, Security & Reliability

Ten mandatory criteria:

- [ ] **Payment and entitlement** — bridge proven, idempotent, replay-safe
- [ ] **Security and RLS** — every table verified; service-role never reachable client-side
- [ ] **Language Guard** — vocabulary contract green **and its scope reviewed**: today
      `lib/core/vocab.test.ts` bans only «توصیه» and «سیگنال» across `app/` + `components/`,
      while `CLAUDE.md` claims a wider ban. Close the gap or correct the claim.
- [ ] **Privacy** — no personal data in logs; retention stated
- [ ] **Observability** — health endpoint, data freshness, last successful cron
- [ ] **Error and stale-data behaviour** — defined and tested
- [ ] **Rollback** — tested, not merely documented
- [ ] **Revenue-path tests** — registration, payment, entitlement, access
- [ ] **Migration rehearsal** — green before any production migration
- [ ] **Branch protection** — enabled per `RUNBOOK-branch-protection.md`, or its absence
      explicitly accepted in writing

## Gate 7 — Controlled Public Launch

- [ ] Every P0 closed
- [ ] Every launch-related P1 closed **or** risk accepted in writing by Arash
- [ ] Daily workflow proven (Gate 3 evidence)
- [ ] ≥5–10 real analyses published
- [ ] Open and closed analyses correctly labelled
- [ ] Approved news sources in use
- [ ] Language Guard green
- [ ] CI gate mandatory, or its status explicitly accepted
- [ ] Vercel green · migration rehearsal green · rollback tested
- [ ] No fabricated data or placeholder on any main path
- [ ] Arash's final approval of the homepage
- [ ] **Arash's explicit approval of the Production cutover**
