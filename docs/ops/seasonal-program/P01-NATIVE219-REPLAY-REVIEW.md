# P01 — Native219 PKCE replay message review

2026-10-03, Asia/Tehran. Source reviewed: PR219 `2e44dc1d7008acf0b0c76e8679238514f4f7bab2`, tree `d5d8dbe18d07d1e315d141fbcf012d1643154125`. **P01 source/fixture verification only; no live native retry or deployment.** P00's handoff reports runtime9b33 preserved until the independent runner's quiet window.

## Reported native defect

The independent runner/P00 reports an actual successful PKCE flow on9b33 followed by replay in the previous context: access was safely denied with307, but the error reason was `auth_unavailable`. The installed SDK's missing-verifier error has class `AuthPKCECodeVerifierMissingError`, status400 and code `pkce_code_verifier_not_found`. That local SDK error also covers a different browser/device or cleared verifier storage; it is not proof of a provider outage, nor exclusively proof of replay. The existing session classifier intentionally treated it as an unknown service error outside callback context.

## Source correction and boundary

The new `authCallbackFailure` uses the installed SDK's official `isAuthPKCECodeVerifierMissingError` predicate. That recognized class maps to `auth_callback_failed` only for callback. All other errors still delegate to the shared classifier. `authSessionFailure` and `authActionFailure` bodies are unchanged; the financial adapter, middleware permission checks, schemas, identities and grants are untouched. Upstream PR208/215/217/218 branches were not modified by P01.

The callback now calls this context-specific function. Safe destination/public origin, cookie/cache propagation and8s deadline remain. Unknown400,404,429,5xx, non-JSON/network failures retain `auth_unavailable`; a missing verifier does not broaden access, renew membership, delete history or imply changing credentials. Null error still uses the existing success branch, not the callback-failure function.

## Exact-source verification

- Installed `@supabase/auth-js` source confirms the class's status/code and official predicate. No error payload from a real account was read or exported.
- `p01-session-contract.test.mjs`:44 passed. Includes the real SDK missing-verifier class, expired flow, unknown400,404,429,500,503 and parse/outage cases; redirects preserve next/cookie/cache and expose no code.
- `p01-cookie-scope.test.mjs`:6 passed. Confirms proxy public-origin and configured/default cookie cases; combined handler count50.
- LoginFlow10 plus merged financialHttp23:33 passed. Total83 in this scoped local review,0 failures/0 skips. Financial tests stop private RPCs for invalid sessions/service failures.
- The new regression explicitly asserts that the same PKCE missing-verifier class still yields503 from `authSessionFailure`; only callback context gets the new label.
- Scoped ESLint and diff check passed. Heavy local build NOT_RUN. GitHub CI37065025739 on exact2e44 completed SUCCESS; this is the source gate, not native acceptance.

## Independent retest still required

After P00's origin-specific build and runtime receipt for2e44, test both primary and isolated unset-cookie profiles with fresh native PKCE requests. Record successful exchange first, then replay/missing-verifier: public-origin307 to the safe local login path with `auth_callback_failed`, no new session/access. Confirm that a prior legitimate session is preserved and the ordinary role/UUID remains canonical, reporting equality/presence only. Restore healthy login afterward. Separate outage/header/body faults must still produce `auth_unavailable` with no private RPC or privilege gain.

Preserve the9b33 replay-message failure and earliera062 origin failure as historical results. Do not transfer their positive subcases or CI counts to2e44. Owner Production login, real providers, external delivery and human/fullDEV07 acceptance remain separate open gates.

P01 read source/CI and ran offline SDK/handler tests in an isolated checkout. No credential, private inbox/fault/counter, live account, runtime, env, schema, migration, SMTP/SMS send or Production change. Tools: Git/PowerShell, installed Node/tsx/SDK/TypeScript test harness/ESLint, read-only CI metadata.
