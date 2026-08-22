# P2-OPS-MEGA-005 — Wave 0 live baseline

Read-only. Nothing external was changed in this wave.

## Git (live, re-fetched — not trusted from history)

| item | value |
|---|---|
| `origin/main` | `a5d1ce2921405d03262937d52c23485d76bef6fb` |
| PR #113 head | `54af488429789810c30dc7838f58b1f7679d025c` · branch `claude/portfolio-pr-76-77-review-bipez7` |
| PR #113 base | `main` @ `a5d1ce2` · draft `true` · merged `false` · `mergeable_state: clean` |
| PR #114 head | `31a4fd28d840ee5a684c7ebca8c65f1801bac78b` · branch `claude/backup-structural-verify` |
| PR #114 base | `main` @ `a5d1ce2` · draft `true` · merged `false` · `mergeable_state: clean` |

CI on PR #113 `54af488`: all 6 checks success, Supabase Preview skipped.

## Supabase projects (confirmed against the live API)

| role | ref | status | engine |
|---|---|---|---|
| Production | `uooeygybrniptzdxuzhj` | `ACTIVE_HEALTHY` | PG 17.6.1.104 |
| Staging | `oqjcvkzyvhqnphopedpn` | `INACTIVE` (paused) | PG 17.6.1.147 |

Both refs match the values named in the mission. Staging being paused matters for
any wave that wanted to rehearse there.

## Capability probe — what this container can and cannot do

| capability | state | consequence |
|---|---|---|
| GitHub MCP | available | PR read/write OK |
| Supabase MCP | available | read-only introspection OK |
| Vercel MCP | **unauthenticated** | Wave 5 cannot run here |
| Docker daemon | **absent** (`/var/run/docker.sock` missing; client 29.3.1 present, no server) | no containers of any kind |
| Supabase CLI | reachable via `npx supabase@2.115.0` | **but `supabase start` requires Docker** → no isolated Supabase-local stack |
| Windows PowerShell 5.1 | **absent** | cannot parse or invoke `.ps1` on the runtime the owner actually uses |
| PowerShell 7 (`pwsh`) | **absent** | cannot even do the weaker PS check the previous PR claimed |
| local Postgres | `psql`/`pg_dump` 16.13, runs as user `postgres` on port 5433 | real-Postgres integration tests OK |

### What this means, stated plainly

Comment `5343512816` items 1 (PowerShell 5.1 execution) and 3 (isolated Supabase-local
restore target) **cannot be proven in this environment.** Not "hard" — impossible: there
is no PowerShell runtime and no container runtime. Any claim to the contrary would be the
exact failure mode Command Center is blocking the PR for.

## Blocking comments read in full

- PR #113 `5342481901` — 6 findings, addressed in `54af488` (answered in `5343331743`).
- PR #113 `5353309329` — 3 new findings on the corrected head. **Open. Wave 1 target.**
- PR #114 `5343512816` — 6 findings + 9-item acceptance gate. **Open. Wave 2 target.**

## Verified against the code, not the comment text

Both `5353309329` findings reproduce on the current head:

- `sql/phase24_payment_entitlement.sql:196` — `create_webinar_payment` rejects only
  `payment_status = 'paid'`; a non-null `payment_id` is overwritten with no check.
- `sql/phase24_payment_entitlement.sql:398-402` — both `create_payment(integer,text,text)`
  and `create_webinar_payment(uuid,integer,text)` carry `GRANT EXECUTE … TO authenticated`
  while taking `p_amount` from the caller.
- `app/api/webinars/payment/route.ts:103` — the `audit_log` insert is awaited but its
  result is discarded.

Command Center is right on all three.
