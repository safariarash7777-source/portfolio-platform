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

test('publisher display-symbol header binds the same issuer without accepting ambiguous aliases',()=>{
 const modern=html=>html.replace(/<span\b[^>]*id="ctl00_lblDisplaySymbol"[^>]*>\s*<\/span>/,'').replaceAll('ctl00_txbSymbol','ctl00_lblDisplaySymbol');
 assert.equal(parse(modern(income),modern(equity)).data.standalone.net_profit,591629286);
 for(const changed of [
  modern(income).replace('id="ctl00_lblDisplaySymbol"','hidden id="ctl00_lblDisplaySymbol"'),
  modern(income)+'<span id="ctl00_txbSymbol">فولاد</span>',
  modern(income)+'<span id="ctl00_lblDisplaySymbol">دیگر</span>',
 ])assert.equal(parse(changed,modern(equity)).data,null);
 assert.equal(parse(modern(income),modern(equity),{...meta,symbol:'دیگر'}).data,null);
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

test('Excel server failure falls back to a validated same-report statement',async()=>{
 const previous=globalThis.fetch;let excelCalls=0,statementCalls=0,completed=0;
 globalThis.fetch=async target=>{
  const u=new URL(target);
  if(u.hostname==='excel.codal.ir'){excelCalls++;return new Response('',{status:500});}
  assert.equal(u.hostname,'codal.ir');statementCalls++;
  return new Response(u.searchParams.get('sheetId')==='1060'?equity:income);
 };
 try{
  const data=await downloadAndParse({link:url,link_excel:'https://excel.codal.ir/service/Excel/GetAll/fixture/0',l18:'فولاد',l30:'فولاد مبارکه اصفهان',title:'صورت‌های مالی 6 ماهه منتهی به 1405/06/31 (حسابرسی نشده)'},'ن-۱۰',()=>{completed++;});
  assert.equal(data?.standalone.revenue,2509422184);
  assert.equal(excelCalls,3);assert.equal(statementCalls,2);assert.equal(completed,1);
 }finally{globalThis.fetch=previous;}
});

test('local request deferral does not invoke statement fallback',async()=>{
 const previous=globalThis.fetch;let calls=0;
 const deferred=Object.assign(new Error('deferred'),{code:'brs_transport_queue_full'});
 globalThis.fetch=async()=>{calls++;throw deferred;};
 try{
  await assert.rejects(downloadAndParse({link:url,link_excel:'https://excel.codal.ir/service/Excel/GetAll/fixture/0'},'ن-۱۰'),e=>e===deferred);
  assert.equal(calls,1);
 }finally{globalThis.fetch=previous;}
});

test('rejected fallback preserves Excel source failure instead of parser success',async()=>{
 const previous=globalThis.fetch;let completed=0,rejected=0;
 globalThis.fetch=async target=>new URL(target).hostname==='excel.codal.ir'?new Response('',{status:500}):new Response('<html></html>');
 try{
  await assert.rejects(downloadAndParse({link:url,link_excel:'https://excel.codal.ir/service/Excel/GetAll/fixture/0'},'ن-۱۰',()=>{completed++;},()=>{rejected++;}),/excel HTTP 500/);
  assert.equal(completed,0);assert.equal(rejected,0);
 }finally{globalThis.fetch=previous;}
});

test('official audited mixed workbook follows advertised income sheet after auditor opinion',async()=>{
 const root=new URL('./fixtures/n10-audited/',import.meta.url);
 const landing=await readFile(new URL('auditor.html',root),'utf8');
 const inc=await readFile(new URL('income.html',root),'utf8');
 const eq=await readFile(new URL('equity.html',root),'utf8');
 const link='https://codal.ir/Reports/Decision.aspx?LetterSerial=NP5pO9KRGeydNngIiOEYNA%3d%3d&rt=0&let=6&ct=0&ft=-1';
 const meta={symbol:'قثابت',company_name:'کارخانه هاي توليدي و صنعتي ثابت خراسان',period_end:'1405-04-31',period_months:12,audited:true};
 const requests=[];
 const result=await loadDecisionStatement({link},meta,{fetchImpl:async target=>{
  requests.push(target);const u=new URL(target);assert.equal(u.hostname,'codal.ir');
  assert.equal(u.searchParams.get('LetterSerial'),new URL(link).searchParams.get('LetterSerial'));
  return new Response(u.searchParams.get('sheetId')==='1'?inc:u.searchParams.get('sheetId')==='1060'?eq:landing);
 }});
 assert.equal(result.reason,null);assert.equal(requests.length,3);
 assert.deepEqual(result.data.standalone,{revenue:15495349,cogs:14502518,gross_profit:992831,operating_profit:426926,net_profit:1479827});
 assert.equal(result.data.capital,6462809);assert.equal(result.data.statement_provenance.scope,'standalone');
 const parse=(i=inc,e=eq)=>admitDecisionStatement(capture(i,link+'&sheetId=1'),capture(e,link+'&sheetId=1060'),meta,{link});
 for(const changed of [
  inc.replace('<option value="13">صورت سود و زیان تلفیقی','<option value="1">صورت سود و زیان تلفیقی'),
  inc.replace('صورت سود و زیان تلفیقی','گزارش دیگر'),
  editRoot(inc,r=>{r.sheets[0].tables[0].title_Fa='صورت سود و زیان تلفیقی';}),
  editRoot(inc,r=>{r.period=6;}),
  editRoot(inc,r=>{r.sheets[0].tables[0].cells.find(c=>c.address==='B4').value='';}),
 ])assert.equal(parse(changed).data,null);
 assert.equal(parse(inc,editRoot(eq,r=>{r.tracingNo++;})).data,null);
 assert.equal(parse().data.statement_provenance.priorAccepted,false);
});
