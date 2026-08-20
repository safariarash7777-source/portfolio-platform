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
| **gold / commodity** | BrsApi commodity feed → `relay/commodity.mjs` (spot metal, in-memory) **and** the gold ETFs `طلا` / `عیار` via the symbol feed | spot: nowhere · **ETFs: `symbol_history`, 2211 and 1973 rows** | **history exists — see the correction below** |
| **FX** | market relay | `fx_rates` (~35 rows, USD free-market only) | thin; USD only |
| **fixed income** | fixed-income ETFs via the symbol feed | **`symbol_history`** — `اعتماد` 2754 rows since 2015-03 | **history exists — see the correction below** |
| **commodity instruments (IME)** | `relay/ime.mjs` | `ime_snapshots` — **0 rows** | schema only |
| **Codal** | codal engine v3 | `codal_feed` (~6.4k), `codal_reports` (~5.2k) | **real and flowing** |
| **macro** | — | `macro_first_print` / `macro_revisions` — **0 rows each** | schema only, write-once design is right |
| **political / geopolitical** | — | — | **nothing exists at any layer** |

## ⛔ CORRECTION — the section below was wrong

**Retracted 2026-08-20.** Everything from here to the end of this section is a
mistake I made and Command Center caught.

I traced the *commodity relay* — which fetches spot metal prices and holds them
in a module variable — found no persistence, and concluded gold had no history.
I never checked whether gold was already covered as an **ETF** inside
`symbol_history`. It was, and so was fixed income:

| symbol | rows | first | last |
|---|---|---|---|
| `طلا` | 2211 | 2017-06-10 | 2026-08-19 |
| `عیار` | 1973 | 2018-06-02 | 2026-08-19 |
| `اعتماد` | 2754 | 2015-03-14 | 2026-08-19 |

Zero duplicate dates, zero null/non-positive closes, all current to the previous
trading day. The allocation page already reads these six symbols and computes all
three presets from real production history.

**Wave C was never blocked by missing ingest.** Full evidence in
[`series-profile.md`](./series-profile.md).

The paragraph below is kept, struck through, because deleting a wrong claim hides
that it was made.

---

~~**Gold has no persisted price series.**~~ `relay/commodity.mjs` fetches, maps and
holds the rows in a module-level variable, exposes them through
`commoditiesForPayload()` and a `/debug` status block, and that is all. Restart the
relay and the history is gone; there was never any history to begin with.

Wave C specifies a reference portfolio that is **70% gold**. Sleeve impact,
benchmark comparison, rebalance thresholds and outcome recording all need a gold
time series. None of them can be computed, let alone tested against real data,
until gold is persisted the way `symbol_history` already is.

The same applies in weaker form to the 15% fixed-income sleeve: there is no source
at all, so its instrument mapping cannot even be named yet.

~~So Wave C is not blocked on engine design. It is blocked on two ingest gaps.~~

**That conclusion was wrong.** The spot-metal relay genuinely has no persistence,
but nothing needs it: the sleeve instruments are exchange-traded funds already in
`symbol_history`. No new ingest path and no new table are required.

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
