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

Discovery and ownership were recorded before code changes. Live connector reconciliation confirmed #191/#195/#181/#185/#197/#175/#184/#176/#199 all open/draft; exact heads and file paths from exact base/head diffs are in [snapshot](p03-member-start/reuse-pr-snapshot.json). #199 changes public webinar/landing/Navbar and does not overlap owned member components. Its unapproved alternatives were not imported.

Delivered [Draft PR #209](https://github.com/safariarash7777-source/portfolio-platform/pull/209), code commit **`f889bb3f351182dcf1d04d82cdd7ec9b47ad12d6`**. Review base `codex/p03-review-base-195-31c44ab` pins the exact #195 SHA above, so an advancing parent PR does not silently change the independent diff. This is a review candidate, not a release. P00's baseline/environment acceptance is separate; its latest checkpoint reported 13 successful scenarios and one blocked on independent human research review. That does not accept P03 or authorize deployment.

## Result

Auth consumer follow-up: [P01 delta report](p03-member-start/P01-CONSUMER-DELTA.md) records runtimef669, test correction1f97cb2, 1313 core PASS and separate native evidence. The initial UI/CI/browser acceptance below remains atf889. Connectivity recovered and ordinary push published797335c; remote PR209 head was independently verified. New-head CI is tracked separately in the publication checkpoint.

Ownership addendum before P01-dependent edits: coordinator assigned the remaining `memberAuthErrorStatus` and **publicationMember only** in `lib/intelligence/publication-server.ts` to P03. Consume P01's exact `lib/auth/session-error.ts` blob at `87f6b2250218c661fc3a6ab89fec10d35f6a7467`; do not rewrite its policy or import the full #208 patch. P00 combines the identical helper with #208. Add consumer regressions in the existing registered member/feed tests; no package registration changes. publicationAdmin stays P07-owned and unchanged. Prior native/browser proof remains at f889bb3; the Auth-consumer delta will have separate SHA/evidence.

- Four links guide a member through course/access, optional needs/question, calendar/resources and published content. All guide targets exist. Five minutes is a proposed short path, not measured completion evidence.
- Calendar uses source dates and Tehran formatting, sorts upcoming sessions and collapses ended sessions. An ended session links to the same authorized resource section; it does not promise a recording. A missing provider remains unavailable. The provider adapter is mock in the isolated acceptance environment.
- Resources search only already authorized titles, normalize Persian spelling variants, and distinguish no matching title, successful empty projection and service failure. The DTO lacks recording/lesson relationships, so no content type was inferred from a title.
- Cohort lessons use the existing publication.v1 `contentKind=lesson` reader. The display filter is explicitly **current-page only**, with unchanged keyset/cursor/API/read contract. Public unapproved lesson placeholders remain unpublished. The glossary link resolves to `/learn/glossary`.
- Educational drafts are restored before GET; edits persist synchronously before navigation; a late response cannot overwrite a new edit. Storage failure copy avoids claiming persistence. Submit/draft receipts use the existing versioned writer and do not book a consultation or guarantee a reply. No new question/ticket model.
- A private link is removed from the UI after its announced TTL; getting a new link checks authorization again. Native Storage independently enforces its signed capability expiry.
- Existing financial routes/components remain outside the P03 diff. No private financial input, LLM call, financial calculation, Auth model, publication model, shared API or migration was added.

## Verification and evidence

Local Node v24.19.0 / Next 15.5.25, production build at code commit above: full typecheck, full lint zero warnings, build **47 static pages**, secret scan and diff-check PASS. `test:core`: **1291 PASS / 0 fail / 0 skip**, including the four added member tests. Focused member/feed run: **27 PASS** (included in core, not an additional total). The four tests cover calendar source preservation/order, Tehran midnight, authorized Persian title search and webinar-only outage.

[CI run 37018723701](https://github.com/safariarash7777-source/portfolio-platform/actions/runs/37018723701) at code commit `f889bb3`: all five jobs PASS; database **443 PASS / 0 fail / 0 skip**, with the existing publication feed, financial and RLS regressions. See [CI snapshot](p03-member-start/evidence/code-ci.json). PR checks remain the authoritative status for any later documentation head.

Own fresh **p03member** local environment used real GoTrue sign-in, PostgREST, native Storage and the production Next build. No existing backup, test Auth bootstrap or injected member JWT. All accounts/contents are synthetic. Twenty-one existing application SQL files were installed only here; **zero new application migrations**. SQL order/hash and image identities are in [environment](p03-member-start/evidence/environment.json) and [migration manifest](p03-member-start/evidence/application-migrations.json). Internal Docker network, loopback gateway, no real SMS/voice/webinar provider. Native `pg_cron` extension was not installed; no `cron.job` scheduler exists. REST's inherited health probe reports unhealthy because it probes a local DB; actual HTTP/RPC tests succeeded. That health signal is disclosed, not called a deployment health PASS.

| Native acceptance group | Result | Evidence |
|---|---|---|
| Two active cohorts plus expired grant; A/B/admin/no-grant; private list/download; mock join/window; educational writer | 38 PASS | [baseline](p03-member-start/evidence/http-baseline.json) |
| Real Storage rejects signed URL after its 60s TTL | 1 PASS, HTTP400 | [expiry](p03-member-start/evidence/http-expiry.json) |
| Explicit idempotent old receipt; save new draft hides old; no fallback; new UUID unread; old receipt retained | 6 PASS | [versions](p03-member-start/evidence/http-versions.json) |
| Withdrawal hides detail/feed and denies new read | 3 PASS | [withdraw](p03-member-start/evidence/http-withdraw.json) |
| Revocation takes effect next request; other cohort/account unaffected; prior capability TTL limitation | 8 PASS | [revoke](p03-member-start/evidence/http-revoke.json) |
| Auth and REST outages remain503 rather than successful empty | 4 PASS | [outage](p03-member-start/evidence/http-outage.json) |
| Initial educational version retained, owner's history remains readable after revoke, B cannot read A | 3 PASS | [history](p03-member-start/evidence/http-history.json) |

Total **63 native HTTP checks PASS**. Resource-list contract is allowlisted200/empty for an authenticated denied account, while private file issuance is403. Needs GET is own-user200/null when no own record exists; it never returns A to B. Feed/detail/read permission errors are403, hidden versions404. These distinctions preserve the installed contract; they were not standardized by an unapproved API change.

Browser verification used the real synthetic sign-in and separate explicit fixture scenarios. A switched A→B→A with exact scoped resources/feed and persistent draft; B's direct A URL showed no member content and its own B form had no A draft. The lesson filter opened the authorized detail, explicit read succeeded, and a new version showed unread. Revoke refreshed into a denied feed and unavailable resources. Narrow viewport390×844 had no horizontal overflow (375px content area including scrollbar), and the ended-session disclosure worked. See [browser record](p03-member-start/evidence/browser.json), [desktop](p03-member-start/evidence/native-desktop-start.png), [calendar mobile](p03-member-start/evidence/native-mobile-calendar.png), [receipt](p03-member-start/evidence/native-lesson-receipt.png), [new unread](p03-member-start/evidence/native-new-version-unread.png) and [B denied](p03-member-start/evidence/native-B-denied-A.png).

Fixture-only checks covered early local recovery during503, editing before a1600ms GET finishes, save503/conflict preserving text, isolated webinar failure with resources still available, and a1s announced TTL clearing the UI link. They do not prove native storage/network/Auth/provider behavior; native checks above provide their separate evidence.

## Contract checkpoint and release gates

[P03/P07/P00 checkpoint](p03-member-start/P07-P00-CHECKPOINT-20261002.md) records the direct P07@0e9e41e1 read and P03@df85b5f acknowledgement. Current reader semantics agree. Proposed decision validity `[from,until)`, DB clock/offset, UNKNOWN, independent grant expiry and one predicate remain **DRAFT / NOT IMPLEMENTED**. Member history access, delayed-until-publish replacement, enums/DTO/schema are open; save-draft-immediate behavior is preserved. No expiry claim is inferred from `asOf` or `publishedAt`.

| Gate | Status / owner |
|---|---|
| P03 independent implementation, local automated/native/desktop/mobile checks | PASS as scoped above |
| Exact accepted release base, consolidated manifest and integration sandbox | P00; independent review still required, this PR is fixed to195 |
| Real provider choice, join/playback/embed, mobile/SMS delivery and Auth release flow | P01; OPEN. This sandbox disables phone provider, so profile endpoint503 displays unavailable correctly |
| Three independent human journeys, comprehension and real completion time | **NOT_RUN**; follow [human guide](p03-member-start/HUMAN-ACCEPTANCE.md) |
| Useful real lesson/recording content approved for the intended audience | Publisher/teacher; OPEN. Synthetic publication approval is not human content acceptance |
| Actual Telegram in-app-browser on an authorized device | **NOT_RUN**; 390px is responsive evidence only |
| Decision validity/replacement extension | DRAFT; owners must agree version/predicate/migration before implementation |
| Production/merge/shared migration | **NOT_PERFORMED**, remains outside authorization |

Known limitations: already displayed content cannot be retroactively unseen; new requests recheck access. Already issued Storage capability may remain usable until its60s TTL after revocation; new issuance is denied. UI TTL starts at receipt arrival and is approximate; native Storage is authoritative. Draft persistence is same-tab/sessionStorage, user+cohort scoped and bounded to two hours; not cross-device or durable until saved. Calendar phase uses server-provided page time and requires refresh as time advances; it is not a live-stream detector. Resource search and content-kind filter cover the fetched authorized rows/current page, not a full library search.

No real customer/amount/identity, credential, signed URL or session is exported in the evidence. No purchase, message to a customer, provider request, Production deployment, merge or shared migration.
