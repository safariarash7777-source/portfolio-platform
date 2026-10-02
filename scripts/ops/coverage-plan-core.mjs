// Metadata-only, offline planning. No prices, network client or live worker.
import { createHash } from 'node:crypto';
import { isMainTicker } from '../../relay/symbols-util.mjs';
import { PersistentDailyBudget } from '../../relay/brsapi-client.mjs';
import { createBrsTransport } from '../../relay/brsapi-transport.mjs';
import { makeSupabaseLeaseStore } from '../../relay/brsapi-budget-store.mjs';

const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const iso = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(s);
const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const proof = x => x?.verified === true && iso(x.observedAt) && typeof x.sourceRef === 'string' && x.sourceRef.length > 0;
const key = (symbol, day) => JSON.stringify([symbol, day]);
const integer = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;

function classify(symbol, day, cell, calendar) {
  if (!isMainTicker(symbol.id)) return ['unsupported', 'excluded_subticker_or_rights'];
  if (proof(symbol.capability) && symbol.capability.type2 === false) return ['unsupported', 'explicit_type2_unsupported'];
  if (proof(cell) && cell.present === true && cell.seriesType === 3) return ['unsupported', 'adjusted_series_not_type2'];
  if (proof(cell) && ((cell.present === true && cell.traded === false)
      || (proof(calendar) && calendar.state === 'closed' && (cell.traded === true || cell.present === true)))) {
    return ['unknown', 'conflicting_calendar_row_or_trade_evidence'];
  }
  if (proof(cell) && cell.present === true && cell.seriesType === 2) return ['covered', 'observed_unadjusted_daily_row'];
  if (proof(calendar) && calendar.day === day && calendar.state === 'closed') {
    if (proof(cell) && cell.traded === true) return ['unknown', 'conflicting_calendar_and_trade_evidence'];
    return ['holiday', 'explicit_official_calendar_closed'];
  }
  if (proof(cell) && cell.traded === false) return ['no-trade', 'explicit_symbol_no_trade'];
  if (proof(symbol.capability) && symbol.capability.type2 === true && proof(cell)
      && cell.traded === true && cell.present === false && cell.completeRead === true
      && proof(calendar) && calendar.day === day && calendar.state === 'open') {
    return ['gap', 'verified_trade_and_complete_read_without_row'];
  }
  return ['unknown', 'insufficient_symbol_date_or_series_evidence'];
}

function navItem(s, entries, now) {
  const blacklist = entries.find(e => e.symbol === s.id);
  if (blacklist) return { symbol: s.id, status: 'preserved_blacklist', eligible: false,
    cause: typeof blacklist.cause === 'string' ? blacklist.cause : null,
    lastCheckedAt: iso(blacklist.lastCheckedAt) ? blacklist.lastCheckedAt : null,
    capability: proof(s.navCapability) ? s.navCapability.supported : null,
    validResponseVerified: proof(s.nav) && s.nav.valid === true,
    reason: 'blacklist_never_cleared_or_retested_by_this_tool' };
  if (!isMainTicker(s.id) || (proof(s.membership) && (s.membership.cs_id !== 68 || s.membership.active === false))) {
    return { symbol: s.id, status: 'unsupported', eligible: false, reason: 'excluded_or_not_active_fund' };
  }
  if (proof(s.navCapability) && s.navCapability.supported === false) {
    return { symbol: s.id, status: 'unsupported', eligible: false, reason: 'explicit_nav_unsupported' };
  }
  const age = iso(s.nav?.sourceAt) ? now - Date.parse(s.nav.sourceAt) : null;
  const candidate = proof(s.membership) && s.membership.cs_id === 68 && s.membership.active === true
    && proof(s.navCapability) && s.navCapability.supported === true;
  const valid = candidate && proof(s.nav) && s.nav.valid === true && s.nav.unit === 'rial'
    && s.nav.positiveVerified === true && s.nav.ratioPlausibleVerified === true
    && age !== null && age >= 0 && age <= 24 * 3600_000;
  if (valid) return { symbol: s.id, status: 'valid_current', eligible: false, sourceAt: s.nav.sourceAt, reason: 'verified_fresh_nav_metadata' };
  return { symbol: s.id, status: candidate ? 'candidate_deferred' : 'unknown', eligible: false,
    reason: candidate ? 'no_live_nav_retest_authorized' : 'capability_membership_or_response_unknown',
    lastCheckedAt: iso(s.nav?.observedAt) ? s.nav.observedAt : null, sourceAt: iso(s.nav?.sourceAt) ? s.nav.sourceAt : null };
}

export function buildCoveragePlan(input) {
  if (!iso(input?.observedAt)) throw new Error('observedAt with timezone required');
  if (!Array.isArray(input.days) || !input.days.length || input.days.length > 366 || !input.days.every(date)) throw new Error('bounded valid Gregorian days required');
  if (!Array.isArray(input.symbols) || input.symbols.length > 5000) throw new Error('bounded symbol metadata required');
  const days = [...new Set(input.days)].sort();
  if (days.length * input.symbols.length > 200000) throw new Error('matrix scope too large; split observed range');
  const symbols = [...input.symbols].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
  if (symbols.some(s => typeof s.id !== 'string' || !s.id.trim() || s.id !== s.id.trim() || s.id.length > 80)) throw new Error('invalid public symbol identifier');
  if (new Set(symbols.map(s => s.id)).size !== symbols.length) throw new Error('duplicate symbol metadata');
  for (const list of [input.funds ?? [], input.blacklist ?? []]) {
    if (!Array.isArray(list) || list.length > 5000) throw new Error('bounded NAV/blacklist metadata required');
    const ids = list.map(s => s.id ?? s.symbol);
    if (ids.some(s => typeof s !== 'string' || !s.trim() || s !== s.trim() || s.length > 80) || new Set(ids).size !== ids.length) throw new Error('ambiguous NAV/blacklist identities');
  }
  const cells = new Map();
  for (const c of input.cells ?? []) {
    if (!symbols.some(s => s.id === c.symbol) || !days.includes(c.day)) throw new Error('cell outside plan scope');
    const k = key(c.symbol, c.day);
    if (cells.has(k)) throw new Error('ambiguous duplicate cell');
    cells.set(k, c);
  }
  const calendar = new Map();
  for (const c of input.calendar ?? []) {
    if (!days.includes(c.day) || calendar.has(c.day)) throw new Error('ambiguous/outside calendar entry');
    calendar.set(c.day, c);
  }
  const matrix = symbols.flatMap(s => days.map(day => {
    const c = cells.get(key(s.id, day));
    const [status, reason] = classify(s, day, c, calendar.get(day));
    return { symbol: s.id, day, status, reason, observedAt: c?.observedAt ?? input.observedAt,
      sourceRef: c?.sourceRef ?? null, existingRowRef: typeof c?.rowRef === 'string' ? c.rowRef : null };
  }));
  const tasks = symbols.flatMap(s => {
    const missingDays = matrix.filter(c => c.symbol === s.id && c.status === 'gap').map(c => c.day);
    if (!missingDays.length) return [];
    const scope = { symbol: s.id, seriesType: 2, targetDays: missingDays };
    return [{ ...scope, taskId: sha(scope), endpoint: 'Tsetmc/Candlestick.php', producer: 'candle-backfill', budgetClass: 'bulk',
      rangeStart: missingDays[0], rangeEnd: missingDays.at(-1), requestsPerAttempt: 1,
      note: 'catalog endpoint returns daily history per symbol; range filters local metadata only' }];
  });
  const nav = (input.funds ?? []).map(s => navItem(s, input.blacklist ?? [], Date.parse(input.observedAt)));
  const attempts = input.maxAttempts ?? 1;
  if (!integer(attempts, 1, 3)) throw new Error('maxAttempts must be explicit 1..3');
  const cap = input.dailyRequestCap ?? null;
  if (cap !== null && !integer(cap, 1, 10000)) throw new Error('invalid declared daily request cap');
  const result = { schemaVersion: 'coverage-plan.v1', mode: 'OFFLINE_ONLY', observedAt: input.observedAt,
    dataClass: input.dataClass === 'SYNTHETIC' ? 'SYNTHETIC' : 'OBSERVED_METADATA', universeComplete: input.universeComplete === true,
    matrix, nav, tasks, preservedBlacklistSymbols: (input.blacklist ?? []).map(s => s.symbol).sort(),
    legacyStateAvailable: input.initialState?.done != null, legacyDone: structuredClone(input.initialState?.done ?? {}),
    counts: Object.fromEntries(['covered', 'holiday', 'no-trade', 'unsupported', 'gap', 'unknown'].map(s => [s, matrix.filter(c => c.status === s).length])),
    budget: { sharedDependencyPR: 178, minimumCandleRequests: tasks.length, maximumRequestsUnderDeclaredAttempts: tasks.length * attempts,
      maxAttempts: attempts, declaredDailyRequestCap: cap, verifiedLiveCapacity: null, completionDays: null,
      plannedNAVRequests: 0, deferredNAVCandidates: nav.filter(n => n.status === 'candidate_deferred').length,
      unknownCandidateCells: matrix.filter(c => c.status === 'unknown').length, spacingMs: 100,
      consumers: ['candle-backfill/bulk', 'nav-completion/bulk', 'nav-bulk/standard', 'FX and other shared-key producers'] },
    liveGate: { enabled: false, blockers: ['planner_has_no_live_mode', 'PR178_live_acceptance_required',
      'supplier_reset_window_and_prior_usage_required', 'approved_scope_capacity_and_operator_rollout_required'] },
    missingUniverseDays: input.universeComplete === true ? [] : days,
    aggregateObservations: structuredClone(input.aggregateObservations ?? []),
  };
  result.planDigest = sha(result);
  return result;
}

const offlineBudgets = new WeakSet();
const offlineLedgers = new WeakMap();
/** Synthetic RPC fixture only. The PR178 store validates its responses and
 * PersistentDailyBudget enforces the existing allocation rules. Not PostgreSQL
 * acceptance and not a second deployed counter. Reuse ledger across restarts. */
export function createOfflineCoverageBudget({ ledger, softBudget, hardCeiling, now }) {
  if (ledger?.dataClass !== 'SYNTHETIC' || !ledger.days || !integer(softBudget, 1, 10000)
      || !integer(hardCeiling, softBudget, 10000) || typeof now !== 'function') throw new Error('explicit synthetic shared-ledger configuration required');
  const fetchImpl = async (_url, init) => {
    const p = JSON.parse(init.body);
    const row = ledger.days[p.p_day];
    if (ledger.failRPC || row?.verified !== true || !integer(row.leased, 0, 10000) || !integer(row.hardCeiling, 1, 10000)) {
      return { ok: false, status: 400, json: async () => ({ code: 'BRSB4' }) };
    }
    const ceiling = Math.min(row.hardCeiling, p.p_hard);
    const before = row.leased;
    row.hardCeiling = ceiling;
    const granted = Math.max(0, Math.min(p.p_want, ceiling - before));
    row.leased += granted;
    return { ok: true, status: 200, json: async () => [{ granted, leased_before: before, hard_ceiling: ceiling }] };
  };
  const store = makeSupabaseLeaseStore({ url: 'https://offline.invalid', serviceKey: 'synthetic-local-placeholder', fetchImpl });
  const budget = new PersistentDailyBudget({ store, softBudget, hardCeiling, leaseSize: 1, lowWaterRatio: 0, now });
  offlineBudgets.add(budget);
  offlineLedgers.set(budget, ledger);
  return budget;
}

function initialCheckpoint(plan, state) {
  const next = state ? structuredClone(state) : { schemaVersion: 'coverage-repair-simulation.v1', planDigest: plan.planDigest,
    legacyDone: structuredClone(plan.legacyDone), simulatedRows: [], events: [], leaseFloorByDay: {} };
  if (next.schemaVersion !== 'coverage-repair-simulation.v1' || next.planDigest !== plan.planDigest
      || sha(next.legacyDone) !== sha(plan.legacyDone) || !Array.isArray(next.simulatedRows) || !Array.isArray(next.events)
      || !next.leaseFloorByDay || typeof next.leaseFloorByDay !== 'object' || Array.isArray(next.leaseFloorByDay)) throw new Error('checkpoint scope/version mismatch');
  for (const [day, floor] of Object.entries(next.leaseFloorByDay)) if (!date(day) || !integer(floor, 0, 10000)) throw new Error('invalid checkpoint lease floor');
  const seen = new Set();
  for (const r of next.simulatedRows) {
    const task = plan.tasks.find(t => t.symbol === r.symbol && t.targetDays.includes(r.day));
    if (!task || r.dataClass !== 'SYNTHETIC' || seen.has(key(r.symbol, r.day))) throw new Error('invalid or duplicate simulated coverage row');
    seen.add(key(r.symbol, r.day));
  }
  for (const e of next.events) if (!plan.tasks.some(t => t.taskId === e.taskId) || !iso(e.at)) throw new Error('invalid checkpoint event');
  return next;
}

// Uses PR178's actual budget class and transport with fixture-only fetch.
// Never accepts a fetch callback, credential or production database adapter.
export async function dryRunCoverage(plan, { budget, responses = {}, checkpoint = null, clock, maxRequests = 50 } = {}) {
  const copy = structuredClone(plan); delete copy.planDigest;
  if (plan.mode !== 'OFFLINE_ONLY' || sha(copy) !== plan.planDigest) throw new Error('plan identity mismatch');
  if (!(budget instanceof PersistentDailyBudget) || !offlineBudgets.has(budget)) throw new Error('isolated PR178 simulation budget required');
  if (!clock || typeof clock.now !== 'function' || typeof clock.advance !== 'function' || !integer(maxRequests, 0, 10000)) throw new Error('bounded simulation clock/request cap required');
  const state = initialCheckpoint(plan, checkpoint);
  const ledger = offlineLedgers.get(budget);
  for (const [day, floor] of Object.entries(state.leaseFloorByDay)) {
    if (!integer(ledger.days[day]?.leased, floor, 10000)) throw new Error('shared simulated ledger was reset or rewound');
  }
  const originalRows = JSON.stringify(state.simulatedRows);
  const transport = createBrsTransport({ now: clock.now, sleep: async ms => { clock.advance(ms); }, fetchImpl: async url => {
    const symbol = new URL(url).searchParams.get('l18');
    const response = responses[symbol];
    return { ok: response?.status === 200, status: response?.status ?? 503, json: async () => structuredClone(response ?? {}) };
  } });
  const complete = task => task.targetDays.every(day => state.simulatedRows.some(r => r.symbol === task.symbol && r.day === day));
  let simulatedRequests = 0, stopReason = null;
  for (const task of plan.tasks) {
    if (complete(task)) continue;
    if (state.events.filter(e => e.taskId === task.taskId).length >= plan.budget.maxAttempts) continue;
    if (simulatedRequests >= maxRequests) { stopReason = 'batch_request_cap'; break; }
    await budget.ensure();
    if (!budget.reserve(task.budgetClass)) {
      stopReason = budget.snapshot().remainingKnown ? 'shared_budget_exhausted' : 'shared_baseline_or_store_unknown';
      break;
    }
    simulatedRequests++;
    const res = await transport.fetch(`https://Api.BrsApi.ir/Tsetmc/Candlestick.php?type=2&l18=${encodeURIComponent(task.symbol)}`);
    const body = await res.json();
    let result = 'response_error';
    if (res.ok && body.dataClass === 'SYNTHETIC' && body.seriesType === 2 && body.symbol === task.symbol && Array.isArray(body.days) && body.days.every(date)) {
      for (const day of new Set(body.days)) {
        if (task.targetDays.includes(day) && !state.simulatedRows.some(r => r.symbol === task.symbol && r.day === day)) {
          state.simulatedRows.push({ symbol: task.symbol, day, seriesType: 2, dataClass: 'SYNTHETIC' });
        }
      }
      result = complete(task) ? 'simulated_complete' : 'empty_or_partial_not_done';
    }
    state.events.push({ taskId: task.taskId, at: new Date(clock.now()).toISOString(), result });
  }
  const completed = plan.tasks.filter(complete).map(t => t.taskId);
  for (const [day, entry] of Object.entries(ledger.days)) if (date(day) && integer(entry.leased, 0, 10000)) {
    state.leaseFloorByDay[day] = Math.max(state.leaseFloorByDay[day] ?? 0, entry.leased);
  }
  const attemptLimitedTaskIds = plan.tasks.filter(t => !complete(t) && state.events.filter(e => e.taskId === t.taskId).length >= plan.budget.maxAttempts).map(t => t.taskId);
  if (!stopReason && attemptLimitedTaskIds.length) stopReason = 'declared_attempt_cap';
  return { mode: 'OFFLINE_SIMULATION', planDigest: plan.planDigest, checkpoint: state, simulatedRequests,
    upstreamRequests: 0, liveDBCalls: 0, historyWrites: 0, blacklistWrites: 0,
    completedTaskIds: completed, pendingTaskIds: plan.tasks.filter(t => !complete(t)).map(t => t.taskId), attemptLimitedTaskIds, stopReason,
    priorRowsPreserved: originalRows === JSON.stringify(state.simulatedRows.slice(0, JSON.parse(originalRows).length)),
    legacyDonePreserved: sha(state.legacyDone) === sha(plan.legacyDone), transport: transport.metrics(),
    budget: budget.snapshot(), liveGate: plan.liveGate };
}

export function metadataCsv(rows, fields) {
  const escaped = x => { const s = String(x ?? ''); return `"${/^[=+@-]/.test(s) ? "'" : ''}${s.replaceAll('"', '""')}"`; };
  return [fields.map(escaped).join(','), ...rows.map(r => fields.map(f => escaped(own(r, f) ? r[f] : null)).join(','))].join('\n') + '\n';
}
