# P01 — Native219 callback origin review

Update2026-10-03: P00's final8445 deployment receipt now pins9b33 and the independent run is reported IN_PROGRESS; see [updated runtime receipt](./P01-NATIVE219-RUNTIME-RECEIPT.md). The a062 runtime statement below describes the earlier source-review moment, not the current handoff. No native PASS is added by this update.

2026-10-02, Asia/Tehran. **Source review and isolated tests; no deployment or native retry by P01.** PR219 final source reviewed: `9b33fe4dacbddabf96dce0c6a27d8e9a9f03c4f5`, tree `8900eb7fd8520531828dab3bfe1c0c824922caaa`. Runtime origin fix: `07f05bdf1f1e2c459786e307cf8c3d0fc324eef3`. The operator's last runtime statement still pins the active8445 run to `a0625a42ad1cb24dd31e561528fa901758d01f57`; a source/CI change is not a runtime upgrade.

## Confirmed evidence and its scope

Independent `callback-origin-diagnosis.json` records at2026-10-02T19:59:20.901Z (23:29:20.901 Tehran): environment `portfolio-auth219-20261002`, SHAa062, GET `/auth/callback`, **codePresent=false**, HTTP307, destination origin `https://0.0.0.0:3000`, path `/login`, samePublicOrigin=false, queryStored=false. This actual HTTP observation proves a wrong origin on the missing-code callback path. It does not prove that a valid PKCE code was exchanged in that diagnostic request.

The independent results snapshot contains N07 BLOCKED and FAIL records. P00 reports PKCE return failure and supplied the origin fix. Preserve those statuses and the broader runner's separate evidence; do not promote the negative diagnostic or the source fix into positive Native PKCE acceptance. The related gateway/streaming/privacy findings in the independent checkpoint also retain their own status and ownership.

## Source correction reviewed

`authOrigin` uses trusted deployment `NEXT_PUBLIC_APP_URL` when configured and ignores forwarded/Host headers. It permits HTTP/HTTPS only and rejects URL userinfo. Callback, protected middleware redirects and email confirmation/recovery destinations now share it. Safe-local-next normalization, cookie/cache propagation and the existing8s callback deadline remain. No account, grant, role, SQL, dependency, financial calculation, template, provider or profile change is in the runtime commit.

Deployment precondition: the configured public app URL must be valid and match the origin-specific build/runtime. The unset fallback still uses requestUrl, so the helper cannot make an unconfigured proxy deployment correct. Invalid URL configuration can throw; this source review does not claim that every misconfigured deployment receives the controlled503 flow. Validate configuration before handing the candidate to the native runner; no live environment was changed for a negative configuration test here.

## CI failure and correction

CI37058385717 on07f05 failed in **Core tests**, with `Cannot find module './lib/auth/origin'` from `components/account/loginFlow.test.ts`. Dependencies, disposable-DB RLS/Integrity and Secret/SQL succeeded. P01 reproduced that same failure in an isolated checkout; it is a legacy VM harness import-resolution failure, separate from the Native wrong-origin defect.

P00 then added9b33 in the existing PR219, loading the actual origin helper into all three legacy middleware harness loaders. No duplicate PR/dependency is needed. Exact9b33 targeted login/return-path suite:16 passed,0 failed/0 skipped; scoped ESLint passed. The92 handler tests also passed during isolated investigation of the same runtime patch. They are not native measurements.

CI37058958179 on exact9b33 completed SUCCESS. All five jobs were independently read as successful; the quality job's **Build** step succeeded. This establishes the source gate for9b33, not acceptance of an app still runninga062.

## Remaining native recheck

After P00's quiet-window handoff, an origin-specific build and accurate runtime receipt must pin the new source. Use fresh native confirmation/recovery requests and links; do not replay an old expired/consumed code as a positive test. Repeat N07 positive exchange plus missing/replayed/expired negatives, N06 callback-cookie consistency, N08 fragment confirmation/recovery, N09 safe-next/fallback, N11 reset destination/proof and N18 relevant Origin/privacy cases. Record the actual source/build/origin for each result. Existing canonical UUIDs, fixtures and histories stay intact; no DB reset or new migration is implied.

Owner Production login, real SMTP/SMS, external delivery and human acceptance remain separate. P01 made no runtime/env/schema/fault/inbox/credential changes and performed no live HTTP/browser login. cfa8444 and195/8443 were not touched. Tools: read-only Git/source review, sanitized independent artifact fields, GitHub CI metadata and filtered error lines, installed Node/tsx/TypeScript/ESLint in an isolated checkout. No raw query/code/token/cookie/password/hash exported.
