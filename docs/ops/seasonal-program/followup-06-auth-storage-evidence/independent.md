# FOLLOWUP06 independent Auth/Storage review

Reviewer: independent Codex reviewer agent `/root/dev07_independent`, separate from the code author and builder preliminary test. This agent review is not human research sign-off and does not change DEV07's human gate.

Application SHA `2605a0ff11ff5cb0f83837528aed230846469b16`, environment `followup06-auth-storage-2605-local`, [local production application](http://127.0.0.1:3299). Build timestamp 2026-10-01T10:59:51.399Z. Six fresh browser contexts signed in through the product UI against actual GoTrue v2.197.0. Actual PostgREST 14.17, PostgreSQL 17.11 and Storage 1.11.2 were exercised. Tests ran 2026-10-01T11:26:09.668Z to 2026-10-01T11:27:27.401Z, with explicit UI-render follow-up through 2026-10-01T11:27:39.154Z; report completed 2026-10-01T11:30:05.769Z. All times are UTC.

**Result: 18 PASS, 2 FAIL, 0 BLOCKED across 20 independently recorded checks.** The two failures independently reproduce the preliminary NEXT-04 findings. This report supplies fresh observations rather than accepting the preliminary PASS labels.

Only followup06-accept-db/auth/rest/storage and this entirely synthetic sandbox were used. No app/schema changes, sql/test policies, session injection, merge, Production, Liara, PR 173 or DEV07 human sandbox action was performed. Six actual account roles: A(revoked initially), B(active C2), expired, cancelled(C3 cancelled), nonmember and admin(no course entitlement). Guest used a seventh empty context. Passwords came privately from the protected reviewer-only credential file. Issued sessions and signed URL stayed in memory; no token/cookie/HAR/trace/credential screenshot was saved.

## Independent observations

| Check | Roles | UTC time | Result | Expected | Actual UI/HTTP/provider evidence |
|---|---|---|---|---|---|
| login-A | A | 2026-10-01T11:26:12.439Z | PASS | Fresh context, real UI login, native GoTrue user and holdings redirect | Fresh browser context and actual UI login: native token 200, native auth/user 200 matched account UUID; /dashboard/holdings return. No session injection. |
| login-B | B | 2026-10-01T11:26:13.905Z | PASS | Fresh context, real UI login, native GoTrue user and holdings redirect | Fresh browser context and actual UI login: native token 200, native auth/user 200 matched account UUID; /dashboard/holdings return. No session injection. |
| login-expired | expired | 2026-10-01T11:26:15.309Z | PASS | Fresh context, real UI login, native GoTrue user and holdings redirect | Fresh browser context and actual UI login: native token 200, native auth/user 200 matched account UUID; /dashboard/holdings return. No session injection. |
| login-cancelled | cancelled | 2026-10-01T11:26:16.528Z | PASS | Fresh context, real UI login, native GoTrue user and holdings redirect | Fresh browser context and actual UI login: native token 200, native auth/user 200 matched account UUID; /dashboard/holdings return. No session injection. |
| login-nonmember | nonmember | 2026-10-01T11:26:17.702Z | PASS | Fresh context, real UI login, native GoTrue user and holdings redirect | Fresh browser context and actual UI login: native token 200, native auth/user 200 matched account UUID; /dashboard/holdings return. No session injection. |
| login-admin | admin | 2026-10-01T11:26:18.761Z | PASS | Fresh context, real UI login, native GoTrue user and holdings redirect | Fresh browser context and actual UI login: native token 200, native auth/user 200 matched account UUID; /dashboard/holdings return. No session injection. |
| current-membership-and-foreign-isolation | A, B, expired, cancelled, nonmember | 2026-10-01T11:26:21.291Z | PASS | Revoked/expired/cancelled/nonmember/foreign receive no files; active B receives only B with exact bytes | Revoked A, expired, cancelled, nonmember and B→A: list 200/zero rows; download 403; authenticated REST 200/zero; RPC 200/allowed=false; native Storage 400. Active B→B: list 200/one, download 200, REST 200/one, RPC allowed=true, native 200 with exact 36-byte digest. |
| guest-http-contract | guest | 2026-10-01T11:26:21.373Z | FAIL | No-session resource list/download return 401 | FAIL: unauthenticated list 503 and download 503, both generic service-unavailable errors. Expected 401. Native confidentiality still holds. Owner NEXT-04. |
| native-guest-private-bucket | guest | 2026-10-01T11:26:21.374Z | PASS | No direct or public private-bucket bytes | Native guest authenticated/private path 400 and public/private path 400; no file bytes permitted. |
| admin-resource-contract | admin without entitlement | 2026-10-01T11:26:21.775Z | FAIL | Admin listed resources must download consistently; permission failure must not be a service outage | FAIL: admin without entitlement lists each C1/C2 resource 200/one row; each download 503 and native Storage 400. Expected list/download authorization consistency, without permission failure reported as outage. Owner NEXT-04. |
| non-admin-command-denied | B | 2026-10-01T11:26:21.886Z | PASS | Member cannot grant course access | Member B attempted real access-grant API;403. |
| temporary-audited-grant | admin, A | 2026-10-01T11:26:22.008Z | PASS | Actual admin command grants labelled synthetic A access | Admin real-session grant command 200 with new audit grant UUID; reason and idempotency UUID supplied. Only synthetic A/C1; removed afterward. |
| positive-real-storage-and-signing | A, anonymous bearer | 2026-10-01T11:26:22.241Z | PASS | Actual native bytes and 60-second signed URL bytes match fixture digest | A list 200/one; signing200; native 200 and signed anonymous bearer200, both 36 bytes and digest 773ee1169339e5c25cda05f6c75296a6daeaf02c81a435a60083984598cc8128. API TTL 60 seconds; URL retained only in memory. |
| publication-existing-C1-audience | A, B, expired, cancelled, nonmember, guest | 2026-10-01T11:26:22.423Z | PASS | Existing published UUID allows newly entitled A only; no PRIVATE content or underlying research | Existing publication f223fd74…: newly entitled A 200; B/expired/cancelled/nonmember/guest 404. No PRIVATE marker in any response. A direct research REST 200/zero. |
| explicit-revoke-and-capability-window | admin, A, anonymous bearer | 2026-10-01T11:26:22.782Z | PASS | New requests denied after revoke; previously signed bearer may remain until provider TTL | Admin revoke 200; next A download 403, list zero, native 400, module allowed=false, publication404. Previously signed bearer still 200 within TTL; expected bounded capability semantics, not immediate token revocation. |
| ledger-preserved-A | A | 2026-10-01T11:26:23.091Z | PASS | Own asset/debt ledger survives membership restrictions byte-for-byte and remains visible | Authenticated holding versions, asset positions and debt positions all 200; before/after row counts and SHA-256 digests identical. Fresh UI login followed by explicit asset-visible wait confirmed asset/debt display. Initial premature text check is retained as a harness observation. UI recheck: 2026-10-01T11:27:33.764Z. |
| ledger-preserved-expired | expired | 2026-10-01T11:26:23.428Z | PASS | Own asset/debt ledger survives membership restrictions byte-for-byte and remains visible | Authenticated holding versions, asset positions and debt positions all 200; before/after row counts and SHA-256 digests identical. Fresh UI login followed by explicit asset-visible wait confirmed asset/debt display. Initial premature text check is retained as a harness observation. UI recheck: 2026-10-01T11:27:36.852Z. |
| ledger-preserved-cancelled | cancelled | 2026-10-01T11:26:23.786Z | PASS | Own asset/debt ledger survives membership restrictions byte-for-byte and remains visible | Authenticated holding versions, asset positions and debt positions all 200; before/after row counts and SHA-256 digests identical. Fresh UI login followed by explicit asset-visible wait confirmed asset/debt display. Initial premature text check is retained as a harness observation. UI recheck: 2026-10-01T11:27:39.154Z. |
| personal-ledger-foreign-denial | B | 2026-10-01T11:26:23.797Z | PASS | B cannot read A personal ledger | B authenticated REST for A personal holding versions 200/zero. |
| provider-signed-url-expiry | anonymous bearer | 2026-10-01T11:27:27.398Z | PASS | Provider denies previously valid signed URL after60-second TTL | Actual provider fetch of the same previously valid bearer URL returned 400 at 65 seconds. URL/token not saved. |

## Reproducible failures and ownership

NEXT-04 F01: In a fresh unauthenticated context, GET /api/cohorts/f3ec0953-d248-4838-a6db-e96c84dd434f/resources and GET /api/cohorts/f3ec0953-d248-4838-a6db-e96c84dd434f/resources/da12b1ad-381f-4a85-b8b2-b5c22f433365. Both returned 503 with generic course-read failure text; expected 401. Native private and public object endpoints returned 400 without allowing private bytes, so confidentiality passed while the HTTP contract failed.

NEXT-04 F02: Sign in as the actual admin account without any course grant. Resource list for C1 and C2 returns200 and one resource each. Request the listed resource download endpoint:503 for each. Native Storage authenticated object read:400 for each. Course administrator visibility and download authorization are inconsistent; permission failure is represented as service outage. No role/grant/policy workaround was installed. Findings were sent to root for NEXT-04 ownership, without application fixes by this reviewer.

## Personal ledger preservation

Existing asset and debt history was observed, not re-seeded. A's shared ledger contains 3 holding versions/3 asset rows/1 debt row; expired and cancelled each contain 2/2/1. Membership grant/revoke, download, publication audience and expiry tests left every row count and digest unchanged. B's direct foreign ledger query remained zero rows. Each affected member UI displayed the synthetic asset 2000 Toman, debt 100 Toman and net 1900 Toman after waiting for actual data rendering.

| Role | Table | Rows | SHA-256 before and after | Result |
|---|---|---|---|---|
| A | member_holding_versions | 3 | 5d0c66c22002a1595f9ccf7ad0126f275a2d2892cb27f40d10f9d5987572e2bc | unchanged |
| A | member_holding_positions | 3 | 741ee90a4582104a92788ffcfce9d4c65cae4622124ed3326fe5a29c64af5aa4 | unchanged |
| A | member_debt_positions | 1 | 8ebc7a47b49f907a75983199a36ac39f870eb201bb737805113274986f799d33 | unchanged |
| expired | member_holding_versions | 2 | 61921651285a2b142ab25b39b48827e91b5d17bad593e2c0592a154ce5d86f8c | unchanged |
| expired | member_holding_positions | 2 | 63ce4899760cb3d9f47ca146469351c57b852aef5970b84aae77af4573ac30b0 | unchanged |
| expired | member_debt_positions | 1 | 759d08be953b1023b1d91e5f1ccf66cb4b25f7765de785d3cd5cc13b60cbf884 | unchanged |
| cancelled | member_holding_versions | 2 | 444608864c258ea72879760caf1ff55037b30b561e4e587cba45e9e2d73a6ae4 | unchanged |
| cancelled | member_holding_positions | 2 | 10e35fc4544edd896d917ebb4e832d13f62a46852a6d7a356abdbac76cf6230e | unchanged |
| cancelled | member_debt_positions | 1 | c322bd4f8909566e3cd9b3def89ce3d85e81e99eb13a7643542fac82df826047 | unchanged |

The first immediate body-text reads after page.reload occurred before React data rendering. The original false visibility observations remain in independent-attempt-01.json; independent-ui-followup.json records fresh actual UI login and explicit visible-element waits. Final ledger PASS uses unchanged hashes plus those actual rendered observations. A target-portfolio read warning (PORTFOLIO_TARGET) was also visible while personal assets/debts remained usable; this review did not assign a code defect or modify prerequisites for that separate target feature.

## Provider expiry and cleanup

Positive A bytes were 36 and matched fixture SHA-256 above for both native Storage and anonymous signed bearer. Signing advertised 60 seconds. Following actual admin revoke, new resource and publication requests were denied immediately while the prior signed bearer remained valid within its bounded TTL. The same URL was denied by the actual provider at 65 seconds (HTTP 400). No URL token is in the report/evidence. Temporary grant fbf536bb-848f-4dcd-bd40-cbdc1b05de80 was revoked through the real admin API (200); final catalog confirms no currently active A grant. Browser contexts were closed.

## Environment witness and limits

The reviewer independently ran SELECT version() on followup06-accept-db at 2026-10-01T11:31:56.414Z: PostgreSQL 17.11 (Alpine), matching this sandbox rather than DEV07. App HEAD and frozen manifest matched 2605a0f. environment.json records 16 actual repository SQL files, fresh native service migrations and no restored data/test scaffold. The reviewer independently recomputed all 16 source hashes; the exact match results and actual Storage catalog SELECT policies are in independent.json. Behavioral permission tests above are the access evidence; source hashes alone are not treated as authorization proof.

The retained publication UUID is `f223fd74-02b3-4478-bc3d-2c25a30763ee`; its receipt was read from preliminary metadata but its current audience responses were independently requested through fresh real Auth sessions. The preliminary creator's automated research approval is technical, not a human approval. This review created no research approval or publication.

Evidence: [independent.json](./independent.json), [original measurement attempt](./independent-attempt-01.json), [UI follow-up](./independent-ui-followup.json), [environment](./environment.json), and [own review harness](./independent.mjs). CI was not rerun by this reviewer; this report makes no new CI/merge claim. Acceptance remains failed for the two NEXT-04 contracts.
