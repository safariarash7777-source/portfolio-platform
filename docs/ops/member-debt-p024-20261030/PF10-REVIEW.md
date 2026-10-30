# PF10 / existing member installment flow

The member can associate a known installment with an existing dated actual cash-flow expense, provide an optional reference, and review immutable declarations and corrections. The expense remains the only amount/date/unit source. No bank verification, principal/interest split, automatic remaining balance, new schedule, upload or provider is introduced.

Owner: existing START-B. Audience: member and Arash reviewing the member journey. Dependencies: PR344/fa7303f product source, existing holdings/debt and CF v1 contracts, native session. Root retains shared program/integration and target installation ownership. This scoped review is linked from the existing PF10-SPEC and does not replace COMMAND-CENTER.

## Review path

1. Open `/dashboard/holdings#debt-payments` in an authorized native session. An unavailable candidate schema shows a closed writer, while existing financial editors remain independent.
2. Select the exact expense period; use the existing `/dashboard/cashflow` editor to record actual expenses once. Select a known installment and one actual expense. The new form cannot accept another money/date value.
3. Save the declaration. A confirmed receipt must also appear in a separate history GET before the draft is released. An unknown response preserves body/token/base; receipt recovery is GET-only. Only an explicit exact retry may reuse that original request.
4. Review source version/date/unit, unknown allocation, member reference, server timestamp and previous correction versions. A new CF version marks the pinned source stale/removed until explicit reconfirmation; it never replaces amounts automatically. A previous financial basis is read-only. Use current basis for a new correction, retaining its payment key and CAS version.
5. Due-date reminders remain the existing DebtSchedule, independent of declarations. No external message/channel is added.

## Validation and acceptance boundary

- `lib/portfolio/debtPayments.test.ts`: strict metadata/actor/period/receipt contracts, partial totals, missing-schema reader, origin/auth/basis denial, exact recovery; actual workspace handler tests for draft locks, GET readback, historical/unavailable state and actor change. Synthetic seams are labeled.
- `lib/portfolio/debtPayments.integration.test.ts`: both existing privilege profiles, disposable CI-local databases only; candidate absence before installation, two partial expenses, independent native read, lost response/exact receipt, CAS/history, concurrent duplicate-source prevention, over-amount/zero, foreign/admin/anon denial, direct DML closed, source stale/removed, historical basis, 50-row cursor and unchanged financial/CF fingerprints. It requires the existing CI service and does not run against a live project.
- Exactly two additions to existing `test:core` and `test:db`; guards and prior test lists are preserved. No dependencies or lockfile changes.
- SQL is `sql/debt_payment_links.sql`, a candidate, **NOT_APPLIED** to any target. Native test installation is confined to newly created, ownership-marked disposable databases. Primary install, grants, real Auth/PostgREST and Arash acceptance remain separate root gates. Preview readiness or anonymous redirects do not satisfy them.

No main merge, model/Hermes invocation, service change, cost, provider setup or real account operation is authorized or performed by this package. If a deployed target lacks this schema, the new section must remain unavailable rather than report an empty payment history.

## Target installation / recovery handoff

Root must separately validate the exact reviewed candidate hash, compatible reader deployment, database identity and preconditions, capacity, fresh backup/restore, install authorization, owner/foreign readback and rollback plan. Collision guards fail atomically rather than replacing existing objects. After any successful declaration, history must remain preserved: closing the writer and serving read-only history is preferable to deleting the new table. This candidate contains no destructive rollback against accepted data.
