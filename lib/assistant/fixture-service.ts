/** Offline P08 rehearsal only. No HTTP route, network, index or customer storage. */
import { createHash } from 'node:crypto';
import { canReadPublication, type PublicationRow } from '../intelligence/publication';

export const ASSISTANT_FIXTURE_CONTRACT = 'assistant.fixture.v0.1';
export const INTENTS = ['asset-definition', 'weight-definition', 'current-view', 'missing-data', 'source-conflict'] as const;
export type Intent = typeof INTENTS[number];
export type Band = 'low' | 'mid' | 'high' | 'unknown';
export type FixtureContext = { subject: string; cohort: string };
export type FixtureSource = {
  row: PublicationRow;
  current: boolean;
  validFrom: string;
  validUntil: string;
  // Only manually reviewed synthetic text; never raw documents, history or user questions.
  reviewedSentence: string;
  privacyReviewed: boolean;
  intents: readonly Intent[];
  origin: 'education' | 'arash' | 'system';
};
export type Snapshot = { grants: readonly string[]; sources: readonly FixtureSource[] };
export type ProviderPayload = {
  contract: typeof ASSISTANT_FIXTURE_CONTRACT;
  intent: Intent;
  evidence: { token: string; sentence: string }[];
  qualitative: Partial<Record<'coverage' | 'distance', Band>>;
};
export type ProviderReply = { token: string; sentence: string; inputTokens: number; outputTokens: number };
export type FixtureProvider = {
  id: string; model: string;
  generate(payload: ProviderPayload, signal: AbortSignal): Promise<ProviderReply>;
};
export type FixtureControls = {
  enabled(): boolean;
  tokenBudget: number | null;
  deadlineMs: number;
  now(): number;
};
type Dependencies = {
  // A fresh canonical read is required on EACH invocation; no memoized grant.
  resolve(context: FixtureContext): Promise<Snapshot>;
  provider: FixtureProvider;
  controls: FixtureControls;
};
export type FixtureResult = {
  state: 'answered' | 'refer'; reason: string;
  answer?: { text: string; origin: FixtureSource['origin']; version: number; href: string };
  measurement: { provider: string; model: string; promptVersion: string; elapsedMs: number; inputTokens: number | null; outputTokens: number | null; cost: null; dataClass: 'synthetic' };
};
const finiteTime = (s: string) => /^\d{4}-\d\d-\d\dT/.test(s) && Number.isFinite(Date.parse(s));
const fingerprint = (s: FixtureSource) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
function eligible(s: FixtureSource, snapshot: Snapshot, now: number): boolean {
  return s.privacyReviewed === true && s.current === true && canReadPublication(s.row, snapshot.grants)
    && finiteTime(s.validFrom) && finiteTime(s.validUntil)
    && Date.parse(s.validFrom) <= now && now < Date.parse(s.validUntil)
    && s.reviewedSentence.trim().length > 0 && s.reviewedSentence.length <= 2000
    && !/\p{N}/u.test(s.reviewedSentence)
    && s.row.sources.length > 0 && s.row.sources.every(x => /^https:\/\//.test(x.url) && /^\d{4}-\d\d-\d\d$/.test(x.asOf));
}
function projectBands(value: unknown): ProviderPayload['qualitative'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(k => k !== 'coverage' && k !== 'distance')) throw Error('unsafe-bands');
  const output: ProviderPayload['qualitative'] = {};
  for (const key of ['coverage', 'distance'] as const) {
    if (record[key] === undefined) continue;
    if (!['low', 'mid', 'high', 'unknown'].includes(String(record[key]))) throw Error('unsafe-bands');
    output[key] = record[key] as Band;
  }
  return output;
}
/** Request is untrusted. A rawQuestion, raw amounts, history or an extra key rejects the call. */
export async function rehearseAnswer(request: unknown, context: FixtureContext, deps: Dependencies): Promise<FixtureResult> {
  const start = performance.now();
  let usage: Pick<ProviderReply, 'inputTokens' | 'outputTokens'> | null = null;
  const result = (reason: string, answer?: FixtureResult['answer']): FixtureResult => ({
    state: answer ? 'answered' : 'refer', reason, ...(answer ? { answer } : {}),
    measurement: { provider: deps.provider.id, model: deps.provider.model, promptVersion: ASSISTANT_FIXTURE_CONTRACT,
      elapsedMs: performance.now() - start, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      cost: null, dataClass: 'synthetic' },
  });
  const control = deps.controls;
  if (!control.enabled()) return result('stopped');
  if (control.tokenBudget === null || !Number.isSafeInteger(control.tokenBudget) || control.tokenBudget <= 0) return result('budget-unknown');
  if (!Number.isFinite(control.deadlineMs) || control.deadlineMs < 1 || control.deadlineMs > 30000) return result('deadline-invalid');
  if (!request || typeof request !== 'object' || Array.isArray(request)) return result('unsafe-request');
  const r = request as Record<string, unknown>;
  if (Object.keys(r).some(k => k !== 'intent' && k !== 'qualitative') || !INTENTS.includes(r.intent as Intent)) return result('unsafe-request');
  if (r.intent === 'source-conflict') return result('conflicting-evidence');
  let qualitative: ProviderPayload['qualitative'];
  try { qualitative = projectBands(r.qualitative); } catch { return result('unsafe-bands'); }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  try {
    const work = async () => {
      const initial = await deps.resolve(context);
      if (closed) return result('deadline');
      const candidates = initial.sources.filter(s => s.intents.includes(r.intent as Intent) && eligible(s, initial, control.now()));
      if (!candidates.length) return result('no-permitted-evidence');
      if (!control.enabled()) return result('stopped');
      // Opaque tokens and reviewed text only. Identity, source metadata and amounts never copied.
      const evidence = candidates.map((s, i) => ({ token: `e${i}`, sentence: s.reviewedSentence }));
      const fingerprints = candidates.map(fingerprint);
      const payload: ProviderPayload = { contract: ASSISTANT_FIXTURE_CONTRACT, intent: r.intent as Intent, evidence, qualitative };
      // Conservative per-call reservation only, not a durable daily ledger.
      const reservation = JSON.stringify(payload).length + 2000;
      if (reservation > control.tokenBudget!) return result('budget-exhausted');
      const safeCopy = structuredClone(payload);
      safeCopy.evidence.forEach(Object.freeze);
      Object.freeze(safeCopy.evidence); Object.freeze(safeCopy.qualitative); Object.freeze(safeCopy);
      const reply = await deps.provider.generate(safeCopy, controller.signal);
      if (closed) return result('deadline');
      if (!control.enabled()) { controller.abort(); return result('stopped'); }
      if (![reply.inputTokens, reply.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) return result('usage-invalid');
      usage = { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens };
      if (reply.inputTokens + reply.outputTokens > control.tokenBudget!) return result('budget-exceeded');
      const index = evidence.findIndex(e => e.token === reply.token && e.sentence === reply.sentence);
      if (index < 0) return result('unsupported-output');
      const chosen = candidates[index];
      const final = await deps.resolve(context);
      if (closed) return result('deadline');
      if (!control.enabled()) return result('stopped');
      const latest = final.sources.find(s => s.row.id === chosen.row.id && eligible(s, final, control.now()));
      if (!latest || fingerprint(latest) !== fingerprints[index]) return result('authority-changed');
      return result('supported', { text: reply.sentence, origin: latest.origin, version: latest.row.version,
        href: `/publications/${latest.row.id}?cohort=${context.cohort}` });
    };
    const timeout = new Promise<FixtureResult>(resolve => { timer = setTimeout(() => {
      closed = true; controller.abort(); resolve(result('deadline'));
    }, control.deadlineMs); });
    return await Promise.race([work(), timeout]);
  } catch {
    return result('resolver-or-provider-unavailable');
  } finally {
    closed = true;
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

/** Deterministic fixture double, never evidence of a working language model. */
export const extractiveFixtureProvider: FixtureProvider = {
  id: 'fixture', model: 'extractive-v1',
  async generate(payload, signal) {
    if (signal.aborted) throw Error('aborted');
    const first = payload.evidence[0];
    return { token: first.token, sentence: first.sentence, inputTokens: 0, outputTokens: 0 };
  },
};
