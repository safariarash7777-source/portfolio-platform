import test from 'node:test';
import assert from 'node:assert/strict';
import {envFingerprint,retargetPlan} from './liara-retarget-relay.mjs';
const project={project_id:'arsadata',scale:1,status:'ACTIVE',envs:[
  {key:'SUPABASE_URL',value:'https://previous.invalid'},
  {key:'SUPABASE_SERVICE_ROLE_KEY',value:'fixture-old'},
  {key:'BRSAPI_KEY',value:'fixture-provider'},
  {key:'RELAY_TOKEN',value:'fixture-relay'},
  {key:'PHASE28',value:'off'},
]};
const target={expectedSourceHash:envFingerprint(project.envs),url:'https://62.60.191.24/liara-preview',serviceKey:'fixture.'+Buffer.from(JSON.stringify({role:'service_role',iss:'supabase',exp:4102444800})).toString('base64url')+'.fixture'};
test('reject a stale inventory before touching configuration',()=>assert.throws(()=>retargetPlan({...project,envs:[...project.envs,{key:'NEW_FLAG',value:'changed'}]},target),/changed since inventory/));
test('refuse multiple relay instances and unexpected destination',()=>{
  assert.throws(()=>retargetPlan({...project,scale:2},target),/single/);
  assert.throws(()=>retargetPlan(project,{...target,url:'https://unexpected.invalid'}),/destination/);
});
test('preserve unrelated provider and safety variables',()=>{
  const result=retargetPlan(project,target);
  assert.deepEqual(result.filter(x=>!x.key.startsWith('SUPABASE_')),project.envs.filter(x=>!x.key.startsWith('SUPABASE_')));
  assert.equal(result.find(x=>x.key==='SUPABASE_URL').value,target.url);
  assert.equal(project.envs[0].value,'https://previous.invalid');
});
