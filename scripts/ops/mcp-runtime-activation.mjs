// Source proposal only. Liara configuration update; never calls the MCP provider.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PROJECT = 'https://api.liara.ir/v1/projects/arsadata';
const RELEASES = PROJECT + '/releases?page=1&count=100';
const UPDATE = 'https://api.liara.ir/v1/projects/update-envs';
const BACKEND = 'https://62.60.191.24/liara-preview';
export const BRIDGE_FLAG = 'MCPFARSI_QUOTE_ENABLED';
const SECRET_NAME = 'MCP_FARSI_API_KEY';
const DEFAULT_RELEASE = '6aebae17bb7b539b677fbac7';
const reject = () => { throw Error('activation_preflight_rejected'); };
function variables(body) {
  const project = body?.project;
  if (project?.project_id !== 'arsadata' || !Array.isArray(project.envs) || project.envs.length > 1000) reject();
  const names = new Set();
  return project.envs.map(entry => {
    if (!entry || typeof entry.key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(entry.key)
      || typeof entry.value !== 'string' || Buffer.byteLength(entry.value) > 65536 || names.has(entry.key)) reject();
    names.add(entry.key);
    return { key: entry.key, value: entry.value };
  });
}
function release(body, expected) {
  if (body?.currentRelease !== expected || !Array.isArray(body.releases) || body.releases.length > 100) reject();
  const found = body.releases.filter(item => item?._id === expected);
  if (found.length !== 1 || found[0].state !== 'READY') reject();
}
function plan(before, apiKey) {
  if (before.find(entry => entry.key === 'SUPABASE_URL')?.value.replace(/\/+$/, '') !== BACKEND) reject();
  // Do not silently rotate an existing different key without a rollback source.
  const old = before.find(entry => entry.key === SECRET_NAME);
  if (old && old.value !== '' && old.value !== apiKey) reject();
  const wanted = new Map([[SECRET_NAME, apiKey], [BRIDGE_FLAG, '1']]);
  const next = before.map(entry => ({ key: entry.key, value: wanted.has(entry.key) ? wanted.get(entry.key) : entry.value }));
  for (const [key, value] of wanted) if (!before.some(entry => entry.key === key)) next.push({ key, value });
  return next;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function activate({ token, apiKey, expectedRelease = DEFAULT_RELEASE, mode = 'activate',
  fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const receipt = { version: 1, project: 'arsadata', state: 'preflight_rejected', providerCalls: 0,
    postAttempts: 0, postAcknowledged: null, automaticRetry: false, rawValuesPublished: false,
    keyHashesPublished: false, plaintextSnapshotWritten: false, beforeBackendMatched: false,
    beforeReleaseMatched: false, concurrentEnvChangeDetected: null, existingValuesAndOrderPreserved: null,
    desiredConfigurationObserved: null, afterBackendMatched: null, afterReleaseMatched: null,
    remoteRestartVerified: false, rollbackRequiresSeparateRootAction: true };
  async function request(url, method = 'GET', body) {
    const controller = new AbortController(); let timer;
    try {
      return await Promise.race([(async () => {
        const response = await fetchImpl(url, { method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        if (method === 'POST') { void response.body?.cancel().catch(() => {}); return response.ok; }
        if (!response.ok || !response.body) reject();
        const reader = response.body.getReader(); const chunks = []; let size = 0;
        try {
          for (;;) { const item = await reader.read(); if (item.done) break;
            size += item.value.byteLength; if (size > 1024 * 1024) reject(); chunks.push(Buffer.from(item.value)); }
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } finally { void reader.cancel().catch(() => {}); }
      })(), new Promise((_, fail) => { timer = setTimeout(() => { controller.abort(); fail(Error('bounded_request_failed')); }, timeoutMs); })]);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  let before, wanted;
  try {
    if (!['activate', 'readback'].includes(mode) || typeof token !== 'string' || !token || token !== token.trim() || /[\r\n]/.test(token)
      || typeof apiKey !== 'string' || !apiKey || /\s/.test(apiKey) || apiKey.length > 4096
      || !/^[a-f0-9]{24}$/.test(expectedRelease)) reject();
    before = variables(await request(PROJECT)); wanted = plan(before, apiKey); receipt.beforeBackendMatched = true;
    release(await request(RELEASES), expectedRelease); receipt.beforeReleaseMatched = true;
    const rechecked = variables(await request(PROJECT));
    receipt.concurrentEnvChangeDetected = !equal(before, rechecked);
    if (receipt.concurrentEnvChangeDetected) reject();
    if (equal(before, wanted)) {
      release(await request(RELEASES), expectedRelease);
      return { ...receipt, state: 'already_configured_no_write', desiredConfigurationObserved: true,
        existingValuesAndOrderPreserved: true, afterBackendMatched: true, afterReleaseMatched: true };
    }
    if (mode === 'readback') return { ...receipt, state: 'readback_only_configuration_not_confirmed', desiredConfigurationObserved: false };
  } catch { return receipt; }
  // Exactly one update attempt. No exception text or request/response body escapes.
  receipt.postAttempts = 1;
  try { receipt.postAcknowledged = await request(UPDATE, 'POST', { project: 'arsadata', variables: wanted }); }
  catch { receipt.postAcknowledged = null; }
  receipt.state = 'write_outcome_unknown_readback_unconfirmed';
  // Even after timeout/HTTP failure, only bounded GET readback follows; never POST again.
  try {
    const after = variables(await request(PROJECT));
    receipt.afterBackendMatched = after.find(entry => entry.key === 'SUPABASE_URL')?.value.replace(/\/+$/, '') === BACKEND;
    receipt.desiredConfigurationObserved = equal(after, wanted);
    const untouched = values => values.filter(entry => ![SECRET_NAME, BRIDGE_FLAG].includes(entry.key));
    receipt.existingValuesAndOrderPreserved = equal(untouched(before), untouched(after));
    release(await request(RELEASES), expectedRelease); receipt.afterReleaseMatched = true;
    if (receipt.desiredConfigurationObserved && receipt.existingValuesAndOrderPreserved && receipt.afterBackendMatched) {
      receipt.state = 'configuration_confirmed_restart_unproven';
    }
  } catch { /* Unconfirmed is not absent, failure, rollback or permission to retry. */ }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Direct environment capture; no secrets in argv, output, files or fingerprints.
  const token = process.env.LIARA_API_TOKEN, apiKey = process.env.MCP_FARSI_API_KEY;
  const expectedRelease = process.env.EXPECTED_RELEASE || DEFAULT_RELEASE;
  const mode = process.env.ACTIVATION_MODE || 'readback';
  const receipt = await activate({ token, apiKey, expectedRelease, mode });
  await writeFile('mcp-runtime-activation-receipt.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(receipt));
  if (!['configuration_confirmed_restart_unproven', 'already_configured_no_write'].includes(receipt.state)) process.exitCode = 1;
}
