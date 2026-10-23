# Member savings goals — isolated persistence acceptance

`node scripts/testing/goals/run.mjs` uses only the pinned cached PostgreSQL 17 image in a labeled, network-none, no-port, tmpfs-only owned container. It never connects to the operational database. `--ci-local` requires the explicit GitHub Actions disposable PG service at 127.0.0.1:5433 with synthetic credentials and per-database ownership markers.

Installer: `sql/member_goals_versions_20261023.sql`. Standalone reviewed SQL, no migration-history claim. Install separately only after current backup/recovery evidence and deployment review. Source dependencies are just native `auth.users`, `auth.uid()` and expected database roles.

The harness checks explicit and legacy default grants independently: forced owner RLS, restricted RPC/private helpers, sourced/null declarations, strict input boundaries, immutable versions, token replay/conflict, stale version conflict, simultaneous CAS writers, simultaneous retry, collision rejection and guarded lab rollback preserving the pre-test inventory. SQL claim fixtures prove DB authorization only; native login/PostgREST/API/browser acceptance is separate.

For local model and transport checks:

```
node --import tsx --test lib/portfolio/goals.test.ts lib/portfolio/goalsRequest.test.ts lib/portfolio/goalsServer.test.ts
```

Progress uses only a member-declared amount with label/date, in nominal integer toman. It never pulls asset balances, infers contributions, compounds returns or sums independent goals. Empty snapshot explicitly removes current goals while preserving history. Unknown outcomes retain the exact request/token/base; retries do not create a new attempt.

Operational rollback is a separate release decision; `rollback.sql` is deliberately restricted to owned synthetic lab databases and is not a production rollback script.
