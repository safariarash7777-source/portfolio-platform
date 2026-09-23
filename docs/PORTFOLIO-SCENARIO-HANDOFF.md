# Portfolio scenario tool — implementation handoff

## Purpose and ownership

Help a member understand how their own assumptions affect their portfolio, consistent with Master Vision: scenarios, attribution and explicit uncertainty. This is a hypothetical single-period calculator, not a forecast or a historical backtest. No probabilities or investment recommendations are generated.

Codex owns `lib/core/portfolioScenario.ts` and its tests in this branch. Claude owns the next UI integration. Existing PR #124 owns the public market/fund journey; PR #115 owns the admin intelligence desk. Do not overwrite their files. Start from current main and integrate this branch's commit after checking overlapping open work.

## UI scope for Claude

Build an independent `/tools/portfolio-scenario` page, after confirming that route is unused. Reuse the existing layout, typography, brand tokens and accessible controls. Avoid modifying marketDesk, AccountBridge, admin intelligence, SQL, payment, relay or deploy workflows. No new dependencies or database credentials are required.

- Inputs: starting portfolio value with explicit currency unit, asset labels, weights in percent, and assumed percentage returns over one explicitly labelled common horizon.
- Allow comparing up to three named scenarios with the same starting holdings and horizon. Labels are user assumptions, never probability estimates.
- Inflation is optional, for that SAME horizon. Blank is unknown, not zero. Show real return only when supplied.
- No preset actual portfolio or fabricated live market inputs. An optional synthetic example must say it is illustrative and only populate after user selection.
- Show monetary gain/loss, hypothetical end value, total nominal return, real return when available, and each asset's contribution in percentage points. Final weights are undefined when all capital is lost.
- Explain assumptions near results: no interim cash flows, fees, tax, leverage or rebalancing. All asset returns are assumed total returns for the period. This is separate from existing historical `runAllocation`.
- Invalid weights must show an error; do not normalise silently. Missing positive-weight returns produce `incomplete`, with missing labels and covered weight, never a portfolio return.
- Use the shared engine only. Keep unrounded numbers internally and format in UI. Persian/Arabic digits and decimal separators need deliberate input parsing. Blank and malformed numbers must remain distinguishable.
- No server persistence of portfolio details in this first iteration. Explain whether values are session-only; do not add analytics that capture amounts.

## Contract

Import `evaluatePortfolioScenario` from `@/lib/core/portfolioScenario`.
Inputs: `{ initialValue, holdings: [{ id, weightPct, returnPct }], inflationPct? }`.
Use stable unique IDs independent of editable asset labels. Percent values are 20 for 20%, not 0.2. `returnPct: null` means missing. Nominal returns may exceed 100%, but cannot be below -100%. Inflation must exceed -100%. Weights must total 100% (only floating point tolerance).

Output is discriminated by `status`: `invalid` with error codes, `incomplete` with `missingIds`/`coveredWeightPct`, or `complete` with totals and contributions. Map error codes to readable Persian labels. No total is returned for incomplete inputs.

## Acceptance

Hand check: capital 1000, weights 60/30/10, returns +20/-10/0 yields final value 1090, profit 90 and nominal return 9%. At 10% same-period inflation real return is approximately -0.9091%, not -1%. Contributions are +12/-3/0 percentage points.

Verify mobile 360/390 and desktop, keyboard operation, labelled inputs, RTL and no horizontal overflow. Exercise incomplete/invalid inputs, zero returns, -100% loss, and Persian numeral entry. Run repo typecheck, lint, relevant tests and build; report actual commands and results. Deliver a reviewable PR with screenshots, not a production claim. Production publication and the Liara deployment task remain separate.

## Verification performed by Codex

On base main `21dfa37`, seven behavioral tests pass via Node 24 type stripping. The new test file is registered in `test:core`. Full application typecheck/build/CI have not yet been run in this scratch environment.
