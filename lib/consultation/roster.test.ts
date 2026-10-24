import test from "node:test";
import assert from "node:assert/strict";
import { filterRoster, parseRosterFilters, rosterMissingCodes, validateRosterRead, type RosterRead, type RosterRow } from "./rosterContracts";
import { getRoster, type RosterDb } from "./rosterServer";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function row(n = 1): RosterRow {
 const r: RosterRow = { relationshipId: id(n), clientId: id(n + 10), clientLabel: `عضو ${n}`, grantedAt: "2026-10-01T00:00:00Z", risk: { state: "missing", category: null, assessmentId: null, assessedAt: null, expiresAt: null, forcedExpiredAt: null, source: "risk_assessments" }, holdings: { state: "not_recorded", versionId: null }, cashFlow: { state: "not_recorded", versionId: null }, goals: { state: "not_recorded", versionId: null }, assetValue: { state: "unavailable", totalToman: null, reason: "valuation_not_in_roster_v1" }, missingCodes: [] };
 r.missingCodes = rosterMissingCodes(r); return r;
}
function snapshot(rows = [row()]): RosterRead { return { contractVersion: "consultation-roster.v1", actorId: id(90), generatedAt: "2026-10-24T00:00:00Z", period: { startOn: "2026-10-01", endOn: "2026-10-31" }, capabilities: { risk: true, financialPresence: true, assetValueRange: false }, rows, totalAuthorized: rows.length, totalMatched: rows.length, page: 1, pageSize: 100 }; }
const filters = (query = "") => parseRosterFilters(new URLSearchParams(query));
test("unknown amount stays null and uncertain risk remains unclassified", () => {
 assert.equal(validateRosterRead(snapshot()).rows[0].assetValue.totalToman, null);
 const bad = snapshot(); (bad.rows[0].assetValue as { totalToman: unknown }).totalToman = 0; assert.throws(() => validateRosterRead(bad));
 const risk = snapshot(); risk.rows[0].risk.category = "متعادل"; assert.throws(() => validateRosterRead(risk));
});
test("unknown filters, duplicate parameters, asset ranges and invalid dates fail", () => {
 for (const q of ["page=0", "pageSize=51", "page=1&page=2", "assetMinToman=0", "riskStates=other", "missing=risk_missing,risk_missing", "startOn=2026-02-30&endOn=2026-03-01", "endOn=2026-10-31", "missingMode=none"]) assert.throws(() => filters(q), q);
});
test("filters run before pagination with AND across groups and OR within choices", () => {
 const rows = Array.from({ length: 60 }, (_, i) => row(i + 1)); rows[59].clientLabel = "كيان";
 const s = validateRosterRead(snapshot(rows));
 const r = filterRoster(s, filters("search=کیان&pageSize=1&riskStates=missing&missing=risk_missing,goals_empty"));
 assert.equal(r.totalAuthorized, 60); assert.equal(r.totalMatched, 1); assert.equal(r.rows[0].relationshipId, id(60));
 assert.equal(filterRoster(s, filters("missingMode=all&missing=risk_missing,goals_empty")).totalMatched, 0);
 assert.equal(filterRoster(s, filters("riskCategories=متعادل")).totalMatched, 0);
});
test("pagination stable on equal timestamp, empty page is honest, never filter partial snapshot", () => {
 const s = snapshot([row(3), row(1), row(2)]);
 assert.equal(filterRoster(s, filters("pageSize=1&page=2")).rows[0].relationshipId, id(2));
 assert.equal(validateRosterRead(filterRoster(s, filters("page=10"))).rows.length, 0);
 assert.throws(() => filterRoster(filterRoster(s, filters("pageSize=1")), filters()));
});
test("risk expiry strictly after 180 days and effective forced expiry", () => {
 const s = snapshot(), r = s.rows[0];
 r.risk = { state: "current", category: "متعادل", assessmentId: id(80), assessedAt: "2026-04-27T00:00:00Z", expiresAt: "2026-10-24T00:00:00Z", forcedExpiredAt: null, source: "risk_assessments" };
 r.missingCodes = rosterMissingCodes(r); assert.doesNotThrow(() => validateRosterRead(s));
 s.generatedAt = "2026-10-24T00:00:00.001Z"; assert.throws(() => validateRosterRead(s));
 r.risk.state = "expired"; r.missingCodes = rosterMissingCodes(r); assert.doesNotThrow(() => validateRosterRead(s));
 s.generatedAt = "2026-10-23T00:00:00Z"; r.risk.forcedExpiredAt = "2026-10-22T00:00:00Z"; assert.doesNotThrow(() => validateRosterRead(s));
 r.risk.forcedExpiredAt = "2026-10-25T00:00:00Z"; assert.throws(() => validateRosterRead(s));
});
test("cross actor, extra private fields, duplicate relations and malformed counts rejected", () => {
 assert.throws(() => validateRosterRead(snapshot(), id(99)));
 const s = snapshot(); Object.assign(s.rows[0], { answers_json: {} }); assert.throws(() => validateRosterRead(s));
 assert.throws(() => validateRosterRead(snapshot([row(), row()])));
 const c = snapshot(); c.totalMatched = 0; assert.throws(() => validateRosterRead(c));
});
const db = (data: unknown = snapshot()): RosterDb => ({ authenticate: async () => ({ user: { id: id(90) }, error: null }), read: async () => ({ data, error: null }) });
const request = (q = "") => new Request(`https://example.test/api/consultation/roster${q}`);
test("authenticated endpoint filters and validates canonical snapshot with private no-store", async () => {
 const response = await getRoster(request("?riskStates=missing"), async () => db()); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
 assert.equal((await response.json()).rows[0].assetValue.totalToman, null);
});
test("missing session and infrastructure auth failure never call roster", async () => {
 for (const [error, status] of [[null, 401], [{ status: 500 }, 503]] as const) {
  let calls = 0; const d = db(); d.authenticate = async () => ({ user: null, error }); d.read = async () => { calls++; throw Error("should not read"); };
  const response = await getRoster(request(), async () => d); assert.equal(response.status, status); assert.equal(calls, 0);
 }
});
test("forbidden/revoked role and missing migration do not become empty success", async () => {
 for (const [code, status] of [["42501", 403], ["42883", 503], ["54000", 503]] as const) {
  const d = db(); d.read = async () => ({ data: null, error: { code } }); const response = await getRoster(request(), async () => d); assert.equal(response.status, status); assert.ok(!(await response.text()).includes("clientLabel"));
 }
});
test("malformed response and mismatched requested period fail closed", async () => {
 assert.equal((await getRoster(request(), async () => db({ rows: [] }))).status, 503);
 assert.equal((await getRoster(request("?startOn=2026-09-01&endOn=2026-09-30"), async () => db())).status, 503);
 assert.equal((await getRoster(request("?assetMaxToman=10"), async () => db())).status, 400);
});
