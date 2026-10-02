import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRatios, qualitativeMask } from '../core/engine';
import { rehearseAnswer, extractiveFixtureProvider } from './fixture-service';
test('195 missing gross remains unknown qualitative band; P08 rejects a raw financial projection',async()=>{
  const ratios=computeRatios({revenue:100,gross_profit:null,operating_profit:10,net_profit:5,eps_rial:null,capital:100,period_months:3,audited:false});
  assert.equal(ratios.gross_margin,null);assert.equal(qualitativeMask(ratios).gross_margin,'نامشخص');
  let calls=0;
  const result=await rehearseAnswer({intent:'missing-data',qualitative:{gross_margin:ratios.gross_margin}}, {subject:'fixture',cohort:'fixture'}, {
    resolve:async()=>({grants:[],sources:[]}),provider:{...extractiveFixtureProvider,async generate(p,s){calls++;return extractiveFixtureProvider.generate(p,s);}},
    controls:{enabled:()=>true,tokenBudget:10000,deadlineMs:100,now:()=>0},
  });assert.equal(result.reason,'unsafe-bands');assert.equal(calls,0);
});
