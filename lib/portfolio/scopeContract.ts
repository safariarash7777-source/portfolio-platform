import type { InvestmentScopeReview } from "./investmentScope";
export interface StoredScopeReview extends InvestmentScopeReview { id: string; scopeVersion: number }
export type ScopeRead = { status: "ready"; review: StoredScopeReview | null } | { status: "error"; review: null };
export const SCOPE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function scopeReviewFromStored(row: Record<string, unknown>, financial: { id: string; version: number }): StoredScopeReview {
  if (!SCOPE_UUID.test(String(row.id)) || row.holding_version_id !== financial.id || !Number.isSafeInteger(row.scope_version) || Number(row.scope_version) < 1
    || row.rules_version !== "member-selected.v0.1" || !Array.isArray(row.assignments) || !row.assignments.length || row.assignments.length > 500
    || typeof row.member_confirmed_at !== "string" || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(row.member_confirmed_at) || !Number.isFinite(Date.parse(row.member_confirmed_at))) throw new Error("invalid scope read");
  const assignments = row.assignments as InvestmentScopeReview["assignments"];
  if (assignments.some(a => !a || typeof a.positionKey !== "string" || !a.positionKey.trim() || !["allocatable", "excluded"].includes(a.use))
    || new Set(assignments.map(a => a.positionKey)).size !== assignments.length) throw new Error("invalid scope read");
  return { id: String(row.id), scopeVersion: Number(row.scope_version), holdingVersionId: financial.id, holdingVersion: financial.version,
    rulesVersion: String(row.rules_version), memberConfirmedAt: row.member_confirmed_at, assignments };
}
