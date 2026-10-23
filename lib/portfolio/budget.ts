import { buildCashFlow, type CashFlowInput, type CashFlowBasis, type CashFlowSource } from "./cashFlow";
import { dateInput } from "./financialInput";

export interface BudgetAmount { knownToman: number | null; totalToman: number | null }
export interface BudgetRow {
  kind: "income" | "expense"; category: string | null;
  planned: BudgetAmount; actual: BudgetAmount;
  /** Expense: planned minus actual. Income: actual minus planned. */
  differenceToman: number | null;
  sources: CashFlowSource[];
}
export interface BudgetReport {
  period: CashFlowInput["period"] | null;
  plannedState: ReturnType<typeof buildCashFlow>["planned"]["state"];
  actualState: ReturnType<typeof buildCashFlow>["actual"]["state"];
  rows: BudgetRow[]; totals: BudgetRow[];
  missingCategory: boolean;
}
const exactDifference = (a: number | null, b: number | null): number | null => {
  if (a === null || b === null) return null;
  const result = BigInt(a) - BigInt(b);
  return result > BigInt(Number.MAX_SAFE_INTEGER) || result < -BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(result);
};
const categoryOf = (category: string | null) => category?.trim() || null;

/** Read-only projection of the selected cash-flow snapshot, never a second budget ledger.
 * Reuse canonical cash-flow validation and arithmetic. No transfer is income/expense.
 * Missing category prevents definitive category comparisons, but not valid overall totals.
 */
export function buildBudget(input: CashFlowInput): BudgetReport {
  const counts = new Map<string, number>();
  for (const entry of input.entries) if (entry.ownerId === input.scope.ownerId) counts.set(entry.entryKey, (counts.get(entry.entryKey) ?? 0) + 1);
  const entries = input.entries.filter(entry => entry.kind !== "transfer").map(entry => ({ ...entry,
    // Filtering categories must not turn a duplicate across categories/bases into a valid row.
    entryKey: (counts.get(entry.entryKey) ?? 0) > 1 ? "" : entry.entryKey,
  }));
  const report = buildCashFlow({ ...input, entries });
  const result: BudgetReport = { period: report.period, plannedState: report.planned.state, actualState: report.actual.state, rows: [], totals: [], missingCategory: false };
  if (!report.period || ["invalid", "unavailable"].includes(report.planned.state)) return result;
  const period = report.period;
  const selected = entries.filter(entry => {
    if (entry.ownerId !== input.scope.ownerId || !input.scope.accountKeys.includes(entry.accountKey)) return false;
    try { const date = dateInput(entry.occurredOn); return date >= period.startOn && date <= period.endOn; }
    catch { return true; } // Undated records remain visible as incomplete, never silently disappear.
  });
  result.missingCategory = selected.some(entry => categoryOf(entry.category) === null);
  const categoryComplete = (basis: CashFlowBasis) => !selected.some(entry => entry.basis === basis && categoryOf(entry.category) === null);
  const makeRow = (kind: BudgetRow["kind"], category?: string | null): BudgetRow => {
    const matching = selected.filter(entry => entry.kind === kind && (category === undefined || categoryOf(entry.category) === category));
    const sub = buildCashFlow({ ...input, entries: matching });
    const amount = (basis: CashFlowBasis): BudgetAmount => {
      const knownToman = kind === "income" ? sub[basis].incomeKnown : sub[basis].expenseKnown;
      const complete = report[basis].state === "complete" && sub[basis].state === "complete" && (category === undefined || categoryComplete(basis));
      // Empty categories are only zero when the whole lane explicitly has complete coverage.
      return { knownToman: knownToman === 0 && matching.filter(entry => entry.basis === basis).length === 0 && !complete ? null : knownToman,
        totalToman: complete ? knownToman : null };
    };
    const planned = amount("planned"), actual = amount("actual");
    const sources = [...new Map(matching.filter(entry => entry.source !== null).map(entry => [JSON.stringify(entry.source), entry.source!])).values()];
    return { kind, category: category ?? null, planned, actual, sources,
      differenceToman: kind === "expense" ? exactDifference(planned.totalToman, actual.totalToman) : exactDifference(actual.totalToman, planned.totalToman) };
  };
  for (const kind of ["income", "expense"] as const) {
    result.totals.push(makeRow(kind));
    const categories = [...new Set(selected.filter(entry => entry.kind === kind).map(entry => categoryOf(entry.category)))];
    for (const category of categories) result.rows.push(makeRow(kind, category));
  }
  return result;
}
