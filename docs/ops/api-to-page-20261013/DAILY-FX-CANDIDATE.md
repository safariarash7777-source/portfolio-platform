# Daily FX integration candidate — 2026-10-13

Based on `f44d975668e59fcf7cfbc2270199cb8cc5e2d09e`. Selected only daily-fx.mjs,
daily-fx.test.mjs, server.mjs and market-retention-server.test.mjs from the verified
offline `b2-fx-ime-v3.patch`, SHA256
`23cb092cac651b62ab1d67d91969f3c3e35f2ae3a85fde6082f78fc91320b630`.
No IME, Codal, package hook, database or runtime changes in this candidate.

## Behavior

- Existing per-family retention/source clocks stay intact. Daily writes receive
  `result.fresh`, so retained rows cannot masquerade as new observations.
- Currency mapping preserves raw `sourceUnit`. Only explicit raw Persian toman
  paired with the existing normalized toman label qualifies for daily FX.
  No rial conversion or unit assumption is added; unverified units block writing.
- Daily FX requires a positive finite USD number and a valid Jalali source date
  and source time, after the configured close, on the current Tehran date, not
  in the future. Receipt time cannot relabel a previous source date as today.
- Existing `equityNumber` also validates the currency mapper's raw price, closing
  a bypass in the supplied patch: boolean true and numeric arrays previously
  became positive numbers before the daily writer could reject them.
- A conflict response (409) is complete only after exact DB readback of a single
  row's date, numeric rate and source. Different existing values are not altered;
  failure remains visible and retryable. HTTP failures, malformed readback and
  thrown transport errors cannot set the completed daily date.
- This does not correct historical FX rows, activate a producer or prove current
  provider units. Installing it may correctly expose missing-unit/source-clock
  problems instead of continuing to append unsupported observations.

## Validation and limitation

Six daily-FX tests and 26 actual-server/retention tests passed. Additional cases
cover invalid minutes/seconds, invalid Persian leap-day, raw booleans/arrays,
failed writes and malformed conflict readback. Server tests use synthetic sources,
block unexpected hosts and check that old/unknown/invalid USD does not write.

The separately attempted strict `b2-offline-guard.mjs` run FAILED before tests:
daily-fx imports eod, which imports codal and then brsapi-transport, whose module
initialization reads `BRSAPI_BASE`. The guard forbids even reading an absent
sensitive environment name. Its counters were network=0, childProcess=0,
sensitiveEnvironment=1, privateFile=0. The guard was not weakened. Normal isolated
tests above passed; they are not claimed as a pass of this stricter harness.

Parent integration added `node --test relay/daily-fx.test.mjs` to test:relay.
Combined code head `6eaf64f` passed full CI run 38459139150. The existing
retention-server hook covers that file. This is candidate CI, not relay release.

## Additional read-only runtime evidence

The documented official CLI [build-log reader](https://github.com/liara-cloud/cli/blob/v9.5.1/src/services/build-logs.ts)
permitted inspection of v50's retained build output. HTTP 200 returned nine lines;
its STDERR reports source archive extraction failed and asks to check filenames
for special characters. This establishes an extraction failure, not the exact
filename or archive defect. No app-build success or newer runtime is inferred.

Current release still v49 (`6abd1ec2f9f9fa3c1e852cb3`). v50's recorded client was
`@liara/cli/9.5.1 linux-x64 node-v22.23.3`, with no git commit/remote metadata.
That identifies the client used for this attempt, not the active publishing owner.
The read-only app configuration has no repository-link field. Subsequent parent
inspection of authenticated GitHub settings found no repository/environment
variables: RELAY_AUTO_DEPLOY is unset, disabling the workflow's automatic path.
Liara's deployment page displayed a repository picker but did not prove a direct
auto-deploy binding. Competing publisher ownership remains unverified. No settings
were changed and no undocumented endpoints were guessed.

Commodity credential availability was checked by NAME only in the current Liara
configuration and three known migration environment files: `liara-stage.env`,
`current-liara-config/liara-stage.env`, `vercel-server-role.private.env`.
None exposes a BRSAPI_COMMODITY_KEY name. The original checkout has only example
environment files. This is a bounded negative check, not a claim that the owner
has no commodity subscription or that no credential exists anywhere.

The repository's BRSAPI-CLIENT-DESIGN reset section explicitly calls midnight
Tehran an assumption and requires provider confirmation; no response confirming
reset or an official current quota balance was found in these referenced docs.
The cited D-026 question file primarily concerns fund-composition feeds, so its
existence alone is not evidence the reset question was asked or answered.
No provider request was made to discover quota information.

## Non-code closure

Publishing ownership, exact selected release artifact and archive extraction,
secure active config/cache/rollback preservation, missing quota RPC plus official
quota/reset baseline, and separate commodity credential provisioning remain.
The active single replica does not establish absence of outside key consumers.
Neither this candidate nor a successful web release closes these runtime items.
