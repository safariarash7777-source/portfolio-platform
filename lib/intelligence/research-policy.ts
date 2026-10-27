import { createHash } from 'node:crypto';
import type { ResearchObservation } from './research-agent';
import type { ResearchProvenance } from './research-inputs';

/** Owner selected hourly deep research on 2026-10-17. No paid fallback. */
export const RESEARCH_POLICY = Object.freeze({
  version: 'hourly-deep-v1', provider: 'openai-codex', model: 'gpt-6.1-sol',
  effort: 'high', maxTurns: 1, runSeconds: 180, timeoutMs: 210000,
  maxAttemptsRollingDay: 24,
});
export const REQUEST_IDENTITY_VERSION = 'source-bound-research-v1';
/** A new key scheme must not silently make historical attempts retryable. */
export function requestIdentityAdmission(state: { version: number; entries: Record<string, unknown>; attempts?: Array<{ at: string }>; requestIdentity?: string }): 'allowed' | 'legacy_identity_requires_review' | 'invalid_ledger' {
  if (state.version !== 2 || !Array.isArray(state.attempts)) return 'invalid_ledger';
  if (state.requestIdentity === REQUEST_IDENTITY_VERSION) return 'allowed';
  if (state.requestIdentity !== undefined || Object.keys(state.entries).length || state.attempts.length) return 'legacy_identity_requires_review';
  return 'allowed';
}
/** Only an explicitly reviewed alias to a known stored outcome can reuse a legacy key. */
export function researchDestinationDigest(requestDigest: string, state: { requestAliases?: Record<string, string>; entries: Record<string, { status: string; id?: string }> }): string {
  const target = state.requestAliases?.[requestDigest];
  if (target === undefined) return requestDigest;
  if (!/^[a-f0-9]{64}$/.test(target) || target === requestDigest || state.requestAliases?.[target] !== undefined ||
      state.entries[target]?.status !== 'stored' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(state.entries[target].id ?? '')) {
    throw new Error('invalid_reviewed_request_alias');
  }
  return target;
}
export function researchRunDigest(observations: unknown, now: number): string {
  if (!Number.isFinite(now)) throw new Error('invalid_run_clock');
  return createHash('sha256').update(JSON.stringify({ contract: RESEARCH_POLICY.version,
    model: RESEARCH_POLICY.model, effort: RESEARCH_POLICY.effort,
    hour: Math.floor(now / 3600000), observations })).digest('hex');
}
/** New request contract. Read time is a receipt, never a new source version.
 * Keep researchRunDigest above unchanged so historical hourly keys remain interpretable.
 */
export function researchRequestDigest(observations: ResearchObservation[], provenance: ResearchProvenance[], instructions: string): string {
  if (!observations.length || observations.length !== provenance.length || !instructions.trim()) throw new Error('invalid_request_identity');
  const sources = provenance.map((source, index) => {
    if (observations[index].id !== `codal:${source.reportId}` || source.evidence !== `E${index + 1}` ||
        observations[index].observedAt !== source.publishedAt || observations[index].sourceUrl !== source.sourceUrl) {
      throw new Error('unbound_request_source');
    }
    // Select fields explicitly: adding a transport receipt must not invalidate a request.
    return { evidence: source.evidence, symbol: source.symbol, reportId: source.reportId,
      sourceUrl: source.sourceUrl, periodEnd: source.periodEnd, periodMonths: source.periodMonths,
      publishedAt: source.publishedAt, capturedAt: source.capturedAt, unit: source.unit, scope: source.scope };
  });
  return createHash('sha256').update(JSON.stringify({ contract: REQUEST_IDENTITY_VERSION,
    model: RESEARCH_POLICY.model, effort: RESEARCH_POLICY.effort, instructions, observations, sources })).digest('hex');
}
export function inferenceAdmission(entries: Array<{ at: string }>, now: number): 'allowed' | 'hour_limit' | 'day_limit' | 'invalid_ledger' {
  if (!Number.isFinite(now)) return 'invalid_ledger';
  const dates = entries.map(e => Date.parse(e.at));
  if (dates.some(t => !Number.isFinite(t) || t > now + 120000)) return 'invalid_ledger';
  if (dates.filter(t => now - t < 86400000).length >= RESEARCH_POLICY.maxAttemptsRollingDay) return 'day_limit';
  if (dates.some(t => Math.floor(t / 3600000) === Math.floor(now / 3600000))) return 'hour_limit';
  return 'allowed';
}
