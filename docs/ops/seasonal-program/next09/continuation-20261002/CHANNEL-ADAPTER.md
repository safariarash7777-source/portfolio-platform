# Channel admission adapter — channel-admission.v0-draft

**Contract/mock only, no live adapter.** Pure planner `lib/notifications/channel-plan.ts` has no fetch/RPC/token/import of a transport and is not mounted in any route, webhook or scheduler. It cannot admit, decline, remove or message anyone. No production ledger or separate admission-consent model is claimed as implemented.

## Proposed adapter boundaries

Trusted server ingress would validate the existing webhook secret and exact configured experimental bot/channel, parse a real join-request ID/sender and bind it to the current two-sided site UUID↔Telegram link epoch. A private owner-approved channel→cohort mapping must constrain the request; client-submitted channel/cohort/Telegram IDs are never authority. `scopeBound` is a verified adapter result, not a user flag.

Canonical access must come from a fresh NEXT04 resources decision for that mapped cohort and current native site identity. No paid/expiry/member-status mirror is created. `observedAt` is the decision's freshness timestamp (30-second planning maximum), not a copied membership expiration. Unknown Auth/ledger or stale/future observations hold the request without removal. Publication/version receipt logic is unrelated to channel admission.

Separate explicit **channel participation consent** is required. Existing private-notification course/updates opt-in cannot be repurposed as that consent. Consent schema/policy is an open owner decision; this draft accepts a synthetic boolean only to demonstrate branching. A real adapter needs immutable consent revision and canonical link/access recheck immediately before transport.

A future durable operation key would bind verified join event, configured channel/cohort, linked principal and decision/consent revisions. An existing pending/accepted/unknown operation receipt must prevent blind replay. Telegram acceptance, observed channel membership, notification acknowledgement and version read receipt remain four distinct facts. No arbitrary UUID from a client should become an operation key.

Planner actions: approve candidate, decline candidate, hold, already-member, duplicate or owner-removal-review. It returns no user data, content, message ID or read receipt. Approve is only a plan requiring a final canonical recheck. Existing membership never proves access/consent. Revocation of an existing member produces **owner review**, not an automatic ban/unban policy. Removal persistence, rejoin policy and race handling need a separate approved implementation.

## Capability constraints, verified read-only 2026-10-02

Current official docs: [getChatMember](https://core.telegram.org/bots/api#getchatmember), [approveChatJoinRequest](https://core.telegram.org/bots/api#approvechatjoinrequest), [banChatMember](https://core.telegram.org/bots/api#banchatmember), [unbanChatMember](https://core.telegram.org/bots/api#unbanchatmember).

Other-user membership lookup is guaranteed only for an administrator bot. Join approval/decline requires admin and `can_invite_users`. Ban/unban are permission-sensitive; banning can prevent rejoining, while unban does not automatically rejoin a user. No removal sequence is chosen here. Owner must verify returned rights and experimental channel behavior before implementing a removal policy. No methods were called.

## New independent mock matrix

Verified pending request→approve plan; forged ingress/unproven identity/changed link/wrong channel-cohort→hold; canonical outage or stale/future snapshot→hold; recorded operation→duplicate; missing admin/invite rights→hold; notification opt-in without channel consent→decline plan; denied current entitlement→decline plan; unknown membership→hold; revoked existing member→owner review; already eligible member→no new approval; absent request→hold. Revocation inserted between planning and the mocked dispatch leaves zero mock approval calls.

Mocks prove only this planning contract. No native webhook, durable admission replay, Telegram delivery, admin permission, channel membership or removal operation has been accepted. Owner steps and secure destinations are in OWNER-ACCEPTANCE.md.
