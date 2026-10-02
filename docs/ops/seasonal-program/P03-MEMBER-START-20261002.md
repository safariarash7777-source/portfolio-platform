# P03 — Member start, education and webinar delivery

Date: 2026-10-02, Asia/Tehran. Authorized scope: arash-product-plan-v0.1, P03, as assigned by the product coordinator. Read source documents 00/01/03/04 and execution order from `portfolio-product-direction/docs/product-plan-v0.1`. Open decisions in those documents remain open.

## Base and file ownership before implementation

Own worktree `portfolio-p03-member-start`, branch `codex/p03-member-start-20261002`, pinned base PR #195 **`31c44ab635b672b589b7833bcbc78b41d36f1e75`**. This includes the owner-consumed #197 fixture correction (`6cba6c1`) and the earlier #191 member/feed/resource integration. It is a development/review candidate, not an accepted release. Do not change the coordinator, P00, Auth, finance or frontend owners' checkouts.

Owned paths: `components/member/MemberHome.tsx`, new member start/calendar/resource/learning components under `components/member/`, `components/member/NeedsAssessmentPanel.tsx` for question explanation and draft recovery, `components/member/AuthorizedLink.tsx` for expiry display, member-only display helpers/tests/explicit preview scenarios under `lib/member/`, this report and P03 member guide/evidence under `docs/ops/seasonal-program/p03-member-start/`. Any test registration in shared package scripts must be coordinated; prefer the existing member test entry. No changes to Auth, globals, landing, financial models, migrations, seasonal API handlers or publication model.

Ownership addendum before feed UI edit: `components/member/PublicationFeed.tsx` remains P03-owned. The existing canonical `contentKind=lesson` already supports cohort lessons, independently of unpublished public `lib/learn.ts` placeholders. Add a clearly page-scoped content-kind display filter; no backend filtering, cursor contract, read-state or lesson model changes.

P00 release-manifest/base acceptance and P01 real-provider acceptance remain dependencies. Independent changes consume the existing stable seasonal.v0.1 and publication.v1 contracts; no new schema/API version is proposed here. P04 owns the financial contract; P03 continues rendering the existing balance-sheet component without reading, calculating or forwarding private amounts to a model.

## Reuse and gaps

| Scope | Existing source | Independent action / dependency |
|---|---|---|
| Cohort selection and permissions | #175/#184 seasonal.v0.1; #181 MemberHome | Preserve explicit cohort scope, native selector navigation and server evaluator. Never derive authorization from the calendar or client grant display. |
| Needs and educational question | Existing four-field versioned needs-assessment | Improve the start/question explanation and recovery; do not build a ticket or consultation booking model. Submitted questions are needs input, not a guaranteed reply. |
| Webinar | Published cohort metadata + canonical join endpoint | Sort/display the calendar clearly in Tehran time and retrieve the join link on request. Provider selection, playback/embed and provider acceptance stay open. |
| Resources / archive | #184 list projection and short-lived signed links | Search the authorized cohort resources; keep refresh/permission/error paths. Resource DTO has no content-kind or recording/lesson relationship: do not classify from a title or promise a recording. |
| Short lessons | Existing publication.v1 `contentKind=lesson` plus public `lib/learn.ts` publishedLessons | Cohort lessons use the canonical published feed and current grant. Public placeholder lessons remain unpublished and are not linked as usable content. No parallel lesson model. |
| Publication/read state | #176/#185 publication.v1 + #197 correction | Reuse current feed, detail, UUID keyset and explicit per-version mark-read. No duplicate state or notification model. |
| Five-minute path | Existing member sections | Add one bounded start guide using links to the same sections: access → optional needs/question → webinar/resources → current publication. Five minutes is a guide, not a measured user completion claim. |
| Financial summary | Existing #173 summary | Keep the existing financial routes and component. P04/P06/P10 own amounts/import/denominator/targets; no financial API expansion here. |

## Acceptance to execute

Synthetic data only, own local sandbox or existing CI disposable database: two cohorts, two accounts, denied/admin/no-grant, expiration/revocation, source/feed access, draft across refresh/cohort switch/error, Tehran calendar, webinar service failure distinct from empty, private link issuance and TTL limits. Desktop/mobile browser evidence must distinguish fixture UI from real GoTrue/PostgREST/Storage. Telegram in-app browser requires an actual authorized device session; a narrow viewport is not that proof.

Reports from #181/#185/#184 are prior evidence, not today's live environment proof. No Production, merge, shared migration, provider purchase or real customer message. A prior policy rejection must not be routed around.

## Status

Discovery and ownership recorded before code changes. Live GitHub connector reconciliation confirmed #191/#195/#181/#185/#197/#175/#184/#176/#199 all open/draft; exact heads are recorded in [snapshot](p03-member-start/reuse-pr-snapshot.json). PR #199 changes public webinar/landing/Navbar and does not overlap the owned member components; its unapproved alternatives are not imported. Direct GitHub REST requests timed out; the connector succeeded without changing scope or accessing another environment. Implementation, verification and deliverable SHA/PR are pending. P00/P01/provider/lesson and human acceptance gates are not closed by this document.
