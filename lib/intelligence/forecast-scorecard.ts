import { dateInput } from '../portfolio/financialInput';

/** Offline evaluation only. Caller-supplied receipts do not authenticate storage or sources. */
export interface ForecastTarget {
  issuerId: string;
  metric: string;
  unit: string;
  scope: string;
  periodStart: string;
  periodEnd: string;
  horizon: string;
}
export interface ForecastEvaluation {
  id: string;
  target: ForecastTarget;
  forecast: number | null;
  baseline: number | null;
  baselineVersion: string;
  modelVersion: string;
  cutoff: string;
  issuedAt: string;
  recordedAt: string;
  forecastReceipt: string;
  inputs: readonly { evidenceRef: string; knownAt: string }[];
  actual: {
    target: ForecastTarget;
    value: number | null;
    publishedAt: string;
    observedAt: string;
    evidenceRef: string;
  } | null;
}
const nonempty = (value: string) => typeof value === 'string' && value.trim().length > 0;
function instant(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  try { dateInput(value.slice(0, 10)); } catch { return NaN; }
  return Date.parse(value);
}
function day(value: string): number {
  try { dateInput(value); } catch { return NaN; }
  return Date.parse(`${value}T00:00:00Z`);
}
function validTarget(target: ForecastTarget): boolean {
  return [target.issuerId, target.metric, target.unit, target.scope, target.horizon].every(nonempty)
    && Number.isFinite(day(target.periodStart)) && Number.isFinite(day(target.periodEnd))
    && day(target.periodStart) <= day(target.periodEnd);
}
function targetKey(target: ForecastTarget): string {
  return JSON.stringify([target.issuerId, target.metric, target.unit, target.scope,
    target.periodStart, target.periodEnd, target.horizon]);
}
const numeric = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;

/** No pricing, recommendation, model invocation or implied quality/rollout approval. */
export function buildForecastScorecard(rows: readonly ForecastEvaluation[], asOf: string) {
  const now = instant(asOf);
  if (!Number.isFinite(now) || rows.length > 10000) throw new Error('invalid_scorecard_options');
  const counts = new Map<string, number>();
  const targets = new Map<string, number>();
  for (const row of rows) {
    // A future/undated revision must not change an earlier evaluation's sample.
    const recorded = instant(row.recordedAt);
    if (!Number.isFinite(recorded) || recorded > now) continue;
    counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
    // Revisions or repeated evaluations of one target cannot inflate the sample.
    const key = targetKey(row.target);
    targets.set(key, (targets.get(key) ?? 0) + 1);
  }
  const excluded: Array<{ id: string; reason: string }> = [];
  const groups = new Map<string, {
    issuerId: string; metric: string; unit: string; scope: string; horizon: string;
    modelVersion: string; baselineVersion: string;
    samples: number; modelMae: number; baselineMae: number;
  }>();
  for (const row of rows) {
    let reason: string | null = null;
    const cutoff = instant(row.cutoff), issued = instant(row.issuedAt), recorded = instant(row.recordedAt);
    const targetEndExclusive = day(row.target.periodEnd) + 86400000;
    const actual = row.actual;
    if (!Number.isFinite(recorded) || recorded > now) reason = 'invalid_forecast_chronology';
    else if (!nonempty(row.id) || counts.get(row.id)! > 1) reason = 'duplicate_or_missing_id';
    else if (!validTarget(row.target)) reason = 'invalid_target';
    else if (targets.get(targetKey(row.target))! > 1) reason = 'ambiguous_target_revision';
    else if (![row.forecastReceipt, row.modelVersion, row.baselineVersion].every(nonempty)
      || !row.inputs.length || row.inputs.length > 1000
      || row.inputs.some(input => !nonempty(input.evidenceRef))) reason = 'missing_provenance';
    else if (![cutoff, issued, recorded].every(Number.isFinite)
      || cutoff > issued || issued > recorded || recorded > now
      || recorded >= targetEndExclusive) reason = 'invalid_forecast_chronology';
    else if (row.inputs.some(input => !Number.isFinite(instant(input.knownAt))
      || instant(input.knownAt) > cutoff)) reason = 'input_after_cutoff';
    else if (!actual) reason = 'actual_unavailable';
    else if (!validTarget(actual.target) || targetKey(actual.target) !== targetKey(row.target)) reason = 'incomparable_actual';
    else if (!nonempty(actual.evidenceRef)) reason = 'missing_actual_provenance';
    else {
      const published = instant(actual.publishedAt), observed = instant(actual.observedAt);
      if (![published, observed].every(Number.isFinite)
        || published < targetEndExclusive || published > observed || observed > now) reason = 'invalid_actual_chronology';
      else if (!numeric(row.forecast) || !numeric(row.baseline) || !numeric(actual.value)) reason = 'unknown_or_unsafe_value';
    }
    if (reason) { excluded.push({ id: row.id, reason }); continue; }
    const modelError = Math.abs(row.forecast! - actual!.value!);
    const baselineError = Math.abs(row.baseline! - actual!.value!);
    if (!numeric(modelError) || !numeric(baselineError)) {
      excluded.push({ id: row.id, reason: 'unsafe_error' }); continue;
    }
    const { issuerId, metric, unit, scope, horizon } = row.target;
    const key = JSON.stringify([issuerId, metric, unit, scope, horizon, row.modelVersion, row.baselineVersion]);
    const group = groups.get(key) ?? { issuerId, metric, unit, scope, horizon,
      modelVersion: row.modelVersion, baselineVersion: row.baselineVersion,
      samples: 0, modelMae: 0, baselineMae: 0 };
    group.samples += 1;
    // Incremental means avoid overflow from summing many large observations.
    group.modelMae += (modelError - group.modelMae) / group.samples;
    group.baselineMae += (baselineError - group.baselineMae) / group.samples;
    groups.set(key, group);
  }
  return {
    asOf, supplied: rows.length, accepted: rows.length - excluded.length, excluded,
    groups: [...groups.values()].map(group => ({ ...group,
      // Zero-error baseline has no meaningful ratio; do not return Infinity/zero skill.
      relativeMaeImprovement: group.baselineMae === 0 ? null
        : Number.isFinite(1 - group.modelMae / group.baselineMae) ? 1 - group.modelMae / group.baselineMae : null,
    })),
    sourceTruthVerified: false as const,
    receiptAuthenticityVerified: false as const,
    rolloutAuthorized: false as const,
  };
}
