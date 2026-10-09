import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOptions } from './options.mjs';

async function mapped(overrides={}) {
  let calls=0;
  const client={request:async options=>{calls++;assert.equal(options.endpoint,'Tsetmc/Option.php');return [{l18:'synthetic-option',type:'call',base_l18:'synthetic-base',pl:1000,pc:900,price_strike:2000,date_end:'1405-10-09',...overrides}];}};
  const rows=await fetchOptions('https://synthetic.invalid','synthetic-only',{client});
  assert.equal(calls,1,'mapping reuses the one existing response');
  assert.equal(rows.length,1);
  return rows[0];
}
test('missing option measurements stay null rather than zero',async()=>{
  const row=await mapped({day_remain:null,interest_open:null,tvol:'',tval:'  ',tno:false,plp:undefined,pl:true,pc:null,price_strike:false});
  for(const field of ['dayRemain','openInterest','volume','value','trades','changePercent','price','closingPrice','strike'])assert.equal(row[field],null,field);
});
test('explicit zero and negative price change retain their meanings',async()=>{
  const row=await mapped({interest_open:0,tvol:'0',tno:0,plp:-1,day_remain:-2});
  assert.equal(row.openInterest,0);assert.equal(row.volume,0);assert.equal(row.trades,0);
  assert.equal(row.changePercent,-1);assert.equal(row.dayRemain,-2);
});
test('documented size and supplied clock are preserved without inventing a date or source unit',async()=>{
  const row=await mapped({size_contract:5000,time:'12:30:01',tval:1234000});
  assert.equal(row.contractSize,5000);assert.equal(row.sourceTime,'12:30:01');assert.equal(row.sourceDate,null);
  assert.equal(row.priceUnit,'toman');assert.equal(row.valueUnit,null);
  assert.equal(row.value,1234000,'unknown source value unit does not trigger a guessed conversion');
  assert.equal(row.valueSourceField,'tval');assert.equal(row.price,100,'existing price conversion is unchanged');
});
test('invalid or absent contract size is unknown, never a default of 1000',async()=>{
  for(const size of [undefined,null,0,-1,false,'',1.5,[],[1000],{}])assert.equal((await mapped({size_contract:size})).contractSize,null);
});
