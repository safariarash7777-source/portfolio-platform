/** Local subscription worker. No general SSH key, API key or admin JWT needed. */
import { execFile } from 'node:child_process';
import { reconcileResearchState } from './research-reconcile';
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepareResearchPacket, RESEARCH_INSTRUCTIONS, type ResearchDraft } from '../../lib/intelligence/research-agent';
import { prepareCodalResearchInputs, DEFAULT_REPORT_MAX_AGE_MS, type StoredResearchCodalRow, type ResearchProvenance } from '../../lib/intelligence/research-inputs';
import { inferResearch, RESEARCH_MODEL } from './hermes-inference';
import { researchRequestDigest, inferenceAdmission, requestIdentityAdmission, REQUEST_IDENTITY_VERSION, researchDestinationDigest } from '../../lib/intelligence/research-policy';

type Entry = { at: string; status: 'started' | 'ready' | 'stored' | 'failed'; draft?: ResearchDraft; provenance?: ResearchProvenance[]; id?: string };
type State = { version: 1 | 2; entries: Record<string, Entry>; attempts?: Array<{ at: string }>; requestIdentity?: string; requestAliases?: Record<string, string> };
const root = resolve(process.env.PORTFOLIO_RESEARCH_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'PortfolioResearch'));
async function atomic(name: string, value: unknown) {
  await writeFile(join(root, name + '.tmp'), JSON.stringify(value), { mode: 0o600 });
  await rename(join(root, name + '.tmp'), join(root, name));
}
async function bridge<T>(request: unknown): Promise<T> {
  return new Promise((accept, reject) => {
    const child = execFile('ssh', ['-F', 'none', '-T', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes',
      '-i', join(root, 'bridge_ed25519'), 'root@62.60.191.24'],
    { timeout: 60000, maxBuffer: 24 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) return reject(new Error('research_transport_failed'));
      try { const response = JSON.parse(stdout); if (!response.ok) throw new Error(); accept(response.result as T); }
      catch { reject(new Error('invalid_bridge_response')); }
    });
    child.stdin?.end(JSON.stringify(request));
  });
}
async function main() {
  if (process.argv.length !== 3 || !['--run', '--inspect-input', '--reconcile'].includes(process.argv[2])) throw new Error('explicit_worker_mode_required');
  if (process.argv[2] === '--reconcile') {
    const report = await reconcileResearchState(root, bridge);
    console.log(JSON.stringify(report));
    if (report.entries.some(entry => entry.destination === 'unknown')) process.exitCode = 1;
    return;
  }
  await mkdir(root, { recursive: true });
  const lockPath = join(root, 'worker.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch {
    // Do not reclaim a stale/partial lock automatically: competing reclaimers
    // could delete a new lock and duplicate inference. Recovery is explicit.
    let previous: { pid: number };
    try { previous = JSON.parse(await readFile(lockPath, 'utf8')); }
    catch { throw new Error('worker_lock_requires_review'); }
    try { process.kill(previous.pid, 0); console.log(JSON.stringify({ status: 'already_running' })); return; }
    catch { throw new Error('worker_lock_requires_review'); }
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  try {
    const now = Date.now();
    const input = await bridge<{ rows: StoredResearchCodalRow[]; symbols: string[]; readAt: string; feedStateAt: string }>({ action: 'read' });
    if (!Number.isFinite(Date.parse(input.readAt)) || Math.abs(now - Date.parse(input.readAt)) > 120000) throw new Error('source_clock_invalid');
    // This proves recent collector activity, not completeness of every report.
    const feedAt = Date.parse(input.feedStateAt);
    if (!Number.isFinite(feedAt) || feedAt > now || now - feedAt > 3 * 3600000) throw new Error('collector_activity_stale');
    if (!Array.isArray(input.symbols) || !input.symbols.length) throw new Error('no_stored_report_issuers');
    const completeSymbols = input.symbols.filter(symbol => input.rows.filter(row => row.symbol === symbol).length < 401);
    if (!completeSymbols.length) throw new Error('source_history_truncated');
    const selected = prepareCodalResearchInputs(input.rows, completeSymbols, now);
    selected.excluded.push(...input.symbols.filter(symbol => !completeSymbols.includes(symbol)).map(symbol => ({ symbol, reason: 'source_history_truncated' })));
    const summary = { issuers: input.symbols.length, eligible: selected.observations.length, excluded: selected.excluded.map(e => e.reason) };
    if (process.argv[2] === '--inspect-input') { console.log(JSON.stringify(summary)); return; }
    if (!selected.observations.length) throw new Error('no_eligible_real_reports');
    const packet = prepareResearchPacket(selected.observations, now, DEFAULT_REPORT_MAX_AGE_MS);
    const digest = researchRequestDigest(selected.observations, selected.provenance, RESEARCH_INSTRUCTIONS);
    let state: State;
    try { state = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')) as State; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = { version: 2, entries: {}, attempts: [] }; }
    if (!state.entries || Array.isArray(state.entries) || typeof state.entries !== 'object') throw new Error('invalid_attempt_ledger');
    const identityAdmission = requestIdentityAdmission(state);
    if (identityAdmission !== 'allowed') throw new Error(identityAdmission);
    // Explicit adoption is required for nonempty historical ledgers. Never reset attempts.
    state.requestIdentity = REQUEST_IDENTITY_VERSION;
    if (!Array.isArray(state.attempts)) throw new Error('invalid_attempt_ledger');
    const destinationDigest = researchDestinationDigest(digest, state);
    const existing = await bridge<{ id: string } | null>({ action: 'find', digest: destinationDigest });
    if (destinationDigest !== digest && (!existing || existing.id !== state.entries[destinationDigest].id)) throw new Error('reviewed_destination_mismatch');
    if (existing) {
      if (destinationDigest === digest) state.entries[digest] = { at: state.entries[digest]?.at ?? new Date(now).toISOString(), status: 'stored', id: existing.id };
      await atomic('state.json', state);
      await atomic('last-run.json', { at: new Date().toISOString(), status: 'unchanged', id: existing.id, requestDigest: digest, destinationDigest, modelCalled: false, ...summary });
      console.log(JSON.stringify({ status: 'unchanged', id: existing.id, requestDigest: digest, destinationDigest, modelCalled: false, ...summary })); return;
    }
    let entry = state.entries[digest];
    if (entry && entry.status !== 'ready') throw new Error('prior_attempt_requires_review');
    if (!entry) {
      const admission = inferenceAdmission(state.attempts, now);
      if (admission !== 'allowed') {
        await atomic('last-run.json', { at: new Date().toISOString(), status: 'budget_hold', reason: admission, modelCalled: false, ...summary });
        console.log(JSON.stringify({ status: 'budget_hold', reason: admission, modelCalled: false })); return;
      }
      entry = { at: new Date(now).toISOString(), status: 'started' };
      state.attempts.push({ at: entry.at });
      state.entries[digest] = entry;
      await atomic('state.json', state); // Durable intent before inference. Unknown outcomes never auto-retry.
      try {
        entry.draft = await inferResearch(packet);
        entry.provenance = selected.provenance;
        entry.status = 'ready';
        await atomic('state.json', state); // Upload retries reuse the validated result.
      } catch {
        entry.status = 'failed'; await atomic('state.json', state); throw new Error('research_inference_rejected');
      }
    }
    if (!entry.draft || !entry.provenance) throw new Error('invalid_pending_draft');
    const { status: _status, ...body } = entry.draft;
    void _status;
    const saved = await bridge<{ id: string }>({ action: 'append', draft: { input_digest: digest, model: RESEARCH_MODEL, body, provenance: entry.provenance } });
    state.entries[digest] = { at: entry.at, status: 'stored', id: saved.id };
    await atomic('state.json', state);
    await atomic('last-run.json', { at: new Date().toISOString(), status: 'stored', id: saved.id, ...summary });
    console.log(JSON.stringify({ status: 'stored', id: saved.id, provider: 'openai-codex', model: RESEARCH_MODEL, published: false, ...summary }));
  } finally { await lock.close(); await unlink(lockPath); }
}
main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const reason = /^[a-z_]+$/.test(message) ? message : 'worker_failed';
  if (process.argv[2] !== '--reconcile') {
    await atomic('last-run.json', { at: new Date().toISOString(), status: 'failed', reason }).catch(() => {});
  }
  console.error(JSON.stringify({ status: 'failed', reason })); process.exitCode = 1;
});
