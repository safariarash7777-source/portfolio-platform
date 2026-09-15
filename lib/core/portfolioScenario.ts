/** Single-period, long-only scenario arithmetic. Inputs are assumptions, not forecasts.
 * No rebalancing, leverage, fees, tax or external cash flows during the period.
 * Returns and inflation must cover the SAME period; no annualisation is inferred.
 */
export interface ScenarioHolding {
  id: string;
  weightPct: number;
  /** null means unknown, never zero. Zero-weight holdings need no assumption. */
  returnPct: number | null;
}

export interface PortfolioScenarioInput {
  initialValue: number;
  holdings: readonly ScenarioHolding[];
  /** Optional change in the price level over the same scenario period. */
  inflationPct?: number | null;
}

export type PortfolioScenarioResult =
  | { status: "invalid"; errors: string[] }
  | { status: "incomplete"; missingIds: string[]; coveredWeightPct: number }
  | {
      status: "complete";
      returnPct: number;
      finalValue: number;
      profitLoss: number;
      realReturnPct: number | null;
      contributions: { id: string; contributionPctPoints: number; profitLoss: number; finalValue: number; finalWeightPct: number | null }[];
    };

export function evaluatePortfolioScenario(input: PortfolioScenarioInput): PortfolioScenarioResult {
  const errors: string[] = [];
  if (!Number.isFinite(input.initialValue) || input.initialValue <= 0) errors.push("initial-value");
  if (!input.holdings.length) errors.push("empty-holdings");
  const ids = new Set<string>();
  for (const h of input.holdings) {
    if (!h.id.trim() || ids.has(h.id)) errors.push("holding-id");
    ids.add(h.id);
    if (!Number.isFinite(h.weightPct) || h.weightPct < 0 || h.weightPct > 100) errors.push("weight");
    if (h.returnPct !== null && (!Number.isFinite(h.returnPct) || h.returnPct < -100)) errors.push("return");
  }
  const weightSum = input.holdings.reduce((sum, h) => sum + h.weightPct, 0);
  // Only floating point noise is tolerated; never silently normalise a partial portfolio.
  if (Math.abs(weightSum - 100) > 1e-8) errors.push("weight-total");
  const inflation = input.inflationPct;
  if (inflation != null && (!Number.isFinite(inflation) || inflation <= -100)) errors.push("inflation");
  if (errors.length) return { status: "invalid", errors: [...new Set(errors)] };

  const missing = input.holdings.filter(h => h.weightPct > 0 && h.returnPct === null);
  if (missing.length) return {
    status: "incomplete",
    missingIds: missing.map(h => h.id),
    coveredWeightPct: input.holdings.reduce((sum, h) => sum + (h.returnPct === null ? 0 : h.weightPct), 0),
  };

  const rows = input.holdings.map(h => {
    const value = input.initialValue * (h.weightPct / 100);
    const contributionPctPoints = (h.weightPct / 100) * (h.returnPct ?? 0);
    const profitLoss = value * ((h.returnPct ?? 0) / 100);
    return { id: h.id, contributionPctPoints, profitLoss, finalValue: value + profitLoss };
  });
  const finalValue = rows.reduce((sum, h) => sum + h.finalValue, 0);
  const returnPct = rows.reduce((sum, h) => sum + h.contributionPctPoints, 0);
  const realReturnPct = inflation == null ? null : ((1 + returnPct / 100) / (1 + inflation / 100) - 1) * 100;
  const contributions = rows.map(h => ({ ...h, finalWeightPct: finalValue === 0 ? null : h.finalValue / finalValue * 100 }));
  const numbers = [finalValue, returnPct, realReturnPct ?? 0, ...contributions.flatMap(h => [h.profitLoss, h.finalValue, h.contributionPctPoints, h.finalWeightPct ?? 0])];
  if (!numbers.every(Number.isFinite)) return { status: "invalid", errors: ["numeric-overflow"] };
  return { status: "complete", returnPct, finalValue, profitLoss: finalValue - input.initialValue, realReturnPct, contributions };
}
