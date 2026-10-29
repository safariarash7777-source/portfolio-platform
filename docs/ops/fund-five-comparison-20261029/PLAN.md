# P08.3 — five selected fund observations

## Problem, audience and ownership

The existing PR316 fund comparison accepts at most three funds, while the approved v0.4 EXECUTION-BACKLOG P08.3 requires comparison of up to five funds of the same type and period. This slice serves the market-page reader and Arash's research review. The existing START-B executor (`01a17cdc…/local`) owns only the fund comparison component/core/tests and this scoped technical record. The integration coordinator (`01a187f6…/local`) owns shared project references and release decisions. This is not another product plan/status ledger.

## Reuse and dependencies

Fresh `origin/main` is `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc`, containing merged PR315/316; the clean `fund-tools-20261024` worktree is reused on a separate `codex/` branch. Existing `/market/funds` reads the current bounded market snapshot, validates each NAV through `withValidNav`, and reads existing grouped history returns. `FundsFullBoard` already passes those observations to `FundComparisonPanel`; there is no new endpoint or request. The existing core checks exact provider type/currency, attested unit class, independent price/NAV clocks and pairing, NAV quality, actual return dates and unadjusted closing-price basis. Missing evidence produces null and a reason.

Independent unit-class evidence is absent from the present feed. That remains a data-contract dependency owned by the existing data executor; neither a symbol name nor fund type is a substitute. No shared source adapter, relay, company/consultation file, environment, primary DB, Hermes, model, provider or paid service changes are part of this slice.

## Spec and plan before implementation

1. Reuse the existing manual-selection UI and comparison core. Set a shared maximum of five; preserve the minimum of two. No automatic selection, ranking or new financial method.
2. Expose five labeled selection slots. Preserve duplicate/type/currency exclusions, clearing, snapshot-missing notices, return links, source/time/unit labels and existing mobile layout tokens. Use shrinkable single-column mobile tracks and bounded desktop columns.
3. Apply every existing eligibility and per-metric gate to all five rows. Six inputs remain invalid. Valid observed zero stays zero; missing class, clock, currency/period evidence or stale NAV never becomes a guessed value. Existing unadjusted price returns remain distinct from total return; dividends, reinvestment and fees remain unknown/excluded, not zero assumptions.
4. Extend the existing core and rendered-component tests, including fourth/fifth row failures. Reuse the existing synthetic browser fixture for five manual choices, reset, duplicate/type/currency exclusions and mobile/desktop review. Synthetic observations are explicitly labeled and are not market data.
5. Run relevant tests and required core/calc/build/type/lint checks; publish the code for review on a new product PR with exact SHA, CI and Preview evidence. Keep code, merge, deployment, live data sufficiency and Arash acceptance separate. The existing price-return limitation remains visible, with the missing reinvestment assumption stated explicitly.

## Completion criteria and evidence

- Four/five fully attested same-type/class/currency/day/period inputs yield the existing comparable outputs, including zero, without mutating input.
- A sixth row or duplicate blocks comparison. A fifth-row class/type/currency issue blocks all comparable metrics; stale NAV/clock failure blocks bubbles; mismatched return period blocks only that return window. Observations and reasons remain visible.
- Five manual selections and reset work in the actual existing component; no sixth slot, automatic substitution or extra data/model request. Missing live unit-class evidence remains explicit.
- The selected five fit the page at 320/390px and desktop without clipping controls or hiding overflow. Preview/fixture boundaries and source limitations accompany screenshots.
- The existing coordinator receives the product PR/head SHA, actual CI/Preview result, scoped evidence and remaining data-contract/acceptance owner. No Production or primary-data activation is implied.
