// Only local metadata JSON inputs and synthetic simulations; no live flags.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoveragePlan, dryRunCoverage, createOfflineCoverageBudget, metadataCsv } from './coverage-plan-core.mjs';

export async function run(args) {
  const allowed = new Set(['--input', '--out', '--simulate', '--checkpoint', '--ledger']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1] || Object.hasOwn(options, args[i])) throw new Error('Use --input file --out directory [--simulate synthetic-file] [--checkpoint file --ledger persisted-ledger]; no live mode');
    options[args[i]] = args[i + 1];
  }
  if (!options['--input'] || !options['--out'] || ((options['--checkpoint'] || options['--ledger']) && !options['--simulate'])
      || (options['--checkpoint'] && !options['--ledger'])) throw new Error('input/output, simulation and persisted ledger for checkpoint resume required');
  const read = p => {
    if (fs.statSync(p).size > 16 * 1024 * 1024) throw new Error('metadata input too large');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { throw new Error('metadata JSON invalid'); }
  };
  const input = read(options['--input']);
  const plan = buildCoveragePlan(input);
  let result = null, simulation = null;
  if (options['--simulate']) {
    simulation = read(options['--simulate']);
    if (options['--ledger']) simulation.ledger = read(options['--ledger']);
    if (simulation.dataClass !== 'SYNTHETIC') throw new Error('simulation must be explicitly synthetic');
    let time = Date.parse(simulation.clockAt);
    if (!Number.isFinite(time)) throw new Error('synthetic clock required');
    const clock = { now: () => time, advance: ms => { time += ms; } };
    const budget = createOfflineCoverageBudget({ ledger: simulation.ledger, softBudget: simulation.softBudget, hardCeiling: simulation.hardCeiling, now: clock.now });
    result = await dryRunCoverage(plan, { budget, clock, responses: simulation.responses,
      checkpoint: options['--checkpoint'] ? read(options['--checkpoint']) : null, maxRequests: simulation.maxRequests ?? 50 });
  }
  const out = path.resolve(options['--out']);
  fs.mkdirSync(out, { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
  write('plan.json', plan);
  fs.writeFileSync(path.join(out, 'symbol-date-matrix.csv'), metadataCsv(plan.matrix, ['symbol', 'day', 'status', 'reason', 'observedAt', 'sourceRef', 'existingRowRef']));
  fs.writeFileSync(path.join(out, 'nav-classification.csv'), metadataCsv(plan.nav, ['symbol', 'status', 'eligible', 'reason', 'cause', 'lastCheckedAt', 'sourceAt', 'capability', 'validResponseVerified']));
  if (result) {
    write('simulation.json', result); write('checkpoint.json', result.checkpoint);
    write('simulated-shared-ledger.json', simulation.ledger);
  }
  return { mode: plan.mode, dataClass: plan.dataClass, planDigest: plan.planDigest, counts: plan.counts,
    plannedCandleRequests: plan.tasks.length, plannedNAVRequests: 0, simulatedRequests: result?.simulatedRequests ?? 0,
    upstreamRequests: 0, liveDBCalls: 0, liveEnabled: false, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await run(process.argv.slice(2)))); }
  catch (e) { console.error(`coverage-plan: ${e.message}`); process.exitCode = 1; }
}
