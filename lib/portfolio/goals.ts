/** Nominal goals are declarations, not an asset ledger or a return forecast. */
export interface Goal {
 goalKey: string; title: string; targetAmountToman: number; targetOn: string;
 declaredSavedToman: number | null; source: { label: string; observedOn: string } | null; note: string | null;
}
export function goalProgress(goal: Goal): { remainingToman: number | null; progressPercent: number | null } {
 const saved = goal.declaredSavedToman, target = goal.targetAmountToman;
 if (!Number.isSafeInteger(target) || target <= 0 || saved === null || !Number.isSafeInteger(saved) || saved < 0 || !goal.source) return { remainingToman: null, progressPercent: null };
 // Cap display at completion; divide before multiplying to avoid integer overflow.
 return { remainingToman: Math.max(0, target - saved), progressPercent: Math.min(1, saved / target) * 100 };
}
