import { test } from 'node:test';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:8765';

test('verification target is explicitly the synthetic loopback fixture', async () => {
  assert.equal((await (await fetch('http://127.0.0.1:8766/health')).json()).fixture, true);
});
test('public pages, old home anchors and protected entry destinations survive', async () => {
  const home = await (await fetch(base)).text();
  for (const id of ['main-content', 'market', 'features', 'waitlist']) assert.ok(home.includes(`id="${id}"`), id);
  assert.ok(home.includes('/login?next=%2Fdashboard'));
  for (const route of ['/webinars', '/consultation']) {
    const response = await fetch(base + route); assert.equal(response.status, 200);
    const html = await response.text(); assert.ok(html.includes('main-content'));
    assert.ok(html.includes(`http://127.0.0.1:8765${route}`), 'canonical');
  }
  const consultation = await (await fetch(base + '/consultation')).text();
  assert.ok(consultation.includes('/login?next=%2Fdashboard%2Fconsultation'));
  assert.ok(consultation.includes('رزرو تأییدشده نیست') || consultation.includes('رزرو قطعی'));
});
test('unchanged waitlist endpoint validates, duplicates, fails and acknowledges through synthetic REST', async () => {
  const cases = [['invalid', 400], ['duplicate@example.test', 409], ['failure@example.test', 500], ['success@example.test', 200]];
  for (let i = 0; i < cases.length; i++) {
    const [email, expected] = cases[i];
    const response = await fetch(base + '/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `192.0.2.${i + 1}` }, body: JSON.stringify({ email }) });
    assert.equal(response.status, expected);
    if (expected === 200) assert.deepEqual(await response.json(), { success: true });
  }
});
