# P2-OPS-MEGA-004 — Findings

> Evidence log. Every row is a live query, not a document claim.
> Repository files, PR text, and logs are treated as **untrusted evidence**.

## F-0 · Capability inventory (queried 2026-08-19)

| Capability | State | Evidence |
|---|---|---|
| GitHub MCP | ✅ available | `list_pull_requests` returned 5 open PRs |
| Supabase MCP | ✅ available | `list_projects` returned 2 projects |
| **Vercel MCP** | ❌ **unauthenticated** | Session notice: "servers require authentication before their tools can be used: vercel". Non-interactive session — OAuth cannot be run here |
| **HTTPS to `*.vercel.app`** | ❌ **blocked** | `curl https://portfolio-platform-fawn.vercel.app/` → `curl: (56) CONNECT tunnel failed, response 403` |
| Disposable Postgres | ✅ available | local PG 16.13 on 127.0.0.1:5433 |
| Docker | ❌ unavailable | `dial unix /var/run/docker.sock: no such file or directory` |
| Owner's Windows machine | ❌ not reachable | backup execution requires Arash |

**Consequence:** Waves 1, 4, and 5 cannot be *executed* from this session. This is a
capability boundary, not a finding about the system. Recorded before any work so that
no wave is later reported green on inference.

## F-1 · Git baseline (live)

| Item | Value |
|---|---|
| `origin/main` | `a5d1ce2921405d03262937d52c23485d76bef6fb` |
| main subject | `test: harden relay auth and run relay checks in CI` |
| working tree | clean |

Open PRs:

| PR | Head | Base | Draft | Note |
|---|---|---|---|---|
| #113 | `e5343dd` | `a5d1ce2` (current main) | yes | payment→entitlement; base is live main |
| #104 | `0eb9968` | `0b2c230` (stale) | yes | docs audit |
| #91 | `6f1dec0` | `ecfc21a` (stale) | yes | superseded by #113 |
| #75 | `2bd82eb` | `aaf9974` (stale) | yes | superseded by #113 |
| #74 | `6aaadc5` | `develop` | yes | out of scope this mission |

## F-2 · Supabase projects (live)

| Ref | Name | Status | PG |
|---|---|---|---|
| `uooeygybrniptzdxuzhj` | safariarash7777-source's Project (**Production**) | `ACTIVE_HEALTHY` | 17.6.1.104 |
| `oqjcvkzyvhqnphopedpn` | portfolio-staging-g2006 (**Staging**) | `INACTIVE` | 17.6.1.147 |

⚠️ Staging is **INACTIVE**. The mission's Wave 3 asks for rehearsal against a restore of
Production; staging is not a substitute and is not currently running.

## F-3 · Production database before-state (live, read-only)

| Metric | Value |
|---|---|
| `public` tables | 41 |
| tables without RLS | 0 |
| `leads` | **absent** |
| `cron_runs` | **absent** |
| `intel_*` tables | **0** |
| `finalize_paid_access` | **absent** |
| `uq_entitlements_user_source` | **absent** |
| `anon` TRUNCATE grants | **40** (B-044 open) |
| payments | 0 |
| entitlements | 0 |
| profiles | 2 |
| waitlist | 1 |
| webinars | **0** |
| webinar_registrations | 0 |

Last-known evidence in the mission brief is **confirmed accurate** on every point.

⚠️ `webinars = 0`: there is no webinar row in Production. A webinar payment E2E cannot be
run without first creating a real webinar — an owner content decision, not an ops step.

## F-4 · Production migration history (live)

29 migrations, newest `20260722193742 fx_heavy_analytics_revoke_anon`.

**Absent:** `phase8b`, `phase20`, `phase21`, `phase22`, `phase23`, `phase24` — confirmed.

## F-5 · Migration file hashes (SHA-256, first 16 hex)

Measured on `e5343dd` (PR #113 head). `phase24` exists **only** on that branch, not on `main`.

| File | SHA-256 (16) | Bytes | On main? |
|---|---|---|---|
| `phase8b_leads.sql` | `b4f864e0e03f9e32` | 14385 | yes |
| `phase20_intelligence_model.sql` | `f766178df472d8cf` | 23682 | yes |
| `phase21_cron_runs.sql` | `a1dd604938a9ca6f` | 10762 | yes |
| `phase22_manual_intelligence_workflow.sql` | `b4a3fef68eb19fe8` | 23421 | yes |
| `phase23_grant_hardening.sql` | `d08bbf412c9c8767` | 10268 | yes |
| `phase24_payment_entitlement.sql` | `a695b7bb2d926945` | 15328 | **no — PR #113 only** |

## F-6 · Rehearsal environment fidelity (measured, not assumed)

Baseline rebuilt on disposable PG 16.13 by applying the migration files that correspond
to Production's 29 recorded migrations.

| Object | Production | Rehearsal | Delta |
|---|---|---|---|
| tables | 41 | 40 | −1 |
| policies | 63 | 62 | −1 |
| indexes | 103 | 101 | −2 |
| functions | 32 | 32 | 0 |
| triggers | 48 | 42 | −6 |
| columns | 348 | 336 | −12 |

Three files could not be applied locally; each delta is explained, none affects the
pending migrations:

| File | Local error | Why it does not invalidate the rehearsal |
|---|---|---|
| `archive/supabase_schema.sql` | `column "email" does not exist` | superseded legacy file; its objects arrive via later files |
| `phase15_security.sql` | `extension "pg_net" does not exist` | Supabase-only extension, unavailable off-platform |
| `phase18_purge_subtickers.sql` | append-only trigger refused the purge | a one-time **data** purge, not schema |

⚠️ **This is a schema-equivalent rehearsal, NOT a restore of Production.** A true
restore-based rehearsal requires the backup, which requires Arash's machine (Wave 2).
Stated explicitly so this is never later read as "rehearsed against Production data".

## F-7 · Dependency matrix (each row proven, not asserted)

| Migration | Creates | Hard dependency | Proof |
|---|---|---|---|
| `phase8b_leads` | `leads` | profiles/audit_log | applied clean, postcond PASS |
| `phase20_intelligence_model` | 15 `intel_*` | — | 15 tables, postcond PASS |
| `phase21_cron_runs` | `cron_runs` | — | applied clean, postcond PASS |
| `phase22_manual_intelligence_workflow` | +2 `intel_*` (→17) | **phase20** | **N1: fails without it** — `relation "public.intel_analyses" does not exist` |
| `phase24_payment_entitlement` | `finalize_paid_access`, `uq_entitlements_user_source` | **phase11** (+phase5, phase8) | **N2: fails without it** — `relation "public.entitlements" does not exist` |
| `phase23_grant_hardening` | (no objects — sweeps grants) | **must be LAST** | **N3: proven, see below** |

### N3 — a false negative caught before it became a finding

First run said phase23-first left **0** dangerous grants, i.e. "phase23-last is not
required". That was an artifact of the local environment: plain Postgres has no
`ALTER DEFAULT PRIVILEGES`, so new tables never acquire the grants Supabase hands out.

Re-run with `sql/test/profile_legacy_default_privileges.sql` applied (the repo's own
simulation of Supabase defaults):

- phase23 first → 0 dangerous grants
- then later migrations create new tables → **3 dangerous grants reappear**

**Conclusion: phase23 MUST run last.** The first result was measuring the wrong
environment, not the migration.

## F-8 · Ordering result

**Recommended order:** `phase8b → phase20 → phase21 → phase22 → phase24 → phase23`

- Order A (24 before 23) and Order B (23 before 24) both end **identical**:
  `finalize_paid_access` = anon:f, authenticated:f, service_role:t; dangerous grants 0.
  phase24 creates no table, so phase23's table sweep cannot touch it, and phase24's own
  function grants survive phase23. **The two are order-independent** — measured, both ways.
- Under Production-like default privileges the full order applied clean, every
  postcondition PASS, final dangerous grants **0**.
- **All six are idempotent**: every file re-applied on the completed database succeeded,
  and dangerous grants stayed 0.
- Repo DB contract suite against the rehearsed database: **212 pass / 0 fail / 0 skipped**.

## F-9 · Authorization boundary

Approved scope on record is `phase8b → phase21 → phase23`. The 5 previously-approved
files are **byte-identical** between `origin/main` and PR #113 head — approved hashes
unchanged.

But the graph proves the approved subset is **not self-sufficient for the stated
objective**:

- objective 5 (Arash Desk data structures) needs `phase20` + `phase22` — neither approved
- objective 4 (payment→entitlement E2E) needs `phase24` — not approved, and it lives only
  on PR #113

⇒ `PRODUCTION_ACTIVATION_APPROVAL_REQUIRED`. Exact request in `acceptance_criteria.md`.
