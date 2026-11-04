# Optional assembled native dispatch

This controller connects the reviewed v4b app-f07 capsule to the existing GitHub Actions
Linux runner. It never runs on a PR, ordinary push or default manual dispatch.
The existing five ordinary CI jobs retain their full original content and gate.

The coordinator reviews this branch before pushing or dispatching. To dispatch
`ci.yml` at that exact reviewed branch commit, supply:

| Input | Value |
| --- | --- |
| `assembled_native` | `true` |
| `allocation_id` | Fresh coordinator allocation UUID |
| `reviewed_helper_sha` | Full reviewed commit containing this workflow/controller |

The controller requires the real `workflow_dispatch` event, exact repository,
job, Linux runner, reviewed head, run ID and attempt **1**. It binds a separate
execution UUID to allocation + run ID + attempt + reviewed head. A private
exclusive intent is written before launch. Reruns and repeated execute calls
cannot launch another native attempt. A failed/unknown result needs review;
another dispatch is never an automatic recovery of that result. Each newly
authorized dispatch uses a fresh allocation UUID.

Two checkouts keep the workflow/controller separate from product source. The
app/SQL checkout must be exact commit
`f07e0543c46cea88822dc0d400080b5bb94bef91`, tree
`8e43eab0bd66705b5455713ea15dd5c1d9c5f81a`. The sealed capsule SHA256 is
`04899c1754525365daad2fbe2b11bd9c7c1c3a417d751bd36151332aaca7d2f4`
(`sealed-v4b-app-f07.tar`);
its detached eight-helper contract is
`0103a765d4862c27a22089414c6a59bcb555dac3f36913ddf48b373e751ecb2a`.
The frozen v3 capsule and its historical tests remain at SHA256
`57d35ddc07e2883bb2dd5b0a7e051625a235c1294e3c5283e06ecec4438ccd81`,
with detached contract `94e50f1ede5cb926e8daf7a677e1e5b84de72540df25edec6b97dec0865bc511`.
The v4b child changes source bindings and one candidate-SHA literal in the auth
helper; the other five runtime helpers and all stage/POST/cleanup behavior remain
byte-exact. Its 26 source entries plus one additional SQL pin preserve 27
fingerprints and eighteen SQL files. Prior failed runs remain historical evidence.
The parent `sealed-v2.tar` remains preserved with SHA256
`f5020a6afebcc685b2e713a7f895646f2a5718ee04b72c846edccec41adb86fc`.
The capsule and original materializer are verified before copying new helpers.
The tracked app, SQL, package/lock, old profiles and protected pins stay exact.
The existing dependency lock is installed with the same `npm ci` as prior CI;
no package, runtime, Chrome, provider or infrastructure upgrade is introduced.

Preparation requires the existing pinned Chrome binary and local Docker socket
before any native account/fixture operation. The native child receives a small
environment allowlist, localhost Supabase settings from the sealed lifecycle,
an empty Docker client credential store and the fixed local socket. Inherited
GitHub/provider/API/SSH credentials are excluded. Neither checkout persists Git
credentials. Images and the owned GoTrue/PostgREST/tmpfs lifecycle remain sealed.
The app makes no general network-egress claim.

The optional dispatch has a unique workflow concurrency group and disables
automatic cancellation for that run. Ordinary CI keeps its previous per-ref
cancellation behavior. Native work starts only after ordinary CI succeeds.

The native driver runs once with private stdout/stderr. Its existing browser
validator is reused. Acceptance requires fourteen distinct checks, exact source
and allocation, eighteen applied SQL hashes, two financial POST intents and one
consent POST intent with distinct tokens, successful browser cleanup and an
independent zero-resource Docker/browser readback. Unknown transport outcomes
stop without replay. On failure/timeout, cleanup may remove only resources with
the exact run marker, expected names and inspected IDs; browser fallback uses
the original sealed ownership/closure/process cleanup. Fallback cleanup cannot
turn a failed native attempt into acceptance.

Only `assembled-native-artifact/receipt.json` is uploaded for seven days. It is
constructed from fixed fields and check names. Private logs, state, passwords,
sessions, tokens, intent bodies, host paths, browser capabilities and headers are
not artifact paths. Failure receipts retain explicit failure/unknown and cleanup
status. If allocation/environment validation fails before private state exists,
the job fails and no accepted artifact can be produced.

The v3 child adds only fixed `stage`/`edge` markers around existing REST and
browser awaits. It never logs the operation's arguments, result or error.
Failure projection exposes the last observed stage and whether it began or
completed; malformed, unknown or out-of-order stage records remain unverified.
An incomplete `before` marker does not prove the underlying failure cause.
These markers are not acceptance checks, do not alter timeouts and cannot turn
a failure into a pass. The browser failure code `playwright_timeout` can also
classify a fetch `TimeoutError`; the stage separates those operations.

Successful status is only `PASS_BOUNDED_ASSEMBLED_NATIVE`, with
`fullAssembledAcceptance=NOT_ESTABLISHED` and `arashAcceptance=UNOBSERVED`.
Published versioned summary and unknown-write UI recovery in this composition
remain separate gaps. No recommendation is published or economic right granted.
Production/primary installation is outside this job. Runner billing is unknown;
no new paid infrastructure, external financial-data or model request is added.

Offline verification (no Docker/Auth/native execution):

```sh
python3 scripts/testing/assembled-native-ci/test_run.py -v
```

The Python tests include the 25 Node receipt tests using the actual sealed browser
validator. Synthetic records stay within those offline tests and never become a
native receipt. The optional CI job runs these checks before preparing a fixture.


## Explicit P03 composition profile

The default f07/v4b profile and its historical receipts stay unchanged. The
`p03-composition-e0-v1` profile requires all four exact inputs: acceptance_profile,
candidate_sha=e0b930927563d7f9f6d79e848917c4ba0d77ed6f, capsule_sha256 and
driver_sha256 from COMPOSITION_SPEC. It reuses this controller and owned cleanup;
it does not install the primary database or connect real service entitlement.

Ordinary PR CI runs the existing Python source/mock suite plus pinned Node guard
probes and 31 pure contract/transport tests without native execution. Explicit
allocated native execution remains separately gated. Proposed runtime scope is
13 native/11 browser checks and 19 SQL files; actual counts remain unobserved
until a fresh authorized run and independent journal/database/cleanup readback.
P09 workbook unknown-save is NOT_COVERED on the frozen e0 application.
