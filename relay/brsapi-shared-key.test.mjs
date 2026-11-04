import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PersistentDailyBudget} from './brsapi-client.mjs';
const source=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
const start=source.indexOf('let sharedBudgetInstance = null;');
const end=source.indexOf('let commodityBrs = null;',start);
assert.ok(start>=0 && end>start);
function wiring(key,{available=true}={}) {
  const days=new Map(),calls=[];
  const store={async lease(day,want,hard){calls.push(day);const before=days.get(day)||0;
    const granted=Math.min(want,hard-before);days.set(day,before+granted);
    return {granted,leasedBefore:before,hardCeiling:hard};}};
  const context={PersistentDailyBudget,BRSAPI_KEY:'main-key',SUPABASE_URL:'https://synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY:'synthetic',commodityConfig:()=>({key}),
    makeSupabaseLeaseStore:()=>available?store:null,errMsg:String,console:{warn(){},error(){}},
    process:{env:{BRSAPI_DAILY_SOFT:'2',BRSAPI_DAILY_HARD:'2',BRSAPI_LEASE_SIZE:'2'}}};
  vm.runInNewContext(source.slice(start,end)+'; globalThis.main=sharedBudget; globalThis.commodity=commodityBudget;',context);
  return {...context,calls};
}
test('main and commodity sharing a key consume one confirmed allowance',async()=>{
  const w=wiring('main-key'),main=w.main(),commodity=w.commodity();
  assert.equal(main,commodity);await Promise.all([main.ensure(),commodity.ensure()]);
  assert.equal(w.calls.length,1);assert.equal(main.reserve('critical'),true);
  assert.equal(commodity.reserve('critical'),true);assert.equal(main.reserve('critical'),false);
});
test('separate commodity key retains its distinct namespace',async()=>{
  const w=wiring('separate-key');assert.notEqual(w.main(),w.commodity());
  await w.main().ensure();await w.commodity().ensure();
  assert.equal(w.calls.length,2);assert.equal(w.calls[1],'commodity:'+w.calls[0]);
});
test('missing shared store cannot create a second allowance for the same key',()=>{
  const w=wiring('main-key',{available:false});assert.equal(w.main(),null);assert.equal(w.commodity(),null);
});
