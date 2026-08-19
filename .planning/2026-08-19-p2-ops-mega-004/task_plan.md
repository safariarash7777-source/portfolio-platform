# P2-OPS-MEGA-004 — Task plan (as executed)

## Capability boundary, declared before work started

Three of the six waves need capabilities this session does not have. Recorded up
front so nothing is later reported green on inference:

- **Vercel MCP is unauthenticated** and this session is non-interactive → OAuth
  cannot be run here.
- **`*.vercel.app` is blocked by the egress proxy** (`CONNECT tunnel failed, 403`)
  → no HTTP smoke test, no anonymous page fetch.
- **The backup needs Arash's Windows machine and the production connection
  string**, which is never requested in chat.

Everything not gated on those was executed.

## Waves

| Wave | Plan | Outcome |
|---|---|---|
| 0 Ground truth | live GitHub + Supabase queries, before-state table | ✅ done; brief's facts all confirmed |
| 1 Vercel config | diagnose, fix, redeploy, smoke-test | ⚠️ diagnosis + bundle-leak proof done; fix/redeploy/smoke ⛔ |
| 2 Backup | audit vs official docs, fix tooling, run it | ⚠️ audit + 3 fixes shipped (PR #114); run ⛔ |
| 3 Migration graph | dependency matrix + rehearsal | ✅ done, with negative tests |
| 4 Activation | apply to Production | ⛔ correctly not attempted — precondition unmet |
| 5 E2E | payment + lead + runtime health | ⛔ needs Wave 1 + Wave 4 |
| 6 Governance | PR cleanup, ledger, gate handoff | ⚠️ evidence recorded; PR closures deferred (see below) |

## Deliberate non-actions

- **No Production SQL.** Read-only queries only. The mission's own hard stop.
- **PR #113 not merged.** Awaiting Codex's independent review, and `phase24` must
  reach Production before the code that calls `finalize_paid_access` deploys.
- **PR #75 / #91 not closed.** The mission permits closing them only *after* their
  replacement is merged and proven. #113 is neither. Closing now would lose the
  comparison while the replacement is still unproven.
- **PR #74 untouched**, per instruction.
- **No branches deleted.**
- **No secret requested, displayed, or written** anywhere.

## Dependency-safe deployment rule for PR #113

`finalize_paid_access` must exist in Production **before** the application code that
calls it. Sequence:

1. backup verified (Gate 2)
2. `phase24` applied to Production and its DB contract passes
3. only then merge #113 → auto-deploy

Merging #113 first would leave every payment falling into `access_pending`.
