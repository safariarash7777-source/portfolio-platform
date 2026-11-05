# Consultation roster F1

Additive read-only RPC `load_consultation_roster(date,date)`; route `GET /api/consultation/roster`.
The UI imports `RosterRead`, `RosterRow`, constants and `validateRosterRead` from `lib/consultation/rosterContracts.ts`.

The risk filter uses the latest assessment (180 elapsed days, explicit expiry, unknown/tie states). No questionnaire answers, contact fields, or unrelated counts are returned. Only enabled advisors with active explicit relationships can read. Revocation during the bounded read is rechecked before return; counts are reconstructed from surviving rows. An advisor disabled during the read receives 403.

Financial presence means an existing canonical version, not a complete or reliable financial file. Empty holdings/goals differ from no version. `assetValueRange: false`; amounts remain null. The endpoint rejects amount filters rather than filtering a partial subtotal as total wealth.

Run in repository root:

```
node node_modules/tsx/dist/cli.mjs --test lib/consultation/roster.test.ts
node scripts/testing/consultation-roster/run.mjs
node node_modules/tsx/dist/cli.mjs --test scripts/testing/consultation-roster/fixture.test.ts
```

SQL harness uses cached PG17, a random ownership label, no network/ports/host mounts and only disposable tmpfs. It attests ownership before cleanup. `--ci-local` requires the existing explicit GitHub Actions loopback service on port5433, synthetic postgres credential, and independently marked random databases. Fixtures contain only synthetic data. It tests both explicit ACL and legacy default-privilege profiles. These checks do not prove native Auth, UI integration, installation or production acceptance.

Migration is **not installed by application or tests** outside the disposable database. Install only after integration review, backed-up deployment procedure and native two-account acceptance. Rollback of this additive reader is `DROP FUNCTION public.load_consultation_roster(date,date)` after reverting route/UI consumers; canonical records and baseline workflow are unchanged. Do not replay the baseline migration.
