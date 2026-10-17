import { validTimestamp } from './market-quality';
import type { CommodityState } from './market-ir';

const MAX_FUTURE_MS = 120_000;
const OLD_AFTER_MS = 30 * 60_000;
export type QuoteClockState = 'recent' | 'old' | 'unknown' | 'future';
/** Quote age is not collector health: a market can be closed while its feed is received. */
export function quoteClock(at: number | null | undefined, now: number): { at: number | null; state: QuoteClockState } {
  const timestamp = validTimestamp(at);
  if (timestamp === null || !Number.isFinite(now)) return { at: null, state: 'unknown' };
  if (timestamp > now + MAX_FUTURE_MS) return { at: timestamp, state: 'future' };
  return { at: timestamp, state: now - timestamp >= OLD_AFTER_MS ? 'old' : 'recent' };
}
export const quoteClockLabel: Record<QuoteClockState, string> = {
  recent: 'زمان قیمت در بازهٔ اخیر است؛ دریافت فید جداگانه سنجیده می‌شود.',
  old: 'آخرین قیمت ثبت‌شده قدیمی‌تر از نیم ساعت است؛ این به‌تنهایی نشانهٔ اختلال دریافت نیست.',
  unknown: 'زمان کامل قیمت نامعلوم است.',
  future: 'زمان قیمت جلوتر از ساعت ارزیابی است و تازگی آن قابل تأیید نیست.',
};
/** Only age the independent receipt. Never derive a feed outage from an older quote. */
export function commodityReadQuality(state: CommodityState, receivedAt: number | null, now: number): CommodityState {
  if (state !== 'received') return state;
  const receipt = quoteClock(receivedAt, now);
  return receipt.state === 'old' ? 'stale' : receipt.state === 'recent' ? 'received' : 'unknown';
}
