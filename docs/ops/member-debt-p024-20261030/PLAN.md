# P02.4 — existing debt/installment/partial-correction slice

## Problem, audience, owner and dependency

The audience is a member reviewing debt balances, one recorded next installment and its due date, then correcting the remaining amounts after a partial payment and reopening the exact financial version. Existing START-B owns this bounded slice, coordinated by root. Shared status remains in COMMAND-CENTER; this is a scoped implementation/validation spec, not another ledger.

The clean existing member checkout was reused on `codex/member-debt-p024-20261030` from product `c0eadaba4be1a070d3f93b2c9706e2c13e9a20f3`. Fresh origin/main remains f93; c0e retains the verified member-entry correction. PR342/8f, its static prototype and its files are absent from this product branch. Root explicitly confirmed exclusive ownership of DebtsWorkbench, financial-forms.test, recovery.integration.test and this scoped ops directory; A/C have separate nonoverlapping scopes.

The latest root reference 8dc2faf and its EXECUTION-BACKLOG state that P02.4 includes actual payment/reminders as well as balances, installments and dates. The current contract contains only a versioned remaining-debt snapshot and one optional next-installment pair. It does **not** contain a payment transaction ledger, recurrence, reminders, interest allocation, loan comparison or early-settlement method. A member-declared correction after a partial payment cannot be called a confirmed bank payment or completion of all P02.4. That remaining scope stays with root's existing program/decision path.

## Existing contract and observed gap

- `DebtsWorkbench` submits the entire debt list through existing `/api/portfolio/debts` and exact FinancialSaveAttempt body/token/base. Values reopen in integer toman even when original-entry currency was rial. No automatic principal/interest/payment derivation.
- `postFinancialSnapshot` validates/normalizes the existing wire body, calls `record_member_debts`, and returns the canonical receipt. Existing SQL makes a new financial version, preserves assets, serializes per owner, and reuses only exact tokens/content. No SQL/schema installation/change is proposed.
- Existing `/api/portfolio/holdings` GET (`getFinancialSnapshot`) reads the owner-bound selected/latest version with assets and debts. `DebtSchedule` displays one next installment per debt; past due means payment status unknown. It never deducts the installment again from net worth.
- Current historical debt UI disables submit but leaves fields/add/edit enabled. This creates a draft that cannot be saved, despite the historical-version message. Before code, an actual-component regression test will reproduce this gap. Fix only the historical edit lock and handlers; preserve the existing current-version and unknown-outcome flow.

## Small scope and observable completion

1. Add actual-component tests before code: historical fields/add/remove must be disabled, stale edit handlers must not acquire the editor or dirty the draft, and current-version inputs remain editable. Apply the smallest correction in DebtsWorkbench only if the baseline fails.
2. Exercise a labeled synthetic partial-correction scenario through the real form and API handler: remaining balance 200000 → 197000 toman; next-installment amount 10000 → 7000; explicit date and member note. These are supplied remaining amounts, not an amortization formula or inferred settlement.
3. Reuse the existing CI-local disposable Postgres integration path and existing migrations. Verify lost response after commit, independent readback, exact same body/token/base retry with one durable version, owner-only reads, preservation of old/new versions and assets, null installment/date pair, rial-to-toman once, and component remount from a fresh canonical GET. Test two existing grant profiles; no primary address or secret is needed.
4. Preserve failure messages, failed form input and version intent. Add no payment provider, account, Auth grant, DDL, feature flag, model run, automatic reminder or production write. Only targeted tests locally and required existing CI checks are relevant; do not rerun already-passed unrelated checks without a new delta.

## Evidence and acceptance boundary

Deliver exact source/PR/SHA, targeted before/after evidence and the disposable native/API readback result. The historical member-payments receipt proves only its recorded installment/balance-sheet scenario and reload at that time; it does not prove partial payments or current native acceptance. Native SQL with explicit actor seams, actual UI-handler tests, browser interaction, deployed real Auth and Arash acceptance must be reported separately. Root owns primary capacity/backup/restore and real-destination gates.

This slice finishes when the historical-edit gap is resolved and the existing manual partial-correction path has reproducible bounded evidence, or any remaining failure has a concrete owner and source. Full actual-payment/reminder acceptance remains open unless the existing program later supplies and accepts that separate capability.
