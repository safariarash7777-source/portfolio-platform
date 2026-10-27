/** Metadata-only list; never request /vm/{id}, whose response includes credentials.
 * Contract: liara-cloud/openapi@338325a42cd28d12dcee10c088840d2098504a8b/spec/Iaas.yaml
 */
import { writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { transportError } from './relay-health-receipt.mjs';
const URL = 'https://iaas-api.liara.ir/vm';
const TARGET = 'arsadata-backend';
const choice = (value, allowed) => allowed.includes(value) ? value : null;
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const day = new Date(value.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
export function selectVm(body) {
  if (!body || !Array.isArray(body.vms) || body.vms.some(vm => !vm || typeof vm !== 'object' || typeof vm.name !== 'string')) return { status: 'invalid_response', matchCount: null };
  const matches = body.vms.filter(vm => vm.name === TARGET);
  if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'not_found', matchCount: matches.length };
  const vm = matches[0];
  return { status: 'found', matchCount: 1,
    state: choice(vm.state, ['CREATED', 'CREATING', 'FROZEN', 'DELETED', 'DELETING']),
    power: choice(vm.power, ['POWERED_ON', 'POWERED_OFF', 'SUSPENDED']), createdAt: timestamp(vm.createdAt), guestState: null };
}
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  const parts = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 1024 * 1024) throw new Error();
      parts.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}
export async function collectVmStatus({ token, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const receipt = { schemaVersion: 1, observedAt: now(), target: TARGET, mode: 'read_only_list', httpStatus: null, matchCount: null, status: 'missing_credential', error: null };
  if (!token) return receipt;
  try {
    const response = await fetchImpl(URL, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    receipt.httpStatus = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return { ...receipt, status: 'http_error' };
    }
    try { return { ...receipt, ...selectVm(await boundedJson(response)) }; }
    catch { return { ...receipt, status: 'invalid_response' }; }
  } catch (error) { return { ...receipt, status: 'connection_error', error: transportError(error) }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await collectVmStatus({ token: process.env.LIARA_API_TOKEN });
    const json = JSON.stringify(receipt, null, 2) + '\n';
    await writeFile('liara-vm-status.json', json, { mode: 0o600 });
    console.log(json);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '```json\n' + json + '```\n');
    if (receipt.status !== 'found' || receipt.state === null || receipt.power === null) process.exitCode = 1;
  } catch { console.error('vm_status_capture_failed'); process.exitCode = 1; }
}
