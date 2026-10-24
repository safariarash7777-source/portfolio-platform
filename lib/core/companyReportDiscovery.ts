import { toLatinDigits } from '../format';

/** Metadata returned by the existing stored-announcement endpoint, not financial observations. */
export interface CompanyAnnouncement {
  title: string;
  kind: string | null;
  date: string | null;
  time: string | null;
  url: string | null;
}
export interface CompanyReportFilter {
  query: string;
  kind: string | null;
  sentDate: 'all' | 'present' | 'missing';
}
export type ReportExclusionReason = 'title_mismatch' | 'kind_mismatch' | 'sent_date_presence_mismatch';
export const EMPTY_REPORT_FILTER: CompanyReportFilter = { query: '', kind: null, sentDate: 'all' };

/** Search normalization only: original titles, dates and links are never rewritten. */
export function normalizeReportSearch(value: string): string {
  return toLatinDigits(value).normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\s\u200c\u200d]+/g, ' ').trim().toLocaleLowerCase('fa');
}

/** Pure filtering of one loaded subset. Never sorts, merges amendments or infers missing clocks.
 * `present` means only nonblank date metadata, not validated publication time/freshness.
 */
export function discoverCompanyReports<T extends CompanyAnnouncement>(rows: readonly T[], filter: CompanyReportFilter) {
  if (!['all', 'present', 'missing'].includes(filter.sentDate)) throw new Error('invalid_sent_date_filter');
  const normalized = {
    query: normalizeReportSearch(filter.query),
    kind: filter.kind === null ? null : normalizeReportSearch(filter.kind),
    sentDate: filter.sentDate,
  };
  const terms = normalized.query.split(' ').filter(Boolean);
  const decisions = rows.map((row, index) => {
    const reasons: ReportExclusionReason[] = [];
    const title = normalizeReportSearch(row.title);
    if (!terms.every(term => title.includes(term))) reasons.push('title_mismatch');
    if (normalized.kind !== null && normalizeReportSearch(row.kind ?? '') !== normalized.kind) reasons.push('kind_mismatch');
    const datePresent = typeof row.date === 'string' && row.date.trim().length > 0;
    if (normalized.sentDate !== 'all' && datePresent !== (normalized.sentDate === 'present')) reasons.push('sent_date_presence_mismatch');
    return { index, row, reasons };
  });
  const reasonCounts: Record<ReportExclusionReason, number> = { title_mismatch: 0, kind_mismatch: 0, sent_date_presence_mismatch: 0 };
  for (const entry of decisions) for (const reason of entry.reasons) reasonCounts[reason]++;
  return {
    scope: 'loaded_stored_announcements' as const,
    filter: normalized,
    total: rows.length,
    items: decisions.filter(entry => entry.reasons.length === 0).map(entry => entry.row),
    excluded: decisions.filter(entry => entry.reasons.length > 0),
    reasonCounts,
    missingSentDate: rows.filter(row => !row.date?.trim()).length,
  };
}

/** Group spelling variants for filter options only, keeping a source label for display. */
export function companyReportKinds(rows: readonly CompanyAnnouncement[]): Array<{ value: string; label: string }> {
  const kinds = new Map<string, string>();
  for (const row of rows) {
    const value = normalizeReportSearch(row.kind ?? '');
    if (value && !kinds.has(value)) kinds.set(value, row.kind!);
  }
  return [...kinds].map(([value, label]) => ({ value, label }));
}
