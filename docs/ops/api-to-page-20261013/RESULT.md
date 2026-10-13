# API-to-page freshness audit — 2026-10-13

Scope: public market data path, from the existing relay and stored snapshots through calculations and rendered market/symbol pages. No agents, schedules, collectors, backfills, migrations or credentials were activated/changed. Public data reads only; no private member data queried.

Baseline: main `e6dcbe0c4cda0311004aaa63e7625d3c3a316065`; production alias `portfolio-platform-fawn.vercel.app`, deployment `dpl_3uPnQxtQD1apMJkze8t4xGzipwd8` reported that SHA and READY. The original dirty checkout was preserved; changes are isolated on `codex/api-to-page-freshness-20261013`.

## Verified live evidence

Read-only observation at 15:08–15:15 UTC; these are snapshots, not continuing monitoring. Sanitized metadata: [relay-read.json](relay-read.json), [storage-read.json](storage-read.json).

- Relay source status for stocks, indices, gold/currency, NAV and fund metadata was successful; database push returned 200. Stored market snapshot receipt was recent. This does not establish source freshness or blame the upstream provider.
- SourceDate/sourceTime fields were absent from every stored stock, fund, option, gold and currency row. The stored payload and relay debug also lacked snapshotQuality. The loss therefore exists before page rendering; active relay release/configuration needs reconciliation with main's source-clock/retention code. Runtime SHA was not established.
- The rotating detail snapshot contained 120 symbols with different entry times. A new batch time cannot make old entries fresh.
- Daily history reported 1097/1097 inserted for 2026-10-13. This is the relay receipt, not acceptance of all history or calculations.
- Codal engine reported successful feed access but six parse failures in the observed feed cycle. Recent stored rows include both recent periods and historical backfill; insertion ID is not the financial reporting period. PR229 separately changes prospective N10 admission and does not repair stored/backlog reports; it is not part of this patch.
- Commodity module reported disabled/configuration error; stored commodities array was empty. IME certificates existed, while certificate EOD had a network-class error and physical IME had an unresolved error. No upstream endpoint/key was guessed, collector started or quota bypassed.
- Quota client was disabled and legacy enforcement false. Replacing the relay is a separate operational change requiring current release/config/cache preservation, single-writer verification, official quota/reset evidence and existing installation runbook checks. Those runtime prerequisites remain unverified.

## Corrected in this patch

1. Fundamental summary selects the latest usable financial reporting period, including interim reports. An old annual report no longer hides a newer interim margin. Annual trend remains annual; source labels retain actual period/scope and unavailable-report warnings remain intact.
2. Market shell and symbol tabs refresh server data every 60 seconds while visible/online, retaining client state. Form editing defers refresh; unmount removes listeners/timers. Detail polling aborts outstanding reads and clears the previous symbol on navigation.
3. Symbol-detail API returns each entry's own receipt clock; missing clocks stay null. Unknown/invalid/future/old clocks cannot appear fresh. The endpoint and fetch bypass HTTP cache.
4. Fundamental, price/NAV history, index/breadth and gold/USD readers use one 60-second memory cache instead of layered 10-minute caches.
5. Gold/USD history paginates across the actual database row cap, newest first within a bounded snapshot window, then selects the latest sample per day. Cache keys include the requested window. Failure returns unavailable rather than a partial series.
6. Fund returns use keyset pagination instead of assuming a requested 50,000 rows were returned. Latest IDs resolve amendments; partial/failed/expired reads cannot masquerade as complete current returns. No return formula changed.

## Verification and limits

Offline regressions cover latest interim selection, cache expiry, visibility/offline/overlap/abort scheduling, detail per-row clocks, capped historical pages, latest daily samples, duplicate return rows and partial/expired failures. Existing symbol SSR tests now supply AppRouterContext for the real new client component.

Local core suite passed 1426 tests before the final additional fund-return regression; that regression passed separately. Calculation suite passed 125. Full lint and production build passed before the final bulk-return delta; final gates are recorded in the PR/CI. Counts overlap across suites and must not be summed as unique tests. No real provider/parser/DB-write acceptance is implied by these tests.

Remaining: release/browser acceptance of this patch; relay source-clock release reconciliation; commodity configuration; IME errors; Codal parser/coverage/backlog repair; measured source-to-page lag by each market calendar. Report freshness must use publication/period dates, market freshness source quote time, and all UI claims must distinguish these from receipt time. The site cannot yet be declared fully current.

Rollback: revert only this application's patch or return to the verified preceding application deployment. No schema/data rollback is needed; relay and stored history were not modified.
