# P04 read/receipt v0.1

2026-10-02. Additive handlers; existing POST holdings CAS remains unchanged. No migration or independent receipt ledger.

## Snapshot

`GET /api/portfolio/holdings?version=<optional UUID>` uses the native authenticated owner and RLS client. Success echoes `contractVersion=p04-canonical-read.v0.1`, server-derived `ownerId`, supportedAssetClasses, `accountRef=null`, `memberConfirmedAt=null`.

- No recorded version: `state=empty`, version=null, positions/debts=[];
- Recorded version, including an empty snapshot: `state=ready`, version={id,version}, full snake_case positions/debts. Money is canonical integer toman; unknown cost/valuation remains null. Ownership is applied by valuation, not to stored quantity/value.
- Authentication missing 401; auth/read outage 503; invalid version 400; inaccessible requested version 404. No partial snapshot presented as empty. More than 500 or duplicate rows fail closed. All responses are private/no-store.

## Receipt observation

`POST /api/portfolio/holdings/receipt` is SELECT-only. Body has `client_token` plus either the original full `positions` and `note`, or `expectedCanonicalContentHash` from a trusted prior canonical receipt. The latter is the existing SQL MD5 content hash, not P05 SHA preview/context digest. Native owner is derived again; successful statuses echo `contractVersion=p04-receipt-read.v0.1` and ownerId.

- Absent token: unknown. It does not prove an original in-flight write cannot commit; do not automatically retry with another token.
- Token alone: unknown with observation; token existence cannot establish content equality.
- Matching expected canonical hash, or normalized full positions plus note: accepted, reused=true, canonicalVersion={id,version}.
- Different content: 409 conflict. Read/auth failures remain errors.

Observation includes canonicalContentHash, canonicalVersion, migrationMappings=null and migrationComplete=false. P05 translates canonicalVersion to its createdVersion DTO. This proves a canonical observation only; it cannot prove operation kind, original base_version, legacy mapping/freeze, account epoch or member confirmation. Existing ledger does not store those independently. A debts-write can carry unchanged holdings: full-position equality is not proof of a holdings-write operation kind.

## Write and acceptance gates

Existing holdings POST receives full positions, base_version and stable client_token; 409 preserves draft. Never use receipt unknown as permission to repeat a write. Native session owner, verified Telegram epoch/account binding, member confirmation persistence and mappings/freeze remain open with P01/P05/P00. No new actual write has been performed. Handler mocks and static UI fixtures are not native HTTP/RLS acceptance.

The shared financialAuthentication helper distinguishes missing session from outages but may classify SDK rejection errors as outage; P01 owns explicit SDK 401/403 classification. Both remain fail-closed. Acceptance must cover native unauthenticated/rejected/expired/outage and cross-owner cases in the P00 environment.
