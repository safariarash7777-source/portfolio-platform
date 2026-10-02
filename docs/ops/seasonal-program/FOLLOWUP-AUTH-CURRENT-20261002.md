# FOLLOWUP-01 / FOLLOWUP-07 — current isolated delivery

2026-10-02. This supplements the dated FOLLOWUP-01-RESULT and FOLLOWUP-07-RESULT; their2026-10-01 observations are historical and are not re-labelled as current Production acceptance.

| Delivery | Runtime source | Exact reviewed head | Gate |
|---|---|---|---|
|Shared session/error contract, PR208|87f6b2250218c661fc3a6ab89fec10d35f6a7467|f0e002bc7c9f22f0425adc41b8b6b81c3a1fcc11|CI/seasonal success; native owner acceptance OPEN|
|Optional cookie namespace, PR211|0ed89c28b54438637b4f49ca322cbbc636d75fc2|04651152ed3828c52a0dfa36eef57286f899bef7|CI success; P00 consumes runtime in demo65|
|Email signup/recovery, PR215|c1bf80c + ac8a601 + required639ee34 route-signature correction|dd9f237ada73c1cd4c9f37fdb69e1d78e1b9afcf|144 local tests; CI37040113251 success; native provider/UI OPEN|
|Financial Auth adapter, PR217|1f5c5876fe9d641f163752cde179619eba502877|ca2f3e27db8779c6b760c1ac613af8626f419c15|15 tests; CI37042068048 success; native DB/HTTP OPEN|
|Bounded browser password login, PR218|d1505afab35945a2c100ba72b8ac0f638c38644c|701d8c0a7764074b19407e2aff618c8d54aed91b|151 tests/typecheck/lint/secret scan passed; remote CI recorded in PR; native acceptance OPEN|

PRs are Draft, unmerged and not Production deployments. PR208 precedes211;211 precedes215;215 precedes218.217 depends on208 separately. This is a source dependency graph, not a request to upgrade the frozen demo.

## Current blockers

Demo65 remains `65c215b801958c32599fafb0f6e331dd5ce3d181`, owned by P00. P11's independent login attempt is BLOCKED by browser control timeout, not a proven Auth failure. The narrow read-only server triage returned no log rows in an inferred window and could not correlate the attempt. Cause UNKNOWN; see [triage report](./P01-DEMO65-TRIAGE.md). A separately reproduced browser SDK stall was corrected in PR218; attribution to P11 remains unproven.

Owner acceptance on the primary Production URL remains OPEN: login, correct profile role, refresh, sign-out/sign-in and unrelated-account rejection with the candidate have not been completed. No account/UUID/role/password changed; legacy email retained. The owner alone handles any credential recovery. Need only the permitted browser attempt and its time/error text when the candidate is installed, never credentials or raw HAR.

SMS hook/provider adapter, limits and private profile retain the prior isolated implementation. GoTrue2.197.0 was observed in demo844's Auth container on2026-10-02. Real SMS/template/SMTP activation and provider delivery-to-SSR acceptance remain OPEN; no send, purchase or external configuration was performed. `arashlogin` and the Persian `%token` message remain proposals, not approved templates. Commercial budget is not inferred. SMS does not establish official identity verification.

This continuation has no migration, Production deployment, proxy/TLS override, fixture reseed or shared environment mutation. Tests use synthetic data and offline SDK transport where stated. A green build is a source gate, not a completed owner/provider journey.
