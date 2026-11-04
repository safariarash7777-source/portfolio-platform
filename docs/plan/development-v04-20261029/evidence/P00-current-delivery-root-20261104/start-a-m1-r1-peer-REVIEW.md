# M1 independent bounded source peer review

Date: 2026-11-04. Verdict: **SOURCE_PASS_BOUNDED** for the sealed proposal below. No remaining P1/P2 was identified in the reviewed source scope. This is not adoption, execution, PostgreSQL acceptance, or production readiness.

## Identity and independent byte verification

Packet: `outputs/start-a-p15-m1-source-7122-20261104`.

- Controller base: `7122a56519d7ae3f34202bb0f9575573143dc80e`.
- SQL/bootstrap baseline: `0d63a8b64e4975a3c9dab3f1f579f91302602b01`.
- Receipt SHA256: `5f3a35154f8add3fbc6821e68dc7edcd7c247c95596743059edd4bd0ef60faaa`.
- PROPOSED.patch SHA256: `83b08725ce485a3ec9f613e411d61ab57824189be9350efaca0004fb260a17a4`.
- Optional workflow patch SHA256: `168c710b6eecd4f26383874e324b626609f4463884a2b7273685c0f9a9b9dd02`.

The unified patch was independently reconstructed in memory against the packet's pinned base bytes, checking every removed/context line and hunk count. All three outputs equal the proposed files byte for byte; lengths and SHA256 match the receipt. No candidate code was imported or executed.

| Proposed file | Bytes | SHA256 |
| --- | ---: | --- |
| scripts/testing/assembled-native-ci/run.py | 87763 | `1411563c8a72adf9360b2ef39ce9023678a28429abdb4b52ed553155ce887ed2` |
| scripts/testing/assembled-native-ci/test_run.py | 105292 | `86f1293fa2a2dd441a1fa95cc5f105aa3f31ddb1d1959b5da4f0934d7b12dc3e` |
| scripts/testing/consultation-feedback/install-feedback.py | 80833 | `e29a32fea28810cadb6f83b5e20932903fd4f47206ca6fbcb3743686227c1312` |

## Prior findings closed in the final bytes

1. Adapter lines 668–690 walk from a root directory descriptor and open each component with O_DIRECTORY/O_NOFOLLOW; the checked leaf descriptor is retained rather than reopened by full path. Evidence creation remains exclusive with file/directory fsync and a real lock.
2. Restore emptiness includes views and the additional catalog guard (adapter lines 884–896 and 917). Views are covered by schema definition/owner/ACL evidence rather than row hashing.
3. Initial role/database metadata is independently captured from all three new resources and required equal before bootstrap (lines 920–927). The restore target is checked against that evidence before any role creation; the three synthetic role creations are one transaction (line 805), closing the partial-creation gap.
4. Finalization catches failures per resource and continues other independently bound IDs (controller lines 552–566). Failed/unknown cleanup cannot yield PASS. Unknown creation without an observed identity is retained as unconfirmed, without guessing an ID or deleting by name.

## Bounded semantic conclusions

The new purpose is routed before the legacy lifecycle. Caller-controlled recipe identity and the independently observed actual allocation are separate; the adapter requires the caller's expected allocation hash. The three full resource IDs, names, labels, image config ID, marker, network isolation and PGDATA mount are checked before the bounded operations. Durable intent precedes creation and SQL writes; unknown outcomes retain evidence and do not authorize automatic replay.

The source proposes the fixed c53 two-SQL payload, an archived synthetic baseline restored independently to copy and third target, a prewrite inverse exercise on the third target, and post-history PT409 rejection without deleting history. Supported full schema/data/sequence/non-secret role/database evidence, including nonzero debt, is compared. This remains an isolated, quiescent fixture comparison using separate queries; it is not a concurrent exported snapshot or a general PostgreSQL backup guarantee.

The optional workflow patch changes only the existing assembled-native-bounded job/profile selection, pins the 0d63 checkout, uses the 25-minute limit, and skips legacy Node/npm setup for this PostgreSQL-only purpose. It contains no added runner/job/workflow, implicit image pull, or new secret. It is a separate unadopted proposal.

## Acceptance limits and remaining dependencies

- The README and receipt correctly say SOURCE_PROPOSAL_NOT_ADOPTED_NOT_EXECUTED. Root integration, exact workflow adoption and fresh allocation remain separate gates.
- The fixed image is a config ID, not a pullable repository digest. Root must establish/preload the exact repository-digest-to-config-ID mapping. `--pull never` remains enforced; the optional workflow does not provide preload.
- Linux descriptor/fsync/flock behavior, actual Docker/PostgreSQL execution, complete restore equality, SQL inverse/history behavior and cleanup acceptance have not been established by this review.
- The author's ten mocked tests are reported evidence only. They were not rerun here and do not exhaustively prove lost-response orchestration or the full restore catalog matrix; historical R5 tests are not new M1 runs.
- No Auth/browser/API/full-consumer acceptance, primary installation, current production backup, or operational authority is inferred. The report preserves targetInstall NOT_APPLIED and fullConsumer NOT_WIRED.

Review method: source/delta reading, final hash checks and in-memory patch reconstruction only. No test, candidate import, network, Docker, SQL, native operation, credential read, or shared-checkout mutation was performed.
