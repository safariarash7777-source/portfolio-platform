# DEV07 independent acceptance — frozen 1978bf5

Reviewer: Independent Codex reviewer agent `/root/dev07_independent`. The reviewer did not author the PR fixes and is not a human. No human sign-off is claimed.

Application SHA: `1978bf562078336f21a7397d01acd8786b020f27`. Environment: `dev07-1978-local`, [local app](http://127.0.0.1:3210), production build. Backend: actual GoTrue v2.197.0, PostgREST 14.17 and fresh Supabase Postgres 17.6. All data is synthetic.

Started 2026-09-30T16:24:40.109Z; finished 2026-09-30T17:01:46.416Z. Timestamps below are UTC; Tehran is UTC+03:30. Manifest: `.task/dev07-app-manifest.json`; catalog evidence: `.task/dev07-preflight.txt`. The public Vercel Preview was not the target of this acceptance.

**Decision: NOT ACCEPTED / NOT READY TO MERGE.** No merge or production deployment was performed.

| Scenario | Result | UTC recorded | Independent evidence |
|---|---|---|---|
| 1 | PASS | 16:26:43.703 | All three actual UI sign-ins reached the requested holdings page; real GoTrue user IDs matched A/B/advisor, HTTP 200. |
| 2 | FAIL | 16:52:45.706 | Market, funds and symbol pages inspected. Unknown main KPIs showed —. Symbol money flow incorrectly showed 0 Toman with absent buyI/sellI. |
| 3 | PASS | 16:26:48.752 | UI Persian ۱۲ created holdings v1; ۲۴ created v2, HTTP 200. Reopened v1 still contained 12. Date, unit and price source retained; valuation 14,400 Toman without a target. |
| 4 | PASS | 16:26:52.438 | B's foreign-version URL denied; authenticated REST versions/items returned HTTP 200 with zero rows; relation RPC returned 403. A saw its own version. |
| 5 | BLOCKED | 16:28:45.349 | Technical UI v1/v2, opening old v1, approval HTTP 201 and client draft REST isolation passed. Independent human approval remains blocked. |
| 6 | PASS | 16:26:51.915 | Before grant, advisor had zero relations, holdings and sessions. A's explicit consent through UI returned 201. After grant, advisor saw one relation and two holding versions. |
| 7 | PASS | 16:28:51.739 | Selector exposed title/version metadata only. Returned approval and newer draft removed the old choice; a formerly approved UUID in POST session returned 422. |
| 8 | PASS | 16:38:42.614 | UI session returned 201 with holding/research links. Tehran 10:00 stored UTC 06:30. Reopening/editing with device timezone America/Los_Angeles preserved that time; due date remained 2026-10-05 without a clock. |
| 9 | PASS | 16:36:52.150 | Before publish, A/B saw zero sessions. Explicit publish returned 201; A saw only v1 and B saw none. Private note absent from client HTML/GET/REST; v2 draft stayed hidden. |
| 10 | PASS | 16:38:45.756 | A's UI status-only request returned 201 and created v2. Four action fields preserved, actor=A, v1 retained; changing the advisor-owned action returned 403. |
| 11 | FAIL | 16:56:40.472 | Advisor UI status change created v3, preserving fields and advisor actor; forged actor did not win. Stale A/advisor requests timed out or returned 503; direct RPC returned 504 PGRST003 instead of 409. |
| 12 | FAIL | 16:58:43.907 | Concurrent base 5 produced one 201 and one 20-second timeout; only one extra row. Duplicate holding token returned the same ID with reused=true. UI 422 retained unsaved text. |
| 13 | PASS | 16:59:44.183 | A's UI revoke returned 201. Next requests from the advisor's stale page for status/session/research returned 403. Authenticated REST case/notes/holdings all returned zero rows. A retained published v1. |
| 14 | PASS | 16:52:41.099 | Scoped permission faults caused research-list error while retaining both sessions and UI retry; case API returned generic 503. Restored permissions recovered through retry. Stale price, missing source and incompatible unit each showed unknown value, without fabricated zero or NaN. |

## Reproducible defects

1. Log in A and advisor through the actual UI. Create a relation, a published session and a client action. Advance the action to version 3, then POST a status-only change with baseVersion 2. Browser Network confirms the request reached `/api/consultation`; a later response was 503. Direct authenticated RPC returned 504 PGRST003 after pool exhaustion. Advisor reproduction also timed out. Concurrent requests with the same base produced one 201; the losing request never returned 409. Custom business-conflict SQLSTATE 40001 in phase35/36 triggers actual PostgREST 14's infinite transaction retry. Stale attempts did not add versions. Restarting only the named local REST service recovered availability.

The [official Supabase troubleshooting article](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) and [upstream PostgREST issue 3673](https://github.com/PostgREST/postgrest/issues/3673) support this diagnosis. This reviewer did not change app code or schema to fix it.

2. The synthetic stock snapshot contains price 1,200 Toman but no buyI/sellI. Open `/symbol/فملی`: “ورود پول حقیقی (امروز)” shows “۰ تومان”. `lib/market-ir.ts` lines 227/229 convert missing buyI/sellI to zero; the symbol page treats those numbers as valid. The requirement says unknown data must not appear as a valid number. Missing CustomerJourney links on the extra `/market/stocks` path were recorded as an observation, not the primary rejection criterion.

## Human approval requirement

Exact scenario 5 instruction: “تأیید انسانی مستقل با UI صف تأیید انجام شود.” The technical Codex reviewer exercised UI approval on clearly labelled synthetic research so downstream behavior could be tested. No human approval was claimed. This criterion remains **BLOCKED**.

## Restored state and audit

Research RPC EXECUTE and sessions SELECT grants are restored to authenticated. The original valid price/date/source remain unchanged. An attempted UPDATE was rejected by the actual append-only guard; subsequent price checks used separately labelled synthetic rows appended through ordinary INSERT. Only the local REST service was restarted after retry loops. No remote, production or Liara resource was touched.

Credentials were securely filled in the actual UI. No cookie or JWT was manufactured or injected. Real session tokens were used only in memory for authenticated REST and never printed. Private-note contents are redacted from observations.

Machine-readable timestamps, statuses, versions, HTTP results, row counts and synthetic IDs are in `.task/dev07-independent-results-1978bf5.json`. Harness files `.task/dev07-independent-*.mjs` contain test automation only; they do not change application code.
