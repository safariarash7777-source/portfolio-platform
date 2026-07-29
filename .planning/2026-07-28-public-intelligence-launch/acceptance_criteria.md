# Acceptance Criteria — Gates 1 → 7

**Last updated:** 2026-07-28 (mission `P2-G1-001`)
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

## Gate 1 — Product Rebaseline  🔵 IN_REVIEW

- [ ] `PRODUCT-BLUEPRINT.md` **rewritten** (not patched) around the intelligence product
- [ ] Old "complete home for the retail investor" and "free floor for 7 needs" retired as
      the primary destination — recorded as `SUPERSEDED`, **not deleted**
- [ ] Existing market / quant / relay assets **preserved and reclassified**, none discarded
- [ ] `DECISION-LOG.md`: no ID deleted · no duplicate ID · every superseded row mapped to a successor
- [ ] `COMMAND-CENTER.md`: current SHA recorded · Gate 1 current · Gate 2 recorded as next
- [ ] Built / Deployed / Operational / Proven distinguished explicitly
- [ ] Mini App decoupled from the Portfolio product-definition gate
- [ ] Service-role error, payment, entitlement, lead and PR #75 all remain **open**
- [ ] No claim that lead or payment is operational
- [ ] Path to launch understandable at a glance
- [ ] Diff is documentation + planning only · no feature · no migration · no lockfile
- [ ] PR stays **draft** until Command Center review

## Gate 2 — Operational Foundation

- [ ] Single package manager (npm); second lockfile removed in **its own PR**
- [ ] A PR that deliberately adds a dependency deploys **green on Vercel**
- [ ] `SUPABASE_SERVICE_ROLE_KEY` corrected in Production, with evidence — **no secret value ever printed**
- [ ] Telegram sync runs successfully again (real, dated run)
- [ ] Webinar payment failure reproduced and fixed; PR #75 findings ported after fresh review
- [ ] `D-024` answered by Arash in writing: product → access level → duration
- [ ] Payment → Entitlement bridge implemented **with regression tests**; no real payment
- [ ] Lead: `leads` table exists on staging · synthetic lead succeeds end-to-end
- [ ] `PLATFORM_WEBHOOK_SECRET` identical in both services; webhook returns 200, not 401
- [ ] Truthfulness: no unprovable number on any public path (`B-027`, `B-028`)
- [ ] No production change without explicit Arash approval

## Gate 3 — Manual Intelligence Workflow  (Arash must pass this)

- [ ] Intelligence data model exists (event · evidence · analysis · scenario · effect)
- [ ] Arash Desk MVP usable: event stream · market radar · approval inbox · data freshness · open/closed record
- [ ] **≥10 real working days** of internal daily workflow, dated and recorded
- [ ] Daily brief achievable on **≥80%** of working days
- [ ] Arash's minutes-per-brief measured, and trending down
- [ ] Draft correction rate recorded
- [ ] **≥5–10 real analyses** exist in the track record
- [ ] Open vs closed positions labelled correctly
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

Prerequisites: `D-022` (approved news sources) and `D-023` (LLM access path under
sanctions and network constraints) both answered by Arash. Existing repo rules still
bind: raw financial numbers never reach an LLM — only `qualitativeMask`.

## Gate 5 — Public Intelligence Experience

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
