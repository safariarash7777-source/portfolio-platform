# Live data release — 2026-10-14 Tehran

PR #231 was merged as `c50f2fc3be583db0b014a1438598a8596e522539`.
Exact-main [CI run 38463083380](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/38463083380)
passed all five jobs. The existing manual [relay workflow 38463617631](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/38463617631)
passed preflight, publication, health, debug acceptance and release recording.
Deployment record: `7049422082`; Liara current release:
`6ace9571a7a0a8faa95f62dc` (v51). Eight sampled runtime file hashes matched Git blob
bytes of the selected SHA; local CRLF working-copy hashes are not the reference.

## Prerequisites resolved and corrected

- The existing manual workflow is the selected publisher. GitHub automatic relay
  publication is unset. Liara displayed a repository picker and, after selection,
  an unsubmitted connection form; no connection or auto-deploy setting was changed.
- The missing phase28 budget RPC is **not a deployment gate with both optional
  budget flags off**. Neither flag was enabled. Earlier text treating the RPC as
  an unconditional release blocker was too broad.
- Current configuration, release metadata and six database state/snapshot records
  were preserved privately with Windows CurrentUser DPAPI; decrypt/hash readback
  passed. The database backup and isolated restore receipts remain retained.
- Existing timers/startup scheduling are unchanged. Persisted Codal archive,
  candle and NAV blacklist state were confirmed. Symbol counters and several
  caches remain process-memory state; restart is not a zero-request operation.
  Official provider daily balance/reset and external key consumers are not proven.
- The commodity credential is absent. The official provider panel requires human
  sign-in; the secure login page was opened. No key was guessed, copied from the
  main feed or created, and no additional commodity collector was activated.

## Production IME installation

After runtime verification, the reviewed phase19 file was applied once to the
existing Liara PostgreSQL database. RLS/ACL/guard verification passed. Both new
tables are visible through authenticated REST `limit=0` reads. Exactly 89 expected
inventory entries were added; unrelated structure and row counts were unchanged
across the installation. See [sanitized installation receipt](live-ime-install-receipt.json).

The tables were initially empty. The existing physical writer is gated to Tehran
hour >=15 and certificate history to >=19; installation after midnight does not
prove a natural history append. No forced request/backfill was used. Recovery
must preserve history: contain the writer if needed, never drop the tables.

## Natural-cycle observations and restart defect

The first complete new market cycle was stored at `2026-10-13T20:33:40.410Z`.
Gold/currency/crypto rows carry source date and time. Stocks/funds/options carry
source time, but no source date in this observed payload. Some currency source
dates are older than the receipt date; a received snapshot is not a claim that
every individual observation is current.

Codal's first natural cycle saved state at `20:36:28Z`: the feed completed and
the watermark advanced. Backfill recorded 12 extraction failures and no inserted
reports; no new N10 success is claimed.

Independent acceptance exposed a pre-existing restart defect in symbol details:
an empty in-memory cache was written over the prior 120-entry database snapshot
when the first provider request timed out. The public DB-only symbol endpoint
therefore returned 404 for a previously covered symbol. The repair reads and
validates the stored baseline before collection and again before publication,
merges by each entry's actual receipt time, and refuses empty/ambiguous overwrites.
Recovery of the preserved snapshot must merge newer current entries and keep
original timestamps. Final repair CI, publication and natural-cycle acceptance
are recorded in the accompanying repair PR; this paragraph alone is not proof
that those later steps completed.

No permanent website agent, model scheduler or extra data producer was activated.

## Codal failure-stage follow-up

Read-only comparison of preserved state and existing Liara logs identified six
new failures and six retries in the first natural backfill cycle. The old ledger
kept only attempt counts; its `parseFailed` label also included download and
storage exceptions. The twelve historical causes cannot be reconstructed.

PR233 merged the symbol-retention repair as `c3d751a`. The subsequent diagnostic
patch adds fixed-size, content-free counters for download exceptions, admission
rejection/exceptions and persistence exceptions to existing state/debug output.
It does not change financial admission, the three-attempt ledger, quotas, timers,
or provider requests. Engine integration passed 51 tests; N10/coverage passed 57;
legacy Codal tests passed. These are offline results, not report-ingestion proof.
Final deployment and natural-cycle receipts belong in the accompanying PR.
