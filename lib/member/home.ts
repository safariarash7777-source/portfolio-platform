import { MODULE_KEYS, type ModuleDecision, type NeedsAssessment, validNeeds } from "../seasonal/contracts";

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export interface MemberGrant { grantRef: string | number; cohortId: string; title?: string; moduleKeys: string[]; startsAt: string; endsAtExclusive: string; standing: "active" | "scheduled" | "expired" | "revoked"; policyVersion?: string }
export interface MemberCohort { id: string; title: string; grants: MemberGrant[] }
export interface Webinar { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; platform: string | null; status: "published" | "live" | "ended" }
export interface CohortDetail { id: string; title: string; startsAt: string; endsAtExclusive: string; timeZone: string; policyVersion: string; moduleKeys: string[]; webinars: Webinar[] }
export interface MemberResource { resourceRef: string; title: string; moduleKey: string; createdAt: string; resourcePath: string }
export interface AssessmentVersion { id: string; version: number; body: NeedsAssessment; submitted_at: string | null; created_at: string }
export type Result<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; status: number };
export function isGrant(v: unknown): v is MemberGrant {
  return record(v) && (typeof v.grantRef === "string" || Number.isSafeInteger(v.grantRef)) && isUuid(v.cohortId) && (v.title === undefined || v.title === null || typeof v.title === "string") && Array.isArray(v.moduleKeys) && v.moduleKeys.every(k => MODULE_KEYS.includes(k)) && date(v.startsAt) && date(v.endsAtExclusive) && Date.parse(v.endsAtExclusive) > Date.parse(v.startsAt) && ["active", "scheduled", "expired", "revoked"].includes(String(v.standing));
}
export const isGrants = (v: unknown): v is MemberGrant[] => Array.isArray(v) && v.every(isGrant);
// A display grouping only. Each server module decision remains independent.
export function groupCohorts(grants: MemberGrant[]): MemberCohort[] {
  const groups = new Map<string, MemberCohort>();
  for (const g of grants) {
    const c = groups.get(g.cohortId) ?? { id: g.cohortId, title: g.title || "دورهٔ ثبت‌شده", grants: [] };
    c.grants.push(g); groups.set(c.id, c);
  }
  const rank = (c: MemberCohort) => c.grants.some(g => g.standing === "active") ? 0 : c.grants.some(g => g.standing === "scheduled") ? 1 : 2;
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}
export function cohortStanding(c: MemberCohort, decisions: ModuleDecision[] = []): string {
  if (decisions.some(d => d.reason === "cohort_cancelled")) return "cancelled";
  for (const state of ["active", "scheduled", "expired", "revoked"] as const) if (c.grants.some(g => g.standing === state)) return state;
  return "never";
}
export const standingLabels: Record<string, string> = { active: "عضویت فعال", scheduled: "عضویت هنوز آغاز نشده", expired: "عضویت پایان یافته", revoked: "دسترسی لغو شده", cancelled: "دوره لغو شده", never: "عضویت ثبت نشده" };
export function isDecision(v: unknown): v is ModuleDecision {
  return record(v) && typeof v.allowed === "boolean" && typeof v.reason === "string" && Array.isArray(v.authorizedByCohortIds) && v.authorizedByCohortIds.every(isUuid) && (v.until === null || date(v.until)) && (v.policyVersion === null || typeof v.policyVersion === "string");
}
export function isCohort(v: unknown): v is CohortDetail {
  return record(v) && isUuid(v.id) && typeof v.title === "string" && date(v.startsAt) && date(v.endsAtExclusive) && v.timeZone === "Asia/Tehran" && typeof v.policyVersion === "string" && Array.isArray(v.moduleKeys) && v.moduleKeys.every(k => MODULE_KEYS.includes(k)) && Array.isArray(v.webinars) && v.webinars.every(w => record(w) && isUuid(w.id) && typeof w.title === "string" && date(w.starts_at) && (w.ends_at === null || date(w.ends_at)) && ["published", "live", "ended"].includes(String(w.status)));
}
export function isResources(v: unknown): v is MemberResource[] {
  return Array.isArray(v) && v.every(r => record(r) && isUuid(r.resourceRef) && typeof r.title === "string" && MODULE_KEYS.some(k => k === r.moduleKey) && date(r.createdAt) && typeof r.resourcePath === "string" && /^\/api\/cohorts\/[0-9a-f-]+\/resources\/[0-9a-f-]+$/i.test(r.resourcePath));
}
export function isAssessment(v: unknown): v is AssessmentVersion | null {
  return v === null || record(v) && isUuid(v.id) && Number.isInteger(v.version) && Number(v.version) > 0 && validNeeds(v.body) && (v.submitted_at === null || date(v.submitted_at)) && date(v.created_at);
}
export function webinarPhase(w: Webinar, now: string): "before" | "during" | "after" | "unknown" {
  if (!date(now) || !date(w.starts_at)) return "unknown";
  if (w.status === "ended" || w.ends_at && Date.parse(now) >= Date.parse(w.ends_at)) return "after";
  if (Date.parse(now) < Date.parse(w.starts_at)) return "before";
  return "during";
}
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const u = new URL(value); return !u.username && !u.password && (u.protocol === "https:" || u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) ? u.href : null; } catch { return null; }
}
