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

const tehranDay = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function navSourceDay(now) {
  const parts = Object.fromEntries(tehranDay.formatToParts(now).map(p => [p.type, p.value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function needsNavRefresh(entry, now, today, retryInterval, maxReceiptAge) {
  if (!entry || !Number.isFinite(entry.at) || entry.at <= 0 || entry.at > now) return true;
  const age = now - entry.at;
  if (age >= maxReceiptAge) return true;
  const day = typeof entry.navDate === 'string' ? entry.navDate.replaceAll('/', '-') : '';
  return age >= retryInterval && /^14[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(day) && day < today;
}
