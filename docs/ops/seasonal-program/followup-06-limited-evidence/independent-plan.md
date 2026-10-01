# Independent limited combination acceptance — preparation

Reviewer: `/root/limited_independent`, separate from the composition author. This file is a plan; no case is accepted by preparing it. The immutable application SHA, build origin and migration proof must be supplied before execution. Frozen `2605a0f` evidence and its `18 PASS / 2 FAIL` result remain historical and unmodified.

The reviewer will use six existing, synthetic native GoTrue accounts and fresh browser contexts. Every session must originate from the product login UI; native REST/RPC requests may reuse only the resulting real access token in memory. Credentials, tokens, signed URLs, HAR and credential screenshots are never evidence files.

| Group | Required observation |
|---|---|
| UI Auth | Six UI logins, GoTrue token/user HTTP200, canonical account UUID, actual redirect |
| Resource patch | Guest list/download and `/api/me/cohorts`401; admin without entitlement list200/zero rows, download403; direct private bucket remains denied |
| Membership | B gets only B private file with exact bytes/digest; A revoked, expired, cancelled, nonmember and foreign accesses denied in application/REST/RPC/native Storage |
| Temporary grant | Real admin API grant to A; allowed actual file and signed bytes; grant must not unlock `/terminal` |
| Publication | Existing technical synthetic cohort-A publication limited to the intended audience, no underlying private research; this is not human research approval |
| Revoke | New resource/publication/native/RPC requests denied; previous signed capability is explicitly permitted only until native TTL60 expires |
| Home/routes | `/dashboard` has member home and shared profile link; `/dashboard/portfolio` retains the prior portfolio view; canonical financial ledgers remain byte-identical before/after restrictions and usable in holdings UI |
| Identity180/181 | Installed authenticated GET is empty/phone-unverified/official-pending, guest401; email-only POST401; direct client writer RPC denied; profile UI renders empty state and not `NOT_INSTALLED`; no private identifiers appear in member-home text |
| Faults | Owned loopback gateway injects upstream503 separately for Auth and Storage; native control request proves fault mode; application failure is classified503; restored transport recovers. This is controlled sandbox transport failure, not a claim that Production/native containers were stopped |

Private fault control: `C:/Users/Asus/.codex/private/followup06-auth-storage/limited-fault.json`, JSON `{auth:true}`, `{storage:true}` or `{}`. Restore `{}` in `finally`. Do not stop containers or touch human DEV07/173 environments.

Successful identity write/mobile provider delivery remains **OPEN**: the existing accounts have no native confirmed phone, and providers are disabled/unconfigured. No phone proof is fabricated. New feed/read-state, NEXT09, human DEV07/173, owner personal login, live market quota/cycles and real FX financial/provider acceptance remain **OPEN** and outside this limited verdict.
