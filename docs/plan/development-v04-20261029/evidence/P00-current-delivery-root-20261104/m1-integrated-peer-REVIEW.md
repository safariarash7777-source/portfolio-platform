# M1 cbf revision3 independent Git-byte packaging closure

Date: 2026-11-04. Verdict: **SOURCE_AND_PACKAGING_PASS_BOUNDED** for this sealed R3. No remaining P1/P2 was identified in the reviewed source/packaging scope. This does not authorize adoption or native execution.

## Explicit correction of revision2 acceptance

The preceding revision2 peer proved reconstruction against the packet's CRLF-converted base snapshot. It did not prove application to the actual cbf Git index. That was insufficient for packaging acceptance, even though the report disclosed line-ending differences. Root correctly rejected R2 adoption. R2 and its report remain immutable historical records; their packaging acceptance is superseded by this R3 proof. The reviewer should have treated that gap as a blocker before issuing the earlier bounded PASS.

## Independently verified raw Git bases

Base commit: `cbf9cd3ba146d035ab7ccd14484cfe5a0ad59ddf`. Each existing base was independently read as raw captured bytes from local `git show`, with no PowerShell text conversion or line-ending normalization. Each equals the corresponding R3 packet base and has zero CRLF lines.

| Base path | Raw Git SHA256 |
| --- | --- |
| scripts/testing/assembled-native-ci/run.py | `c675a7c8637349cab8c76a29f514899beaffb2ccf8844e26babd4dfe45e89c2b` |
| scripts/testing/assembled-native-ci/test_run.py | `dfce6cf052046c6090df5a724f3dbe6897fba5aa2d41d2fd79e066957a4a200e` |
| .github/workflows/ci.yml | `ba810334e794899fc1cf2008b309ad53d229f7fc6fa3fc1ba6d9a9998568e5e0` |

## Actual private-index application proof

The peer created a fresh bare repository and private GIT_INDEX_FILE under this sibling review folder. The existing source repository's object directory was supplied only as a read-only alternate. All Git writes, new objects and index entries remained in the peer repository; no shared index, checkout, branch or ref was modified.

1. `git read-tree cbf9cd3ba146d035ab7ccd14484cfe5a0ad59ddf` populated the private index.
2. `git apply --cached --whitespace=error PROPOSED-against-cbf9.patch` succeeded against that index.
3. Every resulting index blob was independently read back and compared byte for byte with R3 proposed bytes. The changed-path list is exactly the four paths below, leaving all other indexed paths at the base blobs.

Resulting private index tree: `b55f37085d8027f47feb4dc7e8b5290a8300ab52`.

| Applied path | Actual index blob SHA256 |
| --- | --- |
| scripts/testing/assembled-native-ci/run.py | `849675db42bd64761d3d778ae45be353a42034f1bd77d6411e5019b8a744e0fa` |
| scripts/testing/assembled-native-ci/test_run.py | `021343c55944d05d1f384b59a9d1a2c9880174afb06f72b7a933833a56bf9bff` |
| scripts/testing/consultation-feedback/install-feedback.py | `88da3b8b1699e0bfb0655d0fbba49bac0220aa8069abea0a654faa074788f353` |
| .github/workflows/ci.yml | `d19b882cb5fc0e186a0654e9c3532c6ca3d31bda788af7b62d0cbb083dff840c` |

Machine-readable independent proof is retained beside this report as RAW-GIT-APPLY-PROOF.json, with the private index/repository available for inspection.

## Sealed identity and unchanged semantics

- R3 receipt SHA256: `0fdbd4b4c9c9bf46e8fdca9ad9b3648ef543d80559d158126340a6b8e985d12a`.
- R3 patch SHA256: `2165a295511eb91213992d589efb40cec80a01385015c51e756781f42b912287`.
- Controller, test and adapter are byte-exact R2 source. Workflow differs from R2 only by CRLF-to-LF conversion. No semantic change was introduced for this packaging closure.

The prior bounded semantic review therefore carries forward: settings use name-based LEFT JOIN evidence and reject any/missing unsupported settings before writes; diagnostics expose only bound fixed phase/literal code or null, preserve the first failure and cannot promote failure to PASS; adapter caller hash is exact; history/no-replay/cleanup policies and c3bb/9d58 capsule/driver remain unchanged. The 15-code diagnostic whitelist remains partial, and observed phase is not proven cause.

## Limits

No tests were rerun. The prior 87 offline mocked PASS are historical author evidence, not R3 test results or real PostgreSQL/native acceptance. Root must independently adopt the exact source/workflow, preload the reviewed aa90 manifest/config79bd/linux-amd64 mapping and issue a fresh allocation before any execution. Actual Linux, Docker, SQL restore/inverse/history, unknown-response recovery and cleanup acceptance remain unverified. Full consumer/Auth/browser remains NOT_WIRED; primary remains NOT_APPLIED.

Only authorized private packaging-proof artifacts were written. No network, pull, Docker, SQL, SSH, credential read, candidate import or native operation was performed.
