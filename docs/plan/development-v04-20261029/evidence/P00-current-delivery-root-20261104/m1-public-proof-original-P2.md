# M1 public-evidence independent bounded source review

Date: 2026-11-04. Verdict: **P2_OPEN — allocation binding is incomplete**. This is a source review, not a runtime finding or native acceptance.

## P2: consistent receipts with a contradictory full allocation binding can pass

At `scripts/testing/assembled-native-ci/run.py:591–594`, m1_public_evidence compares purpose, sourceCommit, allocationId, runId and payloadSha256, but neither requires nor verifies profile, attempt or allocationSha256. It does not read the caller-issued m1-actual-binding.json or m1-actual-allocation.json.

The actual adapter constructor, `scripts/testing/consultation-feedback/install-feedback.py:844`, includes all three omitted fields in its binding. In particular, allocationSha256 binds the independently observed resource IDs and complete allocation, while runId/allocationId alone do not verify those bytes. Controller lines 507–512 create that actual allocation and its caller-issued hash.

Concrete source counterexample: keep the checked runId/allocationId/source/payload values and all archive/snapshot digests correct, but use one shared install binding with a wrong allocationSha256 or attempt other than "1" in backup, history, both restore receipts, inverse receipt and execution.result. Every new condition can still pass and emit public evidence before PASS. The same is true if profile/attempt/allocationSha256 are absent: the new supposedly valid fixture at test_run.py:1438 actually omits these fields. This conclusion follows from the reviewed conditions; no test or candidate execution was performed.

Required correction: validate the caller's actual allocation and its canonical SHA against m1-actual-binding.json, bind its run/attempt/controller/source/recipe context to this execution, and compare every proof receipt to the exact expected complete adapter binding, including profile, attempt and the verified allocationSha256. Add a negative fixture with an otherwise internally consistent proof bundle carrying a wrong/missing allocation hash and wrong attempt/profile. Do not weaken producers, replay operations or infer allocation identity from a self-asserted receipt.

## Other bounded conclusions

- The archive is read privately with the existing bound, requires PGDMP prefix and exact archive digest, and the two restore receipt digests must match both archive and canonical backup-before snapshot digest.
- History is required equal to execution.result, retains the partial/not_done and PT409 claims, and explicitly keeps Auth/reader/full-consumer unavailable. The inverse receipt is separately bound and prehistory-only.
- Empty database-role settings are checked; output uses digests, an archive byte count and fixed outcomes. Raw snapshot/journal bodies and the canary are not returned. No new live database/provider read or write is introduced.
- Proof strictness is narrower than revalidating the entire snapshot producer contract: the debt count check uses > 0 and therefore alone accepts a boolean; the underlying full_snapshot producer already requires a real integer. This distinction is recorded without claiming a new SQL/query defect or expanding this review into a snapshot rewrite.
- The new evidence gate runs before PASS and fails closed on missing/read errors; the existing cleanup, unknown-write, no-replay and prior-failure rules remain. The P2 above concerns an incomplete new evidence-validation promise.

## Exact source identity and boundaries

- Head: `ea6776887564eacaaeb61d7f8a32386181a66aa5`.
- Tree: `a7b464c35cb172faf734c2e3a3f08b596acc70d5`.
- Verified parent: `e45295e2824646b15207835c399d1c46abba16c5`.
- run.py Git blob: `74987113b5d33b66dec5bc9f01b410d77869ddd3`; SHA256 `6a79c397eeb1555ade894f17cfe60e2e5a385f7a14e2a06bcc80f76fa9f0e73b`.
- test_run.py Git blob: `5218b1e244a2d23262269481ab0b140db8658494`; SHA256 `647661715af9d3f4a3aa32d37cd59c36d1b30922b13e48588f7ebb1578de0277`.
- Raw Git diff SHA256: `97be7892126d5d7cfa1a9cf078718dd93fc48505b9e019fc374c9d78acf301c9`.

The exact delta contains only run.py and test_run.py: a fixed failure code, the projector/call before PASS and one added test class. Adapter SHA256 remains `88da3b8b1699e0bfb0655d0fbba49bac0220aa8069abea0a654faa074788f353`. Workflow, old test methods, capsule/resource/budget implementation and other files have no delta to this parent. Author-reported offline PASS was not rerun and is not actual restore or native acceptance.

Review method: immutable local Git object/diff reads and hashes only. No candidate import, test, network, pull, Docker, SQL, native/dispatch operation, source/index/ref mutation or new agent.
