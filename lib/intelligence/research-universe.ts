/** Pure point-in-time ranking. No collector, inference or trading side effects. */
export interface ResearchUniverseRow {
  issuerId: string;
  symbol: string;
  securityType: 'ordinary-share' | 'other' | 'unknown';
  /** Issuer total equity market capitalization, not turnover or free-float value. */
  marketCapRial: string | null;
  unit: 'IRR' | null;
  source: string;
  sourceAt: string | null;
  observedAt: string | null;
}
export interface ResearchUniverseOptions {
  asOf: string;
  target: number;
  maxAgeMs: number;
}
const instant = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function selectResearchUniverse(rows: readonly ResearchUniverseRow[], options: ResearchUniverseOptions) {
  const cutoff = instant(options.asOf);
  if (!Number.isFinite(cutoff) || !Number.isInteger(options.target) || options.target < 30 || options.target > 50
    || !Number.isFinite(options.maxAgeMs) || options.maxAgeMs <= 0) throw new Error('invalid_universe_options');
  const excluded: Array<{ issuerId: string; reason: string }> = [];
  const groups = new Map<string, ResearchUniverseRow[]>();
  const unknownTime = new Set<string>();
  for (const row of rows) {
    if (!row.issuerId.trim()) { excluded.push({ issuerId: row.issuerId, reason: 'missing_identity' }); continue; }
    const observed = instant(row.observedAt);
    if (!Number.isFinite(observed)) { unknownTime.add(row.issuerId); excluded.push({ issuerId: row.issuerId, reason: 'unknown_observation_time' }); continue; }
    if (observed > cutoff) continue; // A later revision cannot affect an earlier decision.
    groups.set(row.issuerId, [...(groups.get(row.issuerId) ?? []), row]);
  }
  const candidates: ResearchUniverseRow[] = [];
  for (const [issuerId, history] of groups) {
    if (unknownTime.has(issuerId)) continue; // Cannot date a potentially newer revision.
    const latest = Math.max(...history.map(row => instant(row.observedAt)));
    const versions = history.filter(row => instant(row.observedAt) === latest);
    const row = versions[0];
    let reason: string | null = null;
    // Ambiguous parallel observations are not resolved by input order.
    if (versions.some(item => JSON.stringify(item) !== JSON.stringify(row))) reason = 'conflicting_latest_observation';
    else if (row.securityType !== 'ordinary-share') reason = 'not_verified_ordinary_share';
    else if (!row.symbol.trim() || !row.source.trim()) reason = 'missing_provenance';
    else if (row.unit !== 'IRR' || typeof row.marketCapRial !== 'string' || !/^[1-9]\d*$/.test(row.marketCapRial)) reason = 'invalid_capitalization_or_unit';
    else {
      const sourceAt = instant(row.sourceAt);
      if (!Number.isFinite(sourceAt)) reason = 'unknown_source_time';
      else if (sourceAt > latest) reason = 'source_after_observation';
      else if (cutoff - sourceAt > options.maxAgeMs) reason = 'stale_source';
    }
    if (reason) excluded.push({ issuerId, reason });
    else candidates.push({ ...row });
  }
  candidates.sort((a, b) => {
    const left = BigInt(a.marketCapRial!); const right = BigInt(b.marketCapRial!);
    return left === right ? compareId(a.issuerId, b.issuerId) : left > right ? -1 : 1;
  });
  return {
    asOf: options.asOf, target: options.target,
    // This function cannot certify that the upstream market snapshot covers all issuers.
    scope: 'eligible_observed_issuers' as const,
    selected: candidates.slice(0, options.target).map((row, index) => ({ ...row, rank: index + 1 })),
    eligibleCount: candidates.length, shortfall: Math.max(0, options.target - candidates.length),
    excluded: excluded.sort((a, b) => compareId(a.issuerId, b.issuerId) || compareId(a.reason, b.reason)),
  };
}

