# P01 — Bounded browser password login

2026-10-02. Source-only continuation of FOLLOWUP-01/07; demo65 remains frozen. Base PR215@`dd9f237ada73c1cd4c9f37fdb69e1d78e1b9afcf`; runtime commit `d1505afab35945a2c100ba72b8ac0f638c38644c`. Main remains `51fd0661d48d791ce8758a87828a81ce72cac6df` and the selected195 base remains `31c44ab635b672b589b7833bcbc78b41d36f1e75`.

## Proven source defect

The existing email/password login directly awaited the browser SDK. Its fetch had no request AbortSignal or UI deadline. An offline test using the installed SDK and a deliberately non-settling transport reproduces an unresolved submit. This source defect is established independently. **It is not the established cause of P11's browser timeout on demo65**; P11 has no exact submit time, correlated HTTP status or completed session observation.

## Minimal correction

Login wraps its SDK call in the existing `withDeadline` helper with8000ms. The existing canonical browser factory accepts an optional request signal. Only this sign-in path supplies it; ordinary factory calls retain the same default options and cookie namespace. A sign-in-scoped client is not put in the normal SDK singleton, so an aborted signal cannot poison a retry or another consumer.

The scoped fetch also bounds response-body completion before giving the SDK a response. It aborts transport on expiry and rejects a late response even when a transport ignores abort. This prevents that late response from storing a session after the UI has reported failure. Credential rejection still comes from native Auth; success still uses the existing SDK cookie and safe full navigation. The existing catch/finally restores the submit action and preserves email/password inputs. No account, role, grant, provider or Auth endpoint was added.

The timeout bounds waiting while the browser event loop is responsive; it cannot repair a hung browser-control connection or frozen browser process. It does not prove owner login, TLS/proxy behavior or server-side permission enforcement.

## Verification

- Seven added regressions: baseline pending transport/no signal; network hang; body hang; successful SDK cookie write; credential rejection; fresh retry after expiry; login wiring/loading/input preservation.
- Network/body/late-write cases use the installed Supabase SDK with offline response fixtures and accelerated test timers. No live account/provider calls, JWT construction, OTP or private credentials.
-104 Auth/SMS/resource tests passed,0failed/0skipped;47 related TypeScript tests passed. Total151.
- Typecheck and targeted ESLint with zero warnings passed. Secret scan:1308 files,0 findings. Diff check passed.
- Heavy local build NOT_RUN to preserve laptop memory. Remote CI/build must pass the delivery head.
- Native browser/provider, independent A/B, owner Production login/refresh/logout/relogin remain OPEN. No new product screenshot is claimed.

## Ownership, integration and rollback

P01 owns Auth and these login/factory changes. No globals, layouts, fonts, Navbar, financial engine, market reader, package/lockfile, workflow, migration or common manifest edits. P00 owns installation and demo freeze. The runtime patch must be applied to the matching PR215/211 cookie contract, not used as permission to redeploy demo65. PR217's financial adapter is separate and depends on PR208.

Rollback: revert this runtime commit in the consuming branch. No account or stored history changes require reversal. Provider activation, real SMTP/SMS, owner credential changes and Production rollout remain separate gates; legacy email login remains present.

Tools: Git/PowerShell, Node, installed SDK, VM fixture harness, TypeScript, ESLint and secret scan; Supabase/Next.js and React best-practices guidance. Read-only server triage is in the separate `P01-DEMO65-TRIAGE.md` receipt; no runtime repair was performed there.
