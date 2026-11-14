// A publisher challenge is an access failure, never a bad financial report.
// Shared by Excel and official sheet readers. Persist the hold in their existing
// cycle state; no credential, CAPTCHA submission or alternate route is used.
const HOLD_MS = 6 * 60 * 60 * 1000;
export const isCodalSourceDeferred = error => error?.code === 'codal_source_challenge';
export function createCodalAccessGuard({ now = Date.now } = {}) {
  let until = 0;
  const error = () => Object.assign(new Error('codal_source_challenge'), { code: 'codal_source_challenge', noRetry: true });
  return {
    check() { if (until > now()) throw error(); },
    inspect(html) {
      if (/id\s*=\s*["']captchaCode["']/i.test(html) && /id\s*=\s*["']captchaImage["']/i.test(html)
        && /کد امنیتی|تأیید کاربر/.test(html)) {
        until = Math.max(until, now() + HOLD_MS);
        throw error();
      }
    },
    restore(value) {
      if (value == null) return;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('codal source hold invalid');
      until = Math.max(until, value);
    },
    snapshot() { return until; },
  };
}
export const codalAccess = createCodalAccessGuard();
