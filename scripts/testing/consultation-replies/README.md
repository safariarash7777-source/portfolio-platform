# Published clarification reply verification

This additive package leaves `consultation_workflow.sql` and its v1 payloads unchanged. It adds two immutable, forced-RLS tables, narrow authenticated RPC wrappers, `/api/consultation/replies`, strict TypeScript contracts, frozen retry requests and independent receipt/effect readback. Only the relationship's enabled owner advisor can publish. Correction appends a version, using CAS; it does not replace a recommendation or run AI.

## Commands

From repository root:

```sh
node node_modules/tsx/dist/cli.mjs --test scripts/testing/consultation-replies/replies.test.ts
node scripts/testing/consultation-replies/run.mjs > /path/to/replies-sql.log
node node_modules/tsx/dist/cli.mjs scripts/testing/consultation-replies/validate-fixtures.ts /path/to/replies-sql.log
```

The Docker runner uses a pinned, already-cached PG17 image, unique ownership-labeled container, no network, no host mounts, no ports, readonly root, and tmpfs data. It attests ownership before each operation and cleanup. It tests both explicit-grant and legacy-default-grant profiles.

For the existing disposable GitHub PostgreSQL service only:

```sh
node scripts/testing/consultation-replies/run.mjs --ci-local
```

`--ci-local` fails unless `GITHUB_ACTIONS=true`, `CI=true`, `PGHOST=127.0.0.1`, `PGPORT=5433`, `PGUSER=postgres`, `PGPASSWORD=postgres` (synthetic service fixture) and no indirect PG service/host configuration. It creates marked `consultation_replies_explicit` and `consultation_replies_legacy` databases and verifies their marker before access and deletion. Do not point it at an operational database.

## Required cases

- Direct table access and private helpers closed, including legacy default grants; original function definitions/ACLs unchanged.
- Exact actor, relationship, recommendation session and member question linkage; unrelated member/admin blocked.
- Explicit publication, Unicode text bounds, token binding, append-only correction and CAS.
- Concurrent competing CAS, identical-token replay, revoke, owner disable and recommendation withdrawal.
- Member published history after revoke/withdraw; no advisor access after revoke.
- Superseded, unpublished, expired, changed financial basis and returned research block new replies.
- No late write after preparation timeout; unresolved retry stays uncertain after subsequent rejection.
- Actual SQL receipts and reads pass the TypeScript validators and exact effect check.

## Acceptance boundary

SQL claims fixtures establish isolated database behavior, not native authentication or production acceptance. Coordinator must separately verify the native adapter, UI busy/dirty/unresolved gating, mobile flow and user acceptance. No installation, account change, real recommendation/reply, environment edit or deployment is performed by this package's tests. Client `saved` means a matching receipt; UI must additionally require `replyReceiptVisible` on an independently validated read.

## Integration exports

- `lib/consultation/replies.ts`: `ReplyCommand`, `ReplyRequest`, `ReplyReceipt`, `ReplyRead`, `ReplyVersion`, validators, `replyReceiptVisible`.
- `lib/consultation/repliesRequest.ts`: `createReplyAttempt`, `sendReplyAttempt`, `readReplies`.
- Reads select mandatory `relationshipId` and `sessionId`; `canReply` is a point-in-time authorization/freshness result, rechecked under shared baseline locks on every new write.
- Preserve the exact frozen attempt on uncertain outcomes. A new token is not a retry. Successful historical replay after withdrawal/supersession returns the existing receipt only; revoked or disabled access cannot replay it.
- Server drafts are not persisted. Every reply row is explicitly published; `purpose: clarification` is a workflow declaration, not a semantic guarantee that arbitrary text contains no new advice.
