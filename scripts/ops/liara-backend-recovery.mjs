/** Existing-VM start only. Official CLI v9.5.1 create-vm-actions.ts uses PATCH
 * /vm/power/{id} with {action:'start'}. No detail endpoint or automatic retry.
 */
import { open, writeFile, rename, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { selectVm } from './liara-vm-status.mjs';
import { transportError } from './relay-health-receipt.mjs';
const BASE = 'https://iaas-api.liara.ir';
const TARGET = 'arsadata-backend';
const choice = (x, allowed) => allowed.includes(x) ? x : null;
async function json(response) {
  const reader = response.body?.getReader(); if (!reader) throw new Error('invalid_body');
  const parts = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 1024 * 1024) throw new Error('body_limit');
      parts.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}
function latestOperation(body) {
  if (!Array.isArray(body?.operations)) return { valid: false, latest: null };
  const operations = body.operations;
  if (operations.some(o => !o || typeof o.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(o.createdAt) || !Number.isFinite(Date.parse(o.createdAt)))) return { valid: false, latest: null };
  const sorted = [...operations].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const last = sorted[0];
  const latest = last ? { name: choice(last.name, ['start', 'stop', 'reboot', 'shutdown', 'create']), state: choice(last.state, ['SUCCEEDED', 'FAILED', 'PENDING', 'RUNNING']), at: new Date(last.createdAt).toISOString() } : null;
  // All in-flight/unknown operations block a new signal, including older ones.
  return { valid: true, settled: operations.every(o => ['SUCCEEDED', 'FAILED'].includes(o.state)), latest };
}
export async function recoverBackend({ token, execute = false, expectedFingerprint, fetchImpl = fetch, persist, now = () => new Date().toISOString() }) {
  const receipt = { schemaVersion: 1, target: TARGET, startedAt: now(), mode: execute ? 'start_existing_if_off' : 'inspect', status: 'pending', before: null, operation: null, action: { method: 'PATCH', action: 'start', status: 'not_sent', httpStatus: null }, after: null, guestHealth: 'unknown', databaseHealth: 'unknown' };
  if (typeof persist !== 'function') throw new Error('durable_receipt_required');
  const save = async () => { receipt.updatedAt = now(); await persist(structuredClone(receipt)); };
  const request = (path, method = 'GET') => fetchImpl(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'PATCH' ? { body: JSON.stringify({ action: 'start' }) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000) });
  const list = async () => {
    try {
      const response = await request('/vm');
      if (!response.ok) { await response.body?.cancel(); return { view: { status: 'http_error', httpStatus: response.status }, id: null }; }
      let body;
      try { body = await json(response); } catch { return { view: { status: 'invalid_response' }, id: null }; }
      const view = selectVm(body);
      const vm = view.status === 'found' ? body.vms.find(v => v.name === TARGET) : null;
      return { view, id: typeof vm?._id === 'string' && /^[a-f0-9]{24}$/.test(vm._id) ? vm._id : null };
    } catch (error) { return { view: { status: 'connection_error', error: transportError(error) }, id: null }; }
  };
  if (!token) { receipt.status = 'missing_credential'; await save(); return receipt; }
  const before = await list();
  const fingerprint = value => value ? createHash('sha256').update(value).digest('hex') : null;
  receipt.before = { ...before.view, targetFingerprint: fingerprint(before.id) };
  if (execute && (!/^[a-f0-9]{64}$/.test(expectedFingerprint ?? '') || expectedFingerprint !== receipt.before.targetFingerprint)) {
    receipt.status = 'target_fingerprint_rejected'; await save(); return receipt;
  }
  if (before.view.status !== 'found' || !before.id || before.view.state !== 'CREATED') {
    receipt.status = 'precondition_rejected'; await save(); return receipt;
  }
  if (before.view.power === 'POWERED_ON') { receipt.status = 'already_on'; await save(); return receipt; }
  if (before.view.power !== 'POWERED_OFF') { receipt.status = 'precondition_rejected'; await save(); return receipt; }
  try {
    const response = await request('/vm/operation/' + before.id);
    if (!response.ok) { await response.body?.cancel(); throw new Error('events_unavailable'); }
    const events = latestOperation(await json(response)); receipt.operation = events.latest;
    if (!events.valid || !events.settled) { receipt.status = 'operation_requires_review'; await save(); return receipt; }
  } catch { receipt.status = 'operation_read_failed'; await save(); return receipt; }
  if (!execute) { receipt.status = 'eligible_off'; await save(); return receipt; }
  // Durable intent is mandatory before I/O. Failure here prevents the signal.
  receipt.action.targetFingerprint = receipt.before.targetFingerprint;
  receipt.action.status = 'intent'; receipt.status = 'start_intent'; await save();
  try {
    const response = await request('/vm/power/' + before.id, 'PATCH');
    receipt.action.httpStatus = response.status;
    receipt.action.status = response.ok ? 'accepted' : 'http_error';
    await response.body?.cancel();
  } catch (error) { receipt.action.status = 'unknown'; receipt.action.error = transportError(error); }
  // Even a lost signal response is reconciled with a read. Never send again.
  const after = await list(); receipt.after = { ...after.view, targetFingerprint: fingerprint(after.id) };
  receipt.status = after.id === before.id && after.view.state === 'CREATED' && after.view.power === 'POWERED_ON'
    ? 'powered_on_observed' : 'outcome_requires_review';
  await save(); return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'backend-recovery-receipt.json';
  try {
    if (!['--inspect', '--start-existing'].includes(process.argv[2]) || process.argv.length !== 3) throw new Error('explicit_mode_required');
    // Runner-local guard only. Reconcile a prior run's intent/fingerprint before
    // any new manual dispatch; never automatically redispatch an unknown action.
    const handle = await open(file, 'wx', 0o600); await handle.close();
    const persist = async receipt => {
      await writeFile(file + '.tmp', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 }); await rename(file + '.tmp', file);
      // Sanitized intent also survives in the Actions log if the runner is lost.
      console.log(JSON.stringify(receipt));
    };
    const receipt = await recoverBackend({ token: process.env.LIARA_API_TOKEN, execute: process.argv[2] === '--start-existing', expectedFingerprint: process.env.EXPECTED_TARGET_FINGERPRINT, persist });
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '```json\n' + JSON.stringify(receipt, null, 2) + '\n```\n');
    if (!['already_on', 'eligible_off', 'powered_on_observed'].includes(receipt.status)) process.exitCode = 1;
  } catch { console.error('backend_recovery_stopped_check_receipt'); process.exitCode = 1; }
}
