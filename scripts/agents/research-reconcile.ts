/** Read-only destination reconciliation. Never unlocks, retries inference or changes the ledger. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Pending = { digest: string; status: 'started' | 'ready' | 'failed' };
type Result = Pending & { destination: 'stored' | 'absent' | 'unknown'; id?: string };
type Find = (request: { action: 'find'; digest: string }) => Promise<unknown>;

export async function reconcileResearchState(root: string, find: Find) {
  const state = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'));
  if (!state || ![1, 2].includes(state.version) || !state.entries ||
      typeof state.entries !== 'object' || Array.isArray(state.entries)) throw new Error('invalid_attempt_ledger');
  const pending: Pending[] = [];
  for (const [digest, value] of Object.entries(state.entries)) {
    const entry = value as { status?: string } | null;
    if (!/^[a-f0-9]{64}$/.test(digest) || !entry ||
        !['stored', 'started', 'ready', 'failed'].includes(entry.status ?? '')) throw new Error('invalid_attempt_ledger');
    if (entry.status !== 'stored') pending.push({ digest, status: entry.status as Pending['status'] });
  }
  // Bound this diagnostic independently of inference budgets. Do not query a
  // partial ledger and accidentally imply that all unknown outcomes were read.
  if (pending.length > 24) throw new Error('reconciliation_batch_limit');
  const entries: Result[] = [];
  let transportFailed = false;
  for (const entry of pending) {
    if (transportFailed) { entries.push({ ...entry, destination: 'unknown' }); continue; }
    try {
      const result = await find({ action: 'find', digest: entry.digest });
      if (result === null) { entries.push({ ...entry, destination: 'absent' }); continue; }
      if (typeof result !== 'object' || !result || !('id' in result) ||
          typeof result.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.id)) {
        throw new Error('invalid_bridge_response');
      }
      entries.push({ ...entry, destination: 'stored', id: result.id });
    } catch {
      // Fail closed and avoid repeatedly probing a broken connection. Neither a
      // lost response nor an invalid response is evidence of absence.
      transportFailed = true;
      entries.push({ ...entry, destination: 'unknown' });
    }
  }
  return { mode: 'read_only_reconciliation', checkedAt: new Date().toISOString(), entries,
    recoveryRequired: pending.length > 0, modelCalled: false, stateChanged: false, lockChanged: false };
}
