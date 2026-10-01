# NEXT09 shared integration contract

Version: `notifications.v1` · revision 1 · 2026-10-01. This file is identical in both repositories. Implementation is reviewable in isolated branches; activation and real-bot acceptance are pending.

## Ownership and inputs

| Repository | Branch | Consumed baseline |
|---|---|---|
| portfolio-platform | codex/next09-telegram-20261001 | Auth180 `bb4f2f3e53859bbecb0ec942975ffb06fd2d2828` |
| telegram-miniapp | codex/next09-bridge-20261001 | main `94d20e104705b573d5def4b1f2058695cbdfcf9a` |

Site is the authority for account UUID, NEXT04 entitlements and NEXT08 reviewed publication/version. Miniapp is an ingress for a server-verified Telegram identity and an existing durable consultation receipt. No membership expiration, payment decision, research content or publication authority is replicated into Telegram. Public `telegram-sync` is unchanged and never imports private course content. SMS is deferred, email retained and Hermes untouched.

Consumed contracts: Auth API v1; NEXT04 `seasonal.v0.1`; NEXT08 `publication.v1`. The private service adapter uses the same NEXT04 ledger predicates: resource module, unrevoked grant, started, not expired and published cohort. It exists because the member RPC intentionally accepts only `auth.uid()`. It is not an independent membership model. Changes to NEXT04 must update and revalidate this adapter with its owner.

## Two-sided account ceremony

1. `/account/telegram` uses canonical `auth.getUser()`; `next09_start_link` additionally requires its matching live `auth.sessions` row/session ID. Typed contact details, username and raw Telegram ID never prove account ownership.
2. Site creates 256-bit random token; only SHA-256 is stored. TTL 600 seconds, ten starts/hour/account, latest challenge supersedes previous challenges. Token lives in component memory, not URL/local storage/logs.
3. In a private bot chat `/link TOKEN`, the existing secret-authenticated webhook checks chat ID equals sender ID and sender is not a bot. Alternatively `/platform-connection` uses the existing verified miniapp session cookie. Both send a machine-only proof to the site.
4. Site creates a new random 256-bit confirmation; stores only its hash once per challenge. Telegram side displays it privately. Site confirmation must come from the same initiating account **and session**, before TTL, with both proofs intact. Replay cannot replace an existing account/Telegram link; user must unlink first.
5. Link starts with both notification categories OFF. Unlink appends history, removes the current projection and mutes preferences; it preserves site notices, entitlements, publications and acknowledgement history. Legacy links require unlink/reproof and are not used for new delivery.

Bridge: `POST /api/telegram/connection-proof`; JSON exactly `{contractVersion:"notifications.v1",token,telegramId}`. `telegramId` is a decimal string obtained by the verified server, never a client body field. Headers: `x-next09-time` (13-digit Unix milliseconds), `x-next09-signature` (hex HMAC-SHA256 over `notifications.v1\nTIME\nEXACT_BODY`). Maximum clock skew 60 seconds, body 2048 bytes, secret minimum 32 characters, fixed configured HTTPS origin, redirects forbidden. Replay reaches the database one-use check. Response contains contract, proof status and confirmation only. Uncertain response means start a fresh ceremony; no automatic proof resend.

Miniapp `/api/platform-connection/prove` accepts only token, enforces its configured Origin and verified session and limits requests to ten/minute/IP. No response contains financial data or a site account identifier.

## Publication, notice and delivery ledger

`POST /api/cron/notifications` uses existing `CRON_SECRET`; no new automatic schedule is installed. Stage consumes `list_research_publication_distribution_events` with persisted `(recordedAt,eventId)` cursor and resolves every publication with `resolve_research_publication_distribution`. Only reviewed published versions produce course/update notices; ready/draft are not send events. Withdrawal produces generic status notices for previous recipients. Category mapping: lesson/webinar_plan → course, other kinds → updates.

Each `(eventId,userId)` notice and its Telegram job are unique. Two-cohort audience union produces one recipient notice. Site notices do not depend on Telegram linkage/consent. Jobs are created only for the event's Telegram channel, a verified current link and explicit current category opt-in. There is no retroactive enqueue when a person later opts in.

Link and preference sequence numbers bind each job. Any preference change conservatively cancels old jobs, including switching off and on again. Before claim and again immediately before transport, the worker rechecks sequences, current projection, current publication resolution and canonical entitlement. An expired/revoked recipient cannot obtain a content link from the site center. Withdrawal can still send a generic status message to its previous recipient when link/opt-in remain valid; it contains no content and targets `/notifications`.

Jobs/attempts/outcomes/notices are append-only in a private RLS schema with raw role grants revoked. `FOR UPDATE SKIP LOCKED` ensures concurrent workers do not claim the same attempt. A competing cursor can temporarily leave no available job; the next invocation continues. Lease is 30 seconds; pre-send check is valid for 25 seconds. Crashed/unfinished leases become `unknown`, not success. Accepted result requires Telegram `ok:true` and positive message ID. Accepted is API acknowledgement, never human reading.

Only explicit Telegram 429 permits retry, with bounded 1–3600-second delay and maximum three total attempts. Definite 4xx is failed. Network timeout, malformed response, ambiguous 5xx or unfinished lease is unknown and stops automatic resend because sendMessage has no idempotency key. Outcomes are visible to the user; do not manually erase attempts or reset an unknown job. A new reviewed publication event is a separate decision, not a replay override.

Messages contain fixed generic Persian text and authenticated site link; no publication title/body, balances, asset values, identity/contact fields, token or national ID. Preview is disabled. Links enter `/login?next=/publications/VERSION_UUID`; Auth180 preserves the local return path and NEXT08 checks current authorization when opened. Unlink/revocation can race with an already in-flight Telegram request; they cannot retract a request already accepted by Telegram.

Corrections are new NEXT08 aggregate versions and links point to version UUIDs. The old version is re-resolved before send; old site content links become unavailable. Withdrawal cancels queued content and records a generic status. No edit/delete sweep is attempted. Telegram deletion is generally limited to messages younger than 48 hours and permissions/type constraints; copies, screenshots, previews already seen or forwards cannot be recalled. This implementation promises neither deletion nor removal of copied content.

`GET /api/notifications` returns only own last 100 notices; `?view=connection` returns own connection/preferences without Telegram ID. POST actions: start, confirm, unlink, preferences, acknowledge, with canonical session, same-Origin writes and strict fields. Site `acknowledge` concerns the notice only and never calls research read-state APIs. UI uses existing Persian/RTL/font/design tokens. QA page is gated to development plus `NEXT09_QA=true`; production exclusion was reviewed in code, not runtime-certified.

## Existing consultation path

The existing MySQL consultation must commit first; unavailable storage fails the submit. Site `leads` remains canonical CRM. NEXT09 new receipts use stable `NEXT09_LEAD_NAMESPACE:localInsertId` as `external_ref` over existing leadWebhook and secret. Site validates existing fields and trusted machine RPC transactionally writes the lead and correlation receipt. Exact repeat returns accepted duplicate; altered body under the same reference returns 409. No extra lead/case is created for retry.

Correlated copying requires explicit HTTPS `PLATFORM_WEBHOOK_URL`; it never uses the old implicit Production URL. Retry is at most three attempts only for network/5xx, with five-second per-attempt timeout. Existing uncorrelated legacy payloads retain one attempt. Logs contain generic outcome and opaque correlation reference, not raw response/errors or Telegram ID. Username is null for the new path so initial and later receipt bodies remain stable.

User sees accepted/pending accurately; pending remains visible and Profile retries **the saved owned receipt**, not a new submission. Only IDs at/above immutable `NEXT09_LEAD_FIRST_RECEIPT_ID` can use this retry. It is the first receipt ID after a quiesced cutover, preventing old uncorrelated receipts from being silently copied a second time. Do not change namespace/cutover marker, reset/reuse MySQL IDs or alter saved receipt fields. Older receipts require explicit reconciliation with canonical leads; this task performs none. Local storage is not a second CRM decision model.

## Real Telegram capabilities and remaining acceptance

Official docs reviewed on 2026-10-01: [Miniapp server validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), [getChatMember](https://core.telegram.org/bots/api#getchatmember), [approveChatJoinRequest](https://core.telegram.org/bots/api#approvechatjoinrequest), [deleteMessage](https://core.telegram.org/bots/api#deletemessage). Membership inspection for other users is guaranteed only with bot admin status; join-request approval requires admin `can_invite_users`. Membership alone proves neither payment nor consent to expose a case.

No channel admission/removal policy or bot-side entitlement mirror is introduced. Protected content stays on the authenticated site; the current task implements optional private notifications. Before channel automation is proposed, verify owner, experimental channel ID, bot admin rights, update delivery and supported join/member operations against the canonical entitlement service. Channel membership is an acceptance gate, not an implemented claim.

Unverified: real bot/channel ownership/rights, real initData→canonical Auth ceremony, actual Telegram acceptance, actual target environment/schema, CI/Preview operational behavior and MySQL cutover values. All local identities/messages are synthetic and transport is mocked. Do not infer deployment or production health from builds/PRs. Never paste secret values into docs/chat.

## Authorized activation checklist (not executed)

1. Obtain separate target-environment authorization; use only experimental bot/channel and synthetic accounts. Reconfirm Auth180 and NEXT04/08 deployed contract/schema and `auth.sessions` compatibility. Review stacked platform PR against Auth180 before retargeting after upstream merge.
2. Quiesce miniapp consultation writes; record durable first-next MySQL receipt ID; set stable namespace and `NEXT09_LEAD_FIRST_RECEIPT_ID`. Reconcile legacy requests separately. Verify exact site origin and shared bridge/lead secrets in the existing secret manager, without logging values.
3. Install only `20261001125428_next09_notifications.sql` after prerequisites in the authorized target. Installation revokes old one-way redemption and raw telegram_links writes even while feature flag is off; plan this cutover explicitly. No migration here has been run on shared/Production DB. Miniapp requires no new MySQL migration.
4. Site names: `NEXT09_ENABLED`, `NEXT09_SEND_ENABLED`, `NEXT09_BRIDGE_SECRET`, `NEXT09_SITE_ORIGIN`, existing `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, Supabase server credentials. Miniapp: `NEXT09_ENABLED`, `NEXT09_BRIDGE_SECRET`, `NEXT09_PLATFORM_ORIGIN`, `MINI_APP_URL` or `VITE_APP_URL`, existing verified-session secrets, `PLATFORM_WEBHOOK_URL`, `PLATFORM_WEBHOOK_SECRET`, `NEXT09_LEAD_NAMESPACE`, `NEXT09_LEAD_FIRST_RECEIPT_ID`.
5. Keep send flag OFF. Enable experimental site connection and stage historical events **before** opt-in: notices are history, no retroactive jobs. Verify fresh same-session two-side link, forged/stale proofs, repeat webhook, unlink and default OFF. Select exactly one existing webhook endpoint per bot: Telegram permits one configured webhook, not simultaneous miniapp/site endpoints. This task calls neither setWebhook nor a real endpoint.
6. Test two synthetic cohorts, expiry/revocation after enqueue, preference change, correction/withdrawal, 429/failure/unknown and concurrent workers. Verify return-to-content after real Auth login and notification acknowledgement distinct from research read-state. Use an isolated queue/cursor, never imported real recipients.
7. Only after evidence/approval enable experimental send and explicitly schedule authenticated POST worker. Record Telegram API result separately from reading. Test consultation initial/pending/same-reference retry with controlled MySQL and canonical leads. Do not notify real admin/member/channel during acceptance.

## Stop and rollback

Disable `NEXT09_SEND_ENABLED` first, stop worker schedule, disable NEXT09 on both apps and drain in-flight requests; remove experimental webhook changes only through its owner. New UI/APIs stop at disabled state; site publications/entitlements/history remain intact. Existing scheduled public telegram ingestion is unrelated.

Preserve migration, private history, receipts and acknowledgements. Do not drop tables or revive old one-way redemption/raw link writes. Feature-off is the reversible application rollback; schema/grant rollback requires a separately reviewed forward migration with target grant snapshot. Previously accepted messages cannot be guaranteed deleted. Do not replay unknown jobs or legacy lead receipts. Resume with same namespace/cutover and preserved cursor after review. Flag-off does not grant permission to send new legacy consultations to an implicit Production target; keep the explicit experimental lead URL/secret or quiesce that flow during rollback.

## Evidence and history

Site evidence: `postgres-tests.txt`, `typecheck.txt`, `lint.txt`, `build.txt`, `secret-scan.txt`, `sql-validation.txt`, `browser-results.json`, `ui-mobile.png`, `ui-desktop.png`. Miniapp evidence: `tests.txt`, `typecheck.txt`, `build.txt`, `browser-results.json`, `ui-mobile.png`. Browser fixtures intercept API responses and are not live identity proof. PostgreSQL runs use only `next09-synthetic-db` with network disabled and disposable `next09_legacy`/`next09_explicit`; synthetic clock advancement briefly disables fixture triggers inside that database only. Production guards remain unchanged.

Standalone pglast grammar command could not run (library unavailable); PostgreSQL17 installed/executed the full migration and RPC tests instead. agent-browser downloads timed out; bundled Playwright with installed Chrome verified actual components. Automated review rejected local built-server start with generic `blocked by policy`; no production-mode runtime smoke claim is made.

2026-10-01 revision 1: two-sided account proof, minimal optional publication outbox, site notices, conservative ambiguous-send handling and existing consultation correlation. No merge, deploy, real delivery or target migration.
