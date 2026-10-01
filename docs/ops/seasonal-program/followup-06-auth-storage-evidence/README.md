# FOLLOWUP06 — actual Auth / Storage acceptance on the frozen checkpoint

Application: `2605a0ff11ff5cb0f83837528aed230846469b16`. Existing CI checkpoint: `b7c77260821cd127c1a7a65eae123022dcf0a43a`. Documentation baseline before this phase: `630c4bac8ff264b3f9f27464266e50f239707723`. No application/schema/dependency bytes changed in this phase. New Auth and NEXT06 branches are excluded. This package does not accept DEV07's human research gate or PR173's human comprehension gate.

Environment: `followup06-auth-storage-2605-local`, [actual UI login](http://127.0.0.1:3299/login?next=%2Fdashboard%2Fholdings), host-local only. Detached application checkout: `C:/Users/Asus/Documents/ChatGPT/توسعه سایت/portfolio-followup06-acceptance`. Application production build completed at `2026-10-01T10:59:51.399Z`. Node24.19.0, PostgreSQL17.11, GoTrue2.197.0, PostgREST14.17, native Storage1.11.2. The cached Storage version is explicitly the tested version, not a claim about the latest provider release or production compatibility.

The database started with zero users and no restored data. [environment.json](environment.json) lists the 16 repository SQL files and SHA-256 hashes applied after native Auth/Storage migrations, including phase32→34→35→36→37→38 and actual migrations04/08. Standard self-hosted `auth.uid/role/jwt` claim interpretation is present; user identities and signed user JWTs came from native GoTrue password login. No `sql/test` bootstrap or `deliberately_permissive_test_read` policy was used. The only storage.objects policies are the actual repository's seasonal read/scope policies. [Read-only verification](environment-verification.json) records 75 native Auth migrations, 73 native Storage migrations, six Auth users, four uploaded synthetic objects, private bucket, labels, loopback ports, exact-origin CORS204/foreign403 and actual application CSP.

All six accounts A/B/expired/cancelled/nonmember/admin are synthetic confirmed-email native Auth accounts. Fixture creation used the native admin API; acceptance used UI password login in six new browser contexts with actual issued sessions. Native file upload used the real Storage upload API; no fake storage.objects rows. The sample cohorts/resources are clearly labelled synthetic. Membership grants/revocations/cancellations and audience publishing used the existing product APIs with real admin cookies. Site-only publication emitted no Telegram, email or SMS.

## Preliminary builder run

[acceptance.json](acceptance.json): `2026-10-01T11:19:52.952Z`→`11:21:12.284Z` UTC, **17 PASS / 2 FAIL / 0 BLOCKED**. This is the builder's preliminary acceptance, not independent signoff. [Separate independent review](independent.md) and [its evidence](independent.json) record **18 PASS /2 FAIL /0 BLOCKED across20 checks**, six fresh actual UI logins and an empty guest context, actual provider expiry at65sec, unchanged ledgers and both independently reproduced NEXT04 defects. Review ran11:26:09.668Z→11:27:27.401Z with a hydration-aware actual UI follow-up through11:27:39.154Z. This checkpoint is **not accepted** until those owner04 patches are independently rechecked; the old human gates remain open.

| Check | Result | Key observation |
|---|---|---|
| UI login A | PASS | native token200, user200, exact UUID and holdings return |
| UI login B | PASS | separate context, native token/user200 |
| UI login expired | PASS | actual login; course expiry does not disable personal identity |
| UI login cancelled | PASS | actual login; course cancellation does not disable personal identity |
| UI login nonmember | PASS | actual login without course grant |
| UI login admin | PASS | actual login, admin role from synthetic profile |
| Audited grants | PASS | admin API200; member attempt403 |
| Two cohort resource lists | PASS | A/C1 and B/C2 one row; cross-cohort/expired/nonmember zero |
| Native private Storage | PASS | authorized bytes match digest; foreign/expired/nonmember/guest denied; public URL400 |
| Signed resource URL | PASS | actual product API200, TTL60, native bytes200, foreign/expired403 |
| Admin resource contract | FAIL | both lists200/one row, both downloads503, native Storage400 |
| Guest HTTP contract | FAIL | list/download503 instead of401 |
| Native REST/RPC isolation | PASS | cross-cohort zero resources, module.allowed=false |
| Personal asset/debt baseline | PASS | API201; separate snapshots in one shared financial ledger; B foreign rows zero |
| API08 cohort publication | PASS | real-admin save/technical approval/ready/publish; A200, B/expired/nonmember/guest404; private interpretation absent |
| Cohort cancellation | PASS | actual API200; next resource403, Storage400, RPC false; personal row counts/digests identical |
| Membership revocation | PASS | actual API200; next resource403, publication404, Storage400, RPC false; personal rows/digests identical |
| Expired personal asset UI | PASS | ledger identical and synthetic personal asset still visible after reload |
| Actual signed URL expiry | PASS | native anonymous fetch400 at 67sec and64sec; signed tokens never persisted |

A signed URL is a bearer capability: the previously issued URL returned200 immediately after membership revoke, then400 after its 60-second expiry. New signing, direct object access and cohort publication access were denied immediately after revoke. The evidence does not claim instant invalidation of an already issued signed token.

## Open defects — ownership before any source fix

**F06-AS-01 — NEXT04 / PR175 owner, P2.** A guest browser with no cookies GETs `/api/cohorts/{C1}/resources` and `/api/cohorts/{C1}/resources/{R1}`. Both return503 even though Auth is healthy200. Expected: explicit unauthenticated401. Source: both resource handlers treat any `db.auth.getUser().error` as a service failure; a missing session is an AuthSessionMissingError. Effect: truthful login-required state is replaced by a service outage; no private bytes leaked. Owner should distinguish missing-session from actual Auth outage, add real HTTP regression for both, then provide a stable patch SHA for combined recheck. Root did not patch the owner's application code.

**F06-AS-02 — NEXT04 / PR175 owner, P2.** Sign in as the actual synthetic admin with no membership entitlement. Each C1/C2 resource list returns200 with one row, but download returns503 and native authenticated Storage returns400. `course_resources` read policy permits `is_admin()`, while `seasonal_private.storage_allowed` requires `seasonal_module_access` which has no admin bypass. Expected: an explicit, consistent admin access contract. If admins may download, align the authorized server/Storage path; if access requires a membership grant, prevent the misleading available-resource action and return an explicit403 rather than503. No broad service-role fallback or relaxed policy was added. The owner must decide/fix the existing contract and deliver the patch for targeted independent recheck.

Security denials and other paths passed; these two failures still prevent accepting this checkpoint. There were no new product defects in API08 or the personal financial ledger in this run.

## Initial attempt and test-harness corrections

[acceptance-attempt-01.json](acceptance-attempt-01.json) is retained verbatim. Several initial failures were harness errors: it incorrectly assumed a separate debt version ledger/base0, queried nonexistent `user_id/id` columns on position tables, and expected an object receipt from publication save instead of the UUID contract. These were fixed only in the acceptance script. Final checks use one financial ledger, positions filtered by actual version IDs and correct publication UUID receipts. Previously cancelled cohorts/history were not reset; [prepare-retest.mjs](prepare-retest.mjs) created a new labelled synthetic cancellation cohort through fixture construction. Prior metadata is in [fixtures-attempt-01.json](fixtures-attempt-01.json).

The initial internal-only Docker network made loopback publication unreachable. `setup-network-attempt.json` preserves that infrastructure attempt; a separate owned API bridge fixed it while the DB remained internal without a published port. This is not an unresolved current service blocker. The corrected fresh setup script refuses to overwrite existing containers or private secrets before writing; it was not rerun against the existing environment. Actual continuation is recorded by `resume-setup.mjs` and the installation manifest.

## Secure handoff / continued review

Credentials live only in current-user ACL-protected `C:/Users/Asus/.codex/private/followup06-auth-storage/reviewer-credentials.json`; infrastructure secrets/env files are alongside it. No values are in this repository. Use the labelled role in that private file, then sign in using the actual product UI. Never inject a cookie/JWT or record credentials, token URLs, HAR, traces or password screenshots. The native JWT keys generated by setup are infrastructure anon/service keys, not manufactured user identities.

Current owned services are `followup06-accept-{db,auth,rest,storage}`, label `codex.task=followup06-accept`; owned volumes `followup06-accept-data/files`; networks `followup06-accept-network` (internal DB) and `followup06-accept-api` (loopback services). Gateway3299→Next3298 and real Auth54341/REST54342/Storage54343. The older own regression DB was stopped to reduce memory use; its volume was retained. DEV07 human3210, PR173 human environment, other Auth sandboxes and Production were not stopped or modified.

The existing application build can be resumed from the frozen acceptance checkout using `node ../portfolio-followup06-integration/docs/ops/seasonal-program/followup-06-auth-storage-evidence/app.mjs`; gateway uses `gateway.mjs`. `app.mjs build` is only necessary after a changed application/environment build. Its external resource guard is [resource-guard.cjs](resource-guard.cjs), copied to the acceptance checkout's `.task/resource-guard.cjs`; it restricts fetch to loopback and reports one CPU/heap768MB on the low-memory host without changing application source. Existing node_modules has the same dependency lock. Existing bundled Playwright with separate headless Chrome contexts was used because agent-browser CLI was not available; nothing was installed and existing human browser profiles were not reused.

Do not blindly rerun setup/fixtures/acceptance against a live review: grant/cancel state is append-only and needs an explicit new labelled synthetic cohort or actual API grant/revoke to arrange a repeat. An independent reviewer can regrant A through the existing admin API, inspect the cohortA publication, then revoke. B remains the active cohortB member; expired/cancelled/nonmember remain negative fixtures. Continue using the fixed checkpoint until its owner delivers a reviewed patch. No merger, production deployment, shared migration, real data, backup/restore or new product feature belongs to this package.
