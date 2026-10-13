# Relay reconciliation — 2026-10-13

Read-only observations at 16:23–16:24 UTC. No provider requests, refresh calls,
backfills, configuration writes, deployments, quota resets or agents were started.

## Runtime and configuration

- Liara API reports `arsadata`: ACTIVE, node, scale **1**, zeroDowntime **false**.
- Current release is **v49**, ID `6abd1ec2f9f9fa3c1e852cb3`, READY, created
  2026-09-30T14:37:54.158Z, image suffix **tivpcjnirm03**.
- A newer **v50**, ID `6acb67a5c60e0718e2c58e25`, created
  2026-10-11T10:40:37.578Z, is FAILED and is **not** the active release.
  The release detail response did not expose a failure reason. It is not evidence
  that main was installed, nor does its state establish why the attempt failed.
- Liara release metadata has no git commit for v49. A separate read-only remote
  hash probe in `/app` found the four files below byte-identical to both
  `e741c208d075c6e976d5cd1b4532d4c7b36159f6` and `025f623`.
  This is a match of the named files, not a claim that every deployed file was hashed.

| File | Runtime SHA256 |
| --- | --- |
| server.mjs | c7aec2b834d13f288c2f83db529000d2e2c54ee145638a0a07f0900433486570 |
| commodity.mjs | 5ff8cef1ea3cec0fd7a781d7490e3ed7feb3dc7330ae2ceee26206cd5124d7f9 |
| options.mjs | 894858532a317d2dc2267793a28813b233a52e4a1689dbe024245d0ce6519db2 |
| package.json | 165301461fdfc895571541de575aba6db6bd5c5080e6b01d50959f51818b3558 |

`market-retention.mjs` is absent from the running `/app`. `/debug` lacks the
`snapshotQuality` key entirely. Current main has the retention/source-clock
implementation and different server/options hashes. The missing runtime code is
a concrete deployment discrepancy upstream of the website's stored-data reader.
It does not establish whether every provider record includes a source clock.

Current environment names, read from the existing Liara account without printing
values: PORT, NODE_ENV, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRSAPI_KEY,
RELAY_TOKEN, CODAL_ENABLED, CODAL_PER_CYCLE, CODAL_SYMBOLS.

`BRSAPI_COMMODITY_KEY` is absent. Debug confirms enabled=false, rows=0,
lastFetchAt=null, reqToday=0 and the explicit disabled/missing-key message.
The commodity feed uses a separate key under the existing contract; the main
market key must not be substituted. No new key was requested or installed.

Both optional quota flags are absent. Debug says client.enabled=false,
legacy.enforced=false and the budget store is unhealthy: its lease RPC returns
404/PGRST202 because `brsapi_budget_lease` is unavailable. Cumulative legacy
producer counters are **not** an authoritative provider daily balance. The
persisted `used=0` field cannot be interpreted as no upstream requests.

## Bounded correction

`mapCommodityRow` used JavaScript coercion that turned null, blank strings,
booleans and arrays into invented prices/percentage changes. The mapper now
accepts only finite numbers and nonblank numeric strings. Missing/invalid inputs
remain null; legitimate zero and signed changes stay intact, in source units.
Existing filtering consequently excludes missing prices instead of admitting zero.

The commodity module is byte-identical between current main and the sampled v49
file. This three-line guard can be selected into a release based on the existing
runtime without importing main's unrelated changes. It adds no dependencies,
network calls, configuration or collection schedule. It remains an offline code
correction until a release is deliberately installed, and the live commodity
feed remains disabled until its separate credential/configuration is available.

Validation: commodity/IME/shared-transport tests 13 passed; BrsApi coverage 5
passed. Tests use synthetic values and no live provider requests. Full release
CI/build and operational acceptance belong to the integrating release.

## Release closure still required

1. Preserve current release/image, environment securely, cache and blacklist;
   preserve an executable rollback using the actual v49 image. This runtime has
   zero-downtime disabled, so a replacement may interrupt service.
2. Confirm publishing ownership (direct repository deployment versus workflow)
   and inventory any external consumers of the same key. scale=1 proves only
   this Liara application's replica count.
3. Resolve the quota RPC/install state and official provider quota/reset baseline
   before enabling enforcement or adding any producer. Do not turn on a flag
   while its required RPC is missing; do not assume counters reconstruct history.
4. Review the chosen release delta against v49, with source-clock retention tests,
   cached/passive read behavior, and CI for that exact SHA. Deploying arbitrary
   current main would include more than a clock propagation fix.
5. After approved installation prerequisites are satisfied, inspect two natural
   existing collection cycles: per-family receipt/source timestamps, retained/error
   states, DB payload and actual cards. Do not call refresh to force acceptance.

API paths/authentication and the read-only shell protocol were taken from the
official pinned CLI source, not guessed:
[base](https://github.com/liara-cloud/cli/blob/v9.5.1/src/base.ts),
[constants](https://github.com/liara-cloud/cli/blob/v9.5.1/src/constants.ts),
[environment listing](https://github.com/liara-cloud/cli/blob/v9.5.1/src/commands/env/list.ts),
[release listing](https://github.com/liara-cloud/cli/blob/v9.5.1/src/commands/app/logs.ts),
[shell](https://github.com/liara-cloud/cli/blob/v9.5.1/src/commands/app/shell.ts).
