# START-B — durable workbook-save recovery contract

Owner: existing START-B executor (`01a17cdc…/local`); integration and operational decisions: existing coordinator (`01a187f6…/local`). This is a scoped technical specification, not a parallel project-status ledger. The coordinator owns shared direction/status documents.

## Problem and audience

The administrator's unknown workbook save currently retains its exact body/ID/target version only in React memory. Closing the page loses that correlation and potentially the private draft. Existing persisted workbook versions already survive reload, but a historical agent draft, a workbook version, an internal review and a publication are different records.

## Coordinator-reconciled storage and privacy decision

Use an immutable, actor-owned write-ahead save intent in the existing native PostgreSQL destination, with the same authenticated-user transport and independent RLS model as workbook storage. It is a recovery record, not another financial/version store. `consultation_command_receipts` supplies an actor/token pattern, but its consultation-owned table is not reused for unrelated private research bodies.

Do not persist private bodies or credentials in localStorage, sessionStorage, IndexedDB, URLs, logs or test artifacts. A non-extractable browser key stored beside its ciphertext would still be usable by another same-origin principal and is not an actor confidentiality boundary. No new provider, model, encryption secret or credential setup is needed for the proposed native journal. Database/operator/backup confidentiality is the same trust boundary as existing private workbook versions; this is not a claim of end-to-end encryption.

The new candidate table is `research_workbook_save_intents`: globally unique fixed request UUID, exact original save-request text, SHA-256 of that exact text, workbook UUID, base/target version, trusted author and creation time. Global UUID uniqueness prevents another actor re-scoping an already prepared token. The app validates the existing workbook body contract and size limit before journalling; server/native guards derive identity and hash from the authenticated session/body, not caller metadata. Only the same currently authorized admin actor can read/prepare/replay that actor's intent. Another admin, a member and anon are denied. No automatic purge, edit, approval, publication or model execution is part of recovery.

The coordinator reconciled this contract for code, candidate SQL and isolated native/CI tests in the existing chat. Candidate SQL is not permission to apply it on the primary destination. Native isolated rehearsal/CI is separate from Production installation, backup/restore acceptance and the existing writer freeze. The candidate SQL never re-grants INSERT on workbook versions or reviews, including on rerun.

The database trust boundary follows [PostgreSQL RLS through Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security): table grants and row policies are separate controls. Native tests exercise both existing privilege profiles, including another admin. They do not claim a real Auth-provider session or Production acceptance.

## HTTP and compatibility

The existing `/api/admin/intelligence/workbooks` endpoint is retained. `POST action=prepare_save` receives `{intentId, requestBody}`. `GET ?intent=…` returns the authorized actor's exact prepared request; `GET ?intents=1&offset=…` returns metadata only, in bounded pages of 50. Normal listing includes `durableRecoveryAvailable`, metadata for the first page and `intentNextOffset`. A new page rediscovers the latest own intent unless an explicit workbook or a newer local edit already takes precedence.

The actual save still sends the original save body, without rewriting its JSON or token/base, and identifies its prepare via `x-workbook-save-intent`. Legacy clients without this header keep their existing versioned-store contract. New clients refuse a new save when the upgraded server explicitly reports the durable destination unavailable. An older server that has not advertised the capability retains its older page-local behavior; that is compatibility, not durable-recovery acceptance. Merely reading the journal does not prove INSERT is enabled: failed/unconfirmed prepare never permits the workbook POST.

The operation journal is append-only, not a mutable status queue. Original versions/reviews remain authoritative, and recovery independently reads the intended version every time. A mismatched concurrent version stays held; neither a new base nor replacement content is guessed. Successful journal and workbook records remain after an expired session, but a fresh authorized session is required to resume. No private body, key or token is written to persistent browser storage. Subsequent unsaved edits that have not themselves reached a confirmed prepare are not falsely promised durable.

## Required flow

1. Construct one exact save request using existing workbook ID, stable initial creation ID when applicable, base version and body. Assign a fixed intent UUID before prepare.
2. Prepare that immutable body on the server, then GET and compare the same intent. Only a confirmed durable prepare permits the actual workbook POST. A lost prepare response never permits a workbook POST. A subsequent fresh-session list/read can rediscover any prepare that committed.
3. The actual save is bound to that prepared intent and its authenticated author. It retains the original body, creation token, workbook ID and base version. Existing append-only uniqueness and idempotency remain the authority for versions.
4. Reopen under a valid authorized session; rediscover/read the actor-owned intent from the server, restore its draft, then independently GET the intended workbook ID/target version. Recovery itself never POSTs, approves or publishes.
5. Exact content, actor, IDs, version metadata and server time must match before confirming a committed result. Mismatch, session error, storage error or a concurrent incompatible version keeps the result unresolved and the durable copy intact.
6. Only explicit, same-intent/version absence followed by a separate deliberate retry can resend the original body. A stale absence proof or later concurrent commit must not create a duplicate.

A draft closed before a durable prepare exists cannot honestly be promised recovered from that server. In that case the application must not send or claim a workbook save. Pre-confirmation loss, prepared-but-uncommitted save, committed save and lost readback are distinct outcomes. This limit is surfaced, rather than inventing success or silently storing plaintext on a shared browser.

## Files and tasks

- `lib/intelligence/workbook-store.ts`: keep existing version/readback/authorization logic; bind actual save to the authorized actor.
- New scoped intent service/types alongside that store; extend the current workbooks HTTP handler instead of inventing an unrelated workflow.
- `components/admin/ResearchWorkbook.tsx`: durable preparation before POST, reopen/readback recovery and draft preservation; retain mobile sizing and review gates.
- Existing unit/component/route/native integration tests: actual handlers and stores with disconnected/remounted UI; no source-text assertions as substitutes for behavior.
- `intent-store.candidate.sql` and private-writer freeze compatibility: isolated native rehearsal only until separately authorized installation.
- `.github/workflows/research-workbook-native.yml`: PostgreSQL 17 on the existing GitHub runner, pinned to the tested PR head; upload a sanitized receipt, with no private body or credentials. The existing `test:db` script also explicitly registers the intent cases for regression coverage on its existing PostgreSQL version.
- Existing temporary PR333 remains a synthetic visual aid and is never merged into product. It cannot be used as native durability evidence.

## Completion evidence

Native persisted v1 → close/reopen/read → v2 while v1 remains; response cut after commit → destroy page/client instance → new authorized instance → discover same intent → GET exact version, with no automatic POST or duplicate/model call. Test prepare-response loss, no-effect absence, late concurrent commit, actor switch (including another admin), expired/unavailable session, corrupt/mismatched content and unavailable/frozen storage. Verify private body is absent from browser persistent storage and sanitized artifacts. Approval for v1 never becomes approval for v2.

Deliver exact product SHA, existing PR, reproducible isolated native/CI destination and sanitized receipts; online preview is supplementary. Production readiness/installation, actual Production behavior and Arash acceptance remain separately evidenced gates.
