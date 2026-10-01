# Coordinator integration note — NEXT09

Dedicated outputs are mirrored into the coordinator checkout only under `docs/ops/seasonal-program/next09` and `NEXT-09-RESULT.md`. Shared README/Command Center/Decision Log are not edited by this task.

Suggested index entry for the coordinator: NEXT09 isolated implementation delivered as Draft platform #189 (stacked on Auth180) and miniapp #5; local 58 DB/HTTP/transport/lead, 1239 core and 68 miniapp tests pass. Shared contract notifications.v1, actual component fixture UI and CI evidence attached. Acceptance remains open for real shared Auth, experimental bot/channel rights, target schema and consultation cutover. No merge, target migration, real messages or Production deployment authorized/performed.

Coordination: consume existing NEXT04 entitlement ledger/NEXT08 published events. Service recipient adapter is private and mirrors their predicates; changes to their public contracts need owner coordination. This task does not own Auth/middleware/globals/Navbar/fonts, components/member, publication server/feed/read-state or upstream migrations. Default send disabled, explicit POST worker `/api/notifications/worker`, no new schedule. See shared README for grant cutover and non-destructive application rollback.

Do not mark NEXT09 operationally accepted solely because Draft CI/Preview are green. Final exact-head snapshot is `FINAL-PR-CHECKPOINT.json` in this coordinator output folder. Initial CI failure and resolved causes are retained in PR-CHECKPOINT.json rather than hidden.
