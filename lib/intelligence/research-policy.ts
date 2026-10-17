import { createHash } from 'node:crypto';

/** Owner selected hourly deep research on 2026-10-17. No paid fallback. */
export const RESEARCH_POLICY = Object.freeze({
  version: 'hourly-deep-v1', provider: 'openai-codex', model: 'gpt-6.1-sol',
  effort: 'high', maxTurns: 1, runSeconds: 180, timeoutMs: 210000,
  maxAttemptsRollingDay: 24,
});
export function researchRunDigest(observations: unknown, now: number): string {
  if (!Number.isFinite(now)) throw new Error('invalid_run_clock');
  return createHash('sha256').update(JSON.stringify({ contract: RESEARCH_POLICY.version,
    model: RESEARCH_POLICY.model, effort: RESEARCH_POLICY.effort,
    hour: Math.floor(now / 3600000), observations })).digest('hex');
}
export function inferenceAdmission(entries: Array<{ at: string }>, now: number): 'allowed' | 'hour_limit' | 'day_limit' | 'invalid_ledger' {
  if (!Number.isFinite(now)) return 'invalid_ledger';
  const dates = entries.map(e => Date.parse(e.at));
  if (dates.some(t => !Number.isFinite(t) || t > now + 120000)) return 'invalid_ledger';
  if (dates.filter(t => now - t < 86400000).length >= RESEARCH_POLICY.maxAttemptsRollingDay) return 'day_limit';
  if (dates.some(t => Math.floor(t / 3600000) === Math.floor(now / 3600000))) return 'hour_limit';
  return 'allowed';
}
