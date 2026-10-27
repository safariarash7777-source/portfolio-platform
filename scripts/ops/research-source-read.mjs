/** Public financial source packet only. No provider requests or writes. */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
export const SOURCES = [
  { kind: 'ن-۱۰', url: 'https://codal.ir/Reports/Decision.aspx?LetterSerial=yC2oQqrZ3w8Q8FsnnWQQBw%3d%3d&rt=0&let=6&ct=0&ft=-1' },
  { kind: 'ن-۳۰', url: 'https://codal.ir/Reports/Decision.aspx?LetterSerial=UF9BctCE5jV6HYNuyA8yYA%3d%3d&rt=0&let=58&ct=0&ft=-1' },
];
// This function is also embedded verbatim in the remote command.
export function projectRow(row) {
  const text = (x, max = 500) => typeof x === 'string' && x.length <= max ? x : null;
  const number = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const boolean = x => typeof x === 'boolean' ? x : null;
  const url = x => {
    if (typeof x !== 'string' || x.length > 2000) return null;
    try { const u = new URL(x); return ['https:', 'http:'].includes(u.protocol) && (u.hostname === 'codal.ir' || u.hostname.endsWith('.codal.ir')) && !u.username && !u.password ? x : null; } catch { return null; }
  };
  const numeric = (x, fields) => Object.fromEntries(fields.map(k => [k, number(x?.[k])]));
  const income = x => numeric(x, ['revenue', 'cogs', 'gross_profit', 'sga', 'other_op_income', 'other_op_expense', 'operating_profit', 'finance_cost', 'pretax_profit', 'tax', 'net_profit', 'eps_rial']);
  if (!row || row.symbol !== 'فولاد' || !['ن-۱۰', 'ن-۳۰'].includes(row.report_kind) || !Number.isSafeInteger(row.id) || row.id <= 0) throw new Error('invalid_report');
  const d = row.data;
  if (!d || d.symbol !== 'فولاد' || d.report_kind !== row.report_kind) throw new Error('invalid_report_data');
  const data = { symbol: d.symbol, report_kind: d.report_kind, period_end: text(d.period_end, 20), unit: text(d.unit, 80), unit_basis: text(d.unit_basis, 200), qty_unit: text(d.qty_unit, 80) };
  if (row.report_kind === 'ن-۱۰') Object.assign(data, { period_months: number(d.period_months), audited: boolean(d.audited), restated_prior: boolean(d.restated_prior), capital: number(d.capital), standalone: d.standalone ? { ...income(d.standalone), prior: d.standalone.prior ? income(d.standalone.prior) : null } : null });
  else {
    if (!Array.isArray(d.products) || d.products.length > 200) throw new Error('invalid_products');
    Object.assign(data, numeric(d, ['fiscal_year', 'period_total_amount', 'fy_cumulative_amount']), { products: d.products.map(p => ({ product_name: text(p?.product_name, 200), market: ['داخلی', 'صادراتی'].includes(p?.market) ? p.market : null, qty_unit: text(p?.qty_unit, 80), ...numeric(p, ['production_qty', 'sales_qty', 'sales_rate', 'sales_amount']) })) });
  }
  return { id: row.id, symbol: row.symbol, report_kind: row.report_kind, period_end: text(row.period_end, 30), title: text(row.title), source_url: url(row.source_url), published_at: text(row.published_at, 64), captured_at: text(row.captured_at, 64), data,
    raw: { announcement_link: url(row.raw?.announcement_link), link_excel: url(row.raw?.link_excel), link_pdf: url(row.raw?.link_pdf), date_publish: text(row.raw?.date_publish, 30), time_publish: text(row.raw?.time_publish, 20), period_end_jalali: text(row.raw?.period_end_jalali, 20), parser_version: number(row.raw?.parser_version), audited: boolean(row.raw?.audited), period_months: number(row.raw?.period_months) } };
}
// Only our fixed failure vocabulary may cross the shell boundary.
export function safeRemoteFailure(error) {
  const reasons = ['endpoint_missing', 'endpoint_mismatch', 'credential_missing', 'stored_http_error', 'body_missing', 'body_limit', 'invalid_json', 'invalid_rows', 'source_or_coverage_mismatch', 'invalid_report', 'invalid_report_data', 'invalid_products'];
  const reason = reasons.includes(error?.message) ? error.message : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : error?.name === 'TypeError' ? 'transport_or_type_error' : 'unknown_remote_failure';
  return { reason, httpStatus: reason === 'stored_http_error' && Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 ? error.httpStatus : null };
}
export async function remoteRead(sources, project, env = process.env, fetchImpl = fetch) {
  if (!env.SUPABASE_URL) throw new Error('endpoint_missing');
  if (env.SUPABASE_URL.replace(/\/+$/, '') !== 'https://62.60.191.24/liara-preview') throw new Error('endpoint_mismatch');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('credential_missing');
  const packets = [];
  for (const source of sources) {
    const query = new URLSearchParams({ symbol: 'eq.فولاد', report_kind: 'eq.' + source.kind,
      'raw->>announcement_link': 'eq.' + source.url,
      select: 'id,symbol,report_kind,period_end,title,source_url,published_at,captured_at,data,announcement_link:raw->>announcement_link,link_excel:raw->>link_excel,link_pdf:raw->>link_pdf,date_publish:raw->>date_publish,time_publish:raw->>time_publish,period_end_jalali:raw->>period_end_jalali,parser_version:raw->parser_version,audited:raw->audited,period_months:raw->period_months', order: 'id.desc', limit: '11' });
    const response = await fetchImpl('https://62.60.191.24/liara-preview/rest/v1/codal_reports?' + query, {
      method: 'GET', redirect: 'error', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('stored_http_error'), { httpStatus: response.status }); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('body_missing');
    const chunks = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 512 * 1024) throw new Error('body_limit'); chunks.push(Buffer.from(value)); }
    } finally { await reader.cancel().catch(() => {}); }
    let selected;
    try { selected = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('invalid_json'); }
    if (!Array.isArray(selected) || selected.some(row => !row || typeof row !== 'object')) throw new Error('invalid_rows');
    const rows = selected.map(row => ({ ...row, raw: Object.fromEntries(['announcement_link', 'link_excel', 'link_pdf', 'date_publish', 'time_publish', 'period_end_jalali', 'parser_version', 'audited', 'period_months'].map(k => [k, row[k]])) }));
    if (!Array.isArray(rows) || rows.length > 10 || rows.some(row => row.symbol !== 'فولاد' || row.report_kind !== source.kind || row.raw?.announcement_link !== source.url)) throw new Error('source_or_coverage_mismatch');
    packets.push({ kind: source.kind, sourceUrl: source.url, status: rows.length ? 'read' : 'not_found', rows: rows.map(project) });
  }
  return { schemaVersion: 1, symbol: 'فولاد', readAt: new Date().toISOString(), source: 'stored_codal_reports', primaryDocumentsFetched: false, packets };
}
export function command() {
  const source = `(${remoteRead.toString()})(${JSON.stringify(SOURCES)},${projectRow.toString()}).then(packet=>console.log('FOLAD_PACKET='+Buffer.from(JSON.stringify({ok:true,packet})).toString('base64'))).catch(error=>{console.log('FOLAD_PACKET='+Buffer.from(JSON.stringify({ok:false,failure:(${safeRemoteFailure.toString()})(error)})).toString('base64'));process.exitCode=1})`;
  const cmd = encodeURIComponent(`node -e eval(require('node:zlib').inflateRawSync(Buffer.from('${deflateRawSync(source).toString('base64')}','base64')).toString())`);
  if (cmd.length > 6000) throw new Error('command_limit');
  return cmd;
}
export function parseCapture(raw, exitCode) {
  if (!Number.isInteger(exitCode) || exitCode !== 0) {
    let markerPresent = false, remoteFailure;
    if (typeof raw === 'string' && Buffer.byteLength(raw) <= 2 * 1024 * 1024) {
      const markers = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/).filter(line => line.startsWith('FOLAD_PACKET='));
      markerPresent = markers.length > 0;
      if (markers.length === 1 && /^FOLAD_PACKET=[A-Za-z0-9+/]+={0,2}$/.test(markers[0])) {
        try {
          const result = JSON.parse(Buffer.from(markers[0].slice(13), 'base64').toString('utf8'));
          if (result?.ok === false) remoteFailure = result.failure;
        } catch { /* Malformed output is never reflected into diagnostics. */ }
      }
    }
    throw Object.assign(new Error('cli_exit'), { exitCode, markerPresent, remoteFailure });
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('capture_limit');
  const lines = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/).filter(line => line.startsWith('FOLAD_PACKET='));
  if (!lines.length) throw new Error('completion_marker_missing');
  if (lines.length !== 1) throw new Error('ambiguous_marker');
  if (!/^FOLAD_PACKET=[A-Za-z0-9+/]+={0,2}$/.test(lines[0])) throw new Error('malformed_marker');
  let result;
  try { result = JSON.parse(Buffer.from(lines[0].slice(13), 'base64').toString('utf8')); } catch { throw new Error('malformed_marker'); }
  if (result?.ok === false) throw Object.assign(new Error('remote_failure'), { remoteFailure: result.failure });
  const p = result?.packet;
  if (result?.ok !== true || p?.schemaVersion !== 1 || p.symbol !== 'فولاد' || p.source !== 'stored_codal_reports' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.readAt) || !Array.isArray(p.packets) || p.packets.length !== 2) throw new Error('invalid_packet');
  const packets = p.packets.map((entry, i) => {
    const expected = SOURCES[i];
    if (entry.kind !== expected.kind || entry.sourceUrl !== expected.url || !Array.isArray(entry.rows) || entry.rows.length > 10 || entry.rows.some(row => row.report_kind !== expected.kind || row.raw?.announcement_link !== expected.url)) throw new Error('invalid_packet_source');
    return { kind: expected.kind, sourceUrl: expected.url, status: entry.rows.length ? 'read' : 'not_found', rows: entry.rows.map(projectRow) };
  });
  return { schemaVersion: 1, symbol: 'فولاد', readAt: p.readAt, source: 'stored_codal_reports', primaryDocumentsFetched: false, packets };
}
export function failureReceipt(error) {
  const local = ['cli_exit', 'capture_limit', 'completion_marker_missing', 'ambiguous_marker', 'malformed_marker', 'remote_failure', 'invalid_packet', 'invalid_packet_source', 'invalid_report', 'invalid_report_data', 'invalid_products', 'command_limit', 'explicit_mode_required'];
  const reason = local.includes(error?.message) ? error.message : 'unknown_capture_failure';
  const remote = error?.remoteFailure;
  const remoteFailure = (reason === 'remote_failure' || reason === 'cli_exit' && remote !== undefined) ? safeRemoteFailure({ message: remote?.reason, httpStatus: remote?.httpStatus }) : null;
  // Preserve fixed remote fallback classes without reflecting arbitrary text.
  if (remoteFailure && ['timeout', 'transport_or_type_error', 'unknown_remote_failure'].includes(remote?.reason)) remoteFailure.reason = remote.reason;
  return { schemaVersion: 1, status: 'failed', reason,
    exitCode: reason === 'cli_exit' && Number.isInteger(error?.exitCode) && error.exitCode >= 0 && error.exitCode <= 255 ? error.exitCode : null,
    markerPresent: reason === 'cli_exit' ? error?.markerPresent === true : null, remoteFailure };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'command' && process.argv.length === 3) console.log(command());
    else if (process.argv[2] === 'parse' && process.argv.length === 5) {
      if ((await stat(process.argv[3])).size > 2 * 1024 * 1024) throw new Error('capture_limit');
      const packet = parseCapture(await readFile(process.argv[3], 'utf8'), Number(process.argv[4]));
      await writeFile('research-source-folad.json', JSON.stringify(packet, null, 2) + '\n', { mode: 0o600 });
      console.log(JSON.stringify(packet));
      if (packet.packets.some(p => p.status !== 'read')) process.exitCode = 1;
    } else throw new Error('explicit_mode_required');
  } catch (error) {
    const receipt = failureReceipt(error);
    if (process.argv[2] === 'parse') await writeFile('research-source-folad.json', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 }).catch(() => {});
    console.error(JSON.stringify(receipt)); process.exitCode = 1;
  }
}
