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
