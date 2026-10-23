# PF2b candidate — isolated cash-flow persistence

This is a candidate migration, **NOT installed on the operational/Production database**. It adds two cash-only tables plus a restricted wrapper/private validation kernel. Assets, debts, portfolio targets, Auth, existing ACL and shared clients stay outside this package.

Run the existing owned-Docker pattern:

```sh
node scripts/testing/cash-flow/run.mjs
```

It requires the already-cached, exact PG17 image named in the runner. It never pulls/builds an image, publishes a port, joins an external network, mounts host files or persists DB data. Every SQL operation and cleanup attest the owner label/image/mount/network identity. Only synthetic local roles/users are used. This proves PostgreSQL authorization and persistence, **not native Auth/JWT/PostgREST or browser acceptance**.

`--ci-local` is wired into `test:db` for the existing disposable GitHub CI PostgreSQL service. It requires explicit CI/GitHub flags and the exact loopback service/test identity; there is no default remote destination. It creates only `cash_flow_explicit` and `cash_flow_legacy`, refuses a pre-existing DB, tags successful creations with a random ownership comment, checks that comment before operations/cleanup, and drops only its owned fixtures. Credential values are never included in assertion errors. Docker is not used in this mode.

## Contract

- `record_member_cash_flow(jsonb,text,integer)` derives the owner from `auth.uid()`. No body owner or arbitrary account registry reference is accepted. Account definitions belong to the same snapshot owner; this is bookkeeping ownership, not bank verification or a new asset model.
- Version series is owner + inclusive date-only period. Token uniqueness is owner-wide. Normalized payload **and base version** are hashed; exact replay returns the same version before CAS, changed token content conflicts. Separate token/period transaction locks cover concurrent replay and stale-base writes.
- Coverage is planned/actual independently, with explicit `memberAffirmed:true` and source required for complete. Unknown values remain null; a complete lane cannot contain unknown amount/day/source. No auto-complete or debt/payment inference.
- Limits: 50 account definitions,160-character labels,366 inclusive days,500 events,2000-character notes,1,000,000 bytes of JSONB payload. The future HTTP adapter must enforce the raw body byte limit too; parsing whitespace/HTTP ingress is not covered by a JSONB SQL argument.
- Events reference definitions of the same owner/version, and known dates must lie inside that snapshot's period. One transfer is one record. Opening stock may be negative/unknown and is never income. Overlapping period reports are separate and must not be added together.
- App mutation/read adapters are **not implemented here**. Existing holdings/debts save helpers have a different receipt contract and cannot be passed cash-flow data directly.

## Evidence and release gate

On 2026-10-20, the candidate SQL SHA256 `d02837f317acacff3cf2bd602430149382019266265bef8fb7ec79ffa7de144d` passed **36 isolated DB checks** (18 each on explicit grants and legacy permissive defaults). Cases cover save/independent read/v2/history, replay, canonical order, changed body/base/period, A/B/anon and direct write denial, complete/partial/null/source/limits, one-row transfers, atomic rollback after header insertion, overlapping concurrent sessions, cross-period token races, accepted limit boundaries and exact schema/function/ACL inventory after lab rollback. Container cleanup passed. The cached local server was PG17.11; operational inventory was PG17.6. No exact-minor compatibility or live installation claim is made.

The receipt distinguishes the 36-check owned-Docker run from the later CI-local transport addition: the non-CI refusal guard and syntax/lint are checked locally; positive CI-local execution is pending candidate PR CI. Unchanged SQL is not retested against live data.

`rollback.sql` is **lab-only** and refuses absent marker/wrong database/object identity. It is not a Production rollback runbook. Before any installation: coordinator review of this candidate/receipt, current schema/ACL preflight, backup/restore and production-specific rollback, then separately authorized installation and app/browser acceptance. No migration or ACL change on the primary is authorized by this README.
