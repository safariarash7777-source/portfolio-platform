import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateRosterRead, filterRoster, parseRosterFilters } from "../../../lib/consultation/rosterContracts";
for (const profile of ["explicit", "legacy"]) test(`real isolated PostgreSQL ${profile} output validates against browser/server contract`, () => {
 const value = JSON.parse(readFileSync(new URL(`./fixture-${profile}.json`, import.meta.url), "utf8"));
 const snapshot = validateRosterRead(value, "00000000-0000-4000-8000-000000000003");
 assert.equal(snapshot.totalAuthorized, 2);
 const result = validateRosterRead(filterRoster(snapshot, parseRosterFilters(new URLSearchParams("riskStates=ambiguous&missing=holdings_empty"))));
 assert.equal(result.totalMatched, 1);
 assert.equal(result.rows[0].assetValue.totalToman, null);
});
