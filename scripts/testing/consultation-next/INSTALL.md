# Additive roster/replies installer — coordinator handoff

The installer is prepared code, not an installation receipt. No checkpoint, receipt hash or copy ID is inferred. It never invokes SSH or creates accounts. The coordinator owns deployment, native acceptance and publication.

## Required input

Provide an explicit JSON file with exactly these fields, populated from the **fresh raw remote checkpoint receipt**, Docker inspect and independent encrypted-backup verification. The placeholders below are deliberately non-executable:

```json
{
  "contractVersion": "consultation-next-install.v1",
  "checkpoint": "<fresh YYYYMMDDTHHMMSSZ>",
  "checkpointReceiptSha256": "<sha256 of exact remote receipt.json bytes>",
  "backupHelperSha256": "<sha256 of reviewed cashflow-native-reviewed.py>",
  "source": {
    "name": "portfolio-stage-db-1",
    "id": "<full exact Docker container ID>",
    "image": "sha256:<full exact image ID>"
  },
  "copy": {
    "name": "portfolio-recovery-proof-<lowercase checkpoint>",
    "id": "<full exact restored-copy container ID>"
  },
  "encryptedBackupVerification": {
    "status": "VERIFIED_BY_COORDINATOR",
    "receiptSha256": "<sha256 of independent verified encryption receipt>",
    "checkpointReceiptSha256": "<same exact remote receipt hash above>"
  }
}
```

The checkpoint must be no more than 24 hours old. `receipt.json` must show passed restoration, zero sourceOnly/targetOnly mismatches, unchanged healthy source, stopped copy, no network/ports and cron disabled. The source/copy identity must match the raw receipt and inspection. The encrypted verification is explicitly a coordinator attestation bound to the receipt, **not** a claim that this Linux script performs DPAPI verification. Never substitute a sanitized documentation receipt for the raw remote receipt bytes.

## Reviewed execution sequence (coordinator only)

Run from a repository containing these exact pinned SQL files on the existing Linux host. Transfer the code and attestation through the existing reviewed workflow; this helper has no transport capability.

```text
python3 scripts/testing/consultation-next/install-native.py --attestation /explicit/path/attestation.json --mode copy
python3 scripts/testing/consultation-next/install-native.py --attestation /explicit/path/attestation.json --mode source
```

Source mode requires a successful stopped-copy rehearsal bound to the identical installer bytes, attestation and combined SQL payload. Changing code or inputs requires review; it cannot silently reuse old proof. Both new scripts run in **one transaction**. The installed baseline is hash-checked but never executed again.

The shared release lock prevents overlapping reviewed releases. The installer uses full container IDs, validates source health and copy isolation before every SQL invocation, pins both SQL hashes, checks collisions, fsyncs an exclusive durable intent before DDL, and does not retry after unknown outcomes. It compares preexisting schema/relation/column/function/constraint/trigger/policy/index/default-ACL tuples before/after; it excludes only the exact new package objects. It checks eight RPC/ACL/RLS/immutability/empty-history conditions. Only successful source installation requests PostgREST schema reload; reload completion and native API readback remain external acceptance gates.

Evidence is written under the checkpoint's `consultation-next-install/` directory. A prior intent, result or catalog-before file blocks automatic replay. Do not delete those files to retry. Inspect the actual database and preserve evidence before deciding recovery. A partial or unknown result is never called APPLIED. Failed verification leaves history intact; no automatic rollback/drop is provided.

## Safety tests

```text
python scripts/testing/consultation-next/install-native.test.py
node scripts/testing/consultation-next/install-sql-test.mjs
node scripts/testing/consultation-next/install-sql-test.mjs --ci-local
```

Set `PYTHON` to an available Python executable for the SQL runner. Unit tests mock all Docker/process/operational-file access. The SQL runner exports the **actual installer payload and queries** through `install-fixtures.py`, runs them against uniquely owned isolated PostgreSQL containers under explicit and legacy ACL profiles, and removes those containers. Its `--ci-local` path inherits the existing guarded GitHub disposable service contract; it is not a general database target option.

No operational installation, member reply, native login, Preview acceptance or production release is implied by these test results.
