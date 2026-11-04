// Existing Liara account only. No provider, database RPC, command execution or writes.
// API response values stay in RAM; only configuration counts and equality booleans leave.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = 'https://api.liara.ir/v1/projects';
const PRIMARY = 'arsadata';
const MAX_PROJECTS = 5;
const idValid = x => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(x);
const scale = x => Number.isSafeInteger(x) && x >= 0 && x <= 100 ? x : null;
function key(x) {
  if (x === undefined || x === '') return null;
  if (typeof x !== 'string' || !x.length || x.length > 4096 || x !== x.trim()) throw Error('invalid_environment_value');
  return x;
}

function selectedKeys(project) {
  const envs = project?.envs;
  if (!Array.isArray(envs) || envs.length > 1000 || envs.some(e => !e || typeof e.key !== 'string')) return null;
  const select = name => {
    const matches = envs.filter(e => e.key === name);
    if (matches.length > 1) throw Error('duplicate_environment_name');
    return matches[0]?.value;
  };
  return { main: key(select('BRSAPI_KEY')), commodity: key(select('BRSAPI_COMMODITY_KEY')),
    commodityOptIn: select('BRSAPI_COMMODITY_ENABLED') === '1' };
}

async function boundedBody(response) {
  if (!response.body) throw Error('empty_body');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw Error('response_limit');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function collectEgressInventory({ token, fetchImpl = fetch, now = () => new Date().toISOString(), timeoutMs = 10000 } = {}) {
  const receipt = { version: 1, mode: 'liara-control-plane-read-only', startedAt: now(),
    providerCalls: 0, remoteWrites: false, environmentValuePolicy: 'RAM_ONLY', rawEnvironmentPublished: false, keyHashPublished: false,
    primaryProject: PRIMARY, projectLimit: MAX_PROJECTS, projects: [],
    completeForListedAccount: false, singleEgressEstablished: false,
    limitations: ['Configured scale is not running process or pod inventory.',
      'Only this Liara account is inspected; external, local and other-account key consumers remain separate checks.',
      'Key equality is compared in RAM only; no key or stable key fingerprint is emitted.',
      'This receipt does not prove global spacing, rolling quota, provider plan or IP ownership.'] };
  let requests = 0;
  async function get(url) {
    const controller = new AbortController(); let timer;
    requests++;
    const work = async () => {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
        signal: controller.signal, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); return { state: 'http_error', status: response.status }; }
      return { state: 'read', status: response.status, body: await boundedBody(response) };
    };
    try {
      return await Promise.race([work(), new Promise(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve({ state: 'timeout', status: null }); }, timeoutMs);
      })]);
    } catch { return { state: 'unconfirmed', status: null }; }
    finally { clearTimeout(timer); controller.abort(); }
  }
  const finish = state => ({ ...receipt, state, controlPlaneRequests: requests, completedAt: now() });
  if (!token) return finish('missing_credential');
  const list = await get(API);
  if (list.state !== 'read') { receipt.list = { state: list.state, httpStatus: list.status }; return finish('list_unconfirmed'); }
  const projects = list.body?.projects;
  if (!Array.isArray(projects) || projects.length > 1000 || projects.some(p => !idValid(p?.project_id)) ||
      new Set(projects.map(p => p.project_id)).size !== projects.length ||
      projects.filter(p => p.project_id === PRIMARY).length !== 1) return finish('invalid_list_schema');
  receipt.listedCount = projects.length;
  const primary = projects.find(p => p.project_id === PRIMARY);
  const selected = [primary, ...projects.filter(p => p !== primary).sort((a, b) => a.project_id.localeCompare(b.project_id))].slice(0, MAX_PROJECTS);
  let primaryKeys = null, allRead = true;
  for (const project of selected) {
    const response = await get(API + '/' + project.project_id);
    let keys = null;
    if (response.state === 'read' && response.body?.project?.project_id === project.project_id) {
      try { keys = selectedKeys(response.body.project); } catch { /* No raw value or exception escapes. */ }
    }
    if (!keys) allRead = false;
    if (project.project_id === PRIMARY) primaryKeys = keys;
    const commodityKey = keys?.commodity ?? (keys?.commodityOptIn ? keys.main : null);
    receipt.projects.push({ projectId: project.project_id, configuredScale: scale(project.scale),
      metadataState: keys ? 'read' : 'unconfirmed', httpStatus: response.status,
      mainKeyPresent: keys ? keys.main !== null : null,
      commodityKeyPresent: keys ? keys.commodity !== null : null,
      commodityOptIn: keys ? keys.commodityOptIn : null,
      mainMatchesPrimary: keys && primaryKeys?.main ? keys.main === primaryKeys.main : null,
      commodityMatchesPrimary: keys && primaryKeys?.main ? commodityKey === primaryKeys.main : null });
  }
  receipt.completeForListedAccount = allRead && selected.length === projects.length;
  return finish('observed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await collectEgressInventory({ token: process.env.LIARA_API_TOKEN });
  await writeFile('relay-egress-inventory.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ state: result.state, configuredProjectsObserved: result.projects.length,
    singleEgressEstablished: false, providerCalls: 0 }));
}
