import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodalAccessGuard, isCodalSourceDeferred } from './codal-source-access.mjs';
import { loadOfflineCodal } from './fixtures/codal-offline.mjs';
const challenge = '<h1>تأیید کاربر</h1><img id="captchaImage"><input id="captchaCode">کد امنیتی';

test('publisher challenge persists a bounded hold, survives restart and allows later scheduled access', () => {
  let clock = 1000;
  const guard = createCodalAccessGuard({ now: () => clock });
  guard.inspect('<table>گزارش مالی</table>');
  assert.throws(() => guard.inspect(challenge), isCodalSourceDeferred);
  assert.throws(() => guard.check(), isCodalSourceDeferred);
  const restarted = createCodalAccessGuard({ now: () => clock });
  restarted.restore(guard.snapshot());
  assert.throws(() => restarted.check(), isCodalSourceDeferred);
  clock += 6 * 60 * 60 * 1000;
  restarted.check();
  assert.throws(() => restarted.inspect(challenge), isCodalSourceDeferred);
  assert.throws(() => restarted.restore('0'), /invalid/);
});

test('actual Excel producer neither retries CAPTCHA nor falls back to another report route', async () => {
  const { parser, counts } = loadOfflineCodal({ fetchFixture: async () => new Response(challenge) });
  const report = { link_excel: 'https://excel.codal.ir/mock', link: 'https://codal.ir/mock' };
  await assert.rejects(parser.downloadAndParse(report, 'ن-۱۰'), isCodalSourceDeferred);
  await assert.rejects(parser.downloadAndParse(report, 'ن-۳۰'), isCodalSourceDeferred);
  assert.equal(counts.fixtureTransportCalls, 1);
});

test('actual official sheet reader shares the hold and issues no follow-up sheet request', async () => {
  const { loadDecisionStatement } = await import('./codal-statement-source.mjs');
  let calls = 0;
  const announcement = { link: 'https://codal.ir/Reports/Decision.aspx?LetterSerial=ValidSerial123' };
  const fetchImpl = async () => { calls++; return new Response(challenge); };
  await assert.rejects(loadDecisionStatement(announcement, {}, { fetchImpl }), isCodalSourceDeferred);
  await assert.rejects(loadDecisionStatement(announcement, {}, { fetchImpl }), isCodalSourceDeferred);
  assert.equal(calls, 1);
});
