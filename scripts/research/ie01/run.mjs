// IE01 only: fixed local inputs and existing pure functions; no service runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const area = path.join(root, 'docs/research/intelligence-loop');
const fixtureDir = path.join(area, 'fixtures');
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value);
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, value) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
};
const clone = value => structuredClone(value);
const label = s => String(s).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]/g, '');
let forbiddenAttempts = 0;
function deny() { forbiddenAttempts++; throw new Error('IE01 offline guard: network/process forbidden'); }
export function installOfflineGuards() {
  globalThis.fetch = deny;
  for (const mod of [http, https]) { mod.request = deny; mod.get = deny; mod.createServer = deny; }
  net.connect = deny; net.createConnection = deny; net.createServer = deny;
  net.Socket.prototype.connect = deny;
  tls.connect = deny; tls.createServer = deny;
  for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
    dns[key] = deny; dns.promises[key] = deny;
  }
  for (const key of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) childProcess[key] = deny;
  for (const key of Object.keys(process.env)) {
    if (/^(BRSAPI_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|CODAL_)/.test(key)) delete process.env[key];
  }
  syncBuiltinESMExports();
}

export function verifyBaseline(manifest, fileReader = fs.readFileSync) {
  for (const f of manifest.files) assert.equal(digest(fileReader(path.join(root, f.path))), f.sha256, `fixed source changed: ${f.path}`);
}
export function nullContract(actual) {
  return actual.normalized?.standalone.gross_profit === null && actual.ratios?.gross_margin === null;
}
export function unitContract(actual) {
  return actual.normalized === null || (actual.normalized.unit === null && actual.ratios === null);
}
function assertion(checks, name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (e) { checks.push({ name, status: 'FAIL', error: e.message }); }
}
const escapeHTML = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const renderTables = tables => tables.map(t => '<table>' + t.map(r => '<tr>' + r.map(c => '<td>' + escapeHTML(c) + '</td>').join('') + '</tr>').join('') + '</table>').join('\n');

export async function execute(outputName = 'IE01-EVIDENCE.json') {
  if (!['IE01-EVIDENCE.json', 'IE01-REPLAY.json'].includes(outputName)) throw new Error('Unsupported IE01 output');
  installOfflineGuards();
  const manifest = readJSON(path.join(root, 'scripts/research/ie01/baseline.json'));
  verifyBaseline(manifest);
  const { parseHtmlTables, normalizeN10, PARSER_VERSION } = await import('../../../relay/codal.mjs');
  const { computeRatios } = await import('../../../lib/core/engine.ts');
  const { dedupeByPeriod } = await import('../../../lib/fundamental/supabase.ts');
  const historical = readJSON(path.join(area, 'history/IE01-EVIDENCE-20261001.json'));
  const archivePath = 'relay/fixtures/vanovin-n10-fy1404.html';
  const bytes = fs.readFileSync(path.join(root, archivePath));
  const archiveDigest = digest(bytes);
  const tables = parseHtmlTables(bytes.toString('utf8'));
  const meta = { symbol: 'ونوین', company_name: 'بانک اقتصاد نوین', period_end: '1404-12-29', period_months: 12, audited: false };
  const current = normalizeN10(tables, meta);
  assert.ok(current, 'reference archive must parse before designing mutations');
  const bankIndex = tables.findIndex(t => t.some(r => label(r[0]) === label('درآمد عملیاتی')));
  assert.equal(bankIndex, manifest.sourceIdentity.selectedBankTableIndex);
  const grossLabel = label('سود(زیان) ناخالص');
  const missingTables = clone(tables);
  const removed = missingTables[bankIndex].filter(r => label(r[0]) === grossLabel);
  assert.equal(removed.length, 1, 'exactly one intended gross-profit row must be removed');
  missingTables[bankIndex] = missingTables[bankIndex].filter(r => label(r[0]) !== grossLabel);
  const missing = {
    dataClass: 'SYNTHETIC_DERIVED_TABLES', originalArchiveDigest: archiveDigest,
    mutation: { bankIndex, operation: 'remove whole gross_profit row (both current/prior)', removedRowCount: 1 },
    meta, tables: missingTables,
  };
  const unitTables = clone(tables);
  let unitsChanged = 0;
  for (const t of unitTables) for (const r of t) for (let i = 0; i < r.length; i++) {
    if (r[i].includes('میلیون ریال')) { r[i] = r[i].replaceAll('میلیون ریال', 'هزار ریال'); unitsChanged++; }
  }
  // Explicit synthetic header in selected statement: do not claim original had it.
  unitTables[bankIndex].unshift(['واحد مبلغ: هزار ریال؛ واحد EPS: ریال']);
  const mismatch = {
    dataClass: 'SYNTHETIC_DERIVED_TABLES', originalArchiveDigest: archiveDigest,
    mutation: { operation: 'replace amount-unit mentions and add explicit bank header, value tokens unchanged', unitsChanged },
    amountUnit: 'هزار ریال', epsUnit: 'ریال', meta, tables: unitTables,
  };
  const row = (id, title, data) => ({ id, symbol: meta.symbol, report_kind: 'ن-۱۰', period_end: meta.period_end,
    title, source_url: null, data, raw: { parser_version: PARSER_VERSION } });
  const corrected = clone(current);
  // Chosen test perturbation, not a number attributed to the issuer.
  corrected.standalone.net_profit = 188042941;
  const correction = {
    dataClass: 'SYNTHETIC_CORRECTION_PAIR', originalArchiveDigest: archiveDigest,
    issuerCorrectionObserved: false, syntheticCorrectionOf: { correctionId: 76, initialId: 77 },
    mutation: { operation: 'test-only net_profit token replacement', newValue: 188042941, sourceAt: null, capturedAt: null },
    rows: [row(77, 'صورت مالی جداگانه سالانه (حسابرسی نشده)', clone(current)),
      row(76, 'صورت مالی جداگانه سالانه (حسابرسی نشده) (اصلاحیه)', corrected)],
  };
  for (const [name, data] of [['missing.json', missing], ['correction.json', correction], ['unit-mismatch.json', mismatch]]) {
    writeJSON(path.join(fixtureDir, name), data);
  }
  const fixtures = ['missing.json', 'correction.json', 'unit-mismatch.json'].map(name => ({
    path: 'docs/research/intelligence-loop/fixtures/' + name,
    sha256: digest(fs.readFileSync(path.join(fixtureDir, name))), dataClass: readJSON(path.join(fixtureDir, name)).dataClass,
  }));
  const toEngine = d => ({ ...d.standalone, capital: d.capital, period_months: d.period_months,
    audited: d.audited, eps_rial: d.standalone.eps_rial ?? null });
  const calculate = d => d ? computeRatios(toEngine(d)) : null;
  const cases = [];
  function record(id, dataClass, input, action, evaluate, scope) {
    const startedAt = new Date().toISOString();
    const before = canonical(input);
    const actual = action();
    const calculatedAt = new Date().toISOString();
    const checks = [];
    evaluate(actual, checks);
    assertion(checks, 'input retained unchanged by product functions', () => assert.equal(canonical(input), before));
    cases.push({ caseId: id, dataClass, scope, executionStatus: 'EXECUTED', status: checks.some(x => x.status === 'FAIL') ? 'FAIL' : 'PASS',
      codeSHA: manifest.selectedBaseSHA, parserVersion: PARSER_VERSION, sourceAt: null, capturedAt: null,
      unit: actual.normalized?.unit ?? null, startedAt, calculatedAt,
      inputDigest: digest(before), inputDigestKind: 'SHA256 exact UTF-8 JSON serialization of execution input',
      normalizedInputDigest: actual.normalized ? digest(canonical(toEngine(actual.normalized))) : null,
      coverage: { definition: 'intended current input fields; not count of non-null product outputs',
        requiredCurrentFields: 6, coveredCurrentFields: id === 'IE01-C2-MISSING' ? 5 : 6,
        missingCurrentFields: id === 'IE01-C2-MISSING' ? ['gross_profit'] : [],
        issuerProvenanceVerified: false, actualIssuerUniverseCoverage: null,
        amountUnitVerifiedAgainstIssuer: false },
      outputDigest: digest(canonical(actual)), actual, checks });
  }
  const input = { archiveDigest, meta };
  record('IE01-C1-COMPLETE', 'PUBLIC_ORIGIN_ARCHIVE_CLAIM', input,
    () => { const normalized = normalizeN10(parseHtmlTables(bytes.toString('utf8')), meta); return { normalized, ratios: calculate(normalized) }; },
    (a, checks) => {
      for (const [field, expected] of Object.entries(historical.referenceInputs.current))
        assertion(checks, 'historic current literal: ' + field, () => assert.equal(a.normalized?.standalone[field], expected));
      for (const [field, expected] of Object.entries(historical.referenceInputs.prior))
        assertion(checks, 'historic prior literal: ' + field, () => assert.equal(a.normalized?.standalone.prior?.[field], expected));
      assertion(checks, 'historic capital literal', () => assert.equal(a.normalized?.capital, historical.referenceInputs.capital));
      // Arithmetic test oracles, not an alternate product engine.
      for (const [metric, field] of [['gross_margin', 'gross_profit'], ['operating_margin', 'operating_profit'], ['net_margin', 'net_profit']])
        assertion(checks, 'ratio cross-product: ' + metric, () => assert.ok(Math.abs(a.ratios[metric] * a.normalized.standalone.revenue - a.normalized.standalone[field] * 100) < 0.01));
      for (const [metric, field] of [['revenue_growth', 'revenue'], ['net_profit_growth', 'net_profit']])
        assertion(checks, 'growth cross-product: ' + metric, () => assert.ok(Math.abs(a.ratios[metric] * Math.abs(a.normalized.standalone.prior[field]) - (a.normalized.standalone[field] - a.normalized.standalone.prior[field]) * 100) < 0.01));
      assertion(checks, 'no price invented for PE', () => assert.equal(a.ratios.pe_ttm, null));
    }, 'Literal replay and ratio arithmetic only; not original-issuer accuracy or unit authenticity');
  record('IE01-C2-MISSING', missing.dataClass, missing,
    () => { const normalized = normalizeN10(parseHtmlTables(renderTables(missing.tables)), meta); return { normalized, ratios: calculate(normalized) }; },
    (a, checks) => {
      assertion(checks, 'fixture truly lacks gross row', () => assert.ok(!missing.tables[bankIndex].some(r => label(r[0]) === grossLabel)));
      assertion(checks, 'missing gross and gross_margin must stay null', () => assert.ok(nullContract(a), 'product emitted non-null gross/gross_margin for absent gross row'));
      assertion(checks, 'independent net field retained', () => assert.equal(a.normalized?.standalone.net_profit, historical.referenceInputs.current.net_profit));
    }, 'Missing-row contract at parser→engine boundary; observes actual fallback, does not patch it');
  record('IE01-C3-CORRECTION', correction.dataClass, correction,
    () => { const selected = dedupeByPeriod(correction.rows); const reverseSelected = dedupeByPeriod([...correction.rows].reverse());
      return { selected, reverseSelected, normalized: selected[0]?.data ?? null, ratios: calculate(selected[0]?.data),
        originalRatios: calculate(correction.rows[0].data) }; },
    (a, checks) => {
      assertion(checks, 'explicit correction wins despite lower insertion ID', () => assert.equal(a.selected[0]?.id, 76));
      assertion(checks, 'order independent and single period', () => { assert.equal(a.selected.length, 1); assert.equal(a.reverseSelected[0]?.id, 76); });
      assertion(checks, 'correction field used', () => assert.equal(a.normalized?.standalone.net_profit, 188042941));
      assertion(checks, 'new net_margin differs; old result not reused', () => assert.notEqual(a.ratios.net_margin, a.originalRatios.net_margin));
    }, 'Explicit title-based correction selection only; timestamps unknown, approval/database/version persistence not exercised');
  record('IE01-C4-UNIT-MISMATCH', mismatch.dataClass, mismatch,
    () => { const normalized = normalizeN10(parseHtmlTables(renderTables(mismatch.tables)), meta); return { claimedAmountUnit: mismatch.amountUnit, epsUnit: mismatch.epsUnit, normalized, ratios: calculate(normalized) }; },
    (a, checks) => {
      assertion(checks, 'fixture explicit thousand-rial header present', () => assert.match(mismatch.tables[bankIndex][0][0], /هزار ریال/));
      assertion(checks, 'conflicting unit must reject/null affected output', () => assert.ok(unitContract(a), 'product accepted contradictory amount unit and emitted ratios'));
      assertion(checks, 'EPS test token unchanged', () => assert.equal(a.normalized?.standalone.eps_rial, historical.referenceInputs.current.eps_rial));
    }, 'Synthetic contradictory amount-unit header; no issuer unit defect asserted');
  verifyBaseline(manifest);
  assert.equal(forbiddenAttempts, 0, 'product attempted forbidden network/process');
  const payload = cases.map(({ caseId, actual, checks, inputDigest, outputDigest, status }) => ({ caseId, actual, checks, inputDigest, outputDigest, status }));
  const result = {
    contractVersion: 'IE01.offline-execution.v2', preparedAt: new Date().toISOString(), timezone: 'Asia/Tehran', nodeVersion: process.version,
    status: 'OFFLINE_EXECUTED_WITH_CONTRACT_FAILURES', isOperationalAcceptance: false, isFinancialValidation: false,
    baseline: manifest, sourceIdentity: manifest.sourceIdentity,
    originalArchive: { path: archivePath, inputDigest: archiveDigest, untouched: true },
    fixtures, calculations: { path: 'lib/core/engine.ts', function: 'computeRatios', codeSHA: manifest.selectedBaseSHA,
      financialOutputsProducedBy: 'existing deterministic code; no model calls', parserVersion: PARSER_VERSION },
    coverage: { casesExecuted: cases.length, issuerProvenanceVerified: false, currentLiteralFields: 6, priorLiteralFields: 2,
      archiveTableCount: tables.length, sourceAt: null, capturedAt: null, marketUniverseCoverage: null },
    cases, summary: { PASS: cases.filter(x => x.status === 'PASS').length, FAIL: cases.filter(x => x.status === 'FAIL').length,
      NOT_EXECUTED: 0, forbiddenAttempts, upstreamRequests: 0, liveDBCalls: 0, modelCalls: 0, productFilesChanged: 0 },
    deterministicPayloadDigest: digest(canonical(payload)),
    blockers: ['Authentic issuer URL/version/publication/capture/rights remain unknown',
      'Missing gross row becomes zero in parser and zero gross_margin in engine',
      'N10 ignores contradictory amount-unit header and emits fixed million-rial unit',
      'Correction approval/storage and ambiguous publication ties outside pure-function scope'],
    ownerHandoff: { owner: 'existing data owner FOLLOWUP04', action: 'review failures; no parser/relay/engine fix included', notifiedByThisHarness: false },
    IE02Started: false, IE03Started: false, humanTenDayCommitment: false,
  };
  writeJSON(path.join(area, outputName), result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await execute(process.argv[2] ?? 'IE01-EVIDENCE.json');
  console.log(JSON.stringify({ ...result.summary, deterministicPayloadDigest: result.deterministicPayloadDigest }));
  process.exitCode = result.summary.FAIL ? 1 : 0;
}
