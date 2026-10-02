import type { HoldingVersion } from "./contracts";

/** Review of the existing snapshot, never another holdings/version store. */
export interface InvestmentScopeReview {
  holdingVersionId: string;
  holdingVersion: number;
  rulesVersion: string;
  memberConfirmedAt: string;
  assignments: readonly {
    positionKey: string;
    use: "allocatable" | "excluded" | "unknown";
  }[];
}

export type InvestmentScopeResult =
  | { status: "blocked"; holdings: null; reasons: readonly string[] }
  | {
      status: "ready";
      holdings: HoldingVersion;
      denominator: {
        kind: "allocatable_investment_assets";
        holdingVersionId: string;
        holdingVersion: number;
        rulesVersion: string;
        memberConfirmedAt: string;
        includedPositionKeys: readonly string[];
        excludedPositionKeys: readonly string[];
      };
    };

/**
 * Require a choice for EVERY recorded asset. No inferred class/house/cash policy.
 * Call only after owner-only canonical loading and explicit member review.
 * Ready means the denominator is identified; prices/coverage remain the engine's gate.
 */
export function selectInvestmentScope(
  holdings: HoldingVersion,
  review: InvestmentScopeReview | null,
  now: Date,
): InvestmentScopeResult {
  const blocked = (...reasons: string[]): InvestmentScopeResult => ({ status: "blocked", holdings: null, reasons });
  if (!review) return blocked("member_scope_confirmation_required");
  if (!holdings.id || !Number.isSafeInteger(holdings.version) || holdings.version < 1
      || review.holdingVersionId !== holdings.id || review.holdingVersion !== holdings.version) {
    return blocked("scope_version_mismatch");
  }
  // Confirmation is an instant with timezone, not an ambiguous local date.
  const confirmed = Date.parse(review.memberConfirmedAt);
  if (!Number.isFinite(now.getTime()) || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(review.memberConfirmedAt)
      || !Number.isFinite(confirmed) || confirmed > now.getTime() || !review.rulesVersion.trim()) {
    return blocked("scope_confirmation_invalid");
  }
  const keys = holdings.positions.map(p => p.positionKey);
  if (keys.some(k => !k.trim()) || new Set(keys).size !== keys.length) return blocked("canonical_position_identity_invalid");
  const assignedKeys = review.assignments.map(a => a.positionKey);
  if (new Set(assignedKeys).size !== assignedKeys.length) return blocked("duplicate_scope_assignment");
  const canonicalKeys = new Set(keys);
  if (assignedKeys.some(k => !canonicalKeys.has(k))) return blocked("scope_contains_foreign_position");
  if (assignedKeys.length !== keys.length) return blocked("scope_assignment_incomplete");
  if (review.assignments.some(a => a.use !== "allocatable" && a.use !== "excluded")) {
    return blocked("scope_contains_unknown_use");
  }
  const includedKeys = new Set(review.assignments.filter(a => a.use === "allocatable").map(a => a.positionKey));
  if (!includedKeys.size) return blocked("scope_has_no_allocatable_assets");
  // Preserve snapshot order and canonical position data; do not mutate or normalize amounts.
  const positions = holdings.positions.filter(p => includedKeys.has(p.positionKey));
  return {
    status: "ready",
    holdings: { id: holdings.id, version: holdings.version, positions },
    denominator: {
      kind: "allocatable_investment_assets",
      holdingVersionId: holdings.id,
      holdingVersion: holdings.version,
      rulesVersion: review.rulesVersion,
      memberConfirmedAt: review.memberConfirmedAt,
      includedPositionKeys: positions.map(p => p.positionKey),
      excludedPositionKeys: keys.filter(k => !includedKeys.has(k)),
    },
  };
}
