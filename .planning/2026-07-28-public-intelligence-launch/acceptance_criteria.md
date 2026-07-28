# Acceptance Criteria

## Gate 0 — Baseline Stabilization

- [x] PR #85 merged (squash) with correct title
- [x] New main SHA recorded: `def602f5f596c42b1499106e21655cb979075232`
- [x] CI green on new main
- [x] Vercel green on new main
- [x] Full route inventory completed
- [x] All DB tables catalogued
- [x] Data sources mapped
- [x] Cron health checked
- [x] Payment → Entitlement gap documented
- [x] Placeholder issues identified
- [x] Package manager gap documented
- [x] LLM absence confirmed
- [x] No code changes made
- [x] No migrations executed
- [x] No production changes

## Gate 1 — Product Rebaseline & Governance

- [ ] Single PRODUCT-BLUEPRINT.md (rewritten, not patched)
- [ ] Single DECISION-LOG.md (D-018 recorded, D-012–D-016 reviewed)
- [ ] Single live COMMAND-CENTER.md
- [ ] Mini App no longer blocks Portfolio Platform product definition
- [ ] Path to launch is understandable
- [ ] No feature implemented
- [ ] PR is docs-only

## Gate 2 — Operational Foundation

- [ ] Single package manager (npm)
- [ ] Vercel and CI both green
- [ ] Payment → Entitlement has plan and tests
- [ ] Lead pipeline rehearsal-ready
- [ ] No fake claims in public paths
- [ ] No production changes without approval

## Gate 3 — Private Rehearsal (Arash must pass)

- [ ] 2–3 weeks of internal workflow usage by Arash
- [ ] Minimum 10 working days of output recorded
- [ ] Minimum 5–10 real analyses exist
- [ ] Daily production and approval time measured
- [ ] Draft correction rate recorded
- [ ] Daily Brief achievable on ≥80% of working days
- [ ] MANUS may NOT declare PASS with fake data

## Gate 5 — Public Intelligence Experience

- [ ] Homepage on Preview
- [ ] Mobile and RTL healthy
- [ ] No fake data
- [ ] No public placeholders
- [ ] All links healthy
- [ ] Stale data has indicator
- [ ] Honest failure states
- [ ] SEO of previous pages preserved
- [ ] Arash explicit approval on image, tone, and order

## Gate 7 — Public Launch

- [ ] All P0s closed
- [ ] All P1s related to public launch closed or risk accepted in writing
- [ ] Daily workflow proven
- [ ] Minimum 5–10 real analyses
- [ ] Open and closed analyses correctly labeled
- [ ] Approved news sources
- [ ] Language Guard green
- [ ] CI gate mandatory or status explicitly accepted
- [ ] Vercel green
- [ ] Migration rehearsal green
- [ ] Rollback tested
- [ ] No fake data or placeholder in main path
- [ ] Arash final approval on homepage
- [ ] Arash explicit approval of Production Cutover
