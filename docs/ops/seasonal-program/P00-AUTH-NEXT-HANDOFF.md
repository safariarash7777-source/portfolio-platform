# P00 — isolated Auth continuation on cfa

Candidate branch: `codex/p00-auth-next-20261002`; base app `cfa4e211dc1c1dd50141eadd0f2a884151f78e06` / Draft PR216. This source preparation does not replace the visible demo8444. Resolve the branch HEAD for the final candidate revision; exact build and CI receipts are recorded separately after freezing it.

## Source and ownership

- PR215 head `dd9f237ada73c1cd4c9f37fdb69e1d78e1b9afcf`: consume `c1bf80ce6f6bc7bd5ad5af5d3e1e79610cc18175`, `ac8a6012168cb63ccc46562ac28c8b271f79dbc2`, and required route-signature fix `639ee3420ee071352086eb81b83b005da14e30d8`. Auth contract and email operations README also match this head.
- PR218 head `b2c28322b5918ac3ec34b61b94da6dc1b4ae3331`: consume runtime `d1505afab35945a2c100ba72b8ac0f638c38644c` plus the actual login-submit regression test from final head b2c2832. The carried P01 result is historical owner evidence; its 151 count is not this candidate's measured count.
- PR217 head `ca2f3e27db8779c6b760c1ac613af8626f419c15`: consume only adapter/test runtime `1f5c5876fe9d641f163752cde179619eba502877`.
- Dependency graph: P01 shared session208 → cookie211 → email215 → login218; financial217 depends on208 separately. cfa already contains208 and runtime211 `0ed89c28b54438637b4f49ca322cbbc636d75fc2`; neither is replayed.
- P01 owns Auth classification, forms and callback. The financial boundary keeps P04's user/error interface, canonical readers/writers and receipts. The only code merge conflict was test imports: retain SDK error classes and all P04 import/read/receipt assertions. A second conflict concerned a missing historical P01 result document; retain the owner's version without relabelling its evidence.

All three exact source heads have five successful main CI gates, read directly through Code Review: 215 run37040113251; 217 run37042068048; 218 run37043326999. They are source gates, not candidate CI or native acceptance.

## Candidate validation

Measured on the merged source: 104 Node Auth/SMS/resource tests, 19 Auth TypeScript tests, and 23 merged financial HTTP tests passed with zero failures/skips. This includes actual submit behavior under a stalled synthetic transport, abort/late-response protection, retry isolation, four cookie factories, recovery proof/metadata guards, stale-user rejection and stopping before a private financial RPC. Typecheck, scoped ESLint and diff-check passed. Tests use installed SDK and synthetic/mocked transports; no real provider send or native Auth session is implied.

Runtime Auth and corresponding test files match final218 exactly; financialHttp.ts matches217 exactly. Package/lock/workflow/migrations and P04/P07 runtime outside the adapter are unchanged versus cfa. Dependencies are reused read-only; no install or schema mutation is needed for preparing the source.

## Environment and open gates

The candidate build is isolated, network disabled and bounded to 2GiB/1CPU; no listening app is started. Demo8444 remains cfa, with its prior independent32 results. Proposed eventual namespace remains `portfolio-demo844-auth` consistently in browser/build/server/callback; default behavior when unset remains supported. Cookie namespace alone is not a real-login witness.

SMTP/SMS and signup remain disabled. A mock email transport is an offline test only. The application's signup flag is not an ingress guard for native GoTrue `/signup`; eventual sandbox settings must be explicitly verified before any signup test. Native UI login/retry, fragment/PKCE recovery, confirmed email recovery proof, provider delivery, owner acceptance and financial DB/RLS acceptance remain OPEN. P11's browser-tool timeout cause remains UNKNOWN; the bounded-login reproduction does not attribute that incident.

After candidate build/CI succeed, coordinate an explicitly versioned native acceptance environment. Do not substitute the restored real Preview DB, change shared schema, send real messages, buy resources, merge a PR or publish Production. Rollback of this source candidate is discarding its branch; the current visible demo has not been changed.
