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

Use existing REST credentials for bounded read-only `limit=0` requests on both tables to confirm schema-cache visibility. Do not seed sample rows into production. Wait for the existing natural collector cycle; verify `/debug` storage success and aggregate database receipts. The physical collector records lastAttemptDay separately from lastRunDay (completed storage). It makes at most two provider requests per Tehran day per process: one each for today and the existing rotating backfill date, including source failures. A storage failure may retry from the exact validated rows, up to three total writes per target with one-hour then two-hour backoff. This adds no provider retry. A successful target is not rewritten while its neighbour retries. Do not restart or force a backfill simply to accelerate acceptance without checking ownership and quota.

The pending cycle is in memory, single-flight and limited to two targets. At the next Tehran day boundary (observed by the existing caller), all target states expire, including successful empty and exhausted targets. Debug `physical.expired` records the previous cycle's incomplete-target and abandoned-pending-row counts; the next day's normal plan reads the provider afresh. This is not a durable retry queue and does not promise that abandoned rows were persisted or later recovered. Restart also loses this process-local state and daily cap; maintain one runtime owner and do not use restart as retry. `lastRunDay` advances only when both targets are valid empty or acknowledged by storage; the legacy `inserted` debug count measures submitted acknowledged rows, not the number newly inserted under `ignore-duplicates`.

## Regression coverage and limits

The integration suite checks service-role append, complete-key conflict deduplication and distinct nullable-key records, distinct rows retained, public reads, denied public writes, denied writer mutations/TRUNCATE, owner-trigger enforcement, exact ACLs, installation re-run refusal, partial-existing-table refusal, unrelated snapshot preservation, and rollback after an injected mid-installation failure.

The existing nullable SQL conflict tuple is preserved. The new physical collector deliberately has stricter admission: every row in a target must have a nonempty symbol and producer, finite observed price and volume, and a source trade date equal to the requested date. If any row fails, the entire target stays incomplete and debug exposes `sourceRows`, `rejectedRows` and a reason; valid neighbours are not silently published as a complete target. Missing identities are not repaired, converted to zero, or retried from the source the same day. Existing nullable database rows are not deleted or modified. Other writers can still insert nullable rows and duplicate them on retry; reliable identity for those observations needs a separate verified provider contract. Complete-key uniqueness remains the existing heuristic and is not asserted to be a provider-issued unique trade ID.

Offline collector tests cover invalid/error envelopes versus documented no-data, rejected raw identities and wrong source dates, zero-valued observations, partial target progress, identical replay after a lost storage response, storage retry/backoff limits, legacy provider cap, simultaneous callers, midnight crossover, expiry reporting and rereading a previously empty backfill date. They run through the existing `relay/ime.test.mjs` entry in `test:relay`.

## Recovery

Before commit, any error rolls back the complete migration. After commit, preserve appended records; do not drop or truncate history as a rollback. If installation must be contained, the owner should stop only the existing IME write path using a reviewed configuration/runtime change, retain its data, and diagnose separately. There is intentionally no destructive rollback script.

References: [Supabase Data API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api), [PostgreSQL unique constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).
