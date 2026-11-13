# Cash-flow encrypted backup checkpoint

## Candidate safe failure diagnostics — 2026-10-31

This local candidate improves attribution for a **future** failed operation. It
does not identify the cause of the previously interrupted native R2 capture:
that attempt remains `UNATTRIBUTED`, with its partial ciphertext preserved and
without a manifest or successful Verify. No retry, new native attempt directory,
native Capture/Verify, SSH, database access, installation or deployment is
authorized or performed by these diagnostics tests.

The existing single stderr line keeps its public prefix and adds a bounded JSON
object: `CHECKPOINT_FAILED stage=<allowlisted-stage> code=OPERATION_FAILED
diagnostic={...}`. The object has exactly eight fields: `version`, `code`,
`phase`, `expectedLength`, `observedLength`, `hashState`, `sshExitCode` and
`sshTimedOut`. Codes/phases/hash states come from fixed enums. Unknown lengths,
exit status and transport observations remain JSON `null`, never a fabricated
zero or false. The outer operation stage uses a fixed allowlist.

Known encryption observations distinguish early EOF, excessive input length,
equal-length SHA256 mismatch, read/write IO failure and encryption phase.
Complete distinguishes its existing exit wait from the original SSH deadline
and a nonzero observed exit code. A transparent stdout wrapper can attach
already available process state to an encryption error **before** the SSH
object is disposed; it performs no extra read, wait, retry or request. An EOF
and a nonzero exit/expired deadline are separate observations, not a claimed
root cause. These enums alone cannot attribute a historical interruption.

Neither raw stderr, exception Message/Data/StackTrace, command, header, path,
plaintext, key nor digest values enter the diagnostic object. SSH stderr is
still drained and discarded. Unknown exception types and all failures before
this invocation has loaded the reviewed diagnostic types use `UNATTRIBUTED` /
`UNKNOWN` and nullable observations. This includes legacy Verify/wrapper errors
for which the frozen code has no typed observation; no message-text guessing
is attempted. This contract covers errors caught by the wrapper; external host
startup/parameter-binding failures outside its catch remain outside this change.
No error file is added to the archive or destination.

AES-256-CBC, HMAC, authentication before decryption, DPAPI, framing, manifest and
profile contracts are unchanged. Remote scripts/pins, host/key/known-host
options, deadlines, exit wait, read order/count, locks, destination checks,
CreateNew/no-overwrite and retained partial files keep their existing policy.
Native operational validation remains a separate root-owned gate.

Run the synthetic checks in fresh processes:

```powershell
pwsh -NoProfile -File ./offline-diagnostics.ps1
pwsh -NoProfile -File ./offline-tests.ps1
pwsh -NoProfile -File ./offline-profile-v2.ps1
pwsh -NoProfile -File ./offline-profile-v2r2.ps1
```

The diagnostics suite compiles the exact C# source with a synthetic stream in
one assembly, exercises the real encryption/verification and the actual two
PowerShell formatting functions, and tests a real wrapper rejection before any
source access. It never constructs `CheckpointSsh`. SSH timeout/exit cases use
the same typed factory as Complete and synthetic observations; they do not
prove native process/timeout behavior. A secret-like random sentinel appears
only in test inputs; public output is checked against the strict eight-field
contract and for sentinel absence. Receipts under the existing synthetic
`test-output` subtree contain check names/code hashes, not the sentinel or
private path values. Fixtures and partial/tampered evidence are retained.

The explicit `ReviewCorrectedCheckpoint` action adopts the pinned ACL19 receipt
bundle in read-only mode. The consultation installer has the corresponding
`--review-corrected-checkpoint` mode. See
[execution, usage and remaining gates](../../../docs/ops/p15-webpack-cache-20261030/EXISTING-CONSUMERS.fa.md).
These review modes do not authorize the old apply path. The explicit candidate
`-Profile CorrectedAcl19V2` below adds a separate archive profile; `LegacyV1`
remains the default seven-file contract.

## Candidate failed checkpoint profile v2 revision 2

`-Profile CorrectedAcl19FailedV2R2` selects `corrected-acl19-failed-v2r2`
explicitly. It preserves the original failed status, old strict V2 profile and
LegacyV1's mandatory seven files. There is no automatic downgrade or missing-file
fallback. This candidate is code/offline evidence only; native metadata,
Capture/Verify, installation and operational acceptance require separate review.

The independent raw canonical policy is
`docs/ops/p15-webpack-cache-20261030/CORRECTED-FAILED-V2R2-POLICY.json`:
4431 bytes, SHA256
`6a1c0113a53a7ac4d8f1cc07e2514fec07f13ec7bd5c4d2987e87120102837cc`.
Its exact bytes are embedded inside the authenticated manifest and pinned
independently by the local and remote validators. Do not normalize policy or
binding bytes. Only reviewed executable Python source is LF-normalized for its
source pin. The immutable parent binding remains 2351 bytes/hash7819.

The format has 17 role descriptors and 16 complete encrypted streams. Only
`original.final_comparison` (`comparison.private.json`) may be absent: its
length, SHA256, owner, cipher name/length/hash and header must be explicit nulls.
Native absence means ENOENT opening that exact child of a checked root-owned,
private, non-symlink directory under the shared release lock. Parent failure,
permission error, symlink, unknown error, or a final file appearing (even empty)
requires reconciliation. Absence is observed before/after metadata and each
stream; capture signs both observations. It does not prove historical
never-creation or no deletion; these remain null. New UTC observations must not
be backdated to the historical producer failure.

`original.pre_comparison` is the real, separately preserved
`comparison-before-correction.private.json` (3707 bytes, hash2ca79419...). It is
not an alias for the absent final comparison or either strict correction role.
The source/correction/supplement/binding/attestation role identities, source
hashes, revision and policy hash are bound into the manifest MAC and the
present-file headers. Sixteen fixed flat `v2r2-00.enc` through `v2r2-15.enc`
use unchanged crypto/DPAPI; no placeholder is encrypted for the absent role.
Verify authenticates before parsing/decrypting and hashes all 16 full plaintext
streams to memory. It does not rerun SSH or turn a historical observation fresh.

Native metadata checks absence and pinned small inputs before the full frozen
gate, then rereads small artifacts and absence afterward. Source/target identity
and release lock checks remain. As with strict V2, each SSH segment has its own
guard and the final metadata pass checks source consistency; there is no single
continuous lock across local encryption. Storage/currentSQL/capacity stay
`NOT_VERIFIED`, readiness/release stay false, and installer/app/SQL are unchanged.

Offline Windows tests: `pwsh -NoProfile -File ./offline-profile-v2r2.ps1`.
Stage the exact policy in Git first (`git add`); the test requires binary Git
policy bytes and the historical binding from HEAD, with no fixture repinning.
The test creates only synthetic data/DPAPI keys/ciphertexts in ignored
`test-output`, exercises the actual wrapper in fresh processes, and constructs
and parses an actual native packet without executing it. Python pure tests:
`python -m unittest discover -s . -p test_checkpoint_profile_v2r2.py -v`.
They never call remote `run`, the native gate, a model or a database.

## Candidate corrected archive profile 2 (offline validation only)

`Capture` and `Verify` accept explicit `-Profile CorrectedAcl19V2`. This is an
extension of this wrapper, not a new backup/restore tool. The pinned crypto,
native helper, gate, read-only consumer, release binding and installer are
unchanged. AES/HMAC framing and DPAPI entropy remain version 1; only the
authenticated archive manifest/header profile is version 2. Existing seven-file
archives keep their default `LegacyV1` verifier. There is no format autodetection,
failed-to-passed projection, restore/export operation or implicit install.

Profile 2 preserves exactly 16 original byte streams: the old seven files;
the correction's `intent.json`, `plan.json`, `result.json`,
`strict-core-comparison.json`, `strict-private-comparison.json`; the external
`v04-fresh-checkpoint-20261030/private-before.json` and `result.json`; exact raw
release binding; and the fresh read-gate attestation. Logical names retain their
fixed source origins. Flat ciphertext names `v2-00.enc` through `v2-15.enc` are
independent of source paths. Headers and the HMAC-authenticated manifest bind each
logical name, byte length, plaintext SHA256, checkpoint, helper and sourceMode.
The original receipt remains `failed`; no synthesized legacy `passed` receipt
is accepted. The original seven files are not rewritten to describe correction.

Native Capture permits only checkpoint `20261030T215307Z`. It loads the existing
gate/consumer/binding using the frozen pins, executes a fresh full-dump read gate
and collects metadata under the same outer shared release lock and exact source
and stopped-proof identities. Each of the 14 remote file streams reacquires that
same lock, uses the gate's no-symlink/root-owned path reader, checks identities
before/after, file stability, complete hash/length and process exit. Binding and
the generated attestation remain in memory until encryption. A final fresh gate
and metadata pass must match all 14 original file hashes/lengths and the binding.
The second gate has a new timestamp; both verdicts are retained in the signed
manifest. This is not a single continuously held SSH lock across the local
encryption operation. Hash/stability checks and the final gate detect drift;
failure retains partial evidence and never automatically retries or cleans it.

Verify authenticates the manifest before parsing, enforces the exact 16-item
profile, then uses the unchanged crypto to authenticate every ciphertext before
decryption and hash all plaintext bytes to a memory-only sink. Verify consumes
historical attestations; it does not refresh their date or call SSH. Successful
format verification still returns `readiness=false`, `releaseAuthorized=false`;
Storage binaries, current SQL and capacity remain `NOT_VERIFIED`, and the
original exported-core versus separate globals/private snapshot limit remains.
This profile does not connect the legacy installer or activate a service right.

Code normalization is limited to the reviewed executable Python gate/consumer.
**Binding, receipts, dumps and SQL payloads are never normalized.** The current
Windows checkout's CRLF binding hashes to `c4ac2888...`, while the frozen Git LF
binding hashes to `7819e0fb...` (2351 bytes). Native preflight therefore rejects
that checkout's changed raw binding; the operator must separately stage/review
the exact frozen bytes before any live invocation. This candidate does not
rewrite the binding or loosen its pin.

Offline validation: `pwsh -NoProfile -File ./offline-profile-v2.ps1`. Synthetic
sources and generated DPAPI test masters stay only in ignored `test-output`;
sourceMode is `offline-synthetic-v2`, gate status is explicitly synthetic and
nativeGateExecuted is false. Fixtures cannot override production pins or select
SSH. `offline-tests.ps1` independently checks unchanged version 1 behavior. No
live Capture/SSH/backup transfer/restore/DDL/env/deploy or new credential is
authorized or executed by these tests. Root owns live review and fresh preflight.
The earlier v2 suite had 29 checks, including JSON-parsed UTC DateTime, an explicit
+03:30 DateTimeOffset and rejection of an unspecified timezone. Gate freshness
uses the original instant rather than a culture-dependent local string; it does
not rewrite the archived attestation or change the frozen gate.
Root's exact-byte staging exposed a separate native entry length defect in
ee70501: it expected 2394 bytes for the unchanged binding whose actual Git bytes
are 2351. That old guard failure is retained; no native metadata was run with
it. The corrected guard uses 2351 and the same hash7819. Five additional checks
read the exact binding from binary Git stdout (not the CRLF working-tree file),
pass it through the native entry validator and reject old2394/length/hash drift.
These tests require an existing Git checkout; no synthetic pin substitutes for
the exact binding. Metadata/Capture/Verify runtime acceptance remains separate.

This directory owns the wrapper, .NET crypto helper, synthetic tests and sanitized receipts. The initial implementation's evidence remains in `offline-receipt-20261020.json`. The 23 October revision pins the bounded recovery correction and allows 1800 seconds per file for the measured slow native transfer; connection and metadata deadlines are unchanged. Its 16-check offline suite passes. Before live Capture, the coordinator verifies exact code hashes and release preflight under existing authorization. `.gitattributes` preserves tested source bytes; synthetic fixtures, keys and ciphertext are excluded from Git.

The current consultation pre-install revision retains all 11 inventory schema predicates (including `goals_private`) and adds exactly the seventh observed ACL pair from checkpoint `20261023T204308Z`: source `schema|goals_private|postgres;{postgres=UC/postgres}` versus target `schema|goals_private|postgres;-`. The only new correction is `GRANT USAGE,CREATE ON SCHEMA goals_private TO postgres` on the owned isolated target. The prior six pairs are unchanged. Current helper SHA256 is `1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2`, policy `observed-seven-acls-v1`; thirteen offline tests cover all 128 subsets, exact schema/owner/grant-option rejection, and every inventory selector. The full database dump and crypto are unchanged. The initial `20261023T204308Z` restore failed closed on seven differences out of 1951 inventory lines; preparing this correction does not relabel that failure as success. Reconciliation must preserve the original failed receipt and differences before any target-only correction and produce separate verification evidence. Historical six-pair helper `850822a79dc2e9e7838fd890294bc9e3758a6ef8b8a7e2388efe0cac3c5cbec2` and earlier five-pair helper `31f86d429a3609d4f1d235842a4784866591c3b4c8b1fc77c73b92f701a37aef` retain their original receipts and matching wrappers. Do not use a new pin to verify an old manifest or replace a remote helper during active capture. No historical receipt is rewritten by this code revision.

Native checkpoint `20261023T125904Z` completed a fresh isolated restore: strict inventory 1848/1848, zero mismatches, unchanged healthy source, stopped target. See `restore-receipt-20261023.json`. Five exact known target ACL differences were corrected automatically, with original mismatch evidence retained privately and correction provenance in the receipt. Unknown differences still fail closed; no source SQL mutation is permitted by that correction. Ten offline guard tests include every subset of known differences and reject permission, owner, RLS, row-count and isolation drift. This restore proof is distinct from encrypted Capture/Verify and from application acceptance.

`backup-checkpoint.ps1` requires PowerShell 7 on Windows and a **fresh `pwsh -NoProfile -File` process for each Capture and Verify**. It fails closed if either helper class is already loaded; it never reuses a potentially foreign class from an interactive session. It **does not start a backup**. It captures exactly seven files from one completed native backup/restore directory, verifies receipt success and source/archive hashes, and checks current source identity/health and stopped isolated target metadata. The reviewed native helper must be staged byte-identically at `/root/portfolio-recovery-tools/cashflow-native-reviewed.py`; its SHA256 is pinned to `1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2`. Use binary transfer such as existing SSH `scp` for staging; do not pipe through `Get-Content`, `Set-Content`, text decoding, or newline conversion. Recompute the local and remote SHA256 against the reviewed bytes before executing the helper. Native backup execution must use `/root/portfolio-recovery-backups/.cashflow-release.lock`; Capture takes a nonblocking shared lock during metadata inspection and refuses an active exclusive backup writer.

Exact allowlist, confirmed from native source: `postgres.dump`, `globals.private.sql`, `cron.private.json`, `source-inventory.private`, `target-inventory.private`, `comparison.private.json`, `receipt.json`. Private errors and `target.private.env` are excluded. No secret, row, plaintext archive or recovered key is printed. The local manifest contains filenames, hashes and lengths only; the original native receipt is encrypted. Source raw files remain private remotely; the wrapper does not delete or overwrite them.

Live destination is fixed to `C:/Users/Asus/.codex/private/cashflow-release/<CheckpointId>`. The wrapper refuses existing Capture destinations, reparse points and unreviewed helper hashes. It creates a protected directory ACL for the current SID and SYSTEM only, then CreateNew files. It requires estimated ciphertext size plus 1GiB free locally. Verify requires the same protected directory ACL. SSH uses the existing fixed key/host, strict host key checking, batch mode, 15-second connection timeout and process-tree kill deadlines (180 seconds metadata; 1800 seconds per file). Binary stdout goes directly to crypto, never through PowerShell's text pipeline. SSH stderr is discarded; failures emit only constant stage/code and exit nonzero. Partial output is preserved; no automatic retry, cleanup, additional backup or restore occurs.

Encryption uses .NET AES-256-CBC/PKCS7 with a fresh random IV per file and independent HMAC-SHA256 key (encrypt then MAC). A random 64-byte AES/HMAC master is wrapped with Windows DPAPI CurrentUser and fixed domain entropy. Each file authenticates magic/version, header length, exact UTF-8 context/source hash/length header, IV and ciphertext. The final 32 bytes are the MAC. The manifest's exact bytes have a separate HMAC. File hashes are additionally bound inside that authenticated manifest. Verify authenticates the entire ciphertext with an exclusive file handle before decrypting on the same handle, then hashes all decrypted bytes with a 64KiB buffer. No plaintext file is produced. Master/key/buffer arrays are cleared where owned by this code; this is not a claim that all managed-runtime copies can be erased.

DPAPI recovery requires this Windows identity/profile. This tool has no Restore/export mode and is not portable off-device disaster recovery. Live Capture is eligible only after the native helper has successfully restored that release's original archive on isolated PG; Verify then establishes that decrypted bytes exactly match the same source archive and auxiliary files. It does not start a second PG restore, validate storage blobs, prove every row's contents, or refresh the database. See COMMAND-CENTER for the current Capture/Verify outcome; restore success alone does not establish it.

After root review and a separately completed successful native backup/restore, use the actual native receipt timestamp (not a new invented ID):

```powershell
$id = '<actual YYYYMMDDTHHMMSSZ from native receipt>'
$dest = "C:/Users/Asus/.codex/private/cashflow-release/$id"
$pin = '1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
pwsh -NoProfile -File './backup-checkpoint.ps1' -Action Capture -CheckpointId $id -ReviewedHelperSha256 $pin -Destination $dest
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint capture failed; preserve partial output and inspect stage only' }
pwsh -NoProfile -File './backup-checkpoint.ps1' -Action Verify -CheckpointId $id -ReviewedHelperSha256 $pin -Destination $dest
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint verification failed; do not install from an unverified checkpoint' }
```

Run from this directory. `capture-complete.json` explicitly says `CAPTURED_NOT_VERIFIED`; only a successful Verify creates `verified.json`. Existing verification receipts are never overwritten. A failed later invocation does not invalidate or refresh an older receipt automatically; the caller must inspect the current exit status and matching manifest hash. Before installation root still refreshes the release-specific operational preflight.

Offline checks: `pwsh -NoProfile -File ./offline-tests.ps1`. Fixture mode is restricted to this directory's `test-output` subtree and requires a synthetic marker. All fixtures are synthetic. Each run uses a new owned path and retains evidence, including rejected/tampered copies. No fixture path can select SSH or the private live destination. Synthetic coverage includes seven-file roundtrip, three buffer crossings, empty source, header/cipher/tag corruption at the crypto boundary and wrapper boundary, wrong master, missing ciphertext, manifest tampering, existing-destination preservation, unreviewed pin, and bad source proof. The timestamped `offline-receipt-*.json` pins the code tested.


## Historical compressed archives: explicit recovery before legacy readers

The three reviewed checkpoints `20261017T122931Z`, `20261023T123955Z` and `20261023T154032Z` now preserve their exact dump bytes as gzip; the redundant raw representations were removed only after full decode/hash and real tmpfs `pg_restore --list` checks. Historical receipts remain unchanged. See [current evidence and capacity](../../../docs/plan/development-v04-20261029/evidence/P15-three-promotions-root-20261104.json) and COMMAND-CENTER; this is not a fresh database backup or restore.

LegacyV1 and `pg_restore` do not read gzip automatically. Before using the old raw path, a separately authorized operator must verify the checkpoint's prepared/tool/gzip pins, use its fixed `materialize` command from `RESTORE-RAW-PATH-20261104.json`, and independently verify the recreated raw byte count/hash and retained gzip. Only helper SHA256 `496e287c429ef1cb29b0cd9570e0392e0f3bd5ce0b45d2a2779999b7441d556d` is reviewed for this route. Pin the prepared receipt externally; the helper's materialize branch does not do that external comparison itself. Reserve at least 10 GiB + exact raw bytes + 32 MiB before materializing. A marker, an old failed read-only call or a presence-only readback grants no write authority and proves no recovery. On an unknown result inspect the same intent; never replay or remove its partial file. Actual raw-missing materialization and database restore have not been performed by this compaction delivery.

## Corrected core/private V3: attempt-bound source, no native delivery

`CorrectedCorePrivateV3` preserves the corrected SQL checkpoint
`20261103T222239Z`. The provider lives beside this wrapper; the existing caller,
adapter and attempt engine live in [attempt-control](attempt-control/).
Its `v3/` directory is the byte-pinned reviewed provider snapshot and `frozen/`
retains the exact Oct30/R2 sources. These are executable source snapshots, not
private controller state or backup archives. The three retained runner receipts
are sanitized historical failure metadata; they issue no authority.

**ACTUAL: NO NATIVE V3 Capture/Verify, provisioning, authorization issuance or
installation has been performed by this source delivery.** Expected schema is
23 present remote roles, one explicit absent role and two pinned memory roles:
26 records / 25 streams. Actual native archive counts remain `null`. Capturing
or verifying the Nov3 dump would preserve that historical checkpoint; it would
not create a current database backup. Storage binaries, rollback, fresh sustained
capacity and current migration compatibility remain separate unverified gates.

Use the same `attempt-control/native-caller.ps1` and its existing actions only
after root separately reviews the source pins, provisions the exact Nov3
controller namespace and issues an attempt authorization. The V3 branch requires
explicit `Profile=CorrectedCorePrivateV3`, `ReviewedProfileSha256` matching the
sibling policy, a specific `AttemptId` and the exact reviewed authorization hash.
There is no inferred latest attempt, automatic authority issuance or fallback
to Oct30 permissions. The old default R2 branch and its entropy/path namespace
remain unchanged. Direct native V3 wrapper execution is rejected unless the
same authenticated controller attempt holds both locks and owns the signed
start event. No standalone V3 command grants permission to capture.

The lifecycle remains authorization, signed capture start, bound capture,
signed verify start and external verified event. An unknown outcome or partial
archive requires authoritative `Readback`; it never permits automatic replay,
deletion or a replacement attempt. Native Verify preserves archive inventory.
Headers, manifest and DPAPI entropy bind the new attempt's authorization/nonce;
successful verification means backup-only and does not unlock legacy Apply or
the separate consultation-next migration consumer.

Keep all runtime keys, signed authority, attempts and archives outside Git in
the existing private per-checkpoint locations. `.gitattributes` lists exact
additional raw-byte paths; do not normalize pinned JSON, Python or snapshots.
The source-only packet was checked offline with mocked I/O/provider boundaries;
those results do not establish a working native controller or product delivery.
Current operational status and acceptance remain in
[COMMAND-CENTER](../../../docs/COMMAND-CENTER.md); the original checkpoint failure
is retained in [the existing evidence](../../../docs/plan/development-v04-20261029/evidence/P15-fresh-backup-not-accepted-root-20261104.json).

### Versioned V3 source/mock regression harnesses

The maintained tests are in `attempt-control/tests/`. Each requires an explicit
`-CanonicalRoot` pointing to this `cashflow-checkpoint` directory and a fresh
PowerShell 7 process; no user-specific output directory is used. Example, from
this directory (repeat for `test_v3_attempt_branch.ps1` and
`test_attempt_lifecycle.ps1`):

```powershell
pwsh -NoProfile -File ./attempt-control/tests/test_attempt_contract.ps1 -CanonicalRoot .
```

The three suites require 22, 76 and 14 checks respectively. They print one JSON
receipt to stdout and do not write receipts, keys, authority or archives. The
baseline source is byte-pinned under `tests/baseline/`; production and R2 sources
are not modified. Tests extract named function definitions, replace I/O/provider
boundaries and reject unexpected commands. Unsafe static operations become a
throwing sentinel. A deliberate file-read canary must be blocked before I/O;
any unexpected boundary attempt fails the whole suite even if a negative test
catches its exception. Receipts require `externalCalls=0`,
`unexpectedBoundaryAttempts=0` and `sentinelProbeDenied=1`.

These are source/mock regressions, including the actual attempt dispatch's lost
Capture/Verify response and no-second-call cases. They do not execute native
initialization, SSH, crypto, key/authority access or archive Capture/Verify.
Windows offline execution passed. Linux execution is pending actual CI; absence
of PowerShell or a skipped step is a failure of coverage, never a pass. A separate
CI registration patch must run all three suites and validate their receipts;
ordinary green CI without that step does not establish V3 harness coverage.

The root-resume correction validates raw JSON with `JsonDocument` before any
PowerShell projection: the root must be an object (not a singleton array), keys
must be unique even after escaping/case folding, status must be the exact string,
and counters must be safe nonnegative JSON integers with the expected values.
Boundary flags must be JSON `false`, never a coerced string or number.

All three suites set terminating error handling before root validation. An
explicit filesystem directory with all 63 reviewed source hashes is required,
including for the historical baseline-only suite. The canonical pin index is
itself hash-pinned and has one exact `-text` attribute; engine/R2 bytes are not
changed. Blank/missing/file/wrong-source roots cannot yield a PASS receipt.

`test_receipt_guard.ps1` covers 117 pure positive/negative receipt cases.
`test_harness_preflight.ps1` checks 15 invalid-root cases across three fresh
processes per input, with the caller explicitly using `Continue`; it requires a
nonzero exit and empty stdout. These are additional test guards, not extra
native acceptance checks. The original three suite counts remain 22/76/14.
Their instrumentation is not a universal sandbox for arbitrary code or all I/O.
Linux coverage still requires the actual registered CI step; none is inferred
from Windows results or source review.
