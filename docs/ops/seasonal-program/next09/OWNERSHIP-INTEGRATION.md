# NEXT09 ownership and integration intake — 2026-10-01

Owner: chat `01a0f780-1262-73e0-8ffc-a3fdc57fe96d`. Coordinator: `01a0f13f-04e7-71f3-b405-b4f0d6cd2a35`. Scope: Telegram account connection, optional distribution outbox and site notification center. No merge, target deployment, shared migration or real recipients authorized.

## Fresh inventory before edits

- Platform independent checkout `portfolio-next09`, branch `codex/next09-telegram-20261001`, base Auth180 `bb4f2f3e53859bbecb0ec942975ffb06fd2d2828`; main fetched `51fd0661d48d791ce8758a87828a81ce72cac6df`. Includes reviewed Wave02 `7cb030c`, NEXT04 and NEXT08. Base PR planned against Auth180, not main.
- Miniapp newly cloned `telegram-next09`, base main `94d20e104705b573d5def4b1f2058695cbdfcf9a`, branch `codex/next09-bridge-20261001`. No existing local miniapp found in workspace/Documents search; remote accessible.
- Fresh GitHub reads: 175 `bb7c2f9`, 176 `d697635`, 180 `bb4f2f3`, all OPEN/DRAFT. 143 `ae06f0adfbf622a96a20182e5044d7d425871dd7` and 149 `09d4893f5aa6755e949e12b3d44b5db843c868f5` inspected for revocation/append-only attempts; reuse principles without claiming merged activation.
- Product-direction checkout dirty and owned by coordinator; other active worktrees remain untouched. Its current NEXT09, README, Blueprint, Command Center and Decision Log supply direction, not proof of deployment.

## Ownership boundaries

Own: new `lib/notifications`, new notification/account routes/components, dedicated timestamp SQL, miniapp bridge modules, dedicated docs and tests. Existing Telegram webhook/transport may be adapted in this independent checkout only. Do not edit `components/member`, publication-server, publication/feed/read-state or their migrations (owner `01a0f2e7-15a4-7701-912a-064ba6635415`); do not edit Auth/middleware/globals/Navbar/fonts (owner `01a0f31c-bc6d-7af3-8194-fd2ad178119e`). Shared contract changes are proposals, not unilateral edits.

## Consumed contracts

- Auth API v1: canonical SSR `auth.getUser()` and same account UUID for email/mobile; phone/national ID input is not proof. Connection challenge is independent from login OTP. SMS deferred, email preserved.
- NEXT04 `seasonal.v0.1`: canonical entitlements/module decision `seasonal_module_access('resources', cohort)`; no local expiration/paid model or separate course membership.
- NEXT08 `publication.v1`: `publication.published` and `publication.withdrawn` from service-only distribution event RPC; stable aggregateRef/version, payloadRef and resolver sitePath. Ready is not sending. Re-resolve before send and enforce recipient resource access via canonical membership. Public telegram-sync remains public ingestion and does not distribute private publications.
- Site notification acknowledgement is separate from research read-state. Telegram API acknowledgement never means a person read content.
- Existing miniapp initData verification/session and protected webhook are identity ingress; existing leadWebhook/correlation remains canonical consultation request ingress. No second lead case.

## Planned delivery gates

Versioned shared README/contract, two-way one-use TTL challenge + unlink, opt-in categories, persistent dedupe/retry/cancel/correction ledger, minimal authenticated link, isolated simulated transport and SQL tests, separate draft PRs, NEXT-09-RESULT and activation/rollback. Real experimental bot/channel ownership, admin rights and actual network delivery remain explicit acceptance gates; no credential values are requested or saved.
