import type { HoldingPosition } from "./contracts";
import type { Currency, DebtKind } from "./financialInput";
import { valuePositions } from "./valuation";
import type { SymbolHistoryRow } from "./prices";
export interface DebtPosition {
  debt_key: string; title: string; kind: DebtKind; balance_toman: number; currency: Currency;
  balance_as_of: string; next_installment_toman: number | null; next_due_on: string | null; note: string | null;
}
export function positionFromStored(p: Record<string, unknown>): HoldingPosition {
  return { positionKey: String(p.position_key), symbol: p.symbol as string | null, manualLabel: p.manual_label as string | null,
    assetClass: String(p.asset_class), qty: p.qty === null ? null : Number(p.qty), unit: String(p.unit),
    costBasis: p.cost_basis === null ? null : Number(p.cost_basis), asOf: String(p.as_of), title: p.title as string | null,
    ownershipPct: Number(p.ownership_pct), valuationMode: p.valuation_mode as HoldingPosition["valuationMode"],
    declaredValue: p.declared_value === null ? null : Number(p.declared_value), valuationSource: p.valuation_source as string | null,
    valuationAsOf: p.valuation_as_of as string | null, valuationStatus: p.valuation_status as HoldingPosition["valuationStatus"] };
}
export function debtFromStored(d: Record<string, unknown>): DebtPosition {
  return { ...d, balance_toman: Number(d.balance_toman), next_installment_toman: d.next_installment_toman === null ? null : Number(d.next_installment_toman) } as unknown as DebtPosition;
}
/** Private amounts remain in this deterministic calculation and authenticated UI; no LLM I/O. */
export function buildBalanceSheet(input: { positions: readonly HoldingPosition[]; debts: readonly DebtPosition[]; priceRows: readonly SymbolHistoryRow[]; now: Date; recorded: boolean; assetsReady: boolean; debtsReady: boolean; pricesFailed?: boolean }) {
  const valuation = valuePositions(input.positions, input.priceRows, input.now);
  const assetValue = input.assetsReady && input.recorded ? (input.positions.length === 0 ? 0 : valuation.subtotal) : null;
  const validDebts = input.debts.every(d => Number.isSafeInteger(d.balance_toman) && d.balance_toman >= 0 && Number.isFinite(Date.parse(d.balance_as_of)));
  const sum = input.debts.reduce((s, d) => s + d.balance_toman, 0);
  const debtValue = input.debtsReady && input.recorded && validDebts && Number.isSafeInteger(sum) ? sum : null;
  const difference = assetValue === null || debtValue === null ? null : assetValue - debtValue;
  const netWorth = difference !== null && Number.isSafeInteger(difference) ? difference : null;
  const partial = !input.recorded || !input.assetsReady || !input.debtsReady || !!input.pricesFailed || valuation.gaps.length > 0 || assetValue === null || debtValue === null || netWorth === null;
  return { valuation, assetValue, debtValue, netWorth, partial, estimated: valuation.estimatedCount > 0 };
}
