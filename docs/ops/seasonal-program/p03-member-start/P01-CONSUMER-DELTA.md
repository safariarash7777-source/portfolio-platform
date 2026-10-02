# P03 consumption of P01 session failure contract

The member readers previously turned explicit expired-session HTTP400 errors into503. Runtime commit `f669c05baf2cdebfead20999e389c77f19015152` delegates `memberAuthErrorStatus` and `publicationMember` to P01's classifier. No new membership policy, Auth model, schema or migration. `publicationAdmin` is unchanged and remains P07-owned.

Owner source: P01 `87f6b2250218c661fc3a6ab89fec10d35f6a7467`. The helper `lib/auth/session-error.ts` is byte-identical Git blob `60ef5ffa882973ad5400c3b8243e32e94280ea63`. Only this helper was imported, not the full #208 middleware/callback/writer patch. Known missing/expired sessions map to401; unknown400, transport/configuration and service errors remain503. Real SDK class identity is retained; a matching error name alone is insufficient. P00 owns the combined tree and its separate acceptance.

Follow-up `1f97cb25d89a983c9641cfdb54e8d2950316f1be` supplies explicit third argument `undefined` to two SDK test constructors. P00 found TS2554 in its combined candidate; independent `tsc --noEmit` now passes. Earlier build evidence must not be transferred to P00's integrated tree.

## Verification

| Check | Result and boundary |
|---|---|
| Full registered core at1f97cb2 | **1313 PASS / 0 fail / 0 skip**, including focused tests |
| Focused member/feed atf669 | 49 PASS; actual server consumer, canned SDK transport; denied list/detail/read never reach private RPC |
| Existing Auth/seasonal/SMS handlers | 23 PASS; existing checkout handlers, not full P01 integration |
| Existing next/login/publication/financial/seasonal consumers | 30 PASS |
| Full TypeScript at1f97cb2 | PASS exit0 |
| Runtime build atf669 | PASS47 static pages; follow-up changes tests only |
| Known400 baseline | [8 mismatches reproduced atf889 and fixed](evidence/p01-delta-negative.json) |
| Cookies | [2 synthetic VM cases](evidence/p01-delta-cookie.json); unchanged middleware vs historical7cb030c; not native refreshed-cookie integration |
| Native SDK | [2 cases](evidence/p01-delta-native-sdk.json); actual synthetic native-issued token, scope-local sign-out and refresh rejection. Unknown validation400 stays503; refresh_token_not_found becomes401; no injected member JWT |
| Native HTTP atf669 | [10 PASS](evidence/http-delta.json): B own feed/detail/resources, anonymous401, wrong/revoked cohort403, private file403, Auth outage503 and recovery200 |
| Browser after reload atf669 | B's own course/resource/publication visible; [screenshot](evidence/native-delta-B.png); not full P01 refresh/logout/recovery proof |

Earlier63 native checks and browser journeys remain labeled at runtimef889; they were not relabeled or needlessly repeated. No schema/RLS change required another local DB suite. New-head CI and consolidated P00 acceptance remain required.

Two preliminary malformed-token probes returned validation_failed and were not counted as successful missing-token scenarios. The final SDK probe uses an actual issued token. The first recovery probe queried before service readiness; readiness polling corrected the probe without application changes, and the final10-case run passed.

## Delivery

Draft [PR209](https://github.com/safariarash7777-source/portfolio-platform/pull/209) was last verified published at `63aeb0ff21db91b0b07c6fdde5b579cd1747b8fc`, before this delta. Git push and the GitHub connector currently fail through the host's external connection. The tested delta is committed locally; until the remote head is verified, it must not be described as published or CI-green. No DNS/VPN/security setting was changed.

Real provider/device/independent human acceptance, P00 release base/manifest and full #208 integrated Auth flow remain open. No Production deployment, merge or shared migration.
