# P03 → P07 / P00: current feed/read contract and validity gap

Date: 2026-10-02. Contract source: PR #195 fixed base `31c44ab635b672b589b7833bcbc78b41d36f1e75`, including #181/#185/#197, schema `20260930182918_research_publication_queue.sql` then `20261001121858_member_publication_feed_reads.sql`. Wire version remains **publication.v1**; access consumes **seasonal.v0.1**. This document records current behavior and extension requirements; it neither changes the contract nor approves a migration.

## Existing entry points and projections

- `GET /api/cohorts/:cohortId/publications?cursor=...&limit=...`: current approved/published content targeting this cohort; limit default 20/max 50. Keyset uses full PostgreSQL timestamp plus version UUID, descending. The opaque cursor is bound to cohort ID and is not an authorization token.
- `GET /api/publications/:versionId?cohort=:cohortId`: canonical scoped detail; UI `/publications/:versionId?cohort=:cohortId`. Preserve cohort on links/back navigation. Existing public detail without cohort continues its canonical public/audience behavior.
- `POST /api/publications/:versionId/read` with body only `{cohortId}`: explicit read after authorized detail. Actor and time are server-owned. Receipt is first read time, idempotent per `(auth.uid(), publication version UUID)`, no notification/event or transaction/action receipt.
- Allowlisted feed item: `versionId`, numeric `version`, `title`, `summary`, `contentKind` (`brief`, `lesson`, `webinar_plan`), public `sources` (`url`, `asOf`), `publishedAt`, local `detailHref`, `readAt`, `hasBeenRead`. List omits full content, internal notes, actor/workbook/account and private financial data. Full detail exposes only the existing member content projection.
- Code: `lib/intelligence/publication-feed.ts`, existing publication/feed HTTP handlers, `lib/member/publication.ts`, `components/member/PublicationFeed.tsx`; DB canonical reader `public.read_research_publication`, scoped list/detail/mark wrappers in the feed migration.

## Current lifecycle — important to preserve

| Trigger | Current effect on next list/detail/read request |
|---|---|
| New publication version saved | Prior version immediately ceases to be current, even if the new version is still draft. The old reader returns hidden; there may be a gap before the new version is published. No automatic old-version fallback. |
| New version published | Its own UUID appears unread; prior version read receipt stays in append-only private history. Never transfer it by publication aggregate or title. |
| Withdraw command | Version is absent from feed; scoped detail hidden; new/replayed mark-read denied despite an old receipt. |
| Source research returned or newer workbook version created | Old research approval is no longer current; dependent publication is hidden. Existing internal history remains. |
| Current cohort/module grant revoked/expired or cohort cancelled | Exact cohort resources check denies on next request; a grant in another cohort cannot authorize this context, even for a multi-cohort publication. Admin is not automatically an educational member. |
| Validity deadline reached | **Not implemented.** publication.v1 has no valid-from/to decision predicate. `sources.asOf` and `publishedAt` are not expiry. Do not claim current feed enforces a decision deadline. |

HTTP distinguishes absent session **401**, current denial **403**, hidden/stale version **404**, malformed input/cursor **400**, and Auth/RPC/network unavailability **503**. An unavailable feed is never a successful empty list or proof of no membership. Authorization is checked before content/read and again on every request; an existing read receipt grants nothing. A browser that already displayed text cannot have that knowledge revoked retroactively; refresh/new requests must not resurrect it.

## Required P07 extension agreement before runtime/schema edits

1. Decide whether replacement becomes effective at new-version save or only at approval/publication. Current behavior is immediate on save. A delayed switch needs an explicit canonical predicate/migration, not a client override.
2. Define validity fields, their authoritative time zone/clock, missing-bound semantics, equality at the deadline and distinction between decision expiry and cohort access expiry. Apply the same predicate in the canonical reader used by list, detail and mark-read; notify/retrieve/AI must consume it too.
3. Define the permitted historical view separately from the active feed. Current member path returns hidden for superseded versions; an archive cannot bypass present grant or reuse the active endpoint with a fallback.
4. Define replacement/stop so an active decision and its stop/replacement cannot both be offered. Keep immutable publication/research history and separate per-version read receipts.
5. Keep actor/audience/grants server-owned, preserve contract allowlists and 401/403/404/503 distinctions. New decision fields cannot be advertised by a DTO if canonical SQL discards or does not enforce them.

Future acceptance: A reads v1 → v2 unread and old detail hidden; revoked/expired user and wrong cohort deny; withdrawal/returned/new research hide list and link; deadline equality and missing/invalid validity; draft replacement behavior; no private-note/financial exposure; active and stop never simultaneous. P03 owns read integration; P07 owns publication/workbook writing; P00 fixes the shared base, schema order and owner overlap.

Status: **current contract verified from source and ACKed by P07/P00; extension principles ACKed as DRAFT, implementation/version/product decisions remain OPEN**. The versioned [checkpoint](P07-P00-CHECKPOINT-20261002.md) records agreement and open differences; no publication.v1 or migration change is implied. Human authorization for project chat coordination was checked against the manager chat's direct instruction to execute the approved plan and send each chat to its assigned work; this contract contains no private credentials, user amounts or real customer data.
