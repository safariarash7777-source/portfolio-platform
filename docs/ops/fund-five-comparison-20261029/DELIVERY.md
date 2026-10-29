# P08.3 — five-fund comparison slice

This extends the existing merged PR316 tool; it does not replace its data pipeline. The [pre-implementation scope and criteria](PLAN.md) remain the technical contract. The coordinator owns project status, merge and release decisions.

## What changed

The existing comparison now has five manual slots and a shared maximum of five in the pure core. Two remains the minimum; six and duplicate inputs fail closed. Existing type/currency, documented unit class, NAV quality/clock/pairing and actual-return-period checks apply to the fourth and fifth row as well. No financial formula, provider, source mapping, endpoint, collection process or persistent store changed.

The price-return notice now explicitly says the reinvestment assumption is unknown. Observed unadjusted price return is still distinct from total return; missing dividend, reinvestment or fee information is not replaced by zero. Numeric comparisons remain null with reasons when independent class/time/period evidence is missing. Existing observations stay visible.

Selectors and cards use shrinkable mobile tracks and five desktop columns. Clearing resets all five slots; a different fund type/currency and already-selected funds remain disabled. No automatic selection, ranking or substitutions were added.

## Reproduced baseline and validation

Fresh main was read at `f93dbdce73ef9e57b8e5eb84af13c4a20034d5bc`. Its two missing capabilities were reproduced without changing the checkout: the original core nulls a fully attested five-fund zero-bubble comparison, and the original component renders only three native selectors. Those two contract checks fail on the pinned baseline. The modified core/component tests pass, including fully attested four/five-row observations, a sixth-row rejection, and fifth-row class/currency/type, stale NAV/missing clock and different-period failures.

Local results (overlapping suites; counts are not product acceptance):

| Check | Result |
|---|---|
| Relevant fund/core/route/rendering/vocabulary cases | 104 passed, 0 failed/skipped |
| Final changed core/component cases, including reinvestment notice | 15 passed, 0 failed/skipped |
| Full core and existing guards | 2057 + 17 + 6 + 5 passed, 0 failed/skipped |
| Calc | 129 passed, 0 failed/skipped |
| Final product build, TypeScript, targeted lint and diff check | Passed |

These ran through the already installed Node/tsx/Next/TypeScript/ESLint tools. Existing test registration is reused; package.json, dependencies and the lockfile are untouched. The full core/calc pass preceded the final notice-only clarification; final component tests/build/type/lint cover that clarification, and exact-head cloud CI is reported on the product PR separately.

## Actual component, synthetic browser evidence

The existing `scripts/testing/fund-comparison/browser-fixture.mjs` was extended to provide five same-type synthetic observations plus incompatible type/currency options. It stays an explicit development fixture, outside product routes and runtime imports. No fake observation or confirmation adapter is installed in the product.

Five funds were manually selected in the actual React component; duplicate/type/currency options were disabled. Removing the fifth left four cards; reselecting and clearing produced five empty selectors, zero cards and the honest empty state. Unknown unit class, stale NAV, observed zero price return and actual period labels remained visible. The final notice was verified after rebuilding/reloading the fixture.

| Viewport | Client / scroll width | Cards / slots | Controls or cards outside page |
|---|---|---|---|
| 320 | 305 / 305 | 5 / 5 | 0 |
| 390 | 375 / 375 | 5 / 5 | 0 |
| 1280 | 1265 / 1265 | 5 / 5 | 0 |

The scrollbar explains the 15px client-width difference. No overflow-hiding rule was introduced. [DOM receipt](browser-receipt.json), [320px screenshot](five-funds-320.png), [desktop screenshot](five-funds-1280.png). Temporary viewport overrides were reset.

The fixture's clocks, NAV states and numbers are deliberately synthetic, not a current-market freshness assertion. Its simple Link adapter does not prove the complete Next.js/Auth/data path. Preview deployment, real data sufficiency and Arash acceptance require separate evidence.

## Remaining boundaries and next owner

The present feed still lacks independent unit-class evidence, and its missing clocks/periods cannot be repaired by selecting five funds. The existing data owner and coordinator must reconcile that source contract before numeric live-comparison acceptance. No class is inferred from a symbol name or broad category. Total return, dividend/reinvestment data, fees, composition and leverage methodology remain outside this capacity slice.

The code is delivered for a separate product PR/Preview, not main deployment. Production environment, primary DB, source/relay adapters, company/consultation files, research PR330, Hermes and writer freeze are untouched. No new paid service or model call was introduced; incremental existing-CI cost has not been assessed. Rollback is a revert of this scoped code change; no data migration exists.
