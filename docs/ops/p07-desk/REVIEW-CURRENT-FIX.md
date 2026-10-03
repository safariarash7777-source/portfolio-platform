# F-PROD-02 — current review UI correction

Date: 2026-10-03. Authorized scope: minimal isolated P07 correction and lightweight regression evidence. Base: PR206 at `051ca87fb7ee881afbd156fee6f26093d82f1220`; branch `codex/p07-review-current-20261003`. This is a stacked Draft change, not an update to the installed cfa candidate.

## Result

`ResearchWorkbook` now derives `approvedHere` using the existing `p07ReviewCurrent(saved.version, saved.latestVersion, reviews)` rather than any historical approval. A later return clears the current-approval badge and enables re-approval of the latest complete, clean version; reopening preserves that result. Re-approval restores the badge. A return tied at the latest timestamp wins, and an older approved version does not carry a current-approval badge.

The existing `canDecide` server-ready/latest-version/dirty/busy gates, structural checklist, human confirm/prompt, append-only reviews, server publication authority and API contract remain in place. No helper semantics, server code, ledger, schema, migration, lockfile or installed service changed. The existing helper assumes canonical normalized timestamp strings, as before; this change introduces no timestamp conversion contract.

## Verification

`components/admin/ResearchWorkbook.test.ts` executes the actual TSX component, its event handlers and returned element props with a minimal hook host. It uses the existing in-memory fixture and canonical workbook handlers, plus controlled review-response histories. It does not duplicate the approval expression and adds no test dependency. This is a local component/handler boundary regression, **not React DOM/browser reconciliation or Native SQL acceptance**.

Before correction: **0 PASS / 2 FAIL**, at the stale badge after return and equal-time returned review. After correction: **34 PASS / 0 FAIL / 0 SKIP**, comprising two component-boundary tests plus workbook/store/publication/workflow regression tests.

Covered component behavior:

- save→open→approve→return→new mount/reopen→re-approve, including badge and approve-button props and three retained reviews;
- equal-time return prevents current approval;
- older approved version has no current badge and both decision buttons disabled;
- pending request disables both decision buttons, while busyRef rejects a duplicate invocation from the prior render;
- editing the title sets dirty state and keeps both review actions disabled.

The new component test is included in `test:core`. Full TypeScript check passed. Targeted lint and four existing static React checks passed. No local heavy build or service was started. CI evidence, when available, belongs to the exact correction head and must not be transferred from PR206 or cfa.

## P00 follow-up gate

The cfa commit `cfa4e211dc1c1dd50141eadd0f2a884151f78e06` and installed environment remain untouched. Its ResearchWorkbook pre-fix blob matched base051; P00 can review this bounded patch for a future authorized candidate. Do not call cfa corrected.

Native browser/publication acceptance remains **NOT_RUN / OPEN**: on the authorized resulting candidate, independently run approve→return→reload, check badge and re-approval affordance, verify publication ready/publish denial after return, re-approve and verify only intended eligibility is restored. Include equal-time/older-version denial receipts at the canonical server/SQL layer. Record Native receipts separately from this local synthetic evidence. No human approval process or Production action is authorized by this delivery.
