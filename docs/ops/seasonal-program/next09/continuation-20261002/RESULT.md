# NEXT09 continuation — 2026-10-02

Base: site189 `804b6ae4f231a0c7fd2bc6e01121843fafc4e345`; mini5 unchanged at `26c885cdf6aac1401e7feb9d7312df525ddd25e2`.

This separate patch fixes two NEXT09-owned defects: recipient-scoped publication links retain the eligible cohort needed by feed185, and native missing/rejected Auth sessions produce 401 while outages produce 503. No feed or Auth owner files were changed.

Read-only contracts: composition191 `a83f71d922a93ec2bfb398a306d7b282ce1db81f`, feed185 `a54b161b8df88f83e8624273b1c4bb2ffd10f787`, Auth190 `a92e184a018d7a0da8fffaa9bb981e57a5489769`. The feed SQL blob is identical in 185/191. Their runtime evidence is not inherited as NEXT09 acceptance.

Validation: 37 targeted unit/mock tests and 10 isolated PostgreSQL tests across legacy/explicit grant profiles passed; typecheck, lint, and production build passed. DB tests used simulated JWT claims, not native login. Only the new migration was applied to synthetic temporary databases; shared and target databases were untouched. Old passed suites were not manually rerun. CI regression results are recorded separately.

`channel-admission.v0-draft` is a pure unmounted decision contract with independent mocks. There is no live channel adapter, consent schema, admission ledger, Telegram transport, registration, or removal automation. Missing/future/stale canonical evidence and absent/unknown requests hold; only a verified pending request can plan approval or decline. Membership never creates entitlement.

Review [CONTRACT-AUDIT.md](CONTRACT-AUDIT.md), [CHANNEL-ADAPTER.md](CHANNEL-ADAPTER.md), and [OWNER-ACCEPTANCE.md](OWNER-ACCEPTANCE.md) for scoped compatibility, owner prerequisites, exact destinations, permissions, and secure secret handoff. Deploy new code and migration together with the scoped feed UI; keep sends disabled during cutover.

The prior production-mode `next start --hostname 127.0.0.1 --port 8800` was rejected before process creation with `blocked by policy`. [POLICY-REJECTION.json](POLICY-REJECTION.json) preserves the exact evidence and planned but unexecuted assertions. No more specific reason was provided. It was not retried through any tool, command, chat, alternate port, or bypass. Combined native runtime, real bot delivery, and channel admission acceptance remain untested.

No merge, Production action, purchase, real Telegram API/message/webhook call, or key/OTP exchange occurred. Fixture setup failures are retained and corrected in the targeted DB evidence.
