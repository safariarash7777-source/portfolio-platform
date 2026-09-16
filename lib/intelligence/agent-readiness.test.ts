import assert from 'node:assert/strict';
import test from 'node:test';
import { agentReadiness } from './agent-readiness';
test('failed data read cannot become zero days or a passed gate', () => {
  const rows = agentReadiness({ unavailableReason: 'خواندن ناموفق', daysRecorded: 0 });
  assert.equal(rows.find(r => r.key === 'rehearsal')?.state, 'unknown');
});
test('ten days alone do not establish sources, provider or a runtime', () => {
  const rows = agentReadiness({ unavailableReason: null, daysRecorded: 10 });
  assert.equal(rows.find(r => r.key === 'rehearsal')?.state, 'observed');
  assert.equal(rows.find(r => r.key === 'sources')?.state, 'unknown');
  assert.equal(rows.find(r => r.key === 'runtime')?.state, 'missing');
});
test('nine days are incomplete without rounding up', () => {
  assert.equal(agentReadiness({ unavailableReason: null, daysRecorded: 9 }).find(r => r.key === 'rehearsal')?.state, 'missing');
});
