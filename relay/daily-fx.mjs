import { tehranNow, isAfterClose, sessionTradeDate } from './eod.mjs';

const latin = value => typeof value === 'string' ? value.replace(/[۰-۹٠-٩]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c) >= 0 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c))) : '';
const sourceCalendar = new Intl.DateTimeFormat('en-US-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' });

/** Daily observations require a same-day source clock, not a fresh receipt. */
export function planDailyFx(payload, now = new Date(), afterHour = 14) {
  const today = tehranNow(now);
  if (!isAfterClose(today.hour, afterHour)) return { skip: 'before-close' };
  const usd = Array.isArray(payload?.currency) ? payload.currency.find(row => row?.id === 'USD') : null;
  if (!usd || typeof usd.price !== 'number' || !Number.isFinite(usd.price) || usd.price <= 0) return { skip: 'invalid-usd-price' };
  // The current mapper does not attest a rial conversion. Accept explicit raw
  // toman only; never infer units from the mapper's hard-coded `unit` label.
  if (usd.unit !== 'toman' || usd.sourceUnit !== 'تومان') return { skip: 'unverified-usd-unit' };
  const date = latin(usd.sourceDate).replaceAll('/', '-');
  const time = latin(usd.sourceTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return { skip: 'unknown-usd-source-clock' };
  const [hour, minute, second = 0] = time.split(':').map(Number);
  if (hour > 23 || minute > 59 || second > 59) return { skip: 'invalid-usd-source-clock' };
  const tradeDate = sessionTradeDate(date);
  if (!tradeDate) return { skip: 'invalid-usd-source-clock' };
  const sourceAt = Date.parse(`${tradeDate}T${time.length === 5 ? time + ':00' : time}+03:30`);
  if (!Number.isFinite(sourceAt)) return { skip: 'invalid-usd-source-clock' };
  const parts = sourceCalendar.formatToParts(new Date(sourceAt));
  const actual = ['year', 'month', 'day'].map(key => Number(parts.find(part => part.type === key)?.value));
  if (actual.some((part, i) => part !== date.split('-').map(Number)[i])) return { skip: 'invalid-usd-source-clock' };
  if (tradeDate !== today.date) return { skip: 'usd-source-not-today' };
  if (sourceAt > now.getTime()) return { skip: 'future-usd-source-clock' };
  if (!isAfterClose(hour, afterHour)) return { skip: 'usd-source-before-close' };
  return { row: { rate_date: tradeDate, usd_toman: usd.price, source: 'brsapi' } };
}

/** Request port is the existing DB transport; tests supply an offline mock. */
export async function writeDailyFx({ payload, now = new Date(), afterHour = 14, request }) {
  const plan = planDailyFx(payload, now, afterHour);
  if (plan.skip) return { complete: false, reason: plan.skip };
  const res = await request('POST', 'fx_rates', [plan.row]);
  if (res.ok) return { complete: true, row: plan.row };
  if (res.status !== 409) return { complete: false, reason: `fx-write-http-${res.status}` };
  const check = await request('GET', `fx_rates?select=rate_date,usd_toman,source&rate_date=eq.${plan.row.rate_date}&limit=2`);
  if (!check.ok) return { complete: false, reason: `fx-readback-http-${check.status}` };
  const rows = await check.json();
  const stored = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const exact = stored && stored.rate_date === plan.row.rate_date && stored.usd_toman === plan.row.usd_toman && stored.source === plan.row.source;
  return exact ? { complete: true, row: plan.row, alreadyStored: true } : { complete: false, reason: 'fx-conflict-not-verified' };
}
