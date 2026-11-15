import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNavRefreshTargets, selectPriorityNavTargets } from './nav-refresh-targets.mjs';

test('ten leaders stay prioritized while four bounded rounds rotate through the rest', () => {
  const funds=Array.from({length:346},(_,i)=>({id:String(i),value:346-i}));
  const cache=new Map();
  const seen=new Set();
  const leaders=selectPriorityNavTargets(funds,10);
  assert.deepEqual(leaders.map(x=>x.id), funds.slice(0,10).map(x=>x.id));
  const quiet=funds.filter(x=>!leaders.includes(x));
  for(let round=1;round<=4;round++){
    const selected=selectNavRefreshTargets(quiet.filter(x=>!cache.has(x.id)),cache,{now:round*1000,limit:90});
    assert.equal(selected.length,round===4?66:90);
    for(const row of selected){seen.add(row.id);cache.set(row.id,{at:round*1000});}
  }
  assert.equal(seen.size,336);
  assert.equal(funds[0].id,'0');
});

test('missing, invalid and future receipts are not mistaken for fresh NAV', () => {
  const funds=[{id:'fresh',value:1e9},{id:'old',value:0},{id:'missing',value:0},{id:'future',value:0}];
  const cache=new Map([['fresh',{at:900}],['old',{at:100}],['future',{at:1100}]]);
  const rows=selectNavRefreshTargets(funds,cache,{now:1000,limit:3});
  assert.deepEqual(new Set(rows.map(r=>r.id)),new Set(['old','missing','future']));
});
