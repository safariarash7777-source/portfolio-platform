# P2-OPS-MEGA-004 — Acceptance criteria, judged from evidence

Legend: ✅ proven · ⛔ blocked by a capability this session lacks · ⚠️ partial

## Gate 0 — `LIVE_BASELINE_VERIFIED` ✅

| Criterion | Status | Evidence |
|---|---|---|
| clean checkout, no dirty backup dir | ✅ | `git status --porcelain` empty |
| exact main SHA | ✅ | `a5d1ce2921405d03262937d52c23485d76bef6fb` |
| all open PRs recorded | ✅ | 5 PRs, F-1 |
| Supabase live-queried | ✅ | F-2, F-3, F-4 |
| Vercel live-queried | ⛔ | MCP unauthenticated |
| before-state table | ✅ | F-3 |

Every last-known fact in the brief was **confirmed**, none stale.

## Gate 1 — `SERVER_RUNTIME_CONFIG_PROVEN` ⛔

| Criterion | Status | Evidence |
|---|---|---|
| root cause of the three failing routes | ✅ | error string in logs is verbatim `lib/supabase/admin.ts:11`; it is a **missing secret**, not an app defect |
| service role never in browser bundle | ✅ | 114 files in `.next/static/` — zero `SUPABASE_SERVICE_ROLE_KEY`, zero `service_role`, **zero JWT-shaped strings** |
| no `NEXT_PUBLIC_*` carries a service key | ✅ | 10 public vars enumerated; none is a service key |
| read/set the Vercel env var | ⛔ | Vercel MCP unauthenticated |
| redeploy from intended SHA | ⛔ | same |
| smoke-test the three routes | ⛔ | proxy returns `CONNECT tunnel failed, 403` for `*.vercel.app` |
| inspect runtime logs after fix | ⛔ | same |

**Exact missing capability:** an authenticated Vercel connector for this session,
**and** outbound HTTPS to `*.vercel.app`. Both are environment grants, not repo changes.

## Gate 2 — `BACKUP_RESTORE_VERIFIED` ⛔ (tooling improved, run not performed)

| Criterion | Status | Evidence |
|---|---|---|
| audit scripts against current CLI docs | ✅ | dump commands match docs exactly |
| fix tooling where wrong | ✅ | **PR #114** — 3 real defects, see below |
| run dump + restore + reconcile | ⛔ | requires Arash's machine + connection string (never requested in chat) |

Defects fixed in PR #114:
1. verification compared **row counts only** — a restore losing every policy/trigger/function would pass
2. restore error count was **computed, printed, never acted on**
3. data restore lacked `session_replication_role = replica` (docs prescribe it)

## Gate 3 — `MIGRATION_REHEARSAL_GREEN` ⚠️ (green on a schema-equivalent DB, not a Production restore)

| Criterion | Status | Evidence |
|---|---|---|
| dependency/reversibility matrix | ✅ | F-7, each row **proven** by a negative test |
| rehearse exact sequence | ✅ | F-8 — all 6 applied, every postcondition PASS |
| tests after each step | ✅ | `test:db` 212 pass / 0 fail |
| consult current Supabase docs | ✅ | dump/restore guide + `db dump` CLI reference |
| recommended order (not filename order) | ✅ | `8b → 20 → 21 → 22 → 24 → 23` |
| rehearse against a **restore of Production** | ⛔ | depends on Gate 2 |

## Gate 4 — Production activation ⛔ **correctly not attempted**

Blocked by its own stated precondition: `BACKUP_RESTORE_VERIFIED` is not green.
**No SQL was executed against Production.** Read-only queries only.

## Gate 5 — E2E ⛔

Payment and lead E2E both require HTTP access to the deployed app plus the
migrations being live. Two independent blockers. Additionally `webinars = 0` in
Production, so a webinar purchase has nothing to buy.

## Owner decisions required (exact, minimal)

**D-1 — Migration scope.** Approved scope is `8b → 21 → 23`. The objective needs more:

| Migration | Needed for | Approved? |
|---|---|---|
| `phase20` | Arash Desk data structures (objective 5) | ❌ |
| `phase22` | Desk workflow; **hard-depends on phase20** | ❌ |
| `phase24` | payment→entitlement (objective 4) | ❌ (and lives only on PR #113) |

> Approve `phase20`, `phase22`, `phase24` for Production in the order
> `8b → 20 → 21 → 22 → 24 → 23`? (yes / partial / no)

**D-2 — Entitlement duration.** `ENTITLEMENT_MONTHS` is 3 for both products,
inherited from a design comment, never decided. Confirm 3 months, or state the value.

**D-3 — Webinar content.** Production has zero webinars. A webinar E2E needs one real
webinar row. Content decision, not ops.

**D-4 — Vercel access.** Authorise the Vercel connector (claude.ai → connector settings)
or perform Wave 1 manually. Until then the three routes stay broken in Production.
