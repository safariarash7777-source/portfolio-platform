# P2-OPS-MEGA-004 — Progress log

| # | Action | Result |
|---|---|---|
| 1 | `git fetch origin --prune` | main `a5d1ce2`, tree clean |
| 2 | `list_pull_requests` | 5 open; #113 base is current main |
| 3 | `list_projects` | prod `ACTIVE_HEALTHY`; staging **INACTIVE** |
| 4 | Production before-state query (read-only) | 41 tables, 0 w/o RLS, leads/cron_runs/intel_* absent, anon TRUNCATE 40 |
| 5 | `list_migrations` | 29 applied; 8b/20/21/22/23/24 **absent** — confirmed |
| 6 | `curl https://portfolio-platform-fawn.vercel.app/` | `CONNECT tunnel failed, 403` → Wave 1/5 blocked |
| 7 | migration hash comparison main vs #113 | 5 approved files **byte-identical**; phase24 PR-only |
| 8 | Production object inventory | 41/63/103/32/48/348; **366 dangerous grants** |
| 9 | rebuilt rehearsal baseline (19/22 files applied) | 40 tables vs 41 — fidelity measured, 3 deltas explained |
| 10 | rehearsal ORDER A (8b→20→21→22→24→23) | all APPLIED, all postconditions PASS |
| 11 | rehearsal ORDER B (23 before 24) | identical end state → the two are order-independent |
| 12 | N1 phase22 without phase20 | **FAILED** — `relation "public.intel_analyses" does not exist` |
| 13 | N2 phase24 without phase11 | **FAILED** — `relation "public.entitlements" does not exist` |
| 14 | N3 phase23 first | 0 dangerous grants → **suspected false negative** |
| 15 | N3 re-run with legacy default privileges | **3 dangerous grants reappear** → phase23-last CONFIRMED |
| 16 | idempotency: re-run all 6 on completed DB | all APPLIED, dangerous grants still 0 |
| 17 | `test:db` against rehearsed DB | 212 pass / 0 fail / 0 skipped |
| 18 | mapped `createAdminClient` consumers | 17 routes/libs; error string matches `admin.ts` verbatim |
| 19 | built and scanned `.next/static/` | 114 files, **zero** service-role or JWT strings |
| 20 | Supabase docs: dump/restore + `db dump` CLI ref | our 3 dump commands match exactly |
| 21 | audited restore half | 3 real defects found |
| 22 | fixed both scripts + extended guards 13→16 | PR **#114** (draft) |
| 23 | failability check on both new guards | both proven red when protection removed |
| 24 | `test:core` | 534 pass / 0 fail |

## Corrections made to my own work

- **Step 14 → 15.** I nearly recorded "phase23-last is unnecessary". The measurement
  was taken in an environment without `ALTER DEFAULT PRIVILEGES`, so it was measuring
  the wrong thing. Re-run under the repo's legacy-privileges profile reversed the
  conclusion. Recorded because the near-miss is the useful part.
