import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {extractN10Tables,inspectN10ReportBinding,admitN10Html} from './baseline/relay/codal.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.dirname(here);
const origin=JSON.parse(readFileSync(path.join(out,'p07-table-scope-proposal-20261104/proposal-instance.json')));
const evidence=JSON.parse(readFileSync(path.join(here,'archive-evidence.json')));
const capture=(name,rel)=>({url:origin[name].exactUrl,sha256:origin[name].sha256,htmlBytes:readFileSync(path.join(out,rel))});
const sources={decision:capture('decision','p07-public-codal-followup-20261104/folad-decision-attempt1.body'),excel:capture('excel','p07-public-codal-fixtures-20261104/feed-19270.body'),announcement:{link:origin.decision.exactUrl,link_excel:origin.excel.exactUrl}};
const html=sources.excel.htmlBytes.toString('utf8'),contexts=extractN10Tables(html);
const meta={symbol:'فولاد',company_name:'فولاد مبارکه اصفهان',period_end:'1405-06-31',period_months:6,audited:false};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const norm=value=>String(value).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]/g,'');
const decision=sources.decision.htmlBytes.toString('utf8');
const script=[...decision.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].find(m=>/var\s+datasource\s*=/.test(m[1]));
const datasource=JSON.parse(/var\s+datasource\s*=\s*([\s\S]*);\s*$/.exec(script[1])[1]);
const tables=datasource.sheets[0].tables;
const cell=address=>tables[0].cells.find(c=>c.address===address);

test('official captured bytes and exact reviewed producer snapshots match their hashes',()=>{
 assert.equal(sha(sources.excel.htmlBytes),'11349a3f2603ffee7949334e726dae7e6e33b9867e9828b67af3c638a6adda9d');
 assert.equal(sha(sources.decision.htmlBytes),'1a4904c496c09cf091c12ea14f40cc58c0777726d02761dd450487c0e857b1a2');
 const baseline=JSON.parse(readFileSync(path.join(here,'baseline.json')));
 for(const file of baseline.files)assert.equal(sha(readFileSync(path.join(here,'baseline',file.path))),file.sha256);
 assert.equal(evidence.sourceHashes.excel,sources.excel.sha256);
 assert.equal(evidence.sourceHashes.decision,sources.decision.sha256);
});

test('real report binds only current B and does not certify C, capital or hidden cells',()=>{
 const binding=inspectN10ReportBinding(html,meta,sources);
 assert.equal(binding.status,'current-column-bound');
 assert.equal(binding.target.tableCode,904);assert.equal(binding.target.metaTableId,3220);
 assert.equal(binding.target.column,'B');assert.equal(binding.scope,'standalone');
 assert.deepEqual(binding.period,{calendar:'jalali',periodKind:'cumulative',months:6,end:'1405-06-31',yearEnd:'1405-12-29'});
 assert.equal(binding.priorDuration,null);assert.equal(binding.capital,null);
 assert.equal(binding.data,null);assert.equal(binding.hiddenCellsAccepted,false);
});

test('actual full admission remains null at comparative-duration gate; legacy input also stays closed',()=>{
 const events=[],legacy=[];
 assert.equal(admitN10Html(html,meta,e=>events.push(e),sources),null);
 assert.deepEqual(events,[{kind:'ن-۱۰',reason:'period_unverified'}]);
 assert.equal(admitN10Html(html,meta,e=>legacy.push(e)),null);
 assert.deepEqual(legacy,[{kind:'ن-۱۰',reason:'scope_unknown'}]);
});

test('C1/C2 supply end and year-end but no duration; note table is not the bound income context',()=>{
 for(const address of ['C1','C2']){
  const c=cell(address);assert.equal(c.periodEndToDate,'1404/06/31');assert.equal(c.yearEndToDate,'1404/12/29');
  assert.equal(Object.keys(c).some(k=>/^(period|periodMonths|months|duration|periodStartToDate)$/i.test(k)),false);
  assert.equal(/ماهه/.test(c.value),false);
 }
 assert.equal(/ماهه/.test(contexts[0].localTitle+' '+contexts[0].localDescription+' '+contexts[0].rows[0][2]),false);
 assert.equal(contexts[9].columnsAmbiguous,true);
 assert.ok(contexts[9].rows[0].some(v=>/دوره ۶ ماهه منتهی به ۱۴۰۴\/۰۶\/۳۱/.test(v)));
 assert.deepEqual(tables.map(t=>t.code),[904,941]);
});

test('visible reported EPS rows remain distinct; hidden nominal input is evidence only, never executed',()=>{
 assert.equal(cell('B27').value,'308');assert.equal(cell('B28').value,'306');
 assert.equal(norm(cell('A27').value),norm(contexts[0].rows[26][0]));
 assert.equal(norm(cell('A28').value),norm(contexts[0].rows[27][0]));
 assert.equal(contexts[0].rows[26][1],'۳۰۸');assert.equal(contexts[0].rows[27][1],'۳۰۶');
 assert.ok(norm(cell('A28').value).includes('ریال'));
 assert.equal(cell('B28').formula,'=ROUND((B21/B29)*A30,0)');
 assert.equal(cell('C28').formula,'=ROUND((C21/C29)*B30,0)');
 assert.equal(cell('A30').isVisible,false);assert.equal(cell('B30').isVisible,false);
 assert.equal(cell('A30').value,'1000');assert.equal(cell('B30').value,'1000');
 // No formula evaluation, annualization, TTM or weighted-share derivation.
 assert.equal(evidence.data,null);
});

test('capital is observed at an as-of date; matching balances do not establish standalone table identity',()=>{
 assert.equal(cell('B29').value,'1935000000');assert.equal(cell('B29').periodEndToDate,'1405/06/31');
 assert.equal(contexts[4].rows[24][1],'۱,۹۳۵,۰۰۰,۰۰۰');
 assert.equal(contexts[5].rows[33][1],'۱,۹۳۵,۰۰۰,۰۰۰');
 assert.equal(contexts[5].rows[33][0],'مانده در ۱۴۰۵/۰۶/۳۱');
 assert.equal(contexts[5].rows[1][1],'۱,۵۰۰,۰۰۰,۰۰۰');
 assert.equal(contexts[5].rows[13][1],'۴۳۵,۰۰۰,۰۰۰');
 for(const index of [4,5]){
  assert.equal(contexts[index].contextValid,true);assert.equal(contexts[index].columnsAmbiguous,false);
  assert.equal(/جداگانه|مستقل|شرکتاصلی/.test(norm(contexts[index].localTitle+' '+contexts[index].localDescription)),false);
 }
 assert.equal(tables.some(t=>/Balance|Equity/i.test(t.aliasName)),false);
});
