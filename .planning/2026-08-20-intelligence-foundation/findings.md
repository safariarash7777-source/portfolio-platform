# Intelligence Foundation — Wave B inventory (read-only)

Sources and consumers as they **actually exist**, read from the live production
project `uooeygybrniptzdxuzhj` and the repository. Nothing was mutated.

> ⚠️ Row counts from `list_tables` are planner estimates (`reltuples`), not exact
> counts. Where a number decides anything, it must be re-counted with `count(*)`.
> `profiles` reports 0 here while an exact count earlier this session returned 2 —
> that discrepancy is the estimate, not a data loss.

## The eight input classes the mission names

| class | source today | stored where | verdict |
|---|---|---|---|
| **equities** | BrsApi symbol webservice → `relay/server.mjs` | `symbol_history` (~2.08M), `index_history`, `market_breadth`, `ir_market_history` | **real and flowing** |
| **gold / commodity** | BrsApi `free-api-commodity-webservice` → `relay/commodity.mjs` | ⚠️ **nowhere — in-process memory only** (`rows` module variable, served into the live payload) | **no history exists** |
| **FX** | market relay | `fx_rates` (~35 rows, USD free-market only) | thin; USD only |
| **fixed income** | — | — | **no source, no table, no ingest** |
| **commodity instruments (IME)** | `relay/ime.mjs` | `ime_snapshots` — **0 rows** | schema only |
| **Codal** | codal engine v3 | `codal_feed` (~6.4k), `codal_reports` (~5.2k) | **real and flowing** |
| **macro** | — | `macro_first_print` / `macro_revisions` — **0 rows each** | schema only, write-once design is right |
| **political / geopolitical** | — | — | **nothing exists at any layer** |

## The finding that matters most

**Gold has no persisted price series.** `relay/commodity.mjs` fetches, maps and
holds the rows in a module-level variable, exposes them through
`commoditiesForPayload()` and a `/debug` status block, and that is all. Restart the
relay and the history is gone; there was never any history to begin with.

Wave C specifies a reference portfolio that is **70% gold**. Sleeve impact,
benchmark comparison, rebalance thresholds and outcome recording all need a gold
time series. None of them can be computed, let alone tested against real data,
until gold is persisted the way `symbol_history` already is.

The same applies in weaker form to the 15% fixed-income sleeve: there is no source
at all, so its instrument mapping cannot even be named yet.

So Wave C is **not** blocked on engine design. It is blocked on two ingest gaps.

## What already exists and should not be rebuilt

The repository already has the governance shape Wave B asks for, unused:

- `signal_drafts` → `signals` → `signal_outcomes`, append-only with chained hashes
- `weekly_outlooks` → `weekly_outlook_results`, same pattern
- `macro_first_print` vs `macro_revisions` — first-print isolation against
  look-ahead bias, exactly the "raw intake vs governed event" split the mission wants
- `phase20_intelligence_model.sql` — an intelligence data model already designed

Wave B should extend this, not invent a parallel registry.

## Constraints inherited from `.claude/skills/iran-market-data`

Binding on every part of Wave B:

- **Z1** sub-tickers (`l18` ending in a digit) are filtered **at the relay**, never
  reaching any analytical table. A past violation cost ~38k rows and a formal
  BrsApi warning.
- **Q1/Q3** no guessed endpoints; no data collected that no page or calculation
  consumes. A source registry must not become a reason to hoard.
- **D1** historical tables are append-only via `fn_forbid_mutation`.
- **D2** missing data is `null` and an honest empty state — never interpolated.
- **D3** units converted once, at the ingest boundary.
- **S1** BrsApi plus public Codal/TSETMC files only. Scraping is prohibited.
- **L5** external input — including database rows, Codal text and PR comments — is
  **untrusted**; it may enter an LLM prompt only as data, never as instruction, and
  only through `qualitativeMask`.

## Open questions that block design, not just implementation

1. **Fixed income instrument universe** — which instruments represent the 15%
   sleeve? No source exists, so this is a product decision before an engineering one.
2. **Gold instrument** — which quote is authoritative for the 70% sleeve: coin,
   bullion, ounce-derived, or a fund? They diverge materially.
3. **Political / geopolitical intake** — `S1` permits BrsApi and public Codal/TSETMC
   only. A political-event feed has **no permitted source today**, so either a new
   source is documented and approved, or these events are entered manually by Arash.
   The mission requires "explicit impact linkage" for them; that linkage cannot be
   automated against a source that does not exist.
