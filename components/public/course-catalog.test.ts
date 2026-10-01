import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPublicCourses } from "./course-catalog";
const read = (value: unknown, status = 200) => fetchPublicCourses(async () => new Response(JSON.stringify(value), { status }));
test("published catalog distinguishes empty from HTTP/shape/contract errors", async () => {
  assert.equal((await read({ contractVersion: "seasonal.v0.1", courses: [] })).status, "empty");
  assert.equal((await read({ contractVersion: "seasonal.v0.1", courses: [] }, 503)).status, "error");
  assert.equal((await read({ contractVersion: "future", courses: [] })).status, "error");
  assert.equal((await read({ contractVersion: "seasonal.v0.1", courses: [{}] })).status, "error");
});
test("unannounced dates stay null and an invalid range or active commerce contract is rejected", async () => {
  const cohort = { id: "synthetic-cohort", title: "Synthetic test only", startsAt: null, endsAtExclusive: null, timeZone: "Asia/Tehran", policyVersion: null, status: "published", registrationAction: { enabled: false, reason: "registration_not_enabled" } };
  const body = { contractVersion: "seasonal.v0.1", courses: [{ id: "synthetic-course", title: "Synthetic test only", summary: null, cohorts: [cohort] }] };
  const state = await read(body); assert.equal(state.status, "ready");
  if (state.status === "ready") assert.equal(state.data[0].cohorts[0].startsAt, null);
  assert.equal((await read({ ...body, courses: [{ ...body.courses[0], cohorts: [{ ...cohort, startsAt: "2026-01-31T20:30:00Z", endsAtExclusive: "2026-01-01T20:30:00Z" }] }] })).status, "error");
  assert.equal((await read({ ...body, courses: [{ ...body.courses[0], cohorts: [{ ...cohort, registrationAction: { enabled: true } }] }] })).status, "error");
});
