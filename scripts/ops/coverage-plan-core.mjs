// Metadata-only, offline planning. No prices, network client or live worker.
import { createHash } from 'node:crypto';
import { isMainTicker } from '../../relay/symbols-util.mjs';

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

export function metadataCsv(rows, fields) {
  const escaped = x => { const s = String(x ?? ''); return `"${/^[=+@-]/.test(s) ? "'" : ''}${s.replaceAll('"', '""')}"`; };
  return [fields.map(escaped).join(','), ...rows.map(r => fields.map(f => escaped(own(r, f) ? r[f] : null)).join(','))].join('\n') + '\n';
}
