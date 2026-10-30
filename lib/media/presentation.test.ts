import { test } from "node:test";
import assert from "node:assert/strict";
import { appearanceFrom, filterMediaDates, mediaDateRange, recordedMediaDay, sourceUrl, uniqueMedia } from "./presentation";
test("appearance accepts only three layouts and bounded identifiers, without access fields", () => {
  assert.deepEqual(appearanceFrom({ layout: 900, covers: "https://evil.test", role: "admin", featured: ["a", "a", 12, "b".repeat(200)] }), { layout: 1, covers: "editorial", featured: ["a"] });
  assert.equal(appearanceFrom(null).layout, 1);
  assert.equal(appearanceFrom({ layout: 3 }).layout, 3);
});
test("source links reject active content, host spoofing and private Telegram invites", () => {
  for (const url of ["javascript:alert(1)", "https://instagram.com.evil.test/x", "https://x.com@evil.test", "https://t.me/+invite", "https://t.me/c/123/4", "https://t.me/joinchat/private", "http://t.me/arash/1"]) assert.equal(sourceUrl(url), null);
  assert.equal(sourceUrl("https://www.instagram.com/reel/one/?stkn=tracking"), "https://www.instagram.com/reel/one/");
});
test("repeated content is shown once without deleting source records", () => {
  const item = { id: "one", platform: "telegram" as const, kind: "post" as const, content_url: "https://t.me/public/1", title: "Public", description: null, published_at: null };
  const list = [item, { ...item, id: "two", content_url: "https://t.me/public/1?tracking=yes" }];
  assert.equal(uniqueMedia(list).length, 1);
  assert.equal(list.length, 2);
});

test("Telegram dedupe normalizes channel case and trailing slash without merging case-sensitive post IDs", () => {
  const item = { id: "one", platform: "telegram" as const, kind: "post" as const, title: null, description: null, published_at: null, content_url: "https://t.me/Public_Channel/123" };
  const rows = [item, { ...item, id: "two", content_url: "https://t.me/public_channel/123/" }, { ...item, id: "three", content_url: "https://t.me/PUBLIC_CHANNEL/123/?track=1" }];
  assert.equal(uniqueMedia(rows).length, 1);
  assert.equal(rows.length, 3);
  const instagram = { ...item, platform: "instagram" as const };
  assert.equal(uniqueMedia([{ ...instagram, content_url: "https://www.instagram.com/p/CaseID/" }, { ...instagram, id: "different", content_url: "https://www.instagram.com/p/caseid/" }]).length, 2);
});

test("public Twitter aliases retain path case and deduplicate to X while rejecting spoofed hosts and private Telegram", () => {
  assert.equal(sourceUrl("https://twitter.com/Person/status/AbC?tracking=1"), "https://x.com/Person/status/AbC");
  assert.equal(sourceUrl("https://www.twitter.com/Person/status/AbC"), "https://x.com/Person/status/AbC");
  assert.equal(sourceUrl("https://www.x.com/Person/status/AbC"), "https://x.com/Person/status/AbC");
  const item = { id: "one", platform: "twitter" as const, kind: "post" as const, title: null, description: null, published_at: null, content_url: "https://twitter.com/Person/status/AbC" };
  assert.equal(uniqueMedia([item, { ...item, id: "two", content_url: "https://x.com/Person/status/AbC/" }]).length, 1);
  for (const url of ["https://twitter.com.evil.test/u/1", "https://twitter.com@evil.test/u/1", "https://t.me/C/123/456", "https://t.me/JoinChat/private", "https://t.me/+invite"]) assert.equal(sourceUrl(url), null);
});

test('recorded media days use explicit Tehran calendar boundaries, never local parsing or rollover', () => {
  assert.equal(recordedMediaDay('2026-10-29T20:29:59.999Z'), '2026-10-29');
  assert.equal(recordedMediaDay('2026-10-29T20:30:00Z'), '2026-10-30');
  assert.equal(recordedMediaDay('2026-10-30T00:00:00+03:30'), '2026-10-30');
  assert.equal(recordedMediaDay('2026-10-30'), '2026-10-30');
  assert.equal(recordedMediaDay('2024-02-29T23:30:00-03:00'), '2024-03-01');
  for (const date of [null, '', 'yesterday', '2026-02-29', '2026-02-30T00:00:00Z', '2026-10-30T12:00:00', '2026-10-30T24:00:00Z', '2026-10-30T10:60:00Z', '2026-10-30T10:00:00+25:00']) assert.equal(recordedMediaDay(date), null, String(date));
});

test('date range normalizes user digits and validates each bound before comparing Gregorian days', () => {
  assert.deepEqual(mediaDateRange(' ۲۰۲۶-۱۰-۳۰ ', '٢٠٢٦-١٠-٣١'), { state: 'valid', from: '2026-10-30', to: '2026-10-31', active: true });
  assert.deepEqual(mediaDateRange('', ''), { state: 'valid', from: null, to: null, active: false });
  assert.deepEqual(mediaDateRange('2026-02-29', ''), { state: 'invalid', reason: 'from_invalid' });
  assert.deepEqual(mediaDateRange('', '2026-04-31'), { state: 'invalid', reason: 'to_invalid' });
  assert.deepEqual(mediaDateRange('2026-10-31', '2026-10-30'), { state: 'invalid', reason: 'reversed' });
  assert.equal(mediaDateRange('2024-02-29', '').state, 'valid');
});

test('inclusive and one-sided ranges preserve original rows and disclose unknown dates without rescuing dateLabel', () => {
  const rows = [
    { id: 'before', published_at: '2026-10-29T20:29:59Z' },
    { id: 'first', published_at: '2026-10-29T20:30:00Z' },
    { id: 'last', published_at: '2026-10-30T20:29:59.999Z' },
    { id: 'after', published_at: '2026-10-30T20:30:00Z' },
    { id: 'missing', published_at: null, dateLabel: '۸ آبان ۱۴۰۵' },
    { id: 'invalid', published_at: '2026-02-30T12:00:00Z' },
  ];
  const original = structuredClone(rows);
  const filtered = filterMediaDates(rows, '2026-10-30', '2026-10-30');
  assert.deepEqual(filtered.items.map(row => row.id), ['first', 'last']);
  assert.equal(filtered.items[0], rows[1]);
  assert.equal(filtered.excludedUnknown, 2);
  assert.deepEqual(filterMediaDates(rows, '', '2026-10-29').items.map(row => row.id), ['before']);
  assert.deepEqual(filterMediaDates(rows, '2026-10-31', '').items.map(row => row.id), ['after']);
  assert.deepEqual(filterMediaDates(rows, '', '').items, rows);
  assert.equal(filterMediaDates(rows, '', '').excludedUnknown, 0);
  const reversed = filterMediaDates(rows, '2026-10-31', '2026-10-30');
  assert.deepEqual(reversed.range, { state: 'invalid', reason: 'reversed' });
  assert.deepEqual(reversed.items, []);
  assert.deepEqual(rows, original);
});
