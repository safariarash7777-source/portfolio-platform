import { dateInput, moneyInput, type Currency } from "./financialInput";

export type CashFlowBasis = "planned" | "actual";
export interface CashFlowSource { label: string; observedOn: string }
export interface CashFlowPeriod { startOn: string; endOn: string }
export interface CashFlowScope { ownerId: string; accountKeys: readonly string[] }
interface EntryBase {
  entryKey: string; ownerId: string; basis: CashFlowBasis;
  occurredOn: string | null; amountToman: number | null; source: CashFlowSource | null;
  category: string | null; note: string | null;
}
/** One transfer event, not two expense/income legs. Account keys are cash-scope references, not assets. */
export type CashFlowEntry = EntryBase & (
  { kind: "income" | "expense"; accountKey: string }
  | { kind: "transfer"; fromAccountKey: string; toAccountKey: string }
);
export interface CashFlowCoverage {
  status: "unknown" | "partial" | "complete";
  /** Complete is an explicit assertion covering this entire owner/account scope and period. */
  source: CashFlowSource | null;
}
export interface CashFlowInput {
  period: CashFlowPeriod; scope: CashFlowScope; readState: "ready" | "unavailable";
  entries: readonly CashFlowEntry[];
  coverage: Record<CashFlowBasis, CashFlowCoverage>;
  /** Balance at the START of startOn, not a transaction and not automatically zero. */
  opening: { amountToman: number | null; atStartOn: string | null; source: CashFlowSource | null } | null;
}
export type CashFlowIssue = "invalid_period" | "invalid_scope" | "read_unavailable" | "coverage_unknown"
  | "coverage_partial" | "coverage_source_missing" | "entry_key_invalid" | "duplicate_entry"
  | "entry_date_invalid" | "entry_account_invalid" | "entry_amount_invalid" | "entry_source_missing" | "transfer_invalid" | "unsafe_total";
export interface CashFlowLane {
  state: "complete" | "partial" | "unknown" | "unavailable" | "invalid";
  /** Known records only; null means no known contribution, not zero activity. */
  incomeKnown: number | null; expenseKnown: number | null;
  transferInKnown: number | null; transferOutKnown: number | null;
  knownNet: number | null;
  /** Definitive only with explicit complete coverage and valid, sourced records. */
  netToman: number | null; closingToman: number | null;
  closingState: "known" | "opening_unknown" | "opening_invalid" | "flow_partial" | "unsafe";
  includedEntries: number; internalTransfers: number; issues: CashFlowIssue[];
}
export interface CashFlowReport {
  contractVersion: 1; period: CashFlowPeriod | null; planned: CashFlowLane; actual: CashFlowLane;
  opening: { state: "known" | "unknown" | "invalid"; amountToman: number | null };
  actualMinusPlanned: number | null;
}

/** Reuse the existing single IRR→IRT boundary; unknown is allowed only explicitly. */
export function cashFlowAmount(value: unknown, currency: Currency): number | null {
  return value === null ? null : moneyInput(value, currency);
}
function day(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return dateInput(value); } catch { return null; }
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function sourced(value: CashFlowSource | null): boolean {
  return value !== null && text(value.label) && !["unknown", "نامشخص", "-", "—"].includes(value.label.trim().toLowerCase()) && day(value.observedOn) !== null;
}
const safeLimit = BigInt(Number.MAX_SAFE_INTEGER);
function exact(value: bigint): number | null { return value <= safeLimit && value >= -safeLimit ? Number(value) : null; }
function blank(state: CashFlowLane["state"], issue: CashFlowIssue): CashFlowLane {
  return { state, incomeKnown: null, expenseKnown: null, transferInKnown: null, transferOutKnown: null,
    knownNet: null, netToman: null, closingToman: null, closingState: "flow_partial", includedEntries: 0, internalTransfers: 0, issues: [issue] };
}

/** Pure dated cash-flow calculation; this is neither persistence nor an authorization boundary. */
export function buildCashFlow(input: CashFlowInput): CashFlowReport {
  const startOn = day(input.period.startOn), endOn = day(input.period.endOn);
  const period = startOn && endOn && startOn <= endOn ? { startOn, endOn } : null;
  const scopeValid = text(input.scope.ownerId) && input.scope.accountKeys.length > 0
    && input.scope.accountKeys.every(text) && new Set(input.scope.accountKeys).size === input.scope.accountKeys.length;
  const blocked = !period ? "invalid_period" : !scopeValid ? "invalid_scope" : input.readState !== "ready" ? "read_unavailable" : null;
  if (blocked) return { contractVersion: 1, period, planned: blank(blocked === "read_unavailable" ? "unavailable" : "invalid", blocked),
    actual: blank(blocked === "read_unavailable" ? "unavailable" : "invalid", blocked), opening: { state: "unknown", amountToman: null }, actualMinusPlanned: null };
  // The guard above establishes a valid period. No dates are converted to instants.
  const selectedPeriod = period!;
  const owned = input.entries.filter(entry => entry.ownerId === input.scope.ownerId);
  const accountKeys = new Set(input.scope.accountKeys);
  const keyCounts = new Map<string, number>();
  for (const entry of owned) keyCounts.set(entry.entryKey, (keyCounts.get(entry.entryKey) ?? 0) + 1);
  const opening = input.opening;
  const openingKnown = opening !== null && Number.isSafeInteger(opening.amountToman)
    && day(opening.atStartOn) === selectedPeriod.startOn && sourced(opening.source);
  const openingState: CashFlowReport["opening"] = opening === null || opening.amountToman === null
    ? { state: "unknown", amountToman: null }
    : openingKnown ? { state: "known", amountToman: opening.amountToman } : { state: "invalid", amountToman: null };

  function lane(basis: CashFlowBasis): CashFlowLane {
    const coverage = input.coverage[basis], issues = new Set<CashFlowIssue>();
    if (coverage.status === "unknown") issues.add("coverage_unknown");
    if (coverage.status === "partial") issues.add("coverage_partial");
    if (coverage.status === "complete" && !sourced(coverage.source)) issues.add("coverage_source_missing");
    const totals = { income: BigInt(0), expense: BigInt(0), transferIn: BigInt(0), transferOut: BigInt(0) };
    const seen = { income: false, expense: false, transferIn: false, transferOut: false };
    let includedEntries = 0, internalTransfers = 0, knownContributions = 0;
    for (const entry of owned) {
      if (entry.basis !== basis) continue;
      const occurredOn = day(entry.occurredOn);
      if (occurredOn && (occurredOn < selectedPeriod.startOn || occurredOn > selectedPeriod.endOn)) continue;
      let bucket: keyof typeof totals | "internal";
      if (entry.kind === "transfer") {
        if (!text(entry.fromAccountKey) || !text(entry.toAccountKey)) { issues.add("transfer_invalid"); continue; }
        const from = accountKeys.has(entry.fromAccountKey), to = accountKeys.has(entry.toAccountKey);
        if (!from && !to) continue;
        if (entry.fromAccountKey === entry.toAccountKey) {
          issues.add("transfer_invalid"); continue;
        }
        bucket = from && to ? "internal" : to ? "transferIn" : "transferOut";
      } else {
        if (!text(entry.accountKey)) { issues.add("entry_account_invalid"); continue; }
        if (!accountKeys.has(entry.accountKey)) continue;
        bucket = entry.kind;
      }
      if (!occurredOn) { issues.add("entry_date_invalid"); continue; }
      if (!text(entry.entryKey)) { issues.add("entry_key_invalid"); continue; }
      if ((keyCounts.get(entry.entryKey) ?? 0) > 1) { issues.add("duplicate_entry"); continue; }
      includedEntries++;
      if (!sourced(entry.source)) issues.add("entry_source_missing");
      const amountKnown = typeof entry.amountToman === "number" && Number.isSafeInteger(entry.amountToman) && entry.amountToman >= 0;
      if (!amountKnown) issues.add("entry_amount_invalid");
      if (bucket === "internal") { internalTransfers++; knownContributions++; continue; }
      if (!amountKnown) continue;
      totals[bucket] += BigInt(entry.amountToman!); seen[bucket] = true; knownContributions++;
    }
    const net = exact(totals.income - totals.expense + totals.transferIn - totals.transferOut);
    if (Object.values(totals).some(value => exact(value) === null) || net === null) issues.add("unsafe_total");
    const complete = coverage.status === "complete" && issues.size === 0;
    const state = complete ? "complete" : coverage.status === "unknown" && includedEntries === 0 && issues.size === 1 ? "unknown" : "partial";
    const closing = complete && net !== null && openingState.state === "known" ? exact(BigInt(openingState.amountToman!) + BigInt(net)) : null;
    return { state, incomeKnown: seen.income || complete ? exact(totals.income) : null,
      expenseKnown: seen.expense || complete ? exact(totals.expense) : null,
      transferInKnown: seen.transferIn || complete ? exact(totals.transferIn) : null,
      transferOutKnown: seen.transferOut || complete ? exact(totals.transferOut) : null,
      knownNet: knownContributions > 0 || complete ? net : null, netToman: complete ? net : null,
      closingToman: closing, closingState: !complete ? "flow_partial" : openingState.state === "unknown" ? "opening_unknown"
        : openingState.state === "invalid" ? "opening_invalid" : closing === null ? "unsafe" : "known",
      includedEntries, internalTransfers, issues: [...issues] };
  }
  const planned = lane("planned"), actual = lane("actual");
  return { contractVersion: 1, period: selectedPeriod, planned, actual, opening: openingState,
    actualMinusPlanned: planned.netToman !== null && actual.netToman !== null ? exact(BigInt(actual.netToman) - BigInt(planned.netToman)) : null };
}
