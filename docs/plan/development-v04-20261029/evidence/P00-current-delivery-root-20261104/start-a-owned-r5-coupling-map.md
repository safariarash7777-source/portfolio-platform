# START-A coupling map — READ ONLY, NOT WIRED
Snapshot root HEAD: ffbb1d202b7913a6fafdcd66c557b70e9b3b8593, verified via git rev-parse. Files below read from exact Git objects; capsule members read in memory only. No commands inside these source files were executed.

| Boundary | Exact source / lines | Available now / missing coupling |
|---|---|---|
| Allocation + dispatch | run.py@ffbb:712–724,769+,899–925 | Existing single job/attempt1, reviewed workflow SHA, external allocation UUID and execution UUID5, one child with deadline. No START-A owned profile or independent expected allocation document SHA wired. |
| Private evidence | run.py:737–758 | Existing private ownership and exclusive file fsync. No directory fsync shown in private_json; no archive blob-store/bounded-reader interface or START-A lock adapter implemented. Reuse must add these guarantees, not relabel as already satisfied. |
| Profile and capsule | run.py:389–418,823–856 | Only legacy member and composition profile; exact application/capsule/driver/SQL materialization. No independent old/source DB plus empty restore target allocation in this caller. |
| Actual owned runtime | capsule assembled-auth-runtime.mjs:94,104–105,141–149 | One fresh <run>-db, internal Docker network, tmpfs PGDATA. Marker is e2e_identity.environment.run_id. Bootstrap applied before exercise; feedbackMode applies both feedback SQL files automatically at149. Thus this mode alone cannot prove old→new migration order. |
| Existing context hook | same runtime:196–210,242 | Four actor IDs are read back against actual Auth/profile rows; allocation, marker, resources and transport observation bound. The exercise callback receives sql/api/users/newSession/setWriteRelease/attestComposition/etc. This is the available continuation point. Raw runtime s.db/container IDs are not exported as a ready PythonIO binding. |
| Same Chrome/context | capsule assembled-native.mjs:54–59 | preflight creates Chrome state once, runNativeAuthProfile passes ctx to exercise(ctx,state). Insert same-context continuation BEFORE exercise returns; do not call this entry a second time. |
| Lifetime/cleanup | runtime:247–250; controller:944–950,967+ | finally stops host and deletes resources. No resume hook after return. Controller admits only db/auth/rest/ingress/rest-version names and existing labels; new backup/restore resources would fail its allowlist. Root must explicitly extend same ownership lifecycle, not bypass cleanup. |
| Actual history phase | R5 consumer stopFeedbackAndVerifyHistory; original consumer1bf lines79–122 | Shared real phase consumes same users/actors/session/action IDs/original rows, stops extended writers, refreshes sessions and reads GET/DOM. No base0 financial or consent creation here. Owned wrapper stays closed. Full original entry would create another runtime/cohort and is NOT a substitute. |

## Concrete incompatibilities root must resolve before adoption
1. R5 resource contract uses network=none, start-a-owned-<allocation>-source/copy names, portfolio.owned.* labels and current_setting(portfolio.owned_copy_marker). Existing native runtime uses an internal network, <run>-db, p03.assembled-native-lab label and a marker TABLE. These are DIFFERENT contracts. Neither source proves the other. Root must choose reviewed stage/topology binding with exact container IDs and actual marker readback; no automatic network switch, renamed evidence or weakened guard is proposed here.
2. Current lifecycle allocates ONE application DB and automatically bootstraps it. There is no old/source plus empty/third restore target or pre-feedback-migration hook. Required order: retain baseline PR314 and existing history, separately prove backup restoration on an owned baseline target, apply exact c53 once to the SAME application DB, continue same account/context with new statuses. Never restore baseline onto the post-write DB as rollback.
3. PythonIO must bind to actual IDs/namespace and durable evidence under the same allocation lock; existing generic subprocess and private_json are not that adapter. An independent root-controlled pin cannot be derived from the supplied attestation/env. SQL error normalization must preserve only approved typed SQLSTATE, not raw stderr. Applied-migration ledger is populated AFTER successful SQL transport (runtime147), but is not independent kernel/catalog readback; same-DB verification remains required.

## Minimum same-caller continuation
Within existing run.py/owned child lifecycle (not a new runner), root introduces the explicitly reviewed owned-start-a-copy purpose and allocation evidence. Before any writer, bind actual Docker IDs/image/labels/network/tmpfs, namespace marker, reader/app blob identity and existing actor IDs. Keep ctx and Chrome state alive. Run backup/restore and migration through the bounded PythonIO seam, then use the shared history phase on the SAME original rows/session/users. Record independent before/after SQL fingerprints and actual response journals. Only after all checks, allow existing owned cleanup to remove exactly its enumerated resources. No current function provides this whole sequence; source coupling and peer review are still required.

## Remaining acceptance matrix (not supplied by R5 guard tests)
- Compatible reader with old SQL: missing capability false, original history readable, new-feedback rejected before RPC.
- Apply c53: default-off + actual ACL/RLS/catalog/history checks; preserve global unrelated history, not merely selected users.
- Actual new partial/not_done rows, distinct actors/tokens, exact IDs/session/action/version/text/actor/time; no counterfeit success flags.
- Application stop while DB on =>409 FEEDBACK_DISABLED; DB stop =>403/42501; fresh GET/DOM same original rows and zero automatic POST. This stops only extended states; legacy doing/done remain permitted.
- Before/after six financial fingerprints (including member_debt_positions), exact history and schema; SQL inverse PT409 with new history or open gate. Pre-write inverse rehearsal only on separate owned branch. R5 restore roster16 does NOT establish whole DB/ACL restore acceptance.

Reader identities must stay distinct: behavioral floor a302b78b67ae1fe90d6028b8f1a0dacd9263910b; actual feedback runtime reader699ea1677c21c216be52869318cf0ac1c4525744; consumer source1bf8f86b7bcaaedcb8320e178b1589a33b88e306. Current composition app e0 is neither automatically a verified feedback runtime nor a replacement for those pins.

Owner/next action: root decides exact lifecycle/topology/IO/context coupling in the existing caller. This map grants no activation, allocation, SQL, native, network or deployment authority. No source patch/test was performed for this mapping task.

## Exact bytes read
- run.py: SHA256 79441ee80b1730eac5a96c78a3af510964d9f819749e89ce251ba7830b284a5a, 74841 bytes
- sealed-p03-composition-e0-v1.tar: SHA256 54d35e1aa4b48962e48085140af0c214547bd139870ea1b9e08e644ac5c8d255, 204800 bytes
- capsule/assembled-auth-runtime.mjs: SHA256 469d60128fad6a71fe432fbd5f674bfa032c56b9ff6a8b0e2ef7523b3b5d1ff3, 48797 bytes
- capsule/assembled-native.mjs: SHA256 288cb64b9a1c7f0769a0cd55cbbb0560005f41b9a61143cfc9a5c3eac17041e7, 7318 bytes
