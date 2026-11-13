import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// Bounded interpretation of public publisher reports without executing their
// scripts. Admission binds income and capital to the same issuer and report;
// the loader below supplies captures and the existing engine owns persistence.
const MAX_DECISION = 2 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error(reason); };
export function supportsDecisionUrl(value){
 try{const u=new URL(value);if(u.hostname==='www.codal.ir')u.hostname='codal.ir';return !!reportSerial(u.href,true);}catch{return false;}
}

/** Native JSON grammar plus a duplicate-key walk (including escaped keys).
 * Existing capitalization JSON deliberately uses last-key-wins and is not a
 * suitable parser for ownership evidence. Never evaluate an object expression. */
function uniqueJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('json_invalid'); }
  let i = 0, tokens = 0;
  const space = () => { while (/\s/.test(text[i] ?? '') && i < text.length) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = depth => {
    if (depth > 64 || ++tokens > 200000) fail('json_limit');
    space();
    if (text[i] === '{') {
      i++; space(); const keys = new Set();
      while (text[i] !== '}') {
        const key = string();
        if (keys.has(key)) fail('duplicate_json_key');
        keys.add(key); space(); i++; value(depth + 1); space();
        if (text[i] === ',') { i++; space(); } else break;
      }
      i++;
    } else if (text[i] === '[') {
      i++; space();
      while (text[i] !== ']') {
        value(depth + 1); space();
        if (text[i] === ',') { i++; space(); } else break;
      }
      i++;
    } else if (text[i] === '"') string();
    else { while (i < text.length && !/[\s,}\]]/.test(text[i])) i++; }
  };
  value(0);
  return parsed;
}

// Find a top-level var datasource = JSON at the end of one inline script.
// Quoted strings and comments cannot create a declaration. Braces inside JSON
// strings are skipped. Publisher code is only text, never imported or evaluated.
function literalDatasource(html) {
  const found = [];
  for (const match of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    const script = match[2];
    let depth = 0;
    for (let i = 0; i < script.length;) {
      const c = script[i];
      if (c === '"' || c === "'" || c === '`') {
        i++; while (i < script.length && script[i] !== c) { if (script[i] === '\\') i++; i++; } i++; continue;
      }
      if (script.slice(i, i + 2) === '//') { i = script.indexOf('\n', i); if (i < 0) break; continue; }
      if (script.slice(i, i + 2) === '/*') { i = script.indexOf('*/', i + 2); if (i < 0) fail('json_invalid'); i += 2; continue; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (/[\w$]/.test(c)) {
        const token = /^[\w$]+/.exec(script.slice(i))[0];
        if (token === 'var' && depth === 0) {
          const declaration = /^var\s+datasource\s*=\s*/.exec(script.slice(i));
          if (declaration) {
            const tail = script.slice(i + declaration[0].length).trim();
            if (!tail.endsWith(';')) fail('json_invalid');
            found.push(uniqueJson(tail.slice(0, -1)));
            break;
          }
        }
        i += token.length;
      } else i++;
    }
  }
  if (found.length !== 1) fail('datasource_ambiguous');
  return found[0];
}

function attributes(opening) {
  return [...opening.matchAll(/\s+([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)]
    .map(m => ({name:m[1].toLowerCase(),value:m[2] ?? m[3] ?? m[4] ?? null}));
}
function attr(opening, name) {
  const matches = attributes(opening).filter(a => a.name === name);
  if (matches.length !== 1) fail('header_ambiguous');
  return matches[0].value;
}
function element(html, tag, id) {
  const matches = [...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>[\\s\\S]*?<\\/'+tag+'\\s*>', 'gi'))]
    .filter(m => attributes(m[0].slice(0, m[0].indexOf('>') + 1)).some(a=>a.name==='id' && a.value===id));
  if (matches.length !== 1) fail('header_ambiguous');
  const opening = matches[0][0].slice(0, matches[0][0].indexOf('>') + 1);
  if (attr(opening, 'id') !== id || /\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden/i.test(opening)) fail('header_invalid');
  return matches[0][0];
}
function sourceText(source, limit) {
  if (!source || !(source.htmlBytes instanceof Uint8Array) || source.htmlBytes.byteLength > limit ||
      !source.htmlBytes.byteLength || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256) || hash(source.htmlBytes) !== source.sha256) fail('source_hash_mismatch');
  const bytes = Buffer.from(source.htmlBytes);
  const text = bytes.toString('utf8');
  if (!bytes.equals(Buffer.from(text, 'utf8'))) fail('source_encoding');
  return text;
}
function reportSerial(url, decision, interim = false) {
  if (typeof url !== 'string' || url.length>4096 || url.trim() !== url) fail('source_identity');
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.port ||
      !(decision ? (u.hostname === 'codal.ir' || interim && u.hostname === 'www.codal.ir') : u.hostname === 'excel.codal.ir')) fail('source_identity');
  if (decision) {
    if (u.pathname !== (interim ? '/Reports/InterimStatement.aspx' : '/Reports/Decision.aspx')) fail('source_identity');
    const pairs = u.search.slice(1).split('&').map(p => p.split('='));
    const serials = pairs.filter(p => p[0] === 'LetterSerial');
    if (serials.length !== 1 || serials[0].length !== 2) fail('source_identity');
    return decodeURIComponent(serials[0][1]); // Do NOT apply URLSearchParams plus-to-space semantics.
  }
  if (u.search) fail('source_identity');
  const match = /^\/service\/Excel\/GetAll\/([^/]+)\/0$/.exec(u.pathname);
  if (!match) fail('source_identity');
  return decodeURIComponent(match[1]);
}

const digits = value => String(value ?? '').replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
const norm = value => digits(value).replace(/ي|ى/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c\u200e\u200f()\-–:،؛]/g,'');
const text = html => html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').trim();
const day = value => {
 const m=digits(value).match(/^(1[34]\d{2})[/-](\d{2})[/-](\d{2})$/);
 if(!m || +m[2]<1 || +m[2]>12 || +m[3]<1 || +m[3]>(+m[2]<=6?31:30))fail('period_invalid');
 return m.slice(1).join('-');
};
const number = value => {
 if(typeof value!=='string' && typeof value!=='number')fail('value_unobserved');
 const s=digits(value).replace(/[,\s\u066c]/g,'');
 const signed=/^\(\d+(\.\d+)?\)$/.test(s)?'-'+s.slice(1,-1):s;
 if(!/^-?\d+(\.\d+)?$/.test(signed)||!Number.isFinite(Number(signed)))fail('value_unobserved');
 return Number(signed);
};

function document(source,meta,announcement,alias,interim=false) {
 const serial=reportSerial(source.url,true,interim);
 if(serial!==reportSerial(announcement.link,true))fail('source_identity');
 const html=sourceText(source,MAX_DECISION);
 const root=literalDatasource(html);
 // The legacy route additionally proves the selected standalone sheet against
 // its separately advertised consolidated counterpart; the default stays closed.
 const mixed=interim && root.isConsolidated===true && /^FinancialStatement-Consolidated-Listed-Product-V\d+$/.test(root.title_En??'');
 if((root.isConsolidated!==false && !mixed) || !Number.isSafeInteger(root.tracingNo) || root.tracingNo<=0 ||
    root.type!==6 || typeof root.isAudited!=='boolean' || root.periodExtraDay!==0 ||
    ![3,6,9,12].includes(root.period) || (!mixed && !/FinancialStatement-Listed-Product/.test(root.title_En??'')))fail('scope_unsupported');
 if(root.period!==meta.period_months || day(root.periodEndToDate)!==meta.period_end || root.isAudited!==meta.audited ||
    day(root.yearEndToDate)<meta.period_end)fail('period_mismatch');
 const visible=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const label=id=>text(element(visible,'span',id));
 if(norm(label('ctl00_txbSymbol'))!==norm(meta.symbol) || !norm(meta.symbol) ||
    norm(label('ctl00_txbCompanyName'))!==norm(meta.company_name) || !norm(meta.company_name) ||
    day(label('ctl00_lblPeriodEndToDate'))!==meta.period_end ||
    norm(label('ctl00_lblPeriod'))!==`${root.period}ماهه` ||
    norm(text(element(visible,'p','ctl00_pPriceNote')))!==norm('کلیه مبالغ درج شده به میلیون ریال می باشد'))fail('header_conflict');
 const refs=[...visible.matchAll(/<input\b[^>]*>/gi)].filter(m=>attributes(m[0]).some(a=>a.name==='id'&&a.value==='ctl00_cphBody_ucDynamicFinancialStatement_hdfLetterRef'));
 if(refs.length!==1 || attr(refs[0][0],'value')!==serial)fail('source_identity');
 const select=element(visible,'select',interim?'ctl00_ddlTable':'ddlTable');
 const options=[...select.matchAll(/<option\b[^>]*>/gi)].filter(m=>attributes(m[0]).some(a=>a.name==='selected'));
 if(options.length!==1 || !Array.isArray(root.sheets) || root.sheets.length!==1)fail('sheet_ambiguous');
 const sheet=root.sheets[0];
 if(sheet.aliasName!==alias || String(sheet.code)!==attr(options[0][0],'value') || !Array.isArray(sheet.tables))fail('sheet_identity');
 const requested=new URL(source.url).searchParams.get('sheetId');
 if(requested!==null && requested!==String(sheet.code))fail('sheet_identity');
 const tables=sheet.tables.filter(t=>t.aliasName===alias);
 if(tables.length!==1)fail('table_ambiguous');
 const table=tables[0];
 if(table.sheetCode!==sheet.code || !Number.isSafeInteger(table.code)||!Number.isSafeInteger(table.metaTableId)||
    /تلفیقی/.test(norm(table.title_Fa)) || !Array.isArray(table.cells) || table.cells.length>20000)fail('table_identity');
 const title=alias==='IncomeStatement'?'صورت سود و زیان':'صورت تغییرات در حقوق مالکانه';
 if(interim){
  const form=element(visible,'form','aspnetForm');
  const opening=form.slice(0,form.indexOf('>')+1);
  const action=new URL(attr(opening,'action'),source.url);
  if(attr(opening,'method')?.toLowerCase()!=='post' || reportSerial(action.href,true,true)!==serial ||
     action.origin!==new URL(source.url).origin || source.requestedSheetCode!==sheet.code)fail('source_identity');
  const choices=[...select.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)];
  const selected=choices.filter(m=>attributes('<option '+m[1]+'>').some(a=>a.name==='selected'));
  if(selected.length!==1 || norm(text(selected[0][2]))!==norm(title))fail('scope_unsupported');
  if(mixed){
   const own=choices.filter(m=>norm(text(m[2]))===norm(title));
   const group=choices.filter(m=>norm(text(m[2]))===norm(title+' تلفیقی'));
   if(own.length!==1||group.length!==1||attr('<option '+group[0][1]+'>','value')===String(sheet.code))fail('scope_unsupported');
  }
 }
 for(const owner of [sheet,table])if(norm(owner.title_Fa)!==norm(title)||
    (owner.isConsolidated!==undefined&&owner.isConsolidated!==false))fail('scope_unsupported');
 if(table.description && (!norm(table.description).includes('میلیونریال')||/هزار|میلیارد|تومان|دلار|یورو/.test(norm(table.description))))fail('header_conflict');
 const cells=new Map();
 for(const c of table.cells){
  if(!Number.isSafeInteger(c.rowSequence)||!Number.isSafeInteger(c.columnSequence)||c.rowSequence<1||c.columnSequence<1||
     c.metaTableId!==table.metaTableId||c.metaTableCode!==table.code||typeof c.isVisible!=='boolean')fail('cell_identity');
  const a=/^([A-Z]+)([1-9]\d*)$/.exec(c.address??'');
  if(!a||+a[2]!==c.rowSequence||[...a[1]].reduce((n,v)=>n*26+v.charCodeAt(0)-64,0)!==c.columnSequence||cells.has(c.address))fail('cell_identity');
  cells.set(c.address,c);
 }
 return {root,sheet,table,cells,html,source};
}

/** Source-bound current cumulative industrial statement. Prior columns are
 * intentionally absent until their own duration is proven. No zero filling. */
function admitStatement(income,equity,meta,announcement,interim=false){
 try{
  const inc=document(income,meta,announcement,'IncomeStatement',interim);
  const eq=document(equity,meta,announcement,'ChangesInPropertyRights',interim);
  if(inc.root.tracingNo!==eq.root.tracingNo || inc.root.yearEndToDate!==eq.root.yearEndToDate || inc.root.isConsolidated!==eq.root.isConsolidated)fail('source_identity');
  const cell=(doc,address,group)=>{
   const c=doc.cells.get(address);
   if(!c||!c.isVisible||c.cellGroupName!==group||c.colSpan!==1||c.rowSpan!==1)fail('cell_unobserved');
   return c;
  };
  const header=cell(inc,'B1','Header');
  const dates=digits(header.value).match(/1[34]\d{2}\/\d{2}\/\d{2}/g)??[];
  if(dates.length!==1||day(dates[0])!==meta.period_end)fail('period_mismatch');
  const rowValue=names=>{
   const labels=[...inc.cells.values()].filter(c=>c.columnSequence===1&&c.cellGroupName==='Body'&&c.isVisible&&names.map(norm).includes(norm(c.value)));
   if(labels.length!==1)fail('row_ambiguous');
   const label=labels[0];cell(inc,label.address,'Body');
   return number(cell(inc,'B'+label.rowSequence,'Body').value);
  };
  const revenue=rowValue(['درآمدهای عملیاتی']);
  const signedCost=rowValue(['بهای تمام شده درآمدهای عملیاتی']);
  const gross_profit=rowValue(['سود(زیان) ناخالص']);
  const operating_profit=rowValue(['سود(زیان) عملیاتی']);
  const net_profit=rowValue(['سود(زیان) خالص']);
  if(signedCost>0 || Math.abs(revenue+signedCost-gross_profit)>Math.max(10,Math.abs(gross_profit)*.02))fail('arithmetic_mismatch');
  const capHeaders=[...eq.cells.values()].filter(c=>c.isVisible&&c.cellGroupName==='Header'&&norm(c.value)==='سرمایه');
  if(capHeaders.length!==1||capHeaders[0].colSpan!==1)fail('capital_unverified');
  const balances=[...eq.cells.values()].filter(c=>c.isVisible&&c.columnSequence===1&&c.cellGroupName==='Body'&&norm(c.value).startsWith('ماندهدر')&&norm(c.value).slice('ماندهدر'.length)===meta.period_end.replaceAll('-','/'));
  if(balances.length!==1)fail('capital_unverified');
  const cap=[...eq.cells.values()].filter(c=>c.rowSequence===balances[0].rowSequence&&c.columnSequence===capHeaders[0].columnSequence);
  if(cap.length!==1)fail('capital_unverified');
  const capital=number(cell(eq,cap[0].address,'Body').value);
  if(capital<=0)fail('capital_unverified');
  return {data:{symbol:meta.symbol,company_name:meta.company_name,report_kind:'ن-۱۰',period_end:meta.period_end,
   period_months:meta.period_months,audited:meta.audited,
   restated_prior:[...inc.cells.values()].some(c=>c.isVisible&&c.cellGroupName==='Header'&&norm(c.value).includes('تجدیدارائهشده')),
   unit:'میلیون ریال',capital,standalone:{revenue,cogs:Math.abs(signedCost),gross_profit,operating_profit,net_profit},
   statement_provenance:{version:1,scope:'standalone',periodKind:'cumulative',tracingNo:inc.root.tracingNo,
    income:{url:income.url,sha256:income.sha256,sheetCode:inc.sheet.code,tableCode:inc.table.code},
    equity:{url:equity.url,sha256:equity.sha256,sheetCode:eq.sheet.code,tableCode:eq.table.code},
    priorAccepted:false,epsAccepted:false}},reason:null};
 }catch(error){return {data:null,reason:['scope_unsupported','period_mismatch','header_conflict','source_identity','source_hash_mismatch','arithmetic_mismatch','capital_unverified','value_unobserved'].includes(error.message)?error.message:'source_context_invalid'};}
}

export const admitDecisionStatement=(income,equity,meta,announcement)=>admitStatement(income,equity,meta,announcement);
/** Pure admission only. A separately reviewed loader must bind the POST sheet
 * selection and source capture before this route may receive live documents. */
export const admitInterimStatement=(income,equity,meta,announcement)=>admitStatement(income,equity,meta,announcement,true);

// Serial requests to the official publisher, never the BRSAPI key endpoint.
// The existing engine still owns discovery, per-cycle caps and persistence.
let requestTail=Promise.resolve();
let nextRequest=0;
async function captureDecision(url,fetchImpl,request={}){
 const operation=async()=>{
  await sleep(Math.max(0,nextRequest-Date.now()));
  nextRequest=Date.now()+2100;
  let response=await fetchImpl(url,{...request,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if([301,302,307,308].includes(response.status)){
   const location=response.headers.get('location');
   if(!location)throw Error('codal_statement_redirect_unsupported');
   const redirect=new URL(location,url);
   const original=new URL(url);
   if(request.method==='POST')throw Error('codal_statement_redirect_unsupported');
   const legacy=redirect.pathname==='/Reports/InterimStatement.aspx' && original.pathname==='/Reports/Decision.aspx';
   const sameReport=legacy
    ? reportSerial(redirect.href,true,true)===reportSerial(original.href,true)
    : redirect.search===original.search;
   if(!['codal.ir','www.codal.ir'].includes(redirect.hostname)||redirect.protocol!=='https:'||
      (!legacy && redirect.pathname!==original.pathname)||!sameReport||redirect.username||redirect.password||redirect.port||redirect.hash)throw Error('codal_statement_redirect_unsupported');
   await response.body?.cancel();
   await sleep(2100);nextRequest=Date.now()+2100;
   response=await fetchImpl(redirect.href,{redirect:'error',signal:AbortSignal.timeout(15000)});
   url=redirect.href;
  }
  if(!response.ok)throw Error(`codal_statement_http_${response.status}`);
  if(!response.body)throw Error('codal_statement_empty');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_DECISION)throw Error('codal_statement_bound');chunks.push(chunk);}
  const htmlBytes=Buffer.concat(chunks);
  return {url,htmlBytes,sha256:hash(htmlBytes)};
 };
 const pending=requestTail.then(operation,operation);requestTail=pending.catch(()=>{});return pending;
}

// Only the publisher's advertised read-only sheet selector may be posted. No
// script, event target, authentication material or arbitrary form is replayed.
function legacySelection(source,title,announcement){
 const html=sourceText(source,MAX_DECISION).replace(/<!--[\s\S]*?-->/g,'');
 if(reportSerial(source.url,true,true)!==reportSerial(announcement.link,true))fail('source_identity');
 const form=element(html,'form','aspnetForm');
 const opening=form.slice(0,form.indexOf('>')+1);
 if(attr(opening,'method').toLowerCase()!=='post')fail('source_identity');
 const action=new URL(attr(opening,'action').replace(/&amp;/g,'&'),source.url);
 if(action.origin!==new URL(source.url).origin||reportSerial(action.href,true,true)!==reportSerial(source.url,true,true))fail('source_identity');
 const select=element(form,'select','ctl00_ddlTable');
 if(attr(select.slice(0,select.indexOf('>')+1),'name')!=='ctl00$ddlTable')fail('source_identity');
 const options=[...select.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/select>|$)/gi)]
  .filter(m=>norm(text(m[2]))===norm(title));
 if(options.length!==1)fail('sheet_ambiguous');
 const code=attr('<option '+options[0][1]+'>','value');
 if(!/^\d{1,6}$/.test(code))fail('sheet_ambiguous');
 const fields=new URLSearchParams();
 for(const match of form.matchAll(/<input\b[^>]*>/gi)){
  const input=match[0];
  if(!attributes(input).some(a=>a.name==='type'&&a.value?.toLowerCase()==='hidden'))continue;
  if(attr(input,'type').toLowerCase()!=='hidden')fail('form_invalid');
  const name=attr(input,'name');
  if(!/^(?:__VIEWSTATE|__VIEWSTATEGENERATOR|__VIEWSTATEENCRYPTED|__EVENTVALIDATION|ctl00\$hdf(?:ThumbPrint|Version)|ctl00\$cphBody\$txb[A-Za-z0-9]+Old|ctl00\$cphBody\$ucDynamicFinancialStatement\$hdfLetterRef)$/.test(name)||fields.has(name))fail('form_invalid');
  const values=attributes(input).filter(a=>a.name==='value');
  if(values.length>1)fail('form_invalid');
  const value=(values.length?attr(input,'value'):'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  fields.set(name,value);
 }
 for(const name of ['__VIEWSTATE','__EVENTVALIDATION'])if(!fields.has(name))fail('form_invalid');
 fields.set('ctl00$ddlTable',code);fields.set('ctl00$btnNextPage','');
 const body=fields.toString();if(Buffer.byteLength(body)>512*1024)fail('form_bound');
 return {url:action.href,code:Number(code),request:{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}};
}

async function loadInterimStatement(landing,meta,announcement,fetchImpl){
 let choice;
 try{choice=legacySelection(landing,'صورت سود و زیان',announcement);}catch{return {data:null,reason:'source_context_invalid'};}
 const income=await captureDecision(choice.url,fetchImpl,choice.request);income.requestedSheetCode=choice.code;
 try{
  document(income,meta,announcement,'IncomeStatement',true);
  choice=legacySelection(income,'صورت تغییرات در حقوق مالکانه',announcement);
 }catch{return {data:null,reason:'source_context_invalid'};}
 const equity=await captureDecision(choice.url,fetchImpl,choice.request);equity.requestedSheetCode=choice.code;
 return admitInterimStatement(income,equity,meta,announcement);
}

export async function loadDecisionStatement(announcement,meta,{fetchImpl=globalThis.fetch}={}){
 let url;
 try{
  const u=new URL(announcement.link);
  if(u.hostname==='www.codal.ir')u.hostname='codal.ir';
  url=u.href;reportSerial(url,true);
 }catch{return {data:null,reason:'source_identity'};}
 const bound={...announcement,link:url};
 const income=await captureDecision(url,fetchImpl);
 if(new URL(income.url).pathname==='/Reports/InterimStatement.aspx')return loadInterimStatement(income,meta,bound,fetchImpl);
 let statement;
 try{statement=document(income,meta,bound,'IncomeStatement');}
 catch{return {data:null,reason:'source_context_invalid'};}
 const select=element(statement.html,'select','ddlTable');
 const options=[...select.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/select>|$)/gi)]
  .filter(m=>norm(text(m[2]))===norm('صورت تغییرات در حقوق مالکانه'));
 if(options.length!==1)return {data:null,reason:'capital_unverified'};
 const code=attr('<option '+options[0][1]+'>','value');
 if(!/^\d{1,6}$/.test(code))return {data:null,reason:'capital_unverified'};
 const equityUrl=new URL(url);equityUrl.searchParams.set('sheetId',code);
 const equity=await captureDecision(equityUrl.href,fetchImpl);
 return admitDecisionStatement(income,equity,meta,bound);
}
