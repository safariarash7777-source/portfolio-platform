# PR-01 focused evidence — 2026-10-17

This is an acceptance receipt; the only status ledger remains `docs/COMMAND-CENTER.md`.

Product tested: `065c293afa9a30ca2bd213c1936abaa92918cb57`, tree `a74bb120a7c0a93c2abd39643765507fa7dcfbd9`. No product source changed in this package. Owner: current Codex coordinator, portfolio/research lane.

## Corrected evidence scope

B3-R2 run `e2eb3r2-3cbe2e07` tested product `70d7a6e67761819870a10feea8906ddaa284ea88`, tree `fdc2cc6367cf247cbd2abc15a5fc14ca94eae334`: 11 PASS, 0 FAIL, 1 BLOCKED. Its scope is synthetic local Auth/REST/Next/DB HTTP access acceptance, not financial save/version acceptance. The final isolation scenario explicitly asserts no financial writes. R2-L03 was blocked because official IAB and Chrome were unavailable; logout HTML rendered but the button was not clicked. This is a historical environment limitation, not evidence of a product logout bug or of today's browser availability.

## Targeted current-code verification

The missing save/retry witness justified one bounded run, not a full suite/build replay:

```text
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 components/portfolio/financial-forms.test.ts components/portfolio/investment-scope.test.ts components/admin/ResearchWorkbook.test.ts
```

Windows, Node v24.19.0, existing dependency junction, no installation: **80 PASS, 0 FAIL, 0 SKIP**, exit 0. Log: [pr01-focused.log](pr01-focused.log), SHA256 `f03834fe86e05006702426cca95c636992d58c6665729b9532171fd4dedd3712`.

These tests exercise actual form/handler code through synthetic hosts and mocked transport/storage: original request/token retention after lost responses, rejection/conflict handling, financial editor lease, scope retry, workbook reopen/new versions and preserved edits. They do not exercise a browser, real database durability, Production ACL/RLS or actual member sessions. They do not establish draft survival across every navigation/remount. No tests were changed to obtain this result.

## Remaining acceptance boundary

Real browser save → independent read → second version and real cross-member isolation require an owned disposable environment and a destination/identity receipt before writes. Do not run the existing Postgres recovery suite against an unverified local service: its setup drops fixed-name test databases. Runtime model quota is unrelated to these synthetic storage checks.

No product fix was indicated by this run. This evidence-only change has no runtime deployment effect; rollback is removal/revert of the receipt. Future repetition requires a relevant code/environment change or a missing scenario, not merely another status request.
