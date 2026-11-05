import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseTicketServiceRight, type TicketServiceRightDiagnostic } from "./ticketServiceRightDiagnostic";
import { type LegacyConsultingAccessRow } from "./tickets";
import { createTicketIntent, recoverTicketIntent } from "./ticketIntent";
import { prepareTicketStorageAttempt } from "./ticketStorageRequest";
import { validateTicketStorageEnvelope } from "./ticketStorageContracts";
import { parent, opening, receipt, history, lookup, M, O, uid } from "../../scripts/testing/consultation-tickets/unit-fixture";

// Existing unit-boundary fixtures only; no DB/Auth/entitlement writes or transport.
const now = "2026-10-31T12:00:00.123456Z";
const entitlement = (patch: Partial<LegacyConsultingAccessRow> = {}): LegacyConsultingAccessRow => ({
  id: uid(200), user_id: M, kind: "consulting", source: "admin_grant",
  starts_at: "2026-10-01T00:00:00Z", expires_at: "2026-11-01T00:00:00Z", revoked_at: null, ...patch,
});
const ready = <T,>(rows: T[]) => ({ state: "ready", rows, complete: true });
function noAuthority(value: TicketServiceRightDiagnostic) {
  assert.equal(value.authority, "not_connected");
  assert.equal(value.writeEnabled, false);
  assert.equal(value.readOnly, true);
  assert.equal(value.serviceIdentifier, null);
  assert.equal(value.quota, null);
  assert.equal(value.obligations, null);
}

test("active legacy consulting reports original provenance but never a service right", () => {
  const row = entitlement(), value = diagnoseTicketServiceRight(ready([row]), M, now);
  assert.equal(value.legacyAccessState, "active");
  assert.equal(value.serviceRightState, "not_connected");
  assert.deepEqual(value.matchingLegacyEntitlementIds, [row.id]);
  assert.deepEqual(value.provenance, { state: "reported", rows: [{
    entitlementId: row.id, kind: "consulting", recordedSource: "admin_grant", sourceAuthority: "unverified",
    startsAt: row.starts_at, expiresAt: row.expires_at, revokedAt: null, matchesLegacyAccess: true,
  }] });
  assert.equal(value.evaluatedAt, now);
  noAuthority(value);
});

for (const [name, patch] of [
  ["future", { starts_at: "2026-11-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" }],
  ["expired", { expires_at: "2026-10-31T12:00:00.123456Z" }],
  ["revoked", { revoked_at: "2026-10-30T00:00:00Z" }],
  ["webinar", { kind: "webinar" }],
  ["manual", { kind: "manual" }],
] as const) {
  test(`${name} legacy record stays reported and inactive without granting this service`, () => {
    const row = entitlement(patch), value = diagnoseTicketServiceRight(ready([row]), M, now);
    assert.equal(value.legacyAccessState, "inactive");
    assert.equal(value.serviceRightState, "not_connected");
    assert.deepEqual(value.matchingLegacyEntitlementIds, []);
    assert.equal(value.provenance.rows?.[0].recordedSource, row.source);
    assert.equal(value.provenance.rows?.[0].matchesLegacyAccess, false);
    noAuthority(value);
  });
}

test("a complete empty legacy snapshot is not zero quota or evidence of absent service rights", () => {
  const value = diagnoseTicketServiceRight(ready([]), M, now);
  assert.equal(value.legacyAccessState, "inactive");
  assert.deepEqual(value.provenance, { state: "reported", rows: [] });
  assert.equal(value.serviceRightState, "not_connected");
  noAuthority(value);
});

test("unavailable, partial, missing or malformed snapshots withhold provenance and remain unknown", () => {
  for (const input of [undefined, null, {}, { state: "unavailable", rows: null },
    { state: "ready", rows: [entitlement()], complete: false },
    { state: "ready", rows: [], complete: "true" }, { state: "ready", rows: [] },
    { state: "ready", rows: null, complete: true }]) {
    const value = diagnoseTicketServiceRight(input, M, now);
    assert.equal(value.legacyAccessState, "unknown");
    assert.equal(value.serviceRightState, "unknown");
    assert.deepEqual(value.provenance, { state: "unknown", rows: null });
    assert.equal(value.matchingLegacyEntitlementIds, null);
    assert.equal(value.evaluatedAt, null);
    noAuthority(value);
  }
});

test("explicitly disconnected source remains disconnected without inventing an empty ledger", () => {
  const value = diagnoseTicketServiceRight({ state: "not_connected", rows: null }, M, now);
  assert.equal(value.legacyAccessState, "not_connected");
  assert.equal(value.serviceRightState, "not_connected");
  assert.deepEqual(value.provenance, { state: "not_connected", rows: null });
  assert.equal(value.matchingLegacyEntitlementIds, null);
  noAuthority(value);
});

test("foreign, duplicate, mixed-invalid and corrupt rows never become a partial successful snapshot", () => {
  const row = entitlement();
  const invalidRows: unknown[][] = [[entitlement({ user_id: O })], [row, row], [row, entitlement({ id: uid(201), user_id: O })],
    [{ ...row, expires_at: null }], [{ ...row, source: {} }], [entitlement({ starts_at: "2026-02-30T00:00:00Z" })],
    [entitlement({ expires_at: row.starts_at })], [{ ...row, kind: "admin" }]];
  for (const rows of invalidRows) {
    const value = diagnoseTicketServiceRight(ready(rows), M, now);
    assert.equal(value.legacyAccessState, "unknown");
    assert.equal(value.serviceRightState, "unknown");
    assert.equal(value.provenance.rows, null);
    assert.equal(value.matchingLegacyEntitlementIds, null);
    noAuthority(value);
  }
  for (const [client, time] of [["bad", now], [M, "bad"], [M, "2026-02-30T00:00:00Z"]]) {
    assert.equal(diagnoseTicketServiceRight(ready([row]), client, time).serviceRightState, "unknown");
  }
});

test("the existing classifier retains inclusive start, exclusive end and microseconds across offsets", () => {
  const row = entitlement({ starts_at: "2026-10-31T15:30:00.123456+03:30", expires_at: "2026-10-31T12:00:00.123459Z" });
  for (const [fraction, expected] of [["123455", "inactive"], ["123456", "active"], ["123458", "active"], ["123459", "inactive"]]) {
    const value = diagnoseTicketServiceRight(ready([row]), M, `2026-10-31T12:00:00.${fraction}Z`);
    assert.equal(value.legacyAccessState, expected);
    assert.equal(value.serviceRightState, "not_connected");
    assert.equal(value.provenance.rows?.[0].startsAt, row.starts_at);
    noAuthority(value);
  }
});

test("free source strings and smuggled admin/full or economic fields cannot establish service authority", () => {
  for (const source of [null, "", "admin", "full", "payment:unverified", "webinar_payment:unverified", '{"service":"consultation","active":true,"quota":"unlimited"}']) {
    const value = diagnoseTicketServiceRight(ready([entitlement({ source })]), M, now);
    assert.equal(value.legacyAccessState, "active");
    assert.equal(value.serviceRightState, "not_connected");
    assert.equal(value.provenance.rows?.[0].recordedSource, source);
    assert.equal(value.provenance.rows?.[0].sourceAuthority, "unverified");
    noAuthority(value);
  }
  for (const extra of [{ role: "admin" }, { level: "full" }, { serviceIdentifier: "consultation" }, { quota: 0 }, { obligations: "unlimited" }]) {
    assert.equal(diagnoseTicketServiceRight({ ...ready([entitlement()]), ...extra }, M, now).serviceRightState, "unknown");
    assert.equal(diagnoseTicketServiceRight(ready([{ ...entitlement(), ...extra }]), M, now).serviceRightState, "unknown");
  }
});

test("diagnosis detaches immutable metadata and never mutates the caller snapshot", () => {
  const input = ready([entitlement()]), before = structuredClone(input);
  const value = diagnoseTicketServiceRight(input, M, now);
  assert.deepEqual(input, before);
  input.rows[0] = entitlement({ source: "changed", expires_at: "2027-01-01T00:00:00Z" });
  assert.equal(value.provenance.rows?.[0].recordedSource, "admin_grant");
  assert.equal(value.provenance.rows?.[0].expiresAt, before.rows[0].expires_at);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.provenance) && Object.isFrozen(value.provenance.rows));
  assert.ok(Object.isFrozen(value.provenance.rows?.[0]) && Object.isFrozen(value.matchingLegacyEntitlementIds));
  const frozen = Object.freeze({ state: "ready", complete: true, rows: Object.freeze([Object.freeze(entitlement())]) });
  assert.equal(diagnoseTicketServiceRight(frozen, M, now).legacyAccessState, "active");
});

test("diagnostic metadata cannot substitute for the unchanged storage capability", () => {
  const value = diagnoseTicketServiceRight(ready([entitlement()]), M, now), envelope = lookup({ product: true });
  const original = structuredClone(envelope);
  assert.throws(() => validateTicketStorageEnvelope({ ...envelope, capability: value }, parent(), { mode: "lookup", relationshipId: envelope.data.relationshipId, requestId: envelope.data.requestId, clientToken: envelope.data.clientToken }));
  assert.equal(prepareTicketStorageAttempt(opening(), parent(), envelope).status, "blocked");
  assert.deepEqual(envelope, original);
});

test("expired, revoked and unknown diagnostics leave original history and receipt recovery independent", () => {
  const request = opening(), source = parent(), saved = receipt(request), read = history(request);
  const original = structuredClone({ request, source, saved, read });
  const intent = createTicketIntent(request, source, lookup({ product: true }).data);
  const found = lookup({ product: true, found: true, attempt: true }, request);
  for (const snapshot of [ready([entitlement({ expires_at: now })]), ready([entitlement({ revoked_at: now })]), { state: "unavailable", rows: null }]) {
    noAuthority(diagnoseTicketServiceRight(snapshot, M, now));
    const recovered = recoverTicketIntent(intent, found.data, source, saved);
    assert.equal(recovered.status, "confirmed");
    assert.deepEqual(recovered.receipt, saved);
    assert.equal(recovered.intent.body, intent.body);
    assert.equal(recovered.intent.clientToken, request.clientToken);
    assert.deepEqual(found.data.request, { state: "found", data: read });
  }
  assert.deepEqual({ request, source, saved, read }, original);
});
