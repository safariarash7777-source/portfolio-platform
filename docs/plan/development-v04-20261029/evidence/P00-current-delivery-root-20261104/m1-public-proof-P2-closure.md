# M1 public-evidence allocation-binding P2 closure

Date: 2026-11-04. Verdict: **SOURCE_PASS_BOUNDED; prior P2 closed** for the exact source below. The original P2 report remains unchanged. No new P1/P2 was identified in this closure delta. This is not native or PostgreSQL acceptance.

## Closure reasoning

The public projector now receives the pinned module supplied by the existing m1_module path. At run.py:591 it derives the expected recipe from the verified execution binding and reviewed constants. It requires the stored recipe and the exact four-field PREPARED controller binding, including adapter and recipe hashes, to match.

The actual allocation must have the exact top-level schema and recipe context. Each source/copy/restore entry must have exactly the planned fields plus one 64-hex ID, match all reviewed resource properties, and match its corresponding exact identity journal. IDs must be distinct. The canonical full allocation hash at line 608 must match the separately caller-issued actual-binding record together with the recipe hash.

Lines 611–617 derive the complete eight-field adapter binding, including profile, attempt and verified allocationSha256, then require exact equality from backup/history. Both restore receipts and the prehistory inverse continue to require equality to that same install binding. Execution.result must equal history. Thus agreement among downstream receipts with a wrong/missing profile, attempt or allocation hash no longer suffices. The expected shape matches the actual M1Exercise constructor in adapter line 844.

Finalization calls the projector inside the existing private journal's exclusive lock at lines 678–679. No allocation ID, journal body, raw error or actor data is added to the public projection; output remains the reviewed digests, archive byte length, fixed counts and fixed outcomes. Archive/restore snapshot linkage, inverse-before-history, PT409, empty settings and prior-failure/no-PASS guards are unchanged.

## Regression source assessment

The fixture now contains the actual full binding and caller-issued recipe/allocation/controller/identity records. The added negatives coordinate the same wrong profile/attempt/hash across downstream receipts, remove each formerly omitted field, contradict the issued actual hash, and alter a resource ID. These target the previously accepted counterexample rather than merely making receipts disagree with each other. Existing changed archive/restore digest and private-canary cases remain. Author-reported 16 M1/proof tests were not rerun here.

The debt-count >0 proof strictness observation from the original review remains outside this closure; the underlying snapshot producer still requires a real integer. It is not claimed fixed and is not a new SQL/runtime defect.

## Exact Git identity

- Head: `499166f81d1074ec7c906bac49706507b253fee1`.
- Tree: `c4d4046e8e15ad4539975a173bd57eb2c27b6459`.
- Independently verified parent: `ea6776887564eacaaeb61d7f8a32386181a66aa5`.
- run.py blob: `0dc20551284913744cb6a141ed61948f0f518185`; SHA256 `eb092aa4568fa5dfb9f8a09a4e35c5e6d06b43537dba245d9001184cd684a33f`.
- test_run.py blob: `66d6bcb0e547b50ed1f7597ea460c3884970cd7b`; SHA256 `9fa69a9d519e462df039ddbd717c59ccf312806f668fdf6c660267f4eb64b1e4`.
- Raw Git delta SHA256: `acb643d4cde4ed339db8c0d1fcc5d9e17d37a03e819a1cc1f0cadf928b5ef8bb`.
- Unchanged adapter SHA256: `88da3b8b1699e0bfb0655d0fbba49bac0220aa8069abea0a654faa074788f353`.

The delta touches only run.py and test_run.py. Adapter, workflow, capsule, resource/budget implementation and legacy paths have no change in this commit. The semantic acceptance boundary remains quiescent synthetic SQL-copy evidence, with primary NOT_APPLIED and full consumer/Auth/browser NOT_WIRED. Actual execution, current backup and root adoption are not inferred from source or mocked tests.

Method: immutable local Git object/diff reads and hashes only. No candidate import, tests, network, pull, Docker, SQL, dispatch/native operation, shared source/index/ref mutation or new agent. Only this authorized sibling report was written.
