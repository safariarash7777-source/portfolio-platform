# P04 scope retry and acceptance handoff — 2026-10-09

Base: `c89229e261ad86f7b1efcb9815c86b93a1b0133e`. P00 alone integrates and publishes.

## Source finding and bounded fix

When a scope save committed but its response was lost, a subsequent 4xx response cleared the client token and unfroze the choices. The next attempt could therefore lose the original receipt or meet an avoidable scope revision conflict. This is a source finding with synthetic handler reproduction, not a Native/main finding.

The workbench now freezes the exact serialized request, token, choices and base scope revision until a matching receipt or the API's canonical CAS conflict. Later authentication, gateway, rate limit and noncanonical errors keep the original replay. Receipt validation binds the financial UUID/version, scope revision, assignments and reused flag. Synchronous refs prevent duplicate saves and stale edit events. A canonical conflict preserves the draft and opens the latest version separately; it never rebases automatically. The API, SQL, Auth, service and shared root checkout are unchanged.

Selected files: `components/portfolio/InvestmentScopeWorkbench.tsx`, `components/portfolio/financial-form-test-host.ts`, `components/portfolio/investment-scope.test.ts`. Register the new test in `test:core`; do not replace P00's package file wholesale.

## Installed schema read-only comparison

P00's `P00-FROZEN-SCHEMA-INSTALL-20261009.json` reports `APPLIED_MAIN_FROZEN`, installed schema selection from a4b6169. Normalized-LF SHA256 comparisons against c89229e matched all five financial/rollback files:

| File | SHA256 |
| --- | --- |
| legacy owner-only migration | 5ae23c1716a8bc0f077a1085f9035def910b40813352e264865ff077225f7f6b |
| phase32_member_holdings.sql | 12c40070fb9eeb918d83b8227565e7369be62fe3dcc845ac29a6a0a87ac6f780 |
| personal balance sheet core migration | 9954c8b0c7f01f8c39f1a90e67439368fdc1694941058e6d7293a94a12c0937f |
| investment scope review migration | 488de1fa2f2d26514d6a60d90b1b8ef73e9ea313efab22de38f1729a4c3a3067 |
| P04-ROLLBACK-FREEZE.sql | d23542b42ece59983256c80010be576f9d96d29209a554604ca7fcd84bb756c5 |

The installed batch asserts authenticated EXECUTE is false for `record_member_holdings(jsonb,text,text,integer)`, `record_member_debts(jsonb,integer,text)`, `record_member_investment_scope(uuid,text,jsonb,integer,text)` and `portfolio_scope_private.record_review(uuid,text,jsonb,integer,text)`. Public scope is SECURITY INVOKER and requires the internal scope helper permission too; public-only activation is insufficient. This audit does not activate either. P00 obtains the fresh operator catalog and owns activation/rollback.

## Safe real acceptance sequence

1. P00 supplies the final SHA, compiled artifact identity/origin and safe Production backend/public Auth fingerprint attestation. The earlier READY Preview used a different backend and cannot establish main acceptance. c89229e CI cannot validate a later patch SHA.
2. P01/owner establish Native login, getUser/role/cookie/SSR and refresh/logout-login on that exact target. No parallel account creation, password/OTP request or credential logging.
3. While financial writers remain frozen, inspect existing owner holdings/history through SSR and the canonical GET. A failed read must not appear as an empty portfolio. Use existing approved accounts only.
4. For existing B/admin without consent, read-only requests for A's approved known version must return unavailable/404 or empty RLS results for assets, debts, scope and legacy holdings; capture status/counts rather than private values or identities. Do not use a forged user_id POST as a negative test: the server derives the authenticated owner and could legitimately create B's data.
5. Actual persistence tests require P00's activation receipt plus precise human authority for existing A/B/admin accounts and the synthetic test records/retention scope. Then verify asset receipt and refresh/logout-login persistence; debt edit creates a new shared version preserving assets/history; scope uses a server timestamp and exact complete choices; a new financial version requires a fresh scope confirmation. Exact replay creates no extra version. Repeat authorized denial checks and preserve histories. No write authority is inferred from CI or frozen installation.
6. P00 records main acceptance or rollback. Freeze writers before changing to an incompatible old binary; preserve recorded history and owner-only privacy. This P04 handoff does not declare Native acceptance complete.

Fresh main read-only catalog at `2026-10-09T20:06:50.593329+00:00` confirms all four authenticated writer EXECUTE permissions remain false, financial tables have RLS + FORCE RLS, authenticated has SELECT only on canonical financial tables, anon has no canonical table privileges, and legacy holdings has owner-only policies with client TRUNCATE denied. The catalog contains no financial rows. It does not include private schema USAGE or `owns_holding_version` / `portfolio_private.record_snapshot` ACLs; source grants and the installed freeze are compatible, but those omitted catalog facts are not newly operator-verified here. No Native access is inferred.

Validation: 16 new scope component cases; 74 targeted form/HTTP cases PASS; all 1,353 core tests PASS (zero skipped); TypeScript PASS; full zero-warning lint PASS; optimized Next.js build PASS. All are local source checks with synthetic fixtures. No migration, account creation, main data write, activation, deploy or Native acceptance was performed by P04. Selected file Git blobs are supplied with the final patch commit.
