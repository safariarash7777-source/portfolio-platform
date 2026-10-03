# RECOVERY-01 / P04 — minimum persistence

2026-10-03. Authority: full RECOVERY-01-arash-site.md SHA256 7bcc9de9da825cef1900f53227c80952cd0ecb553c8632d99ee17e3722be14d5, section6. P00 is sole release coordinator. Patch development starts from existing P04@1fcb3a1; this is not the selected Production release base.

## Current source difference

At Production source pin 51fd0661d48d791ce8758a87828a81ce72cac6df, `app/api/portfolio/holdings`, `/debts`, `/dashboard/holdings`, lib/portfolio and phase32/34/35/36/37/38 are absent. Existing dashboard reads legacy `holdings` and `portfolio_versions`; the latter is target/advisor allocation history, not actual holdings/debt snapshots. P00 current metadata receipt P00-PRODUCTION-SCHEMA.json at2026-10-03T09:38:24Z confirms canonical asset/debt tables/RPC absent in the actual main-site backend, while portfolio_versions exists with RLS. No live private amounts were read here.

Canonical existing implementation: phase32 member_holding_versions/positions and phase38 assets+debts in one immutable financial version. Full phase38 also extends consultation; recovery extracts its financial core byte-for-byte and leaves advisor RPC absent. Thus owner-only minimum does not need phase34/35/36/37: phase38 core itself installs the same current financial writer with PT409. Existing portfolio_versions cannot store actual quantity/ownership/valuation/debt without changing its target contract. Do not copy legacy holdings silently, remove records, or replace dashboard shell/public appearance. Legacy dashboard and target history remain in place and are explicitly linked from the financial page. No invented units/ownership or automatic historical conversion. Import/performance/alerts/P06/P10 are not recovery prerequisites.

## Minimum addition being prepared

One append-only scope review metadata table attached to the canonical financial UUID, with server-generated confirmation timestamp, rule version and complete per-position choices. Separate scope revision enables correcting selection without rewriting holdings/debts. A new financial snapshot does not inherit a prior confirmation. Idempotent token + base scope revision + same per-owner financial advisory lock prevent stale tabs silently winning. Scope does not create another financial history or accept client owner/time authority.

Existing scope UI reads the recorded review, saves through native-session RPC, preserves choices on error/conflict and compares only using durable confirmation. Historical financial versions keep their own review and remain read-only; selecting new unsaved scope stops comparison until saved. No personalized notification or definitive rebalance from local state. Existing financial writer, ownership/toman/null conventions and history UUID unchanged.

## Schema/operation gate

CLI2.117.0 generated candidates `20261003094257_recovery_personal_balance_sheet_core.sql` (exact existing phase38 core before advisor RPC) and `20261003094327_member_investment_scope_reviews.sql`; NOT_INSTALLED. Order: existing phase32 → core → scope. Initially generated earlier scope scaffold was replaced with a fresh CLI-generated later scaffold to preserve ordering; it was never installed. Prerequisites: auth.users/profiles, existing portfolio_versions, deny_mutation/is_admin; P00 checks real grants/signatures and assigns release hashes. No research/consultation table dependency or advisor authority added. Do not install independently or before destination-specific backup/restore proof. Previous main app ignores new tables; rollback preserves old target/holding histories and all new financial/scope rows, disables canonical writes by revoking new RPC execution, and restores previous app/config. No DROP or financial rewrite.

Local Docker daemon unavailable; no new local/sandbox service started. DB tests will use the existing disposable CI/Postgres mechanism or a P00-approved test job, then acceptance on the main domain after coordinated installation. Backup validity is destination-specific; old synthetic restore cannot satisfy it.

## Acceptance required before closing

Native owner A save assets/debts → logout/login/reload/second session → exact persisted UUID/current+previous versions; negative net worth, unknown prices/null, partial ownership, IRR once and unpriced items. Scope save → reload/second session, new assets/debt UUID requires fresh confirmation, previous review retained. Concurrent same financial or scope base conflicts; exact retry reuses same version/time. B and admin without dedicated consent cannot read A private assets/debts/scope. Anonymous/expired/outage fail closed. Current main-domain familiar appearance at390/1440; no synthetic fixture leaks.

Code, CI/Postgres proof, native acceptance, backup/install and published main-domain result remain separate. This document is a work-package record; central state/manifest belongs to P00.

## Legacy holdings privacy correction

P00 live policy receipt `P00-LEGACY-RLS-EXPRESSIONS.json` at 2026-10-03T10:04:14Z confirms both holdings/hold_self_read SELECT and hold_owner_write ALL allow `auth.uid()=user_id OR is_admin()`. P00 assigned this bounded correction to P04. Independent CLI candidate `20261003100542_recovery_legacy_holdings_owner_only.sql` alters BOTH policies to authenticated owner-only and revokes table-wide TRUNCATE from PUBLIC/anon/authenticated; no row/table is deleted or changed. Existing owner row DML remains, owner reassignment is denied, and portfolio_versions policy/target contract remains unchanged. Inventory drift aborts the transaction for P00 review. The security rollback retains this restriction; it must never reopen the former admin exception.

Real Postgres tests reproduce the pre-install admin exposure, apply the candidate twice, check A/B/admin/anon row access and insert/update/delete/TRUNCATE denial, owner DML and ownership reassignment, and exact preservation of legacy row/target JSON on both privilege profiles. This is DB proof; actual main-domain HTTP owner/B/admin acceptance remains pending coordinated installation and account sessions. No invented legacy API or mock HTTP proof replaces it. Selected runtime closure and transfer exceptions are in `P04-SELECTED-FILES.json`; no whole-parent-branch merge is authorized.
