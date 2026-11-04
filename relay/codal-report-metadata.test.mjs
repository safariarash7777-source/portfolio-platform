import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectN10ReportBinding, admitN10Html, extractN10Tables } from './codal.mjs';
import { container } from './fixtures/n10-admission-fixtures.mjs';

// Synthetic public-source shape; deliberately different table/trace/serial IDs
// from the archived specimen. No production exceptions or external requests.
function fixture(options = {}) {
  const months = options.months ?? 6, end = options.end ?? '1405/06/31', yearEnd = options.yearEnd ?? '1405/12/29';
  const meta = {symbol:'نمونه',company_name:'شرکت نمونه',period_end:end.replaceAll('/','-'),period_months:months,audited:false};
  const sheetCode = options.sheetCode ?? 7, code = options.tableCode ?? 501, metaTableId = options.metaTableId ?? 802;
  const labels = ['درآمدهای عملیاتی','بهای تمام شده درآمد','سود(زیان) ناخالص','سود(زیان) عملیاتی','سود(زیان) خالص'];
  const vals = ['100','(60)','40','30','20'], prior = ['80','(50)','30','20','10'];
  const cells = [];
  const cell = (address,rowSequence,columnSequence,value,group='Body',extra={}) => cells.push({
    address,rowSequence,columnSequence,value,cellGroupName:group,metaTableId,metaTableCode:code,
    colSpan:1,rowSpan:1,isVisible:true,formula:'',periodEndToDate:'',yearEndToDate:'',isAudited:false,...extra});
  cell('A1',1,1,'شرح','Header',{rowSpan:2});
  const currentLabel = `دوره منتهی به ${end}`;
  cell('B1',1,2,currentLabel,'Header',{periodEndToDate:end,yearEndToDate:yearEnd});
  cell('B2',2,2,'حسابرسی نشده','Header',{periodEndToDate:end,yearEndToDate:yearEnd});
  const priorLabel = `${options.priorMonths ? `دوره ${options.priorMonths} ماهه` : 'دوره'} منتهی به 1404/06/31`;
  cell('C1',1,3,priorLabel,'Header',{periodEndToDate:'1404/06/31',yearEndToDate:'1404/12/29'});
  cell('C2',2,3,'حسابرسی شده','Header',{periodEndToDate:'1404/06/31',yearEndToDate:'1404/12/29',isAudited:true});
  cell('D1',1,4,'دوره منتهی به 1404/12/29','Header',{periodEndToDate:'1404/12/29',yearEndToDate:'1404/12/29'});
  cell('D2',2,4,'حسابرسی شده','Header',{periodEndToDate:'1404/12/29',yearEndToDate:'1404/12/29',isAudited:true});
  cell('E1',1,5,'درصد تغییر','Header',{rowSpan:2});
  for (let i=0;i<labels.length;i++) {
    cell(`A${i+3}`,i+3,1,labels[i]); cell(`B${i+3}`,i+3,2,vals[i]);
    cell(`C${i+3}`,i+3,3,prior[i]); cell(`D${i+3}`,i+3,4,200);
    cell(`E${i+3}`,i+3,5,0); // JSON zero versus blank Excel percentage: not an identity failure.
  }
  cell('A8',8,1,'1000','Body',{isVisible:false});
  cell('B8',8,2,'999999','Body',{isVisible:false});
  const title = options.title ?? 'صورت سود و زیان', description = 'ارقام به میلیون ریال';
  const table = {code,metaTableId,sheetCode,aliasName:'IncomeStatement',title_Fa:title,description,cells};
  const root = {title_Fa:'صورت‌های مالی',period:months,periodEndToDate:end,yearEndToDate:yearEnd,
    periodExtraDay:0,isConsolidated:false,isAudited:false,tracingNo:options.tracingNo ?? 54321,
    sheets:[{code:sheetCode,tables:[table]}]};
  const rows = [["شرح",currentLabel,priorLabel,'دوره منتهی به 1404/12/29','درصد تغییر'],
    ['حسابرسی نشده','حسابرسی شده','حسابرسی شده'],...labels.map((label,i)=>[label,vals[i],prior[i],200,''])];
  let excel = container(rows,title,description);
  if (options.capital) excel += container([['شرح','سرمایه'],[`مانده در ${end}`,500]],
    `صورت تغییرات حقوق مالکانه جداگانه شرکت اصلی - دوره ${months} ماهه منتهی به ${end}`);
  const serial = options.serial ?? 'SYNTHETIC+REPORT==';
  const decisionUrl = `https://codal.ir/Reports/Decision.aspx?LetterSerial=${encodeURIComponent(serial)}&rt=0&let=6`;
  const excelUrl = `https://excel.codal.ir/service/Excel/GetAll/${encodeURIComponent(serial)}/0`;
  const span = (id,value)=>`<span id="${id}">${value}</span>`;
  const header = `<title>صورت‌های مالی میاندوره‌ای ${months} ماهه منتهی به ${end}</title>`+
    span('ctl00_txbCompanyName',meta.company_name)+span('ctl00_txbSymbol',meta.symbol)+
    span('ctl00_lblPeriod',`${months} ماهه`)+span('ctl00_lblPeriodEndToDate',end)+
    span('ctl00_lblYearEndToDate',yearEnd)+span('ctl00_lblIsAudited','حسابرسی نشده')+
    `<select id="ddlTable"><option selected="selected" value="${sheetCode}">صورت سود و زیان</option></select>`+
    `<input type="hidden" id="ctl00_cphBody_ucDynamicFinancialStatement_hdfLetterRef" value="${serial}">`;
  const capture = (url,html)=>{const htmlBytes=Buffer.from(html);return {url,htmlBytes,sha256:createHash('sha256').update(htmlBytes).digest('hex')};};
  return {root,table,meta,excel,header,capture,decisionUrl,excelUrl,
    sources(rootJson=JSON.stringify(root),decisionHeader=header,excelHtml=excel) {
      return {decision:capture(decisionUrl,decisionHeader+`<script>var datasource = ${rootJson};</script>`),
        excel:capture(excelUrl,excelHtml),announcement:{link:decisionUrl,link_excel:excelUrl}};
    }};
}
const inspect = f => inspectN10ReportBinding(f.excel,f.meta,f.sources());
function reject(f,sources=f.sources(),expected) {
  const result=inspectN10ReportBinding(f.excel,f.meta,sources);
  assert.equal(result.status,'rejected'); assert.equal(result.data,null);
  if(expected) assert.equal(result.reason,expected);
  assert.equal(admitN10Html(f.excel,f.meta,undefined,sources),null);
}

test('metadata binds one generic current B as Jalali cumulative; no partial full report',()=>{
  const f=fixture(), result=inspect(f);
  assert.equal(result.status,'current-column-bound');
  assert.deepEqual(result.period,{calendar:'jalali',periodKind:'cumulative',months:6,end:'1405-06-31',yearEnd:'1405-12-29'});
  assert.deepEqual(result.target,{sheetCode:7,tableCode:501,metaTableId:802,excelContextIndex:0,column:'B'});
  assert.equal(result.priorDuration,null); assert.equal(result.otherColumnDurations,null);
  assert.equal(result.capital,null); assert.equal(result.data,null); assert.equal(result.fullReportAccepted,false);
  const events=[];assert.equal(admitN10Html(f.excel,f.meta,e=>events.push(e),f.sources()),null);
  assert.deepEqual(events,[{kind:'ن-۱۰',reason:'period_unverified'}]);
  const legacy=[];assert.equal(admitN10Html(f.excel,f.meta,e=>legacy.push(e)),null);
  assert.deepEqual(legacy,[{kind:'ن-۱۰',reason:'scope_unknown'}]);
});
test('IDs and hashes are generic, not specimen exceptions',()=>{
  const f=fixture({sheetCode:13,tableCode:921,metaTableId:777,tracingNo:123456,serial:'OTHER/REPORT+=='});
  assert.equal(inspect(f).status,'current-column-bound');
});
test('explicit valid C closes only period; independent capital remains required',()=>{
  const f=fixture({priorMonths:6}),events=[];
  assert.equal(admitN10Html(f.excel,f.meta,e=>events.push(e),f.sources()),null);
  assert.deepEqual(events,[{kind:'ن-۱۰',reason:'capital_unverified'}]);
  const complete=fixture({priorMonths:6,capital:true});
  const data=admitN10Html(complete.excel,complete.meta,undefined,complete.sources());
  assert.equal(data.period_months,6);assert.equal(data.capital,500);assert.equal(data.standalone.revenue,100);
  assert.equal(data.standalone.prior.revenue,80);
});
test('blank percentage cells and hidden values are never imported',()=>{
  const f=fixture(),before=extractN10Tables(f.excel)[0].rows;
  const result=inspect(f);assert.equal(result.status,'current-column-bound');
  assert.equal(result.blankCellsReplaced,false);assert.equal(result.hiddenCellsAccepted,false);
  assert.ok(before.slice(2).every(r=>r[4]===''));
  assert.deepEqual(extractN10Tables(f.excel)[0].rows,before);
});
test('C or D dates/audit metadata never inherit current duration or audit flag',()=>{
  const f=fixture();f.table.cells.find(c=>c.address==='D1').periodEndToDate='1404/12/29';
  const result=inspect(f);assert.equal(result.status,'current-column-bound');assert.equal(result.priorDuration,null);
  assert.equal(f.table.cells.find(c=>c.address==='C1').isAudited,false);
  assert.equal(f.table.cells.find(c=>c.address==='C2').isAudited,true);
});
test('invalid Jalali month/day and non-leap Esfand reject',async t=>{
  for(const end of ['1405/07/31','1405/12/30','1405/13/01','1405/00/01','1405/06/00','1405/06/32','1405/02/99'])
    await t.test(end,()=>reject(fixture({end}),undefined,'period_mismatch'));
});
test('valid leap day remains a valid Jalali date',()=>{
  assert.equal(inspect(fixture({end:'1403/12/30',yearEnd:'1403/12/30',months:12})).status,'current-column-bound');
});
test('strict booleans/duration/extra-day types and consolidated reports reject',async t=>{
  for(const [key,value] of [['isConsolidated','false'],['isConsolidated',true],['isConsolidated',null],['isAudited','false'],
    ['period','6'],['period',6.5],['period',1],['periodExtraDay',1],['periodExtraDay','0'],['tracingNo',null]])
    await t.test(`${key}:${value}`,()=>{const f=fixture();f.root[key]=value;reject(f,undefined,'metadata_type_or_scope');});
});
test('six-month evidence cannot be relabelled as a quarter, month, or Gregorian period',()=>{
  for(const [key,value] of [['periodKind','quarter'],['periodKind','monthly'],['calendar','gregorian']]) {
    const f=fixture();f.root[key]=value;reject(f,undefined,'metadata_type_or_scope');
    const g=fixture();g.meta[key]=value;reject(g,undefined,'metadata_type_or_scope');
  }
});
test('duplicate JSON keys including escaped keys and nested table keys reject',()=>{
  const f=fixture(),json=JSON.stringify(f.root);
  reject(f,f.sources(json.replace('"period":6','"period":3,"period":6')),'duplicate_json_key');
  reject(f,f.sources(json.replace('"period":6','"per\\u0069od":3,"period":6')),'duplicate_json_key');
  reject(f,f.sources(json.replace('"code":501','"code":501,"code":501')),'duplicate_json_key');
});
test('malformed JSON and executable expressions are not evaluated',()=>{
  const f=fixture();reject(f,f.sources('(()=>{throw new Error("must not run")})()'),'json_invalid');
  reject(f,f.sources('{"period":6,}'),'json_invalid');
});
test('source hash, exact body, URL pairing and decoded serial must match',()=>{
  const f=fixture();let s=f.sources();s.decision.sha256='0'.repeat(64);reject(f,s,'source_hash_mismatch');
  s=f.sources();s.excel=f.capture(f.excelUrl,f.excel+' ');reject(f,s,'source_identity');
  s=f.sources();s.announcement.link_excel+='x';reject(f,s,'source_identity');
  s=f.sources();s.decision.url=s.announcement.link=s.decision.url.replace('SYNTHETIC','OTHER');reject(f,s,'source_identity');
  s=f.sources();s.decision.url=s.announcement.link=s.decision.url.replace('https:','http:');reject(f,s,'source_identity');
  s=f.sources();s.decision.url=s.announcement.link+='&LetterSerial=duplicate';reject(f,s,'source_identity');
});
test('header identity, duplicate IDs, hidden headers and publisher serial conflicts reject',()=>{
  const f=fixture();
  for(const h of [f.header.replace('شرکت نمونه','شرکت دیگر'),f.header.replace('6 ماهه','3 ماهه'),
    f.header.replace('حسابرسی نشده','حسابرسی شده'),f.header.replace('SYNTHETIC+REPORT==','OTHER'),
    f.header+'<span id="ctl00_lblPeriod">6 ماهه</span>',f.header.replace('id="ctl00_lblPeriod"','hidden id="ctl00_lblPeriod"'),
    f.header.replace('id="ctl00_lblPeriod"','data-id="ctl00_lblPeriod"')]) reject(f,f.sources(undefined,h));
});
test('scope conflicts and malformed standalone claims cannot be overridden',()=>{
  for(const title of ['صورت سود و زیان تلفیقی','صورت سود و زیان مستقل نیست','صورت سود و زیان مستقل از تورم']) reject(fixture({title}));
  for(const at of ['sheet','table']) {
    const f=fixture();(at==='sheet'?f.root.sheets[0]:f.table).isConsolidated=true;reject(f,undefined,'metadata_type_or_scope');
  }
});
test('ambiguous sheet/table/cell and shifted column identities reject',()=>{
  let f=fixture();f.root.sheets.push(structuredClone(f.root.sheets[0]));reject(f,undefined,'sheet_ambiguous');
  f=fixture();f.root.sheets[0].tables.push(structuredClone(f.table));reject(f,undefined,'table_ambiguous');
  f=fixture();f.table.cells.push(structuredClone(f.table.cells[0]));reject(f,undefined,'cell_identity');
  f=fixture();f.table.cells.find(c=>c.address==='B1').columnSequence=6;reject(f);
  f=fixture();f.table.cells.find(c=>c.address==='B1').isVisible=false;reject(f);
  f=fixture();f.table.cells.find(c=>c.address==='B1').periodEndToDate='1404/06/31';reject(f,undefined,'column_identity');
});
test('two matching Excel tables reject; other income contexts cannot inherit binding',()=>{
  const f=fixture();let html=f.excel+f.excel;
  assert.equal(inspectN10ReportBinding(html,f.meta,f.sources(undefined,undefined,html)).reason,'context_ambiguous');
  html=f.excel+f.excel.replace('صورت سود و زیان','صورت سود و زیان دیگر');
  const events=[];assert.equal(admitN10Html(html,f.meta,e=>events.push(e),f.sources(undefined,undefined,html)),null);
  assert.deepEqual(events,[{kind:'ن-۱۰',reason:'scope_unknown'}]);
});
test('unit conflict and visible numeric identity mismatch reject',()=>{
  const f=fixture();let html=f.excel.replace('میلیون ریال','هزار ریال');
  assert.equal(inspectN10ReportBinding(html,f.meta,f.sources(undefined,undefined,html)).status,'rejected');
  html=f.excel.replace('<td>100</td>','<td>101</td>');
  assert.equal(inspectN10ReportBinding(html,f.meta,f.sources(undefined,undefined,html)).reason,'row_identity');
});
test('metadata does not rewrite a contradictory local duration',()=>{
  const f=fixture();let html=f.excel.replace('دوره منتهی به 1405/06/31','دوره 3 ماهه منتهی به 1405/06/31');
  f.table.cells.find(c=>c.address==='B1').value='دوره 3 ماهه منتهی به 1405/06/31';
  assert.equal(inspectN10ReportBinding(html,f.meta,f.sources(undefined,undefined,html)).reason,'period_conflict');
});
