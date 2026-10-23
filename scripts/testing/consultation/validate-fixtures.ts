/** Feed only the synthetic SQL harness stdout on stdin; no database/network. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateConsultationRead} from '../../../lib/consultation/contracts';

let checked = 0;
for (const line of readFileSync(0, 'utf8').split(/\r?\n/)) {
 let item;
 try { item = JSON.parse(line); } catch { continue; }
 if (!item?.syntheticDossierFixture) continue;
 assert.ok(['consultation_explicit','consultation_legacy'].includes(item.profile));
 const result = validateConsultationRead(item.syntheticDossierFixture, {
  actorId: '00000000-0000-4000-8000-000000000003',
  period: {startOn:'2026-10-01',endOn:'2026-10-31'},
 });
 assert.equal(result.selected?.clientId, '00000000-0000-4000-8000-000000000001');
 assert.equal(result.dossier?.holdings?.positions.length, 2);
 assert.equal(result.dossier?.holdings?.debts.length, 2);
 assert.equal(result.dossier?.cashFlow?.payload.entries.length, 3);
 checked++;
}
assert.equal(checked, 2, 'Both PostgreSQL profiles must supply a populated fixture');
console.log(JSON.stringify({status:'PASS', validatedSyntheticDossiers: checked}));
