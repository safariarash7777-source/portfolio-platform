# P2-OPS-MEGA-005 — progress

## Wave 0 — LIVE_BASELINE_VERIFIED ✅
Live git, both PRs, all three blocking comments, both Supabase refs confirmed
against the live API. Capability probe recorded in `findings.md`. Nothing changed.

## Wave 1 — PR113_READY_FOR_COMMAND_CENTER_REVIEW ✅
Head `6e61f74` (was `54af488`). Draft, not merged. CI green.

- retry policy: resume-by-default, deliberate replacement only after the
  server-side stale window, via `fail_payment` + `payment.replaced` audit
- DB guard independent of the route, with `PT409` / `PT425` SQLSTATEs
- webinar amount derived from the locked webinar row; `p_expected_amount`
  compared, never stored
- `create_payment` service-role only, explicit user; all three old
  amount-taking signatures dropped and asserted gone
- route logic behind ports; `evidence_recorded` reflects the real audit insert
- 626 core / 71 calc / 237 db, MIN_PASS 222 → 237
- three reintroduced defects each proven to turn the suite red

## Wave 2 — PR114 rebuilt, PARTIAL ⚠️
Head `710b99f` (was `31a4fd2`). Draft, not merged.

Done and executed: encoding contract (BOM + ASCII-only + PS7-syntax scan),
atomic exit-code-driven restore, faithful-target assertion, dynamic full-table
row counts, deterministic bidirectional structural fingerprint, single shared
comparator, destination guard, `.gitignore` second layer, 8 count-preserving
defects detected, 17 real-Postgres tests, guard failability proven.

**Not done — capability missing, not skipped:**
- Windows PowerShell 5.1 parse + invocation — no PowerShell runtime here
- isolated Supabase-local restore — no Docker daemon here

`BACKUP_RESTORE_VERIFIED = NO`.

## Wave 3 — stop for Command Center review ← current
Neither PR merged. No SQL, migration, environment, secret or deployment change.

## Waves 4–10 — blocked
- W4 backup: needs W2 approval + merge, then the owner's machine
- W5 runtime: Vercel MCP unauthenticated in this session
- W6–W10: gated on `BACKUP_RESTORE_VERIFIED` and explicit owner authorisation

## Open owner decisions
- `D-024` / `D-2` — access level and duration per product (3/3 months is a
  provisional operational default, not approved)
- `D-026` — `webinar_retry_stale_minutes`, seeded at 60, must exceed the
  gateway's StartPay validity window
