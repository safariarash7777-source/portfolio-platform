import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyReportKinds, discoverCompanyReports, EMPTY_REPORT_FILTER, type CompanyAnnouncement } from './companyReportDiscovery';

// Synthetic metadata only; no observed company data or numerical financial claims.
const rows: CompanyAnnouncement[] = [
  { title: 'صورت‌هاي مالي شرکت ۱۴۰۵', kind: 'ن-۱۰', date: '1405/04/31', time: '12:30:00', url: '/Reports/original' },
  { title: 'اصلاحیه صورت‌های مالی شركت ١٤٠٥', kind: 'ن-10', date: null, time: null, url: '/Reports/amended' },
  { title: 'فعالیت ماهانه', kind: 'ن-۳۰', date: '', time: null, url: null },
  { title: 'مجمع شرکت', kind: null, date: '  ', time: '18:00:00', url: null },
];

test('search normalizes Persian/Arabic spelling, digits, diacritics and half-spaces only for matching', () => {
  const input = structuredClone(rows);
  const found = discoverCompanyReports(input, { ...EMPTY_REPORT_FILTER, query: 'شِرکت مالی 1405' });
  assert.deepEqual(found.items, input.slice(0, 2));
  assert.equal(found.filter.query, 'شرکت مالی 1405');
  assert.deepEqual(input, rows, 'all source titles, clocks and URLs remain unchanged');
});

test('empty filters preserve response order and keep originals and amendments distinct', () => {
  const found = discoverCompanyReports(rows, EMPTY_REPORT_FILTER);
  assert.equal(found.scope, 'loaded_stored_announcements');
  assert.deepEqual(found.items, rows);
  assert.equal(found.items[0], rows[0]);
  assert.equal(found.items[1], rows[1]);
  assert.equal(found.excluded.length, 0);
  assert.equal(found.missingSentDate, 3);
});

test('type filtering matches normalized codes without substituting unknown types', () => {
  assert.deepEqual(discoverCompanyReports(rows, { ...EMPTY_REPORT_FILTER, kind: 'ن-١٠' }).items, rows.slice(0, 2));
  assert.deepEqual(discoverCompanyReports(rows, { ...EMPTY_REPORT_FILTER, kind: '' }).items, [rows[3]]);
  assert.deepEqual(companyReportKinds(rows), [{ value: 'ن-10', label: 'ن-۱۰' }, { value: 'ن-30', label: 'ن-۳۰' }]);
});

test('date filtering tests metadata presence only, never replaces a missing date with current time', () => {
  const missing = discoverCompanyReports(rows, { ...EMPTY_REPORT_FILTER, sentDate: 'missing' });
  assert.deepEqual(missing.items, rows.slice(1));
  assert.equal(missing.items[0].date, null);
  assert.deepEqual(discoverCompanyReports(rows, { ...EMPTY_REPORT_FILTER, sentDate: 'present' }).items, [rows[0]]);
  const invalid = { ...rows[0], date: 'unknown-format' };
  assert.deepEqual(discoverCompanyReports([invalid], { ...EMPTY_REPORT_FILTER, sentDate: 'present' }).items, [invalid], 'presence does not certify a calendar or freshness');
});

test('per-row exclusions and aggregate reasons are reproducible; overlapping reasons do not inflate excluded row count', () => {
  const filter = { query: 'ماهانه', kind: 'ن-10', sentDate: 'present' as const };
  const found = discoverCompanyReports(rows, filter);
  assert.equal(found.total, 4);
  assert.equal(found.items.length, 0);
  assert.equal(found.excluded.length, 4);
  assert.deepEqual(found.reasonCounts, { title_mismatch: 3, kind_mismatch: 2, sent_date_presence_mismatch: 3 });
  assert.deepEqual(found.excluded[2], { index: 2, row: rows[2], reasons: ['kind_mismatch', 'sent_date_presence_mismatch'] });
  assert.deepEqual(found, discoverCompanyReports(structuredClone(rows), filter));
});

test('zero returned rows is a subset result, not a whole-history completeness claim', () => {
  const found = discoverCompanyReports([], EMPTY_REPORT_FILTER);
  assert.equal(found.total, 0);
  assert.equal(found.missingSentDate, 0);
  assert.deepEqual(found.items, []);
  assert.deepEqual(found.excluded, []);
});

test('invalid date filter is rejected rather than silently narrowing the list', () => {
  assert.throws(() => discoverCompanyReports(rows, { ...EMPTY_REPORT_FILTER, sentDate: 'today' as 'all' }), /invalid_sent_date_filter/);
});
