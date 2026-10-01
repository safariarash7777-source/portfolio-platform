export const CONTRACT_VERSION = "seasonal.v0.1" as const;
export const MODULE_KEYS = ["market-overview", "funds", "gold-fx", "symbol", "webinar", "resources"] as const;
export type ModuleKey = typeof MODULE_KEYS[number];
export type Standing = "never" | "scheduled" | "active" | "expired" | "revoked";
export interface ModuleDecision {
  allowed: boolean;
  reason: string;
  authorizedByCohortIds: string[];
  until: string | null;
  policyVersion: string | null;
}
export interface NeedsAssessment {
  experience: "new" | "some" | "experienced";
  interests: string[];
  goal: string;
  question: string;
}
export function validNeeds(value: unknown): value is NeedsAssessment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  return Object.keys(b).every(k => ["experience", "interests", "goal", "question"].includes(k)) &&
    ["new", "some", "experienced"].includes(String(b.experience)) && Array.isArray(b.interests) &&
    b.interests.length <= 5 && b.interests.every(s => typeof s === "string" && s.length <= 80) &&
    typeof b.goal === "string" && b.goal.length <= 500 && typeof b.question === "string" && b.question.length <= 1000;
}
