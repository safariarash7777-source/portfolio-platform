import { sourceTime, parseSnapshotQuality } from '../market-quality';
import { dateInput } from '../portfolio/financialInput';
import { selectResearchUniverse, type ResearchUniverseOptions, type ResearchUniverseRow } from './research-universe';

/** Evidence is supplied by a reviewed adapter, never inferred from instrument ISIN. */
export interface IssuerMappingEvidence {
  symbol: string; issuerId: string; securityType: 'ordinary-share';
  validFrom: string; validUntil: string | null; knownAt: string; evidenceRef: string;
}
export interface CapitalizationEvidence {
  unit: 'IRR'; definition: 'issuer-total-equity'; knownAt: string; evidenceRef: string;
}
export interface ResearchCoverageEvidence {
  issuerId: string;
  axis: 'quarterly' | 'monthly' | 'ime';
  /** Count of validated distinct periods after existing unit/scope/canonical gates. */
  periods: number;
  knownAt: string; evidenceRef: string;
}
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  try { dateInput(value.slice(0, 10)); } catch { return null; }
  const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null;
}
function exactCap(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
}
/** Pure inspection of a stored latest payload. Never fetches or substitutes detail-cache rows. */
export function inspectResearchUniverseReadiness(payload: unknown, options: ResearchUniverseOptions, evidence: {
  capitalization: CapitalizationEvidence | null;
  mappings: readonly IssuerMappingEvidence[];
  coverage?: readonly ResearchCoverageEvidence[];
}) {
  // Reuse the ranking contract to validate target/cutoff/age options even for empty input.
  selectResearchUniverse([], options);
  const cutoff = time(options.asOf)!;
  const stored = object(payload);
  const quality = parseSnapshotQuality(stored?.snapshotQuality);
  const family = quality?.families.stocks;
  const observed = family?.receivedAt ?? null;
  const observedAt = observed !== null && observed <= cutoff ? new Date(observed).toISOString() : null;
  const capEvidence = evidence.capitalization;
  const capKnown = time(capEvidence?.knownAt);
  const capVerified = capEvidence?.unit === 'IRR' && capEvidence.definition === 'issuer-total-equity'
    && !!text(capEvidence.evidenceRef) && capKnown !== null && capKnown <= cutoff;
  const rawRows = Array.isArray(stored?.stocks) ? stored.stocks : null;
  const rows = (rawRows ?? []).map((raw: unknown, index: number) => {
    const stock = object(raw);
    const symbol = text(stock?.id);
    const reasons: string[] = [];
    if (!symbol) reasons.push('missing_symbol');
    else if (/[0-9۰-۹٠-٩ح]$/.test(symbol)) reasons.push('quarantined_ticker');
    if (!observedAt) reasons.push('missing_or_future_receipt');
    if (family?.state !== 'received' || family.retained) reasons.push('stock_family_not_freshly_received');
    const source = sourceTime(typeof stock?.sourceDate === 'string' ? stock.sourceDate : null, typeof stock?.sourceTime === 'string' ? stock.sourceTime : null);
    if (source === null) reasons.push('missing_or_invalid_source_clock');
    else if (observed === null || source > observed) reasons.push('source_after_receipt');
    else if (cutoff - source > options.maxAgeMs) reasons.push('stale_source');
    const marketCapRial = exactCap(stock?.marketValue);
    if (marketCapRial === null) reasons.push(typeof stock?.marketValue === 'number' && !Number.isSafeInteger(stock.marketValue) ? 'unsafe_cap_precision' : 'missing_or_invalid_cap');
    if (!capVerified) reasons.push('capitalization_contract_unverified');
    const mappings = evidence.mappings.filter(mapping => {
      const known = time(mapping.knownAt), from = time(mapping.validFrom), until = mapping.validUntil === null ? Infinity : time(mapping.validUntil);
      return symbol !== null && mapping.symbol === symbol && !!text(mapping.issuerId) && !!text(mapping.evidenceRef)
        && mapping.securityType === 'ordinary-share' && known !== null && known <= cutoff && from !== null
        && until !== null && source !== null && from <= source && source < until;
    });
    const mapping = mappings.length === 1 ? mappings[0] : null;
    if (!mapping) reasons.push(mappings.length > 1 ? 'ambiguous_issuer_mapping' : 'issuer_mapping_unverified');
    const candidate: ResearchUniverseRow | null = reasons.length ? null : {
      issuerId: mapping!.issuerId, symbol: symbol!, securityType: 'ordinary-share', marketCapRial, unit: 'IRR',
      source: capEvidence!.evidenceRef, sourceAt: new Date(source!).toISOString(), observedAt,
    };
    return { index, symbol, marketCapRial, issuerId: mapping?.issuerId ?? null, reasons, candidate };
  });
  // Duplicate rows cannot be used to silently resolve a snapshot ambiguity.
  const symbolCounts = new Map<string, number>();
  for (const row of rows) if (row.symbol) symbolCounts.set(row.symbol, (symbolCounts.get(row.symbol) ?? 0) + 1);
  for (const row of rows) if (row.symbol && symbolCounts.get(row.symbol)! > 1) { row.reasons.push('duplicate_snapshot_symbol'); row.candidate = null; }
  const universe = selectResearchUniverse(rows.flatMap(row => row.candidate ? [row.candidate] : []), options);
  const counts: Record<string, number> = {};
  for (const row of rows) for (const reason of row.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
  const pilot = universe.selected.slice(0, 5).map(row => {
    const coverage = (['quarterly', 'monthly', 'ime'] as const).map(axis => {
      const records = (evidence.coverage ?? []).filter(item => item.issuerId === row.issuerId && item.axis === axis);
      const valid = records.length === 1 && Number.isSafeInteger(records[0].periods) && records[0].periods >= 0
        && !!text(records[0].evidenceRef) && time(records[0].knownAt) !== null && time(records[0].knownAt)! <= cutoff;
      return { axis, validatedPeriods: valid ? records[0].periods : null, evidenceRef: valid ? records[0].evidenceRef : null };
    });
    return { issuerId: row.issuerId, symbol: row.symbol, rank: row.rank, coverage, forecastReady: false as const };
  });
  return { snapshotState: rawRows === null ? 'unavailable' as const : 'inspected' as const,
    scope: 'stored_snapshot_readiness_only' as const, rows, reasonCounts: counts, universe, pilot,
    pilotShortfall: Math.max(0, 5 - pilot.length) };
}
