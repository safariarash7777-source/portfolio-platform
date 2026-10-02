# P04 product checkpoint

2026-10-02. Draft PR205, stacked on PR200; development baseline PR195@31c44ab635b672b589b7833bcbc78b41d36f1e75. Supersedes the earlier helper-only stage in INVESTMENT-SCOPE-RESULT.md. P04 human/native acceptance remains OPEN.

## Delivered

Existing holdings UI now mounts CSV preview and a version-bound investment-scope preview. Add/edit/full-snapshot CAS stays in the existing form. CSV requires explicit ownership, valuation mode and money units, preserves unpriced items and all current unsaved valid rows outside the file, and requires explicit consent for matching-key updates. Invalid precision, currency, ownership or row structure blocks transfer. Changing preview/draft invalidates its approval. Transfer only populates the form; save remains a separate action.

Scope starts unknown per position, excludes consumption assets only by member choice, and binds confirmation time/rules/selected keys to the same holding version. Comparison uses selected investment assets. Unknown classes, missing price or incomplete coverage cannot produce a definitive comparison. Confirmation is visibly a local preview; account persistence is not implemented or implied. Whole balance-sheet debt/net worth remains separate.

Native GET snapshot and SELECT-only receipt handlers are implemented on existing canonical tables/RLS. See READ-RECEIPT-CONTRACT.md. No SQL, auth model, globals, publication, feed or notification change. Undefined optional cost basis now normalizes to null rather than NaN.

## Verification at this product checkpoint

- test:core 1301 PASS, test:calc 106 PASS; targeted portfolio 54 PASS; TypeScript noEmit, scoped ESLint max-warnings=0 and git diff --check PASS.
- Full repository ESLint max-warnings=0 PASS after removing the ignored generated fixture bundle (third-party bundled React/Next code is not source lint input); fixture source itself stays tracked and linted. Secrets scan PASS. Product/source checkpoint f58f6f0baea9a24987a7b7a7c4099b5a9d205804; clean fixture-ending build pin 7b92b165d0f389cf8531dc64788f377c93825758.
- Actual React components bundled with esbuild and existing Tailwind/Vazirmatn on loopback3444; synthetic data and synthetic fetch only. No Next/native auth/database/market dependency.
- Browser: initial scope confirmation blocked; house excluded and gold/cash selected gives 1,000,000 toman denominator (60/40 versus 50/50). Whole assets 101,000,000, debt 120,000,000 and net -19,000,000 remain independent.
- Invalid CSV blocks transfer. Valid CSV preserves three existing positions, imports 2,000,000 IRR once as 200,000 IRT before 50% ownership, and preserves 12.5 gram unpriced quantity. First synthetic 409 preserves all five draft positions and base_version=2. transport-witness.json is synthetic, including its random client token.
- Mobile 390x844: document clientWidth=375 and scrollWidth=375. Screenshots/DOM under ui-evidence. No claim of native browser acceptance or genuine concurrent DB CAS.
- Live GitHub CI at exact build pin 7b92b165d0f389cf8531dc64788f377c93825758: CI Gate, Typecheck/Lint/Tests/Build, Database RLS/Integrity and Secret scan/SQL validation all completed success; Supabase Preview skipped. Check URLs/timestamp are in PRODUCT-VALIDATION.json. This verifies full Next build and existing DB suite, not native acceptance of the new SELECT adapter or authenticated product UI. P00 additionally launched an isolated 2GiB/1CPU/network-none server job at the same pin, receipt pending.

Reproduce lightweight fixture: `node docs/ops/seasonal-program/p04/fixtures/serve.mjs`, open http://127.0.0.1:3444. Server is temporary; build output stays ignored under .task.

## Open gates

Full Next build is verified by current product-pin CI; no heavy laptop build was run. Native read/receipt/session/RLS/CAS acceptance needs the P00 environment and fixed product SHA. Real writes/import commit remain blocked pending account binding, durable member confirmation, receipt/mappings/freeze contract. Performance/cashflow coverage and three historical human examples remain unaccepted. P06 waits for P02/P04/P07; P10 waits for P04 acceptance. No merge, deploy, Production or customer message.
