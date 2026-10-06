// Core source families share a transport, not a success or freshness clock.
export const MARKET_FAMILIES = ['gold', 'currency', 'crypto', 'stocks', 'funds', 'options', 'indices'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const clock = x => typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
const shaped = (p, k) => k === 'indices'
  ? p?.indices !== null && typeof p?.indices === 'object' && !Array.isArray(p.indices)
  : Array.isArray(p?.[k]);
const empty = (p, k) => k === 'indices' ? p?.indices == null : !p?.[k]?.length;
const absent = k => k === 'indices' ? null : [];

export function validStoredSnapshot(p) {
  return p !== null && typeof p === 'object' && !Array.isArray(p) &&
    MARKET_FAMILIES.every(k => k === 'indices' ? own(p, k) && (p[k] === null || shaped(p, k)) : shaped(p, k));
}

export function familyKnown(p, k) {
  if (!shaped(p, k)) return false;
  const q = p.snapshotQuality?.families?.[k];
  if (q) return q.state !== 'unavailable';
  // Old empty arrays did not distinguish timeout from successful emptiness.
  return !empty(p, k);
}

export function mergeStoredBaseline(current, stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return current;
  if (!current) return stored;
  const p = structuredClone(current);
  for (const k of MARKET_FAMILIES) {
    if (familyKnown(p, k) || !familyKnown(stored, k)) continue;
    p[k] = structuredClone(stored[k]);
    p.snapshotQuality ??= { families: {} };
    p.snapshotQuality.families ??= {};
    p.snapshotQuality.families[k] = stored.snapshotQuality?.families?.[k] || {
      state: 'stale', receivedAt: clock(stored.fetchedAt), retained: true,
    };
  }
  return p;
}

export function retainMarketFamilies(previous, candidate, outcomes, attemptedAt) {
  const payload = structuredClone(candidate);
  const fresh = structuredClone(candidate);
  const families = {};
  let successes = 0, known = 0;
  for (const k of MARKET_FAMILIES) {
    const ok = outcomes[k]?.ok === true && shaped(candidate, k);
    if (ok) {
      successes++;
      known++;
      families[k] = { state: empty(candidate, k) ? 'empty' : 'received', receivedAt: attemptedAt, retained: false, error: null };
    } else {
      const hasPrevious = familyKnown(previous, k);
      payload[k] = hasPrevious ? structuredClone(previous[k]) : absent(k);
      fresh[k] = absent(k);
      if (hasPrevious) known++;
      const receipt = previous?.snapshotQuality?.families?.[k];
      const receivedAt = hasPrevious ? (receipt && own(receipt, 'receivedAt') ? clock(receipt.receivedAt) : clock(previous.fetchedAt)) : null;
      families[k] = {
        state: hasPrevious ? 'stale' : 'unavailable',
        receivedAt: receivedAt !== null && receivedAt <= attemptedAt ? receivedAt : null,
        retained: hasPrevious, error: outcomes[k]?.error || 'source-failed',
      };
    }
  }
  const receipts = MARKET_FAMILIES.filter(k => familyKnown({ ...payload, snapshotQuality: { families } }, k)).map(k => families[k].receivedAt);
  // This is a receipt clock, never a substitute for a source validity time.
  payload.fetchedAt = receipts.length && receipts.every(x => x !== null) ? Math.min(...receipts) : null;
  payload.snapshotQuality = {
    version: 1, state: successes === MARKET_FAMILIES.length ? 'complete' : successes ? 'partial' : 'error',
    attemptedAt, families,
  };
  fresh.fetchedAt = attemptedAt;
  return { payload, fresh, successes, canServe: known > 0, complete: successes === MARKET_FAMILIES.length };
}

// No provider URL, response body, key, or exception text is published here.
export function sourceErrorCategory(error) {
  const s = String(error || '').toLowerCase();
  if (s.includes('timeout') || s.includes('abort')) return 'timeout';
  if (s.includes('budget') || s.includes('ceiling') || s.includes('quota')) return 'budget';
  if (s.includes('http')) return 'http';
  if (s.includes('schema') || s.includes('array') || s.includes('field')) return 'schema';
  return 'source-failed';
}
