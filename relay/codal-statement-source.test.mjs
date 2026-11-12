import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {admitDecisionStatement,loadDecisionStatement} from './codal-statement-source.mjs';
import {downloadAndParse} from './codal.mjs';
const income=await readFile(new URL('./fixtures/n10-decision/industrial-income.html',import.meta.url),'utf8');
const equity=await readFile(new URL('./fixtures/n10-decision/industrial-equity.html',import.meta.url),'utf8');
const url='https://codal.ir/Reports/Decision.aspx?LetterSerial=qV4MKXMUUbQQQaQQQ9cOOObOOO8qmo3wRg%3d%3d&rt=0&let=6&ct=0&ft=-1';
const meta={symbol:'فولاد',company_name:'فولاد مبارکه اصفهان',period_end:'1405-06-31',period_months:6,audited:false};
const capture=(html,url)=>{const htmlBytes=Buffer.from(html);return {url,htmlBytes,sha256:createHash('sha256').update(htmlBytes).digest('hex')};};
const parse=(i=income,e=equity,m=meta)=>admitDecisionStatement(capture(i,url),capture(e,url+'&sheetId=1060'),m,{link:url});
function editRoot(html,edit){
 const match=/var datasource\s*=\s*([\s\S]*?);\s*<\/script>/i.exec(html);
 assert.ok(match);const root=JSON.parse(match[1]);edit(root);
 return html.slice(0,match.index)+match[0].replace(match[1],JSON.stringify(root))+html.slice(match.index+match[0].length);
}
test('official industrial current statement binds two sheets and preserves unknown prior/EPS',()=>{
 const result=parse();assert.equal(result.reason,null);
 assert.deepEqual(result.data.standalone,{revenue:2509422184,cogs:1759586964,gross_profit:749835220,operating_profit:679984579,net_profit:591629286});
 assert.equal(result.data.capital,1935000000);assert.equal(result.data.unit,'میلیون ریال');
 assert.equal(result.data.period_months,6);assert.equal(result.data.statement_provenance.periodKind,'cumulative');
 assert.equal(result.data.standalone.prior,undefined);assert.equal(result.data.standalone.eps_rial,undefined);
});
test('scope, amount unit, issuer, period, hashes and sheet identity fail closed',()=>{
 for(const changed of [
  editRoot(income,r=>{r.isConsolidated=true;}),
  editRoot(income,r=>{r.period=3;}),
  editRoot(income,r=>{r.sheets[0].code=13;}),
  editRoot(income,r=>{r.sheets[0].isConsolidated=true;}),
  editRoot(income,r=>{r.sheets[0].tables[0].description='مبالغ به هزار ریال';}),
  income.replace('کلیه مبالغ درج شده به میلیون ریال می باشد','کلیه مبالغ درج شده به هزار ریال می باشد'),
 ])assert.equal(parse(changed).data,null);
 assert.equal(parse(income,equity,{...meta,symbol:'دیگر'}).data,null);
 const source=capture(income,url);source.sha256='0'.repeat(64);
 assert.equal(admitDecisionStatement(source,capture(equity,url+'&sheetId=1060'),meta,{link:url}).data,null);
});

test('source HTTP failures and unsupported redirects never become parser success or follow another host',async()=>{
 for(const response of [new Response('',{status:500}),new Response('',{status:302,headers:{location:'https://untrusted.invalid/'}}),new Response('',{status:302})]){
  let calls=0;
  await assert.rejects(loadDecisionStatement({link:url},meta,{fetchImpl:async()=>{calls++;return response;}}),/codal_statement_(http_500|redirect_unsupported)/);
  assert.equal(calls,1);
 }
});
test('missing, hidden, duplicated and inconsistent financial values never become zero or accepted',()=>{
 for(const mutate of [
  r=>{r.sheets[0].tables[0].cells.find(c=>c.address==='B4').value='';},
  r=>{r.sheets[0].tables[0].cells.find(c=>c.address==='B4').isVisible=false;},
  r=>{r.sheets[0].tables[0].cells.push({...r.sheets[0].tables[0].cells[0]});},
  r=>{r.sheets[0].tables[0].cells.find(c=>c.address==='B4').value='1';},
  r=>{r.sheets[0].tables[0].cells.find(c=>c.address==='B4').metaTableId=-1;},
 ])assert.equal(parse(editRoot(income,mutate)).data,null);
 assert.equal(parse(income,editRoot(equity,r=>{r.tracingNo++;})).data,null);
 assert.equal(parse(income,editRoot(equity,r=>{r.sheets[0].tables[0].cells.find(c=>c.address==='B34').value='';})).data,null);
 assert.equal(parse(income.replace('"isConsolidated":false','"isConsolidated":true,"isConsolidated":false')).data,null);
});
test('automatic adapter reads only publisher income and advertised equity sheet',async()=>{
 const requests=[];
 const result=await loadDecisionStatement({link:url},meta,{fetchImpl:async target=>{
  requests.push(target);assert.equal(new URL(target).hostname,'codal.ir');
  return new Response(new URL(target).searchParams.get('sheetId')==='1060'?equity:income);
 }});
 assert.equal(result.reason,null);assert.equal(requests.length,2);
 assert.equal(result.data.capital,1935000000);
 let calls=0;
 assert.equal((await loadDecisionStatement({link:'https://untrusted.invalid/Reports/Decision.aspx'},meta,{fetchImpl:async()=>{calls++;}})).data,null);
 assert.equal(calls,0);
});
test('existing automatic producer accepts source-bound statement without an Excel context bypass',async()=>{
 const previous=globalThis.fetch;let completed=0,rejected=0;
 globalThis.fetch=async target=>{
  const u=new URL(target);
  if(u.hostname==='excel.codal.ir')return new Response('<table></table>');
  assert.equal(u.hostname,'codal.ir','no additional provider or unmocked network');
  return new Response(u.searchParams.get('sheetId')==='1060'?equity:income);
 };
 try{
  const data=await downloadAndParse({link:url,link_excel:'https://excel.codal.ir/service/Excel/GetAll/fixture/0',l18:'فولاد',l30:'فولاد مبارکه اصفهان',title:'صورت‌های مالی 6 ماهه منتهی به 1405/06/31 (حسابرسی نشده)'},'ن-۱۰',()=>{completed++;},()=>{rejected++;});
  assert.equal(data?.standalone.revenue,2509422184);assert.equal(completed,1);assert.equal(rejected,0);
 }finally{globalThis.fetch=previous;}
});
