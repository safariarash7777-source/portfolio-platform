# P01 — Financial API session classification

Observed: 2026-10-02. Isolated source delivery; no deployment or database mutation.

## Scope and ownership

Base: `f0e002bc7c9f22f0425adc41b8b6b81c3a1fcc11` / Draft PR208 (`codex/p01-session-contract-20261002`). Runtime patch: `1f5c5876fe9d641f163752cde179619eba502877`.

P01 owns Auth classification. P04 owns financial readers, receipts, calculations and schema. This patch only changes the existing `financialAuthentication` adapter and its tests; its `{ user, error: boolean }` return contract remains compatible with those consumers. It creates no parallel account, grant or financial model. P04's reported read/receipt source `f58f6f0` is a separate dependency, not installed or accepted by this delivery.

## Corrected behavior

Previously the financial adapter used its own broad status classification, diverging from the shared session contract. It now calls `authSessionFailure` from PR208. A missing/rejected/explicitly expired session yields a null user and the existing financial handler's HTTP401. Unknown errors, unknown400,404,429,5xx and non-JSON/network failures yield HTTP503. A user returned alongside an Auth error is discarded. Both failures stop before a private financial RPC and retain the existing private/no-store response.

The PR208 helper is required before this patch. Applying this adapter alone to the older195 helper would retain that helper's older classification. No policy, role, owner relationship or RLS predicate changes.

## Evidence

- `lib/portfolio/financialHttp.test.ts`: 15 passed, 0 failed, 0 skipped. Includes actual SDK error classes, stale-user rejection, successful adapter shape, and zero-RPC assertions for holdings and debts.
- TypeScript typecheck passed after correcting test constructor arguments to the installed SDK signature.
- Targeted ESLint and `git diff --check` passed.
- Remote CI/build is the delivery gate; a heavy local build was omitted to preserve the review laptop's available memory.

These are synthetic function/handler and SDK tests. Native HTTP, DB/RLS, owner login, refresh and independent A/B acceptance remain OPEN. No migration, credential write, service restart, Production activation or change to demo65 was performed.

## Consumption and rollback

Consume PR208 first, then this runtime commit. P04 can retain `financialAuthentication`; no new interface is needed. Rollback is reverting the adapter/test commit in the consuming branch, without touching accounts or stored financial history. A deployment and native acceptance require the environment owner's separate integration step.

## Tools

PowerShell, Git, installed Node/TypeScript/tsx/ESLint and the installed Supabase SDK. Supabase and Next.js skill guidance used for canonical identity and session boundaries. No live provider or private client data used in tests.
