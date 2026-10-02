/** Executable DRAFT contract fixture. Not a canonical reader, grant or publication predicate. */
import { isCalendarDate } from './research-workbook';

export const P07_VALIDITY_DRAFT = 'p07.validity.draft.v1';
export type DraftValidity = 'unknown' | 'not_yet_valid' | 'within_time_window' | 'expired';

/** Contract timestamps require an explicit offset; preserve up to PostgreSQL microsecond precision. */
function instant(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || !isCalendarDate(match[1])) return null;
  const seconds = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[6]}`);
  if (!Number.isFinite(seconds)) return null;
  return BigInt(seconds) * BigInt(1000) + BigInt((match[5] ?? '').padEnd(6, '0'));
}

/** Explicit test clock only. Time validity alone never establishes active/authorized/approved state. */
export function evaluateDraftValidity(authoritativeNow: unknown, validFrom: unknown, validUntil: unknown): DraftValidity {
  const now = instant(authoritativeNow), from = instant(validFrom), until = instant(validUntil);
  if (now === null || from === null || until === null || until <= from) return 'unknown';
  if (now < from) return 'not_yet_valid';
  return now < until ? 'within_time_window' : 'expired';
}
