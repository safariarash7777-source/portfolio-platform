# P01 — Read-only demo65 login triage

Observation: 2026-10-02T17:35:47Z–17:36:12Z. Environment: `portfolio-demo844`, `https://62.60.191.24:8444`; reported application SHA `65c215b801958c32599fafb0f6e331dd5ce3d181`, tree `2e4c81459bb1bd733dc598c1fe0f3fa69c2ca8c6`. P00 owns this runtime. This report does not install the later email/recovery PR215.

## Finding

**Cause UNKNOWN; independent native acceptance BLOCKED.** P11 reached the native login form, submitted synthetic account A, then lost browser control to timeout/reset. Its report records no valid login completion, exact submit timestamp, HTTP status or usable request ID. Last observed pathname was `/login`. A/B/member journeys remain NOT_RUN. A browser-control timeout is not evidence of invalid credentials or an Auth failure.

The P00 receipt reports separate successful native token200/canonical-account/cookie checks. Those checks do not replace P11's independent browser acceptance and cannot be attributed to P11's attempt. A proxy hypothesis remains a hypothesis.

## Read-only server evidence

SSH read `docker ps`, narrow Docker metadata, and `docker logs --timestamps --since 2026-10-02T17:19:00Z --until 2026-10-02T17:28:00Z` only for demo844 Auth, app and gateway. This window is inferred from the P00 receipt at17:20:38Z and the P11 report at17:27:12Z; it is not a measured submit interval.

| Container | Started UTC | Restarts | Log driver | Rows returned in window |
|---|---|---:|---|---:|
| Auth / GoTrue2.197.0 |16:52:39Z|0|json-file|0|
| app |17:08:38Z|0|json-file|0|
| gateway |17:10:36Z|0|json-file|0|

All three bounded log reads exited successfully and each container had a log path. Zero returned rows do **not** prove that a request did not reach Auth; request logging completeness was not established. HTTP status, cookie presence, `getUser`, refresh, redirect completion and request attribution remain UNKNOWN. No code defect is proven by this evidence, so no runtime repair was made.

Sanitized evidence: [aggregate JSON](./P01-DEMO65-TRIAGE.json), [logging metadata](./P01-DEMO65-LOG-METADATA.json). No raw logs, request bodies, query strings, headers, email, UUID, hash, credential, OTP, cookies or tokens were exported.

## Independent browser limit

P01's own in-app browser navigation to the same demo login was rejected with `ERR_BLOCKED_BY_CLIENT` before product DOM access. The blank tab was closed. A separate public health request timed out, with status UNKNOWN. These are P01 transport observations, not P11 observations or an Auth diagnosis. No alternative browser/proxy/HTTP/tunnel was used to bypass the block.

## Next acceptance step

Preserve demo65 unchanged. In the next permitted P11 browser run, record the exact UTC submit time and route progression without recording credentials or token/cookie values. Compare only sanitized request method/path/status in that measured interval where available. Test login, role, refresh, sign-out/sign-in and unrelated-account rejection separately. If the browser loses control again, keep completion UNKNOWN; do not turn a provider send receipt or a token response from another test into UI acceptance.

No runtime, proxy, account, fixture, database, migration, SMS or Production changes were performed. Tools: read-only SSH/Docker via PowerShell and in-app CUA browser; source/report inspection. Supabase session guidance applies; owner credentials and private reviewer file were not read by P01 during this triage.
