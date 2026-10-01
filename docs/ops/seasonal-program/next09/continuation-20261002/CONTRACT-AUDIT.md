# NEXT09 continuation — 2026-10-02

Scope: read-only contract comparison, two narrow NEXT09 fixes, isolated new-scenario tests and a draft channel-adapter contract. No reattempt of the rejected built-server action through any tool/chat/command. No bot API call, webhook registration, live credentials, purchase, real message, shared migration, deployment or merge.

## Pinned inputs (fresh GitHub reads)

| PR | Head | Role |
|---|---|---|
| site189 | 804b6ae4f231a0c7fd2bc6e01121843fafc4e345 | patch base, existing account proof/notifications |
| miniapp5 | 26c885cdf6aac1401e7feb9d7312df525ddd25e2 | unchanged verified Telegram proof and correlated lead path |
| composition191 | a83f71d922a93ec2bfb398a306d7b282ce1db81f | read-only composition; NEXT09 remains inventory only |
| feed185 | a54b161b8df88f83e8624273b1c4bb2ffd10f787 | scoped feed/detail/read receipts |
| Auth outage190 | a92e184a018d7a0da8fffaa9bb981e57a5489769 | SDK-returned-error classification |

All inputs Draft/Open/unmerged at read. No patches from191/185/190 were applied to owner files. Feed SQL blob `a5c812bab785f86da2c3091388a31fbf9e4ca7ff` is identical in185 and191; the isolated test asserts this equality before consuming the read-only pinned SQL. Composition191's reported39 runtime checks do not test NEXT09 and are not inherited. No composition runtime was contacted.

## Contract mapping and findings

| Concern | Feed185 / composition191 | NEXT09 before | Continuation outcome |
|---|---|---|---|
| Publication identity | existing aggregate publicationId; immutable version UUID and version number | notice stores both IDs/version, unique event+recipient | compatible, no duplicate publication model |
| Cohort detail | `/publications/VERSION?cohort=COHORT`; explicit current resources check | `/publications/VERSION`, losing cohort context | **N09-C01 fixed:** own private path adapter selects a currently eligible published target cohort in deterministic UUID order, both site notice and worker use it |
| Two-cohort union | individual feed scope | one notice/job per event+user | retained; link chooses one eligible cohort without adding jobs; revoked choice switches to other eligible cohort |
| Auth deeplink | same local normalizeReturnPath preserves query | URL encoded local next, allowlist rejected queries | exact optional cohort query now allowed; extra/duplicate keys, malformed IDs, fragments and foreign origins rejected |
| Read receipt | explicit POST version/read with `{cohortId}`, unique user+version; latest version unread | own notice acknowledgement separate | retained: notification seen and Telegram accepted never write/read feed receipts; updated cohort link exposes explicit “خواندم” in185 UI |
| Access/revocation | canonical read on every detail/read/replay; published cohort, NEXT04 resources | re-resolve before claim and immediate pre-send; link/preferences epochs | retained and new path adapter rechecks canonical current version/grant; expiry removes links; history preserved |
| Correction/withdrawal | older/current/withdrawn publication visibility from canonical reader | stale content cancelled, generic withdrawal to prior recipients | retained; scoped path null when withdrawn/old; generic withdrawal remains `/notifications` |
| Notification opt-in | no Telegram consent decision in feed | two explicit categories OFF on link; any preference epoch change cancels old jobs | retained; no retroactive enqueue; channel admission consent is an independent future requirement |
| Dedupe / retry | read replay never bypasses access | event+user / job uniqueness; max3 explicit429; unknown stops auto resend | unchanged; migration replaces entry-point implementations, not existing append-only jobs/attempts/outcomes |
| Native Auth error |190 missing/rejected4xx→401, service/unknown→503 | native error coerced to boolean; every error→503 | **N09-C02 fixed:** own API/page boundary keeps SDK error and translates same190 categories; no RPC runs for failed Auth; no edits to Auth/helper/middleware |
| Cross-owner edge categories |191 publicationMember currently maps only missing/401/403 to401, other errors503;190 maps all4xx401 | scope fixes align190 | **owner follow-up:**400/404/429 classifications differ between existing feed and190. Common missing/401/403/5xx cases align; do not silently modify owner code |
| Schema/activation |191 does not include notification189 migration/runtime |189 install disables old redemption even flag off | separate target authorization remains mandatory; new scoped-link migration follows189; feed185 must be present for receipt UI |

N09-C01 compatibility: public-audience publications retain the plain version path; they do not acquire a fake cohort/read receipt. Withdrawal retains the notification center link. The adapter reads only existing canonical publication/entitlement/cohort tables, creates no membership cache and grants no authorization. Query identifiers remain opaque; notification text still omits content/financial/contact data. An in-flight request cannot be retracted after Telegram accepts it.

N09-C02 is an HTTP-boundary translation, not a second Auth model. `notificationSessionStatus` uses the SDK missing-session predicate and190's returned status categorization. RSC pages redirect rejected/guest sessions and render a recovery message for outages; this does not claim the HTML response itself has HTTP503. API responses return401/503 and no-store. Throwing failures remain503 through the existing catch. Changes to Auth classification require owner coordination.

## Policy evidence and exact untested scope

`POLICY-REJECTION.json` records the earlier CreateProcess rejection of a local `next start` at127.0.0.1:8800 with synthetic environment values. Only reason returned: **`blocked by policy`**. No more specific rationale or process exit code was supplied. Do not infer a reason, product defect or environment failure.

That server never started. Planned production-mode QA404, disabled API/private-cache statuses, worker401 and anonymous redirect checks have no executed observations from that attempt. This continuation reads the report only and neither repeats the action nor substitutes another tool/chat/server to obtain those runtime results. Local SQL/unit mocks are separately authorized checks of new contracts; they are not substitutes claiming to satisfy the blocked application runtime acceptance.

Still unaccepted: actual combined191+189+this patch runtime; native two-sided site/Telegram ceremony and return-to-scoped-detail; production-mode QA route exclusion/runtime smoke; real experimental bot/channel rights/admission; target schema/grant cutover; stable MySQL receipt cutover; actual Telegram result. Existing builds and CI statuses do not prove any of those. Human reading remains a separate explicit site action.

## Fresh scoped validation

- `scope-audit.test.ts` plus affected notification tests:34PASS. New SDK errors/guest/outage classifications, no RPC on Auth failure, scoped next preservation and tampering, draft adapter branches and immediate mock revocation.
- `scope-audit.integration.test.ts`:10PASS over two grant profiles. Actual189+read-only185 SQL+new patch installed only into `next09_scope_legacy/explicit` in the dedicated network-disabled PostgreSQL17 container. Baseline189 path observed unscoped, then patch checked existing notice/job behavior, recipient cohort choice/dedupe, independent seen/read, new version unread, canonical admin revocation, account/private-helper isolation, opt-out/unlink, synthetic expiry, withdrawal/history.
- SQL Auth/session claims are explicit simulation, not native GoTrue-issued-session acceptance. Fixture expiry advances time by changing only temporary synthetic entitlements with triggers restored in the same transaction. First fixture failures (missing policy shape; missing revocation reason) are retained in raw logs; resolved by valid fixture policy and canonical `seasonal_access_command`. They are not product/runtime failures.
- No unchanged58/1239/68 historical suites rerun merely for activity. Typecheck/lint/build are scoped implementation gates; no server is started by build. CI may run repository regression gates on the new Draft patch.

See `unit.txt`, `db.txt`, raw fixture-failure logs, `typecheck.txt`, `lint.txt`, `build.txt` and new checkpoint. Channel mock results are **planning only**, not proof of a live adapter, durable production ledger or Telegram admission.

## Delivery and activation boundary

Separate patch branch based on189; review only changed NEXT09 files and its new timestamp migration. Do not retarget/apply191 changes here, alter185/Auth owner files or install target SQL. Keep send disabled during a separately approved coordinated code/migration cutover: new migration plus old189 link allowlist would reject scoped links, so never enable that mismatched pair. Preserve189 migration and all histories; new migration is a forward replacement of own claim/notices only. Feed185 deployment remains necessary for its scoped read-receipt UI.

The channel adapter is deliberately unmounted pure planning code. Its proposed adapter/policy, mock matrix and precise owner prerequisites are in `CHANNEL-ADAPTER.md` and `OWNER-ACCEPTANCE.md`. No new admission-consent store, channel map, join endpoint, webhook binding or Telegram transport has been implemented. NEXT09 remains isolated/reviewable, not operationally accepted.
