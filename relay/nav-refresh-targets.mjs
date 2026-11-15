const value = row => typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : 0;
const byValue = (a, b) => value(b) - value(a) || String(a.id).localeCompare(String(b.id));

// The caller retains symbol and blacklist checks for both schedules.
export function selectPriorityNavTargets(funds, limit) {
  return [...funds].sort(byValue).slice(0, limit);
}

// The slower schedule rotates through funds with missing or older receipts.
export function selectNavRefreshTargets(funds, cache, { now, limit }) {
  const receipt = id => {
    const value = cache.get(id)?.at;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now ? value : 0;
  };
  return [...funds].sort((a, b) => receipt(a.id) - receipt(b.id) || byValue(a, b))
    .slice(0, limit);
}
