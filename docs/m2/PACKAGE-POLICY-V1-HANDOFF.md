# M2 package policy v1 — proposal candidate

Authority is the coordinator's `M2-PACKAGE-POLICY-20261017` decision in the canonical Decision Log (c4e3 / PR254 43c7508), following Arash's explicit delegation. This technical handoff does not create another decision or status ledger. Base PR237 source: `6df58979cd5188e4b5eaaacd4adabc83cdec7176`. No main merge, deployment, production write, backup or restore was performed.

## Installed snapshot

`installed-snapshot-20261017.json` contains only catalog metadata, function-definition MD5 fingerprints and aggregate counts. It was obtained from the attested primary `portfolio-stage-db-1/postgres`, PostgreSQL17.6, in `BEGIN READ ONLY`, 10s statement timeout, 1s lock timeout, ending in ROLLBACK. No row identifiers, amounts, authorities, session links, tokens or private user values were selected.

At that instant webinars=0, registrations=0, payments=0 and entitlements=0; M2 attempt table and access/settlement RPCs were absent. There is no data reconciliation workload in those four tables in this snapshot. This does not authorize skipping the fresh nonempty-registration gate at installation time.

The snapshot found effective TRUNCATE rights for anon/authenticated on the two webinar tables, despite RLS. The proposal revokes TRUNCATE from PUBLIC/anon/authenticated/service_role only on these exact tables. It checks effective inherited rights afterward and aborts atomically if an unknown inherited grant remains; no unrelated role/grant is guessed or removed.

## Implementation

- Each webinar remains independent; account/global entitlements are unchanged. Confirmation time is stored per registration and gates access. Existing session URL is the only resource currently served; no archive, recording, Q&A file or subscription is fabricated.
- Empty access inputs may use an explicit event end plus exactly 2160 elapsed hours (90 days, not calendar months). Without an event end, the manager must provide an explicit valid access window. Defaults apply only to new rows. Capacity, event schedule, price and access window cannot change after first registration.
- A server-created paid registration holds a seat for 15 minutes using the database clock. Expired holds stop occupying capacity without a scheduler. A register replay never extends its hold; an expired unstarted hold never creates a new financial request automatically. Existing requesting/unknown/ready attempts are not reset or replaced.
- Registration and settlement serialize on the webinar row. A verified late payment takes a seat only if available under that lock. Otherwise the canonical ledger remains paid, but registration has `fulfillment_state=paid_pending_resolution`, `resolution_kind=refund_due`, no confirmation and no access. Exact replay never grants a subsequently freed seat or writes another settlement. No refund or external financial action is executed.
- Public registered count includes confirmed registrations only. Callback and register replay display the unresolved payment explicitly, never as successful registration. The existing negative owner/webinar/binding checks remain.

## Proposal packaging and verification

`build-package-policy-proposal.mjs` reads the frozen base and generates the v1 extension and `proposed-install-package-v1.sql`. The latter is the install candidate: one BEGIN/COMMIT around base preflight, M2 DDL, policy and ACL hardening. The separate base and extension are review inputs, not a recommended two-step live rollout with a gap between commits. No versioned production migration is registered here.

Verified: 194 route/UI/contract tests, 12 PostgreSQL v1 scenarios (13 TAP including parent), full TypeScript noEmit, targeted ESLint on five changed application files, and diff check. The unchanged base SQL's 16 static contract checks also passed. PostgreSQL tests used a cached17.11 image, network none, no host mounts/ports, bounded memory/CPU and synthetic fixtures; exact owned container cleanup was verified. No new restore was created.

The forced-error test rolls back the entire combined install, restoring base columns, RPC body, original policies and original ACLs. Other cases cover legacy rejection before v1 DDL, TRUNCATE denial, exact duration, reservation expiry/replay, occupied/free late payment, one seat under two concurrent late settlements, immutable policy and no global entitlement. Fixture-only initial failures were corrected: a source profile did not reproduce installed TRUNCATE grants, and member role is named `user`, not `member`; neither failed attempt is counted as acceptance.

## Remaining release work

This is a proposal candidate, not a deployed feature. Full Next build and real browser acceptance are not claimed. Before live installation: independent review, current-main integration, regeneration/hash verification, the fresh legacy/schema/ACL gate, coordinated callback/app drain, and use of the coordinator's existing17.6 restore for exact-runtime install/rollback acceptance. Do not start a second restore. The live read did not mutate prior rights; no old-rights transformation is included.

The demonstrated rollback is a precommit failure rollback. A postcommit operational rollback must first stop new registration/payment starts and drain callbacks, preserve every paid/refund_due fact and attempt, and choose a compatible application/schema freeze. Blindly restoring the old public URL/INSERT policies or TRUNCATE grants is not an accepted rollback. Resolution/refund operations and additional resource/archive delivery remain separate guarded work; the current candidate only records and exposes the unresolved outcome honestly.
