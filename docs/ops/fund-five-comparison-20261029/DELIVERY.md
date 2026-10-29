# P08.3 — five-fund comparison slice

This extends the existing merged PR316 tool; it does not replace its data pipeline. The [pre-implementation scope and criteria](PLAN.md) remain the technical contract. The coordinator owns project status, merge and release decisions.

The initial capacity slice below is historical evidence at `1d7b3586931548fe35f1d5cacbf4ad93771c3d30`. The read-state follow-up at the end changes the source and therefore requires its own exact-head CI/Preview evidence. An old successful CI or zero-row response is not proof of the new source or real five-fund acceptance.

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

## Read-state follow-up — no false source-empty claim

The initial real Preview showed zero selectors and the old text claiming an empty snapshot. That text was based only on `funds.length === 0`. Subsequent read-only evidence reported by C through the coordinator found an HTTP 402 on the existing destination read; the existence/count of stored rows, the cause of 402 and fallback outcome remain unknown. Zero displayed rows therefore did not establish an empty source.

`FundsPage` now passes the same existing `SourceAvailability` result to `FundsFullBoard`, alongside the existing validated observations. The board does not issue any read or retry. For zero displayed rows:

- The existing validated fund-family `empty` state, with no failed/timed-out read, can describe a valid response without rows. Unrelated partial families do not invalidate that independent fund-family result.
- A read-error or timeout has priority, even if an inconsistent caller also supplies an empty-family label. The message names the read failure/time limit and says source emptiness is unconfirmed.
- Unavailable, stale, missing or unknown quality does not claim an empty snapshot. Rejected rows are not evidence of source emptiness.

No core data/quality function or freshness policy changed. Retained observations and their null/zero distinctions still pass through the existing guards; the five-slot comparison remains intact. The existing accessible status text changes only this explanation. There is no new helper, endpoint, refresh behavior, collection, persistence, provider, credential or environment change.

The actual page/board behavior tests reproduced four failures against the prior implementation (missing metadata transfer and false empty messages), then passed after the fix. The targeted page/board/comparison suite passed 28 tests, 0 failed/skipped. Full local core passed 2062 + 17 + 6 + 5, with 0 failed/skipped; final TypeScript, targeted lint, build and diff checks passed. Existing test registration was reused in the fund page test; no shared package or shared data test was edited. Old financial/capacity validation above remains attributed to its original source; new exact-head cloud checks are linked on PR337 after independent readback.

This fixes an independent consumer explanation. It does not resolve the destination read error, establish an authoritative empty snapshot, supply class evidence or accept five real funds. C/coordinator retain source/destination investigation; this executor retains subsequent real consumer verification on the exact Preview/SHA. No previous successful test/CI or known old empty GET is rerun as a substitute for new evidence.
