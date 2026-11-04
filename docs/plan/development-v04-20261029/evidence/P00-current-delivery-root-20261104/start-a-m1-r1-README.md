# M1 PostgreSQL owned-copy source proposal

Status: SOURCE PROPOSAL ONLY. No native operation, Docker, SQL, network, dispatch, installation, primary backup or customer data access occurred. Root is the only adoption/execution owner.

## Exact inputs and scope

Controller: 7122a56519d7ae3f34202bb0f9575573143dc80e. Synthetic SQL baseline: 0d63a8b64e4975a3c9dab3f1f579f91302602b01. Same START-A two-SQL payload c53de46a216a57b90afaff760c0474cb5d95911f56ff022832fd1536affae8a8. Consult source-inputs.json and actual code pins for authoritative full hashes; the apply payload is verified by the existing adapter.

PROPOSED.patch modifies the existing run.py and test_run.py and introduces the same versioned START-A adapter at scripts/testing/consultation-feedback/install-feedback.py in the controller checkout (that path is absent at controller base). Adapter provenance is the existing R5 adapter, not a parallel installer. Existing product SQL, Windows authority, old profile branches and capsule bytes are unchanged. The PR314 helper is read from the exact pinned baseline app checkout.

The same caller derives a planned recipe from verified actual_context, persists it before create, binds three actual Docker IDs from create stdout plus inspect, and independently issues the allocation hash to the adapter. No provided JSON/env expected hash is authorization. Private store uses descriptor-relative nofollow ancestry, exclusive creation, file/directory fsync and lock. Source/copy/restore-third must be distinct, exact labelled image IDs, network none, no published ports and exact tmpfs PGDATA.

Backup and restores use the same private archive bytes. Snapshot compares all supported non-system tables (including nonzero debt), sequences, schema/owners/ACL/default ACL/RLS/policies/constraints/indexes, non-secret roles/memberships and database settings. Unsupported foreign tables fail closed. Target empty catalog and independently captured initial roles/database metadata are checked before atomic synthetic-role creation. Only paired pg_dump header/footer nonce markers are normalized. This is a quiescent synthetic fixture snapshot, NOT a consistent concurrent export or a production backup claim.

Prewrite inverse runs separately on restore-third. After new history, inverse must return PT409 while history and financial evidence remain unchanged. Unknown writes retain durable intent and readback; no DDL replay. Cleanup independently attempts every previously bound identity once even if another fails; unknown cleanup remains unconfirmed. M1 is SQL claims only: fullConsumer NOT_WIRED, Auth/browser/API acceptance false, primary targetInstall NOT_APPLIED.

## Evidence and limits

m1-tests-closure1.log: 10 local mock tests passed, including per-resource cleanup continuation, role drift before writes, view-only target rejection, bounded/redacted process transport, private storage and three-ID binding. m1-tests-initial.log is retained: one test assertion expected RuntimeError instead of actual ValueError, subsequently corrected. These tests do not establish PostgreSQL semantics, a live rollback, exhaustive lost-response orchestration or the full catalog restore matrix. Historical R5 tests are referenced, not rerun or counted as M1 tests.

The full UTF-8 patch was applied to an independent exact-base reconstruction and all three resulting files compared byte-for-byte with proposed. No shared checkout or Git ref was changed.

## Root-owned wiring before any execution

OPTIONAL-workflow-wiring.patch is a separate, unadopted proposal for the SAME existing workflow/job. It adds the explicit owned-start-a-copy choice, exact 0d63 checkout, 25-minute limit, bypasses legacy Node/npm setup for this PG-only profile, and selects the M1 mock tests in the existing test step. Ordinary five jobs remain unchanged. It adds no runner/job, secret, remote service or implicit pull. Controller requires explicit candidate SHA and rejects composition capsule/driver inputs for this profile.

This does NOT make the current job runnable: root must review/adopt controller and workflow as one exact source, supply a fresh valid allocation and confirm runner image preload. M1_IMAGE sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24 is an IMAGE CONFIG ID, not necessarily a pullable repository digest. Root must independently prepare and attest a repository digest to exact image-ID mapping. --pull never stays enforced; no image loading/pulling is included. Linux-only descriptor/fsync/flock behavior and actual restore/rollback acceptance remain unexecuted.

Consumer continuation with the same real ctx/accounts/Chrome remains a distinct NOT_WIRED gate. M1 SQL completion cannot stand in for it, or authorize production application.
