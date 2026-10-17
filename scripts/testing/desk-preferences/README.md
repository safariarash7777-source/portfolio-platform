# Desk preferences verification

The real workspace reads the existing Iran market snapshot/market-desk engine, `index_history`, Codal announcement metadata and stored research drafts. All three layouts share this read model. The previous intelligence workflow remains at `/admin/desk?classic=1`.

## Reproduction

From the repository root with installed dependencies:

```sh
npx tsx --test app/api/admin/desk/preferences/route.test.ts components/admin/useDeskAccountPreferences.test.ts lib/desk/preference-requests.test.ts lib/desk/preferences.test.ts lib/desk/workspace-read.test.ts lib/desk/registry.test.ts
node scripts/testing/desk-preferences/run.mjs
```

The first command is also registered in `test:core`. The second requires the exact cached PostgreSQL image identified in `run.mjs`; it does not download an image. It creates an owned, disposable synthetic database with no network, published ports, or persistent mounts, attests those properties before mutations, and removes its container afterward. It never reads deployment credentials.

## Recorded results, 2026-10-17

- PostgreSQL: 27 scenarios passed. Admin ownership/isolation, member/anonymous/service-role denial, forged actor/role arguments, broad ambient grants revoked, direct table/sequence writes denied, append-only history, reset as a new version, invalid input, concurrent same-revision writers and demotion.
- Preference parser: 6 tests passed.
- Source failures: 5 tests passed, including synchronous unexpected exceptions in each reader and all readers failing together. Data failures never become authorization failures.
- Request ordering: 3 guard tests and 3 executions of the actual hook passed. Deferred GET excludes PUT; PUT excludes reload/duplicate PUT; a superseded GET cannot overwrite a newer receipt even if fetch ignores abort; unknown save results preserve draft; decreasing revisions are rejected.
- Actual GET/PUT route: 4 tests passed using injected synthetic session/RPC transport. Missing session/member denial happens before RPC; auth and role lookup outages are distinct; forged fields and cross-origin requests are denied; private responses are no-store; CAS, permission denial and malformed receipts fail explicitly.
- Existing market/index engine: 60 tests passed; existing desk/workflow/style guards: 36 passed. Financial formulas were not changed.
- Initial CI run `39056795817` failed only the orphan-test registry: the three new `lib/desk` test files were not registered in package scripts. Added the new hook, route and lib tests to the existing `test:core`; the registry and affected tests passed locally. The full combined CI is required after merging current main.

SQL candidate: `sql/admin_desk_account_preferences_20261017.sql`, SHA256 of LF bytes `fa55c4cb410a42a9945340703a4b5d65a8ddafdeb46611dd0fb0b4138d4b3e5e`. It is a reviewed candidate, not proof of installation. Root coordinator owns installation, integration and publication.

## Limits

Synthetic session tests do not verify live JWT/PostgREST. The local visual harness, outside the product repository, uses public data from the site's API and public `/market` page; its preference transport is explicitly labeled temporary. It does not prove real account persistence, logout/login, private research acceptance, or production availability.

Live acceptance still requires the coordinator's authenticated Preview and main-domain checks: three layouts, allowed tool visibility, valid save/reset receipts, logout/login persistence, member denial, mobile/desktop and source failure isolation. No real account was signed out or modified by the local harness. No production SQL was executed by this branch's implementer.
