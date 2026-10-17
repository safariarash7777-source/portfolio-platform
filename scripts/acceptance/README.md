# Controlled primary acceptance receipts

See `REPORT-member-primary.fa.md` for actual results and remaining browser gaps.
These scripts target the operational primary system. They are a receipt of a
reviewed, bounded run, not a generic production seed command. Do not rerun them
without coordinator destination, marker, sole-writer and lifecycle review.

The fixed run marker is `member-primary-20261017-01`. Only its two newly created
synthetic Auth users are eligible. Private config/state live under the ignored
`scripts/isolated-e2e/.local-primary/` directory with a private Windows ACL. Never
add that directory, credentials, sessions, raw Auth responses or raw function
definition snapshots to Git. Receipts here contain only controlled synthetic
ledger values and redacted status/contract evidence.

`member-primary.py ACTION PRIVATE_CONFIG_PATH` sends the remote helper and
ephemeral generated password through SSH stdin. The existing service/anon keys
are read only inside the server process. The public backend includes the exact
`/liara-preview` prefix; TLS verification and SSH host-key verification stay on.
The internal Auth administration address is separately allowlisted and checked
against the current running Auth container IP before each administration call.
No JWT is minted by the harness.

Actions are `preflight`, `provision`, `read`, `api-first-save`,
`api-second-version`, `media-negative`, `desk-negative` and `retire`. Provision and all later
actions require the reviewed run marker. Financial scenarios additionally use
separate approval markers. Each financial payload and idempotency token is
persisted before any network request; reuse it after an unknown response.
The only financial payload is one synthetic 3-gram unpriced position; version 2
changes only its title. B's foreign-object probes target only A's owned fixture.

The three SQL files are independent reviewed recovery artifacts. The acceptance
runner never invokes them. The A profile repair is guarded to the exact owned
UUID/email/Auth marker and an absent profile/empty ledger. Four-grant restoration
and rollback pin five installed function definitions, owners, security modes,
prior ACLs and existing table protections. Installation was performed by the
coordinator/data owner after restore rehearsal; the installation receipt is a
redacted subset of that separate operation.

This run uses native HTTP/Auth/DB, not a browser driver. SSR cookies constructed
from a real native Auth session remain in the remote HTTP process and are never
injected into a browser. All UI must use documented CUA APIs. Primary browser
login/save/fault/logout remains blocked without a documented secure credential
handoff; it must not be inferred from these API results. The earlier isolated
14-PASS evidence remains separately recorded in `scripts/isolated-e2e/`.

The final B desk authorization check passed on coordinator-attested Production
`0e49f88fd60af829ccb551cb120da96576d5613a`: anonymous401, member GET403 and
valid PUT403, with B preference rows remaining zero. Both controlled accounts
were then retired. Retirement requires all four native scenario receipts PASS,
pins each UUID to private state plus Auth marker/role, globally revokes native
sessions, bans the owned user, and verifies zero sessions/total refresh tokens/
active refresh tokens and identical full synthetic ledger. Interrupted recovery
can verify an already-banned user without another login. Already-issued JWTs can
remain valid until expiry. No real owner browser session was modified.
