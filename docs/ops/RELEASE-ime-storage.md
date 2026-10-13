# IME history installation runbook

This is an executable preparation package, not a deployment receipt. Live status belongs in `COMMAND-CENTER.md` and `MIGRATION-LEDGER.md`.

## Scope and meaning

`relay/ime.mjs` already writes daily certificate rows to `ime_certificate_history` and physical trade rows to `ime_physical_trades`. The older `ime_snapshots(category,captured_at,data)` object cannot satisfy these requests: it is a different schema. Keep that object and all its data unchanged.

Installing the two missing tables only makes those existing writes possible. Current market pages consume snapshot certificates; this migration does not add a history chart, backfill missing days, fix source timestamps, or activate an AI agent. Product approval for retaining history and the existing collector's ownership must be established before installation. Do not launch a second collector.

## Preflight

1. Confirm target identity, PostgreSQL version, sole relay owner and the exact current runtime. Read the active configuration without logging credentials.
2. Take a fresh private backup, record checksums and restore it into an isolated database. Verify the restore; never run integration fixtures against the operational database.
3. Confirm both history tables **and** `public.reject_mutation_ime()` are absent. The candidate deliberately aborts if any object exists. Capture existing `ime_snapshots` count and a database schema fingerprint, excluding only the new objects for the after comparison.
4. Check API roles, schema USAGE, and `service_role` BYPASSRLS. The collector must use its existing service key server-side. No global default ACL changes are required.
5. Run `lib/security/ime-storage.integration.test.ts` on a disposable PostgreSQL 15+ instance. Tests use only synthetic values, create dedicated databases, and test permissive and strict default grants. They deliberately fail if PostgreSQL is unavailable. Local Docker/psql availability is an execution prerequisite, not evidence that tests passed.
6. Check receipt-versus-source dates in the current relay. The corrected certificate EOD path uses each quote's date_update via the existing source-session parser and skips absent, invalid or future dates. Confirm that this exact writer is deployed; the old writer used Tehran's current day. Physical `trade_jdate` comes from provider `date_trade`. Resolve this distinction before claiming daily completeness.

## Installation and verification

Run the reviewed `sql/phase19_ime_tables.sql` as the schema owner, using `psql -X -v ON_ERROR_STOP=1` with the existing private connection mechanism. The script uses one transaction, a five-second lock timeout and thirty-second statement timeout. It creates only the two tables, their indexes and identity sequences, one invoker trigger function, policies and mutation guards; explicit grants override legacy default privileges on these objects only. `NOTIFY pgrst, 'reload schema'` is delivered after commit.

Run `sql/test/verify_ime_storage.sql` through the same connection. This is read-only and raises on incomplete RLS, table/sequence/function permissions, row/TRUNCATE guards, or a changed conflict tuple. It prints aggregate row counts and dates, never raw trades. Compare the unrelated schema/data fingerprints with preflight.

Use existing REST credentials for bounded read-only `limit=0` requests on both tables to confirm schema-cache visibility. Do not seed sample rows into production. Wait for the existing natural collector cycle; verify `/debug` storage success and aggregate database receipts. The physical collector records lastAttemptDay separately from lastRunDay (completed storage). Its existing daily provider-attempt cap is retained, so fixing the table does not retry until the next day. Do not restart or force a backfill simply to accelerate acceptance without checking ownership and quota.

## Regression coverage and limits

The integration suite checks service-role append, complete-key conflict deduplication and distinct nullable-key records, distinct rows retained, public reads, denied public writes, denied writer mutations/TRUNCATE, owner-trigger enforcement, exact ACLs, installation re-run refusal, partial-existing-table refusal, unrelated snapshot preservation, and rollback after an injected mid-installation failure.

The existing nullable conflict tuple is preserved. When producer, price or volume is missing, retries can still duplicate rows. Collapsing those NULL values would discard distinguishable trades with different suppliers or contract types; reliable deduplication needs a separate, verified provider trade-identity contract. No historic rows are rewritten.

## Recovery

Before commit, any error rolls back the complete migration. After commit, preserve appended records; do not drop or truncate history as a rollback. If installation must be contained, the owner should stop only the existing IME write path using a reviewed configuration/runtime change, retain its data, and diagnose separately. There is intentionally no destructive rollback script.

References: [Supabase Data API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api), [PostgreSQL unique constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).
