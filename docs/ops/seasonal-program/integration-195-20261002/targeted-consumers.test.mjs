// Independent synthetic consumer acceptance. No server, DB, issuer data or network.
// Run with the reviewed checkout's installed tsx; REVIEWED_CHECKOUT is a local path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = process.env.REVIEWED_CHECKOUT;
assert.ok(root, 'REVIEWED_CHECKOUT must identify the pinned, read-only checkout');
const require = createRequire(path.join(root, 'package.json'));
const { deriveN10, narrativeGrossMargin } = require('./lib/fundamental/calc.ts');
const { deriveQuarters, ttmSeries } = require('./lib/core/quarterly.ts');
const { computeRatios, qualitativeMask, fundamentalAxis } = require('./lib/core/engine.ts');
const React = require('react');
const Charts = require('recharts');
const ts = require('typescript');

// Append exports only in memory to inspect private component boundaries.
// The product file and function bodies remain byte-for-byte unchanged on disk.
function component(file, exports = '') {
  const filename = path.join(root, file);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source + exports, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => name.startsWith('@/')
    ? require(path.join(root, name.slice(2))) : require(name);
  const run = vm.runInThisContext('(function(require,module,exports){' + js + '\n})', { filename });
  run(localRequire, module, module.exports);
  return module.exports;
}
const { MarginsChart } = component('components/symbol/FundamentalCharts.tsx', '\nexport { MarginsChart };\n');
const { default: QuarterlyCharts } = component('components/symbol/QuarterlyCharts.tsx');

function elements(node, type, found = []) {
  if (Array.isArray(node)) node.forEach(n => elements(n, type, found));
  else if (React.isValidElement(node)) {
    if (node.type === type) found.push(node);
    elements(node.props.children, type, found);
  }
  return found;
}
const statement = gross => ({ revenue: 100, cogs: 60, gross_profit: gross,
  operating_profit: 25, net_profit: 20, eps_rial: 2 });
const annual = (cur, prior) => ({ symbol: 'SYNTHETIC', company_name: 'fixture',
  report_kind: 'ن-۱۰', period_end: '1404-12-29', period_months: 12,
  audited: false, restated_prior: false, unit: 'میلیون ریال', capital: 10,
  standalone: { ...statement(cur), prior: statement(prior) } });
const quarter = (months, gross, revenue, net) => ({ id: months, period_end:
  ({ 3: '1404-03-31', 6: '1404-06-31', 9: '1404-09-30', 12: '1404-12-29' })[months],
  period_months: months, audited: false, capital: 10, revenue,
  gross_profit: gross, operating_profit: net + 5, net_profit: net });

test('annual current gross unknown suppresses comparison narrative without erasing net margin', () => {
  const d = deriveN10(annual(null, 30));
  assert.equal(d.margins.gross, null);
  assert.equal(d.priorMargins.gross, 30);
  assert.equal(d.margins.net, 20);
  assert.equal(narrativeGrossMargin(d), null);
  assert.equal(JSON.parse(JSON.stringify(d)).margins.gross, null);
});

test('annual prior gross unknown suppresses a false improvement comparison', () => {
  const d = deriveN10(annual(40, null));
  assert.equal(d.margins.gross, 40);
  assert.equal(d.priorMargins.gross, null);
  assert.equal(narrativeGrossMargin(d), null);
});

test('qualitative mask and score drivers distinguish absent gross from observed zero', () => {
  const input = { ...statement(null), capital: 10, period_months: 12, audited: false };
  const missing = computeRatios(input);
  const zero = computeRatios({ ...input, gross_profit: 0 });
  assert.equal(qualitativeMask(missing).gross_margin, 'نامشخص');
  assert.equal(qualitativeMask(zero).gross_margin, 'پایین');
  assert.ok(!fundamentalAxis(missing).drivers.some(d => d.label === 'حاشیه سود ناخالص'));
  assert.ok(fundamentalAxis(zero).drivers.some(d => d.label === 'حاشیه سود ناخالص'));
});

test('middle cumulative gross gap affects two quarters and preserves later recovery and net TTM', () => {
  const input = [quarter(3, 40, 100, 20), quarter(6, null, 220, 50),
    quarter(9, 120, 350, 80), quarter(12, 160, 500, 120)];
  const frozen = structuredClone(input);
  const q = deriveQuarters(input);
  assert.deepEqual(q.map(x => x.grossProfit), [40, null, null, 40]);
  assert.deepEqual(q.map(x => x.netProfit), [20, 30, 30, 40]);
  assert.equal(q[1].grossMargin, null);
  assert.equal(q[2].grossMargin, null);
  assert.equal(ttmSeries(q).length, 1);
  assert.equal(ttmSeries(q)[0].netProfitTtm, 120);
  assert.deepEqual(input, frozen);
});

test('actual annual component data excludes unknown gross but retains measured zero', () => {
  for (const [cur, prior] of [[null, 30], [40, null], [null, null]]) {
    const tree = MarginsChart({ derived: deriveN10(annual(cur, prior)), fyLabel: 'current', priorLabel: 'prior' });
    const data = elements(tree, Charts.BarChart)[0].props.data;
    assert.ok(!data.some(x => x.name === 'ناخالص'));
    assert.equal(data.find(x => x.name === 'خالص').cur, 20);
  }
  const tree = MarginsChart({ derived: deriveN10(annual(0, 0)), fyLabel: 'current', priorLabel: 'prior' });
  const data = elements(tree, Charts.BarChart)[0].props.data;
  assert.equal(data.find(x => x.name === 'ناخالص').cur, 0);
  assert.equal(data.find(x => x.name === 'ناخالص').prior, 0);
});

test('actual quarterly component keeps null gaps, zero points and honest tooltip text', () => {
  const q = deriveQuarters([quarter(3, 0, 100, 20), quarter(6, null, 220, 50),
    quarter(9, 120, 350, 80), quarter(12, 160, 500, 120)]);
  const tree = QuarterlyCharts({ quarters: q, ttm: ttmSeries(q), peSeries: [], currentPe: null, sourceTitle: 'SYNTHETIC' });
  const lineChart = elements(tree, Charts.LineChart).find(x => x.props.data[0]?.ناخالص === 0);
  assert.ok(lineChart);
  assert.deepEqual(lineChart.props.data.map(x => x.ناخالص), q.map(x => x.grossMargin));
  const grossLine = elements(lineChart, Charts.Line).find(x => x.props.dataKey === 'ناخالص');
  assert.equal(grossLine.props.connectNulls, false);
  const formatter = elements(lineChart, Charts.Tooltip)[0].props.formatter;
  assert.equal(formatter(null, 'ناخالص')[0], '—');
  assert.ok(formatter(0, 'ناخالص')[0].includes('۰'));
});
