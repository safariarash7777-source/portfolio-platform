# P08 — مصرف مبنای195 و قرارداد بودجه/ارجاع

2026-10-02. Selected P00 baseline: `31c44ab635b672b589b7833bcbc78b41d36f1e75`, tree `b891e09732872b16768317b506bfb9910cb0fdbf`; source: `portfolio-product-direction/docs/product-plan-v0.1/P00-BASELINE.md`. Baseline selection is now resolved. Environment, end-to-end acceptance and release gates remain open.

## Baseline consumption

PR202's branch and prior evidence were preserved. Merge `b813d2e23d79af06938b83fb6084bc266027509c` consumed195 without repeating any patch; its previous P08 head was `2304e7b7c07e2740243ea02c668f3d81b90074f9`. PR202 should target195's branch so its review diff contains only P08-owned files. No force push or shared-checkout change occurred.

[Blob comparison](evidence/baseline195-blobs.json) proves publication, publication-feed, workbook/store, agent-readiness, rebalance, balanceSheet, narrative and lockfile are identical between191 and195. Engine, quarterly, fundamental calc/types change null propagation and unit provenance. P08 consumes those changes without duplicating them. `baseline-195.test.ts` specifically checks missing gross margin becomes the existing unknown qualitative band and a raw financial projection makes zero provider calls.

53 targeted checks:36 existing P08 controls +16 ledger/handoff checks +1 baseline195 consumption check. [Raw output](evidence/baseline195-ledger-tests.txt). This is separate from the preserved historical70 checks; neither count evaluates the60-question answer-quality draft. Unrelated191/195 suites, SQL, live providers and native server admission were not blanket-retested. Typecheck, scoped lint and build are checked for the changed code; final receipts identify the exact commit.

## Persistent fixture ledger

`lib/assistant/fixture-ledger.ts` implements a synthetic append-only JSONL journal with hash chaining, fsync and an exclusive filesystem lock across processes. Explicit policy version/window/start/end, total and subject token caps, and total and subject concurrency caps are required. Null or invalid values fail closed. Test limits are synthetic token counts, not approved commercial budgets, tariff, currency or provider decisions.

- Only explicit fixture setup initializes a journal. Reopening or runtime operations never initialize a missing ledger. Missing marker/journal, corruption, changed policy and an orphan crash lock stop admission. No stale lock is automatically stolen.
- `reserve` accounts for outstanding commitments in both capacity and concurrency. Idempotency keys cannot be reused with different subject/token commitments.
- `claimDispatch` atomically returns true exactly once. Reservation replay does not authorize another provider call. Dispatch is recorded before external work; a crash or ambiguous timeout holds the reservation.
- Cancellation releases only a reservation known not to have been claimed for dispatch. Settlement requires measured, nonnegative actual usage; duplicate equal settlement is idempotent, conflicting settlement is refused. Unknown usage never releases capacity. An actual overrun is recorded truthfully and blocks new work pending reconciliation.
- Late settlement belongs to the original window. An expired window cannot admit a new dispatch. The server must own window namespaces and rollover policy; restart, removing a journal or changing caps is not a reset mechanism.
- A two-subprocess test on one directory admitted exactly one reservation at a synthetic concurrency cap of one. Power loss, reboot, network volumes and production DB behavior were not tested. An orphan lock deliberately trades availability for safety and needs operator review.

The ledger remains independent of fixture-service and is not connected to a live provider or member route. A future server adapter must consume current authorization → reserve → claim → provider → settle → current authorization recheck. Restricted metadata for usage source/status, model/prompt versions, tariff and monetary cost still requires an approved policy. This fixture journal stores reservation and actual token counts only. Opaque subject references must come from approved environment mapping; a plain hash of real member identity is not an approved pseudonymization policy.

## Human handoff and P11 consumption

P11 PR203@`1f3bf0e918fb17d5ee9d1a0cb2ef537a0bb2d78e`: EVENT-CONTRACT.md, event.schema.json and P08-COORDINATION.md were read. `measurement.v0.1` is unchanged. Assistant result dimensions are only status and durationMs. Token usage, reservations, policy/window/model/prompt and costs belong in the restricted P08 ledger, not analytics dimensions.

`handoff-fixture.ts` provides local transitions with expected revision, matching member subject or explicit operator case grant, and versioned consent. States are pending_consent → received → assigned → resolved/closed. Consent revocation closes the local case and removes its owner. No actual ticket storage, queue or customer message is created; fixture consent is not a P01 grant.

`p11SupportDimensions` returns dimensions only, not a collector event. Opened requires a witnessed canonical receipt after consent; assigned is not responded, and closed is not resolved. Each canonical lifecycle transition needs a stable, distinct source reference derived from case+revision by the approved environment mapping; replay must not create a new event. First human response stays UNKNOWN without its own human receipt and timestamp. Named responder, hours and SLA remain Arash/operations/P00 decisions. Question text may only enter the authorized internal ticket storage after consent and retention policy approval, never the token journal, telemetry or provider.

## P07 and remaining gates

P07 decision draft206@`52cd3a9490d7116c5e115be390fc945dab65905c` was read. Its P06 documentation ACK at`f996936f18f5640ee3a21ca16b55a5c7827caba1` is not an implemented API. Current SQL makes an old aggregate version noncurrent when any new draft is saved, even before that draft is published. The old answer must not remain active through that gap. Validity/replacement remains UNKNOWN/fail-closed; action/denominator enums, schema and API are open. P08 changes no publication migration or financial calculation.

P00 owns native environment and end-to-end gates; P01/P03/P07 own live grants and version resolution; P06 owns financial size/basis/calculation; P11 owns measurement mapping, collector policy and support receipts. Arash owns provider/model/retention/budget, named human support/SLA and human review of60 questions. Live provider and customer indexing remain OFF. Fixture tests prove neither model quality nor real response cost/latency. No Production action, purchase or real customer message occurred.

## Independent P11 findings and correction

P11 reproduced two defects on the intermediate snapshot: an existing reservation could claim dispatch after another invocation overran its reservation; and a handoff projection accepted unrelated cases or a revision jump. Both were reproduced and fixed. Dispatch now checks the overrun stop condition for existing reservations too. Support projection checks case/subject identity, opaque references, exact consecutive revision, stable reason/version and consent/owner structure. Two focused regression probes are included in the53 tests. Independent recheck is requested separately; these corrections do not prove live ticket receipt authenticity or production authorization.

## P07/P03 contract ACK

P07 decision draft at`0e9e41e1fb2dc32075696b38914cd9f73a7cedb1` was read directly. P08 agrees with its DRAFT interpretation: decision validity `[validFrom,validUntil)` using authoritative DB/server time and offset-bearing timestamps; exact end equality is expired; either missing boundary is UNKNOWN/fail-closed for a decision. Legacy educational content is not an active trading decision. Current grant expiry is independent of decision validity. No disagreement or shared schema/DTO change is introduced.

P08 must consume the same canonical predicate used by list/detail/mark, including current state/approval/grant and decision validity. A new draft makes the old version noncurrent immediately; no old-version fallback is permitted. Read receipts belong to immutable version UUIDs; a new version is unread and old receipts do not revive authority. Member archive and delayed activation until publish remain open product decisions.

Future native acceptance must independently cover now=validFrom (included), now=validUntil (excluded), missing/invalid boundaries, a valid decision with an expired/revoked exact-cohort grant, and a valid grant with an expired decision. Test both retrieval and the pre-response re-read, including a change while provider work is pending. Client clock changes must not affect authority. Existing fixture expiry/revocation tests are not evidence that a future native resolver implements these semantics. No commercial access policy is inferred from this ACK.

## Frozen review and CI checkpoint

P11 receipt at203@`0169aa71555e624a8159b1b924c65ec9c2bd3868` closes only the two independently reproduced findings at202@`2ca3058db75b44771c748b2673341aff2e84e77f`. Eleven independent synthetic assertions passed; frozen canonical blobs are ledger=`6098dac35291289ee5ddba8b5bbd96b0a38fa419` and handoff=`c940595c24d5419f3b7e194b0b1e032fb3d6f4e9`. Review scope is overrun dispatch and projection lineage only, not all ledger behavior or native receipt/Auth/RLS/LLM/cost acceptance. P11 preserves the initial failed probes and the recheck evidence.

Exact-head CI run`37015040267` on2ca3058 passed typecheck and full lint but failed one core registry test: all lib test files must be named in npm scripts, and the three new P08 test files were not registered. Raw failure and CI snapshot are preserved beside this document. P08 requested P00/P01 ownership coordination for adding only those three paths to test:core. The registry guard is retained. Registration and final-head CI are subsequent checkpoints; this failed run is not relabelled successful.

P00 subsequently recorded limited ownership coordination in P00-CONTRACT-ISSUES.md: append only the three P08 paths to the existing test:core command in this isolated checkout. That additive change is applied; dependency, lockfile, all other scripts and the registry guard are unchanged. Registration plus P08 targeted checks now total55 PASS/0 FAIL/0 skip in [raw evidence](evidence/registration-and-p08-tests.txt). The final CI run must execute the registered tests on the new head; success is not inherited from any earlier SHA. Reviewed runtime blobs remain identical to2ca3058 after registration and documentation changes.
