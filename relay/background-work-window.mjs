// Conservative workload policy, NOT an exchange calendar or a market-closed flag.
// Shared stock/fund quotes, NAV, on-demand reads and 24h markets remain unchanged.
export function backgroundWorkWindow(now = Date.now()) {
  if (!Number.isFinite(now) || now <= 0) return { offPeak: false, rotationIntervalMs: 0, issuerMultiplier: 1 };
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour:'2-digit',hourCycle:'h23' }).format(new Date(now)));
  const offPeak = hour >= 20 || hour < 8;
  return { offPeak, rotationIntervalMs: offPeak ? 60 * 60 * 1000 : 0, issuerMultiplier: offPeak ? 4 : 1 };
}
export function backgroundRotationDue(lastAt, now = Date.now()) {
  const { rotationIntervalMs } = backgroundWorkWindow(now);
  return !Number.isFinite(lastAt) || lastAt <= 0 || now < lastAt || now-lastAt >= rotationIntervalMs;
}
