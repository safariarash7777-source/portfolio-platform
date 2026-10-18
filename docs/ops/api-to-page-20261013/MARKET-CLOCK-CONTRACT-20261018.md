# Market quote clocks — bounded follow-up (2026-10-18)

Read-only production observation at 08:05–08:07 UTC: the primary
`ir_market_snapshots` row was written at 08:05:51.304 UTC and its payload
`fetchedAt` was 08:05:51.007 UTC. The public `/api/market?diag=1` read the
stored payload successfully. It contained 762 stocks and 9 gold rows, with a
complete collection receipt. This proves recent collection and storage, not
that every quoted price was observed recently.

All 762 stock rows lack `sourceDate`; the sampled stock has `sourceTime` but no
date. The [BrsApi AllSymbols contract](https://brsapi.ir/) calls `time` the
last-price information time and does not document a quote-date field; its
published JSON sample likewise shows `time` without a date. The relay maps
only the provider's `date` and `time` fields. It must leave a missing date
unknown. The separate index date and the snapshot receipt cannot establish
the trading date of each stock, fund, or option quote. A clock alone cannot
establish its age across days, including market closures.

The 9-row gold family had 2 older source observations despite its recent
family receipt. Individual local gold rows can therefore be recent while the
conservative family summary is stale. The correction in this change labels
that aggregate cause `old-price-time`; it keeps `old-receipt` for retained or
actually old collection receipts. It does not change prices, collection,
storage, schedules, freshness thresholds, or provider quota.

The public stock status must continue to say that a complete source price
time is unknown; a stock's supplied hour may be shown only as an hour with
its date explicitly unknown. The gold/currency cards already show each quote's
source date/hour and their separate family receipt. For a future stock
freshness claim, obtain a provider-backed per-symbol quote date and time with
timezone and a clear definition of whether it is trade time, quote time, or
last-update time. Validate the fields on actual responses before changing the
relay and its UI contract. Never infer a per-symbol date from `fetchedAt`, the
index date, the current calendar day, or an older historical candle.

Intermittent Vercel-to-primary connection timeouts on public routes are a
separate open issue. A single successful read or healthy primary container
does not disprove those failures; this change does not claim to repair them.
