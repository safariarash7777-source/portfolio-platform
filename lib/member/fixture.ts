import { CONTRACT_VERSION, type NeedsAssessment } from "../seasonal/contracts";
import type { AssessmentVersion, MemberGrant } from "./home";
import type { MemberRequest } from "./http";
export const MEMBER_FIXTURE_COHORT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const MEMBER_FIXTURE_COHORT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const MEMBER_FIXTURE_USER = "11111111-1111-4111-8111-111111111111";
export const MEMBER_FIXTURE_NOW = "2026-10-01T12:00:00Z";
export const MEMBER_FIXTURE_SCENARIOS = ["overlap", "active-b", "expired", "revoked", "cancelled", "scheduled", "empty", "never", "error", "save-error", "save-conflict", "needs-read-error", "needs-read-slow", "webinar-error", "short-link"] as const;
const response = (data: unknown, status = 200) => Response.json({ contractVersion: CONTRACT_VERSION, data }, { status });
const body: NeedsAssessment = { experience: "new", interests: ["صندوق‌ها"], goal: "درک بهتر منبع و تاریخ داده", question: "تاریخ NAV چگونه بررسی می‌شود؟" };
/** Explicit UI preview only; no Auth, identity claim, Storage or publication proof. */
export function memberFixtureRequest(scenario: string): MemberRequest {
  const A = MEMBER_FIXTURE_COHORT_A, B = MEMBER_FIXTURE_COHORT_B;
  const assessments = new Map<string, AssessmentVersion>();
  let conflict = scenario === "save-conflict";
  const inactive = ["expired", "revoked", "cancelled", "scheduled"].includes(scenario);
  const makeGrant = (cohortId: string, grantRef: number, modules: string[]): MemberGrant => ({ grantRef, cohortId, title: cohortId === A ? "مسیر راه — دورهٔ ساختگی A" : "مسیر راه — دورهٔ ساختگی B", moduleKeys: modules, startsAt: scenario === "scheduled" ? "2026-11-01T05:30:00Z" : "2026-09-01T05:30:00Z", endsAtExclusive: scenario === "expired" ? "2026-09-30T05:30:00Z" : "2027-01-01T05:30:00Z", standing: scenario === "revoked" || scenario === "cancelled" ? "revoked" : scenario === "expired" ? "expired" : scenario === "scheduled" ? "scheduled" : "active", policyVersion: "sandbox.explicit.v1" });
  const grants = scenario === "never" ? [] : scenario === "active-b" ? [makeGrant(B, 3, ["resources", "gold-fx", "symbol"])] : [makeGrant(A, 1, ["webinar", "resources"]), ...(!inactive ? [makeGrant(A, 2, ["funds"]), makeGrant(B, 3, ["resources", "gold-fx", "symbol"])] : [])];
  return async (path, init) => {
    const u = new URL(path, "https://example.invalid");
    if (scenario === "error") return response(null, 503);
    if (u.pathname === "/api/auth/identity") return Response.json({ profile: null, phoneVerified: false, identityMatch: "pending", phoneNationalIdMatch: "pending" });
    if (u.pathname === "/api/me/cohorts") return response(grants);
    const cohort = u.searchParams.get("cohort") ?? u.pathname.split("/")[3];
    const modules = grants.filter(g => g.cohortId === cohort).flatMap(g => g.moduleKeys);
    const authorized = !inactive && modules.length > 0;
    if (u.pathname === "/api/me/module-access") return response({ allowed: authorized && modules.includes(u.searchParams.get("module") ?? ""), reason: scenario === "cancelled" ? "cohort_cancelled" : inactive ? scenario : modules.includes(u.searchParams.get("module") ?? "") ? "active" : "module_not_granted", authorizedByCohortIds: authorized && modules.includes(u.searchParams.get("module") ?? "") ? [cohort] : [], until: authorized ? "2027-01-01T05:30:00Z" : null, policyVersion: "sandbox.explicit.v1" });
    if (u.pathname.endsWith("/needs-assessment")) {
      if (init?.method === "POST") {
        if (scenario === "save-error") return response(null, 503);
        const b = JSON.parse(String(init.body)) as { baseVersion: number; body: NeedsAssessment; submitted: boolean };
        if (conflict) { conflict = false; assessments.set(cohort, { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", version: 1, body, created_at: MEMBER_FIXTURE_NOW, submitted_at: null }); return response(null, 409); }
        if (b.baseVersion !== (assessments.get(cohort)?.version ?? 0)) return response(null, 409);
        const v: AssessmentVersion = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", version: b.baseVersion + 1, body: b.body, created_at: MEMBER_FIXTURE_NOW, submitted_at: b.submitted ? MEMBER_FIXTURE_NOW : null };
        assessments.set(cohort, v); return response({ id: v.id, version: v.version });
      }
      if (scenario === "needs-read-error") return response(null, 503);
      if (scenario === "needs-read-slow") await new Promise(resolve => setTimeout(resolve, 1600));
      return response(assessments.get(cohort) ?? null);
    }
    if (u.pathname.endsWith("/join") || /^\/api\/cohorts\/[^/]+\/resources\/[^/]+$/.test(u.pathname)) return authorized ? response({ url: "https://example.invalid/synthetic-authorized-link", expiresInSeconds: scenario === "short-link" ? 1 : 60 }) : response(null, 403);
    if (u.pathname.endsWith('/publications')) return Response.json(authorized?{data:{items:[],nextCursor:null},contractVersion:'publication.v1'}:{error:'Synthetic denied'},{status:authorized?200:403});
    if (u.pathname.endsWith("/resources")) return response(!authorized || scenario === "empty" ? [] : [{ resourceRef: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: cohort === A ? "منبع ساختگی فقط دورهٔ A" : "منبع ساختگی فقط دورهٔ B", moduleKey: "resources", createdAt: MEMBER_FIXTURE_NOW, resourcePath: `/api/cohorts/${cohort}/resources/cccccccc-cccc-4ccc-8ccc-cccccccccccc` }]);
    if (scenario === "cancelled") return response(null, 404);
    if (scenario === "webinar-error") return response(null, 503);
    return response({ id: cohort, title: "دورهٔ ساختگی", startsAt: "2026-09-01T05:30:00Z", endsAtExclusive: "2027-01-01T05:30:00Z", timeZone: "Asia/Tehran", policyVersion: "sandbox.explicit.v1", moduleKeys: modules, webinars: scenario === "empty" ? [] : [
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", title: "وبینار آیندهٔ ساختگی", description: null, starts_at: "2026-10-01T13:00:00Z", ends_at: "2026-10-01T14:00:00Z", platform: "سرویس نمونه", status: "published" },
      { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", title: "وبینار در بازهٔ برگزاری ساختگی", description: null, starts_at: "2026-10-01T11:30:00Z", ends_at: "2026-10-01T12:30:00Z", platform: "سرویس نمونه", status: "live" },
      { id: "abababab-abab-4bab-8bab-abababababab", title: "وبینار پایان‌یافتهٔ ساختگی", description: null, starts_at: "2026-09-20T10:00:00Z", ends_at: "2026-09-20T12:00:00Z", platform: "سرویس نمونه", status: "ended" },
    ] });
  };
}
