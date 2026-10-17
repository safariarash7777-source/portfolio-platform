import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_TOOLS, parseDeskPreferences, parseDeskPreferenceReceipt, parseDeskPreferenceWrite } from './preferences';

const preferences = { schemaVersion: 1, layout: 2, hiddenTools: ['alerts'] };
const write = { ...preferences, expectedRevision: 0 };
const receipt = { preferences, revision: 7, updatedAt: '2026-10-17T10:00:00.000Z', allowedTools: [...DESK_TOOLS] };

test('preference and receipt parsers detach mutable arrays', () => {
  const input = { ...write, hiddenTools: ['alerts'] };
  const parsed = parseDeskPreferenceWrite(input);
  parsed.hiddenTools.push('reports');
  assert.deepEqual(input.hiddenTools, ['alerts']);
  const original = { ...receipt, preferences: { ...preferences, hiddenTools: ['alerts'] }, allowedTools: [...DESK_TOOLS] };
  const output = parseDeskPreferenceReceipt(original);
  output.allowedTools.pop(); output.preferences.hiddenTools.pop();
  assert.equal(original.allowedTools.length, 6);
  assert.deepEqual(original.preferences.hiddenTools, ['alerts']);
});

test('untrusted account or access fields are rejected instead of silently stripped', () => {
  for (const field of ['actorId', 'role', 'userId', 'allowedTools', '__proto__', 'access']) {
    const input = JSON.parse(JSON.stringify({ ...write, [field]: field === 'role' ? 'admin' : ['research'] }));
    assert.throws(() => parseDeskPreferenceWrite(input));
  }
});

test('only bounded known tools and layout versions are accepted', () => {
  for (const patch of [
    { schemaVersion: 2 }, { layout: '2' }, { layout: 0 }, { layout: 4 },
    { hiddenTools: ['admin'] }, { hiddenTools: ['chart', 'chart'] },
    { hiddenTools: [null] }, { hiddenTools: [['chart']] }, { hiddenTools: null },
  ]) assert.throws(() => parseDeskPreferences({ ...preferences, ...patch }));
  for (const layout of [1, 2, 3]) assert.equal(parseDeskPreferences({ ...preferences, layout }).layout, layout);
});

test('write revisions are mandatory finite safe nonnegative integers', () => {
  for (const expectedRevision of [undefined, null, -1, 1.1, '1', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseDeskPreferenceWrite({ ...write, expectedRevision }));
  }
  assert.equal(parseDeskPreferenceWrite(write).expectedRevision, 0);
  assert.equal(parseDeskPreferenceWrite({ ...write, expectedRevision: 14 }).expectedRevision, 14);
});

test('receipt tool scope must be complete and exact; malformed account receipts fail closed', () => {
  for (const allowedTools of [[], [...DESK_TOOLS, 'admin'], DESK_TOOLS.slice(1), [...DESK_TOOLS.slice(1), 'chart']]) {
    assert.throws(() => parseDeskPreferenceReceipt({ ...receipt, allowedTools }));
  }
  for (const revision of [-1, '7', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseDeskPreferenceReceipt({ ...receipt, revision }));
  assert.throws(() => parseDeskPreferenceReceipt({ ...receipt, actorId: 'forged' }));
  assert.throws(() => parseDeskPreferenceReceipt({ ...receipt, preferences: { ...preferences, role: 'admin' } }));
});

test('unsaved receipt has null timestamp; saved receipt requires a real timestamp', () => {
  assert.equal(parseDeskPreferenceReceipt({ ...receipt, revision: 0, updatedAt: null }).updatedAt, null);
  for (const updatedAt of [null, '', 'not-a-date', 123]) assert.throws(() => parseDeskPreferenceReceipt({ ...receipt, updatedAt }));
  assert.throws(() => parseDeskPreferenceReceipt({ ...receipt, revision: 0 }));
});
