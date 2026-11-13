import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {admitInterimStatement,admitDecisionStatement,loadDecisionStatement} from './codal-statement-source.mjs';
const income=readFileSync(new URL('./fixtures/n10-interim/industrial-income.html',import.meta.url),'utf8');
const equity=readFileSync(new URL('./fixtures/n10-interim/industrial-equity.html',import.meta.url),'utf8');
const url='https://www.codal.ir/Reports/InterimStatement.aspx?LetterSerial=f7CWBx0JQQQaQQQdM0pmYwVNwKjQ%3d%3d';
const announcement={link:url.replace('www.codal.ir/Reports/InterimStatement','codal.ir/Reports/Decision')};
const meta={symbol:'فملی',company_name:'ملی صنایع مس ایران',period_end:'1404-12-29',period_months:12,audited:true};
function capture(html,requestedSheetCode){const htmlBytes=Buffer.from(html);return {htmlBytes,url,requestedSheetCode,sha256:createHash('sha256').update(htmlBytes).digest('hex')};}
const parse=(i=income,e=equity,m=meta)=>admitInterimStatement(capture(i,1),capture(e,1060),m,announcement);
test('automatic legacy loader binds form selection and uses returned form state',async()=>{
 const calls=[];
 const result=await loadDecisionStatement(announcement,meta,{fetchImpl:async(target,options)=>{
  calls.push({target,options});
  if(calls.length===1)return new Response(null,{status:302,headers:{location:url}});
  if(calls.length===2)return new Response(income);
  assert.equal(target,url);
  assert.equal(options.method,'POST');
  const form=new URLSearchParams(options.body);
  assert.equal(form.get('ctl00$ddlTable'),calls.length===3?'1':'1060');
  assert.equal(form.get('ctl00$btnNextPage'),'');
  assert.ok(form.has('__VIEWSTATE'));
  assert.equal(options.headers.authorization,undefined);
  return new Response(calls.length===3?income:equity);
 }});
 assert.equal(calls.length,4);assert.equal(result.reason,null);
 assert.equal(result.data.capital,1050000000);
});
test('legacy loader rejects foreign form before any POST',async()=>{
 let count=0;
 const result=await loadDecisionStatement(announcement,meta,{fetchImpl:async()=>{
  count++;
  return count===1?new Response(null,{status:302,headers:{location:url}}):new Response(income.replace('action="./InterimStatement.aspx','action="https://untrusted.invalid/InterimStatement.aspx'));
 }});
 assert.equal(count,2);assert.equal(result.data,null);assert.equal(result.reason,'source_context_invalid');
});
function editRoot(html,edit){
 const m=/var datasource\s*=\s*([\s\S]*?);\s*<\/script>/i.exec(html);assert.ok(m);
 const root=JSON.parse(m[1]);edit(root);
 return html.slice(0,m.index)+m[0].replace(m[1],JSON.stringify(root))+html.slice(m.index+m[0].length);
}
test('official mixed workbook admits only its explicitly selected standalone sheets',()=>{
 const r=parse();assert.equal(r.reason,null);
 assert.deepEqual(r.data.standalone,{revenue:3218894510,cogs:1354424181,gross_profit:1864470329,operating_profit:1806426640,net_profit:1506011965});
 assert.equal(r.data.capital,1050000000);assert.equal(r.data.unit,'میلیون ریال');
 assert.equal(r.data.statement_provenance.scope,'standalone');assert.equal(r.data.statement_provenance.tracingNo,1564582);
 assert.equal(r.data.standalone.prior,undefined);assert.equal(r.data.standalone.eps_rial,undefined);
 assert.equal(admitDecisionStatement(capture(income,1),capture(equity,1060),meta,announcement).data,null);
});
test('legacy source requires exact same-report form and selected sheet witness',()=>{
 for(const altered of [
  income.replace('action="./InterimStatement.aspx','action="https://untrusted.invalid/InterimStatement.aspx'),
  income.replace('method="post"','method="get"'),
  income.replace('value="13">صورت سود و زیان تلفیقی','value="1">صورت سود و زیان تلفیقی'),
  income.replace('selected="selected" value="1"','selected="selected" value="13"'),
  income.replace('value="13">صورت سود و زیان تلفیقی','value="13">نامشخص'),
 ]){assert.notEqual(altered,income,'test must alter the real fixture');assert.equal(parse(altered).data,null);}
 for(const code of [undefined,13,1060,'1'])assert.equal(admitInterimStatement(capture(income,code),capture(equity,1060),meta,announcement).data,null);
 const other=capture(equity,1060);other.url=url.replace('f7CWB','different');
 assert.equal(admitInterimStatement(capture(income,1),other,meta,announcement).data,null);
});
test('mixed workbook cannot conceal conflicting scope, period, unit or missing amounts',()=>{
 for(const mutate of [
  r=>r.type=7,
  r=>r.title_En='FinancialStatement-Consolidated-Listed-Bank-V9',
  r=>r.sheets[0].title_Fa='صورت سود و زیان تلفیقی',
  r=>r.sheets[0].tables[0].isConsolidated=true,
  r=>r.sheets[0].tables[0].description='مبالغ به هزار ریال',
  r=>r.period=6,
  r=>r.sheets[0].tables[0].cells.find(c=>c.address==='B4').value='',
 ])assert.equal(parse(editRoot(income,mutate)).data,null);
 assert.equal(parse(income,editRoot(equity,r=>r.tracingNo++)).data,null);
 assert.equal(parse(income,equity,{...meta,audited:false}).data,null);
 assert.equal(parse(income,equity,{...meta,symbol:'فولاد'}).data,null);
});
