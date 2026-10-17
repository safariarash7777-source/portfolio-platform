# Live data release — 2026-10-14 Tehran

## Commodity connection follow-up — 2026-10-14

PR [#239](https://github.com/safariarash7777-source/portfolio-platform/pull/239)
merged as `065c293afa9a30ca2bd213c1936abaa92918cb57`. Exact-main
[CI 38518502712](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/38518502712)
passed all five jobs. Manual [relay release 38518920086](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/38518920086)
passed all gates. Liara release `6acf18866de510a731ee30f3`; ten runtime file hashes
matched the selected Git blobs. Vercel Production `dpl_EsYSfjfLQj1E49yyTMjeQSc9qhBk`
is READY at the same commit and assigned to the public aliases.

The owner signed into BrsApi. The account panel showed an active commodity
entitlement (108/1500 used) and AIO (2949/20000 used) at inspection. Official
[key rules](https://brsapi.ir/tsetmc-exchange-free-bourse-api-key-request/) establish
one account key for all services. The previous separate-key assumption was wrong.
The old endpoint base and flat-response parser also disagreed with the official
[commodity contract](https://brsapi.ir/free-api-commodity-webservice/).

Only `BRSAPI_COMMODITY_ENABLED=1` was added to existing Liara configuration;
readback confirmed all nine original variables unchanged and scale=1. No key was
copied, created, or printed. Existing optional budget flags remain off. Encrypted
pre-change preservation of configuration and six DB state rows passed readback.
Changing environment variables restarts Liara; the subsequent deployment also
restarts the process. Existing process-local counters therefore reset, whereas
persisted archive/candle/NAV state remains stored. No account-wide or durable quota
guarantee is claimed; commodity local cap is 300 per process/Tehran day.

At 05:53:29 UTC, the first natural startup cycle had stored **14 rows**: precious
metals 4, base metals 5, energy 5. All 14 had source units and Unix clocks; source
date was `1405/07/22`, source times ranged from 08:23 to 09:21 Tehran, and the
independent receipt was 05:53:09.861 UTC. DB and live receipt matched, state was
`received`, commodity error was null, and core snapshot state remained `complete`.
An early post-release response still showed old metadata; acceptance used a
fresh read and actual runtime hashes, not health status alone.

The next scheduled cycle (no forced refresh) advanced the receipt to 05:58:12.436 UTC, with two attempts total, 14 rows, no error, matching DB/debug/auxiliary clocks, and core state complete. The public page then displayed the new 09:28 Tehran receipt. See [sanitized live receipt](commodity-live-receipt.json) and [runtime hash comparison](commodity-runtime-receipt.json).

The public `/market#commodities` rendered 14 cards and 14 source-clock labels,
without unknown units or empty-state text. Browser screenshot retained privately
as `commodity-live-page.png`. Receipt and source validity remain distinct; this
does not assert every upstream quote is contemporaneous with the feed receipt.
No synthetic commodity history/chart or LLM scheduler was added. Permanent OpenAI
agents remain inactive, with secure API credential setup unresolved.

Rollback: set `BRSAPI_COMMODITY_ENABLED=0` through the existing configuration API
(retained quotes remain labelled disabled), or deploy the preceding successful
relay SHA via the existing workflow. The new UI handles absent legacy fields.

The following sections describe earlier release stages, not the current commodity
activation result above.

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
