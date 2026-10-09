import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrsApiClient, BudgetExceededError } from './brsapi-client.mjs';
const snapshot=()=>({used:1,hardCeiling:1});

for(const phase of ['admission','reserve'])test('budget-stop notification covers '+phase+' and a throwing observer cannot send or change rejection',async()=>{
  let notifications=0,sent=0,observed;
  const client=new BrsApiClient({base:'https://synthetic.invalid',key:'synthetic',
    budget:{wouldAdmit:()=>phase!=='admission',reserve:()=>false,snapshot},
    fetchImpl:async()=>{sent++;return Response.json([]);},
    onBudgetStop:(producer,error)=>{notifications++;observed={producer,error};throw new Error('synthetic observer fault');},
  });
  await assert.rejects(client.request({endpoint:'isolated',producer:'isolated'}),BudgetExceededError);
  assert.equal(sent,0);assert.equal(notifications,1);
  assert.equal(observed.producer,'isolated');assert.ok(observed.error instanceof BudgetExceededError);
});

test('ordinary HTTP rejection never reports a budget stop',async()=>{
  let notifications=0;
  const client=new BrsApiClient({base:'https://synthetic.invalid',key:'synthetic',
    budget:{wouldAdmit:()=>true,reserve:()=>true,snapshot},fetchImpl:async()=>new Response(null,{status:403}),
    onBudgetStop:()=>{notifications++;},
  });
  await assert.rejects(client.request({endpoint:'isolated',producer:'isolated'}));
  assert.equal(notifications,0);
});
