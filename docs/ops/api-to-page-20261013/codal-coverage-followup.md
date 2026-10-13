# Codal coverage follow-up — 2026-10-13

Base: main `ec927700d561faf8e63f5eac48597c73b6f5f98f`. Read-only production observations; no provider calls, report downloads, collector runs, database writes or agent activation. All counts below are operational metadata, not financial values or proof of usable reports.

## Reproduced defect and bounded correction

At 16:26:11 UTC, the existing `coveredCounts` query for the relay's current top 200 symbols requested 10,000 rows but received only 1,000. A descending primary-key paginated read of the same symbols returned 5,200 rows in seven reads (including the terminal empty page).

The existing threshold of eight stored rows classified 33 symbols as covered using the truncated read, versus 145 using the complete read. Thus 112 symbols were unnecessarily eligible for backfill under the current heuristic. This demonstrates waste in site-side scheduling and does not attribute a fault to BrsApi.

`relay/codal-coverage.mjs` now reads through the server row cap using decreasing `id` cursors. Short pages do not imply completion; only an empty page does. Failure, invalid/unordered IDs or exceeding 100 pages rejects the whole count before any backfill requests. New inserts above the first page cannot move subsequent cursor pages. The existing eight-row heuristic is intentionally preserved; it does not prove period completeness, correct units, parser quality or current financial coverage.

No file owned by draft PR229 was changed. Its prospective N10 admission work neither resolves historic failure causes nor repairs stored rows and is not included here.

## Current live blockers

- Read-only `/debug` at approximately 16:23 UTC reported engine `ok=true` alongside `lastError="feed: The operation was aborted due to timeout"`. Its last run was 13:37 UTC: seven feed downloads, one insert and six failures, plus six backfill failures. Fields `feed.complete` and `incompleteReason` were absent. Main already computes health from these failures and exposes those fields, so runtime behavior needs reconciliation with source before asserting the main fixes are running.
- Persisted engine state at 13:37:46 UTC had 403 failure entries: 344 with one attempt, 53 with two, six with three. Values are only numeric counts. Neither this ledger nor current debug identifies which failures were download, parser rejection or persistence failures. Exact causes require existing sanitized runtime logs or additional diagnostics during later natural cycles; they must not be inferred from the label `parseFailed`.
- Archive debug reported 198 requests used against a daily cap of 200, with a quota-exhausted message. No extra recovery/backfill was started. Debug's observed stored-symbol coverage was 102 N30 and 232 N10, checked 15:52:38 UTC; these counts are not completeness guarantees.

## Validation and release boundary

Six offline regressions cover capped/short pages, later-page failure, invalid/repeated/unsafe IDs, bigint cursors, filter escaping, bounded reads and empty input. Together with existing engine-cycle integration tests, 39 tests passed. The new reader was additionally exercised read-only against the existing destination to establish the 1,000 versus 5,200 discrepancy. No raw reports, credentials or private records are included in this evidence.

Release and live acceptance remain the parent's responsibility: register the test in the canonical relay test script, run release checks, include the helper in the relay artifact and preserve the existing single-writer/quota/cache deployment prerequisites. After release, observe a natural cycle for revised queue skipping and health. Do not clear the failure ledger, rewrite stored reports or launch broad backfill to prove this correction.
