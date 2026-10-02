# NEXT-06 feed timestamp fixture correction — 2026-10-02

Scope: test-only repair on PR #195 head `a1bf054b07fd982c9471484204ad3a8bca02093e`. Owned paths: `lib/intelligence/publication-feed.integration.test.ts` and this report. Runtime, schema, permissions, migrations and other owners' worktrees are outside this correction.

## Cause and reproduction

Verified original CI: [run 36984900710, database job 110767579816](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/36984900710/job/110767579816), executed at 2026-10-02 08:37 UTC: **441 tests, 439 pass, 2 fail, 0 skipped**. Both failures are the tied timestamp case, at its first version-ID assertion. PR #195 remained open/draft on the stated head when inspected.

The test hard-coded publish command times `2026-10-01T23:59:00.123456Z` and `.123457Z`. After that date, the test's ready commands are newer than its own publish commands, so canonical publication state is no longer guaranteed to be published. Earlier cases also have newer published versions, so the first feed row need not be the test's expected version. A relative calendar date or retry would only postpone or conceal the failure.

Original source reproduced locally on 2026-10-02, database clock 08:59 UTC, PostgreSQL 17.6, own `feed06-db`: **16 integration tests, 14 pass, 2 fail, 0 skipped**, same first version-ID assertion in both privilege profiles. No runtime or migration change was needed to reproduce it.

## Correction

One materialized database anchor is calculated after the ready commands, using the later of `clock_timestamp()` and the maximum existing command timestamp, rounded down to a second and advanced by one second. All three immutable publish commands are inserted in one statement at exact SQL interval offsets of 123456 / 123456 / 123457 microseconds. The original UUID ordering and cursor assertions are retained, with an additional exact one-microsecond spread assertion.

Both privilege profiles additionally run the same assertions with a pre-existing synthetic publication two days ahead of database time. This catches an incomplete clock-only correction. No timestamp travels through JavaScript Date or gets rounded to milliseconds. No command rows are updated.

Date/time semantics checked against [PostgreSQL documentation](https://www.postgresql.org/docs/16/functions-datetime.html). Supabase changelog inspected on 2026-10-02; this correction changes no SDK, schema, Data API, Auth or RLS behavior.

## Validation and delivery

- Local feed unit + real SQL integration suite: **25 pass, 0 fail, 0 skipped** (7 unit + 9 cases per privilege profile).
- Local TypeScript typecheck and changed-file ESLint: pass.
- Negative control: in an isolated temporary copy, replacing the max-command anchor with database clock alone caused both future-publication assertions to fail as intended. The original source stayed unchanged and the temporary file was removed.
- Secret scan: 1298 files, no secret pattern; SQL policy validator: 51 files, 0 rejected. Inherited archive SQL warnings are unchanged.
- Reviewable PR and exact-head CI will be recorded after push. The commit is intended for review/consumption by the PR #195 owner; no automatic merge or cherry-pick into their checkout.

Local reproduction logs are kept in the ignored task workspace (`.task/before.log`, `.task/after.log`, `.task/source-ci.log`); the durable counts, cause, commands and source are recorded here.

Run locally with the existing own sandbox: `FEED_DB_CONTAINER=feed06-db node node_modules/tsx/dist/cli.mjs --test lib/intelligence/publication-feed.test.ts lib/intelligence/publication-feed.integration.test.ts`. In CI, use the existing `PGHOST` profile with the disposable PostgreSQL 16 service and `npm run test:db`.

Limitations: this is a deterministic synthetic timestamp fixture correction, not proof of full NEXT-06 acceptance or Production state. Existing acceptance/release gates remain open. No new migration is required because production code is unchanged.

All execution is confined to synthetic, disposable local/CI PostgreSQL databases. No Production, shared migration, real user data, merge, deployment or external user request is authorized by this task.
