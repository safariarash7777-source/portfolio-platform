# Liara REST alternatives — offline client-source evidence

No network, CLI invocation, credential/config read, API call, shell, WS or START was performed. This documents installed CLI 9.5.1 consumption of API fields, not a formal complete server schema or proof of current responses.

## Exact source and pins

Root: `C:/Users/Asus/AppData/Local/pnpm/store/v11/links/@liara/cli/9.5.1/1f8ea672a86bf6e4ae607c0a28efd4a83a09f4efcd175ffa51bf3bf22984bc21/node_modules/@liara/cli`

| Relative source | SHA256 |
|---|---|
| package.json | 6c44aa005fcc8c46045d1e8f974d9e55d4ea8989096a1b6a0b09beda9a7ae86b |
| lib/base.js | 00dae07c922f820411f45dbd48ac535c55e48ceeeff5414a63d4707f2d41b638 |
| lib/constants.js | 4e3a4a87ffb444f34611c3ead1ce4261ddd5972cbf6a22ab476238943373efd8 |
| lib/commands/app/list.js | efdad4a822feb50a7e0b1d0e995f8f529ddef6c405128afca1c96af75611ecb6 |
| lib/commands/app/logs.js | 445933de6747f99faf0e6fff55ce0957a0ed015dc45c2e808308a6dd39b987eb |
| lib/commands/deploy.js | 9887023ee5cd44d5f0494c068a698cdd4e055e50f48ab2adefc6393b8051c974 |

`constants.js` maps both configured regions to `https://api.liara.ir`. `base.js:51–91` sets Bearer authorization, adds teamID to requests and chooses the configured region base. Defaults are not proof of the active account/team. It does not explicitly set a zero retry limit or response byte cap in this inspected configuration; never infer one-call behavior from CLI invocation.

## Observed read contracts

| GET path | Client evidence / consumed shape | What it supports | What it does not establish |
|---|---|---|---|
| `/v1/projects` | app/list.js:8–23; `{projects:[{project_id,type,planID,bundlePlanID,status,scale,created_at}]}` | Control-plane list, platform/plan/status under authorized account/team | Actual PID, runtime environment, database binding, consumed provider quota; account-wide list is broader than needed |
| `/v1/projects/{app}` | deploy.js:95–104; `{project:{scale,bundlePlanID,type,...}}` | App control-plane metadata | Running process identity or database behind its environment; deploy command itself MUST NOT be invoked to obtain it |
| `/v1/projects/{app}/releases?page=1&count=100` | app/logs.js:90–130; `{releases:[{_id,tag,...}]}`; existing frozen discovery parser separately expects `currentRelease` and matching `state=READY` | Current release reference when the already-reviewed discovery contract matches, and release/tag lookup | Runtime executable hash, effective env, table identity, successful ingestion or remote shell termination |
| `/v1/releases/{releaseID}` | deploy.js:316–321,471–485; `{release:{queue,state,failReason?}}`; recognizes FAILED/UNHEALTHY/READY | Deployment queue/state in control plane | That application data are fresh or BRSAPI/account quota is valid; failReason must not be printed raw |
| `/v2/projects/{app}/logs` | app/logs.js:20–65; query `start`, `direction=forward`, `last_lines`, optional `releaseId`; `{data:[{metaData:{releaseId},values:[[timestamp,encodedLog],...]}]}` | Release-labelled timestamped log observations, if bounded and projected | Present backend identity without a trusted structured attestation; log statements may be historical, incomplete or application claims |

Log display parses `encodedLog` JSON for `_entry` and `type` and prints raw text. This path is NOT an approved sanitizer. `last_lines` is boolean, not a numeric response bound. No supported `end` or numeric line-limit parameter was found in this client method; do not invent them.

`logs.js:156–201` also reads plan retention from `/v1/me`, may resolve release tags, fetches release lists for new IDs, and loops even with follow=false until an empty batch (unless last-lines breaks). Therefore the full CLI command is not a bounded single-read alternative. The inspected app commands expose no metrics/actual-usage endpoint; plan CPU/RAM capacity in app creation is not consumption. This is a scoped finding, not a claim that no metrics API exists anywhere.

## Proposed bounded request envelope — not executed or authorized here

Prefer an existing reviewed release receipt first. If root later authorizes fresh metadata: one GET for exact app, one existing-contract release-list GET, and optionally one GET for that exact current release: maximum THREE requests total, no polling, redirects or retries. Stop on unknown/error/malformed identity rather than exploring other accounts. Suggested local enforcement: 10-second per-request deadline, 1 MiB body cap, fixed endpoint allowlist, selected typed fields only. These are proposed client limits, not guarantees supplied by the provider.

Logs should be a separate explicit decision, at most ONE additional GET (20-second deadline, 1 MiB local cap) for the already-bound release and a fixed recent start time, without tag lookups or CLI loops. Oversize/failure means unknown, not partial success or retry. A closed structured-log allowlist and redaction review are prerequisites; no raw log collection is proposed. Do not add logs automatically merely because metadata was inconclusive.

None of these evidenced endpoints directly proves the effective database target, RPC ACLs, internal budget leases, or actual BRSAPI account consumption. That requires a separately evidenced runtime/database attestation or existing trusted readback contract. No invented metrics/quota endpoint or guessed shell flag closes that gap. Existing CR@8/count32 discovery failure remains unresolved and NO_RETRY remains in effect.
