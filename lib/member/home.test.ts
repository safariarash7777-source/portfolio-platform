import { test } from "node:test";
import assert from "node:assert/strict";
import { cohortStanding, groupCohorts, isCohort, isGrants, isResources, isDecision, safeExternalUrl, webinarPhase, type MemberGrant, type Webinar } from "./home";
import { memberData, MemberReadError, memberAuthErrorStatus } from "./http";
import { draftKey, restoreDraft } from "./draft";
import { memberFixtureRequest, MEMBER_FIXTURE_COHORT_A as A, MEMBER_FIXTURE_COHORT_B as B } from "./fixture";
import { accountEntryHref } from "../../components/account/returnPath";
import { readMemberProfile } from "./profile";
const grant: MemberGrant = { grantRef: 1, cohortId: A, title: "A", moduleKeys: ["funds"], startsAt: "2026-10-01T05:30:00Z", endsAtExclusive: "2027-01-01T05:30:00Z", standing: "active" };
test("shared Auth missing installation, session and service failures remain distinct", async () => {
  for (const [status, state] of [[404, "not_connected"], [401, "sign_in_required"], [503, "unavailable"]] as const) assert.deepEqual(await readMemberProfile(async () => new Response(null, { status })), { state });
  assert.deepEqual(await readMemberProfile(async () => { throw Error("network"); }), { state: "unavailable" });
});
test("shared profile projection discards identity fields and never claims official verification", async () => {
  const common = { phoneVerified: false, identityMatch: "pending", phoneNationalIdMatch: "pending" };
  assert.deepEqual(await readMemberProfile(async () => Response.json({ ...common, profile: null })), { state: "incomplete", phoneVerified: false, version: null });
  const projected = await readMemberProfile(async () => Response.json({ ...common, version: 2, profile: { firstName: "SYNTHETIC", lastName: "TEST", nationalId: "SYNTHETIC_TEST_ONLY" } }));
  assert.deepEqual(projected, { state: "recorded", phoneVerified: false, version: 2 });
  assert.equal(JSON.stringify(projected).includes("nationalId"), false);
});
test("unknown shared identity shape is unavailable and read uses private no-store credentials", async () => {
  let init: RequestInit | undefined;
  assert.deepEqual(await readMemberProfile(async (_path, i) => { init = i; return Response.json({ profile: {}, phoneVerified: true, identityMatch: "verified", phoneNationalIdMatch: "pending" }); }), { state: "unavailable" });
  assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
});
test("an Auth outage is not presented as an expired session", () => {
  assert.equal(memberAuthErrorStatus({ name: "AuthSessionMissingError" }), 401);
  assert.equal(memberAuthErrorStatus({ status: 401 }), 401);
  assert.equal(memberAuthErrorStatus({ status: 503 }), 503);
  assert.equal(memberAuthErrorStatus({ name: "AuthRetryableFetchError" }), 503);
});
test("overlapping grants are grouped for display without creating an authorization flag or merging module rights", () => {
  const groups = groupCohorts([{ ...grant, cohortId: B, standing: "expired" }, grant, { ...grant, grantRef: 3, moduleKeys: ["resources"], endsAtExclusive: "2027-02-01T05:30:00Z" }]);
  assert.equal(groups.length, 2); assert.equal(groups[0].id, A); assert.equal(groups[0].grants.length, 2); assert.deepEqual(groups[0].grants.map(g => g.moduleKeys), [["funds"], ["resources"]]); assert.equal("allowed" in groups[0], false);
});
test("cancellation uses server reason and remains distinct from grant revocation", () => {
  const c = groupCohorts([{ ...grant, standing: "revoked" }])[0];
  assert.equal(cohortStanding(c), "revoked");
  assert.equal(cohortStanding(c, [{ allowed: false, reason: "cohort_cancelled", authorizedByCohortIds: [], until: null, policyVersion: null }]), "cancelled");
});
test("unexpected DTOs, unsafe cohort IDs and missing end dates remain unavailable", () => {
  assert.ok(isGrants([grant])); assert.equal(isGrants([{ ...grant, endsAtExclusive: null }]), false); assert.equal(isGrants([{ ...grant, cohortId: "../../admin" }]), false); assert.equal(isGrants([{ ...grant, moduleKeys: ["admin"] }]), false);
  assert.equal(isResources([{ resourceRef: A, title: "x", moduleKey: "resources", createdAt: grant.startsAt, resourcePath: "https://evil.example" }]), false);
});
test("webinar before/during/after boundaries use source dates, not claims about live streaming", () => {
  const w: Webinar = { id: A, title: "fixture", description: null, starts_at: "2026-10-01T12:00:00Z", ends_at: "2026-10-01T13:00:00Z", platform: null, status: "published" };
  assert.equal(webinarPhase(w, "2026-10-01T11:59:59Z"), "before"); assert.equal(webinarPhase(w, w.starts_at), "during"); assert.equal(webinarPhase(w, w.ends_at!), "after"); assert.equal(webinarPhase({ ...w, status: "ended" }, w.starts_at), "after"); assert.equal(webinarPhase(w, "invalid"), "unknown");
});
test("private download/provider links reject script, embedded credentials and insecure remote destinations", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), null); assert.equal(safeExternalUrl("https://user:secret@example.test/"), null); assert.equal(safeExternalUrl("http://remote.example/file"), null); assert.ok(safeExternalUrl("https://example.test/object?token=synthetic")); assert.ok(safeExternalUrl("http://127.0.0.1:3410/file"));
});
test("unknown API versions and malformed JSON do not become an empty cohort list", async () => {
  for (const response of [Response.json({ data: [] }), Response.json({ contractVersion: "other", data: [] }), new Response("<html>failure</html>")]) await assert.rejects(memberData("/api/me/cohorts", isGrants, async () => response), (e: unknown) => e instanceof MemberReadError && e.status === 503);
});
test("HTTP 401/403/409/503 remain distinguishable, body text and SQL errors are not propagated", async () => {
  for (const status of [401, 403, 409, 503]) await assert.rejects(memberData("/api/me/cohorts", isGrants, async () => Response.json({ error: "sensitive SQL" }, { status })), (e: unknown) => e instanceof MemberReadError && e.status === status && !e.message.includes("SQL"));
});
test("private API reads and POSTs use no-store and same-origin credentials", async () => {
  let init: RequestInit | undefined;
  await memberData("/api/me/cohorts", isGrants, async (_p, i) => { init = i; return Response.json({ contractVersion: "seasonal.v0.1", data: [] }); }, { method: "POST", body: "synthetic", headers: { "Content-Type": "application/json" } });
  assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.body, "synthetic");
});
test("educational draft is account/cohort scoped, bounded in time and rejects unrecognized fields", () => {
  const body = { experience: "new", interests: [], goal: "تعلم", question: "منبع؟" };
  assert.notEqual(draftKey(A, A), draftKey(B, A)); assert.notEqual(draftKey(A, A), draftKey(A, B));
  assert.deepEqual(restoreDraft(JSON.stringify({ body, savedAt: 100 }), 200), body); assert.equal(restoreDraft(JSON.stringify({ body, savedAt: 100 }), 100 + 2 * 60 * 60 * 1000), null); assert.equal(restoreDraft(JSON.stringify({ body: { ...body, balance: 1000 }, savedAt: 100 }), 200), null); assert.equal(restoreDraft("broken", 200), null);
});
test("login keeps the selected course and existing personal destinations", () => {
  for (const path of [`/dashboard?cohort=${A}`, "/dashboard/portfolio", "/dashboard/holdings?v=" + B, "/dashboard/consultation"]) assert.equal(decodeURIComponent(accountEntryHref("/login", path).split("next=")[1]), path);
});
test("preview fixture models cohort-specific resources and per-module rights without union leakage", async () => {
  const request = memberFixtureRequest("overlap"); const cohorts = await memberData("/api/me/cohorts", isGrants, request); assert.equal(groupCohorts(cohorts).length, 2);
  const a = await memberData(`/api/cohorts/${A}/resources`, isResources, request), b = await memberData(`/api/cohorts/${B}/resources`, isResources, request); assert.notEqual(a[0].title, b[0].title);
  assert.equal((await memberData(`/api/me/module-access?module=funds&cohort=${B}`, isDecision, request)).allowed, false);
  assert.equal((await memberData(`/api/me/module-access?module=funds&cohort=${A}`, isDecision, request)).allowed, true);
  assert.ok(isCohort(await memberData(`/api/cohorts/${A}`, isCohort, request)));
});
test("preview distinguishes expired/revoked/cancelled and genuine empty resources from an API outage", async () => {
  for (const s of ["expired", "revoked", "cancelled"]) assert.equal((await memberData(`/api/me/module-access?module=resources&cohort=${A}`, isDecision, memberFixtureRequest(s))).reason, s === "cancelled" ? "cohort_cancelled" : s);
  assert.deepEqual(await memberData(`/api/cohorts/${A}/resources`, isResources, memberFixtureRequest("empty")), []);
  await assert.rejects(memberData("/api/me/cohorts", isGrants, memberFixtureRequest("error")), MemberReadError);
});
