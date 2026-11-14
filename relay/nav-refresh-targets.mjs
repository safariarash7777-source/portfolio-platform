// Spend the existing bounded NAV allocation fairly across eligible funds.
// The caller retains symbol/blacklist checks. Missing or oldest receipts precede
// trading value, so quiet funds cannot be permanently starved by the top 150.
export function selectNavRefreshTargets(funds, cache, { now, limit }) {
  const receipt = id => {
    const value = cache.get(id)?.at;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now ? value : 0;
  };
  const value = row => typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : 0;
  return [...funds].sort((a, b) => receipt(a.id) - receipt(b.id)
    || value(b) - value(a) || String(a.id).localeCompare(String(b.id)))
    .slice(0, limit);
}
