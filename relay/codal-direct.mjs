// Official public search contract reviewed against sepehr071/codal-mcp (MIT,
// 0a4cb6d57904851ce18e0de3da742c5ab2cbe4e0). No financial parsing is copied.
// Keep the existing codal.ir link identity so stored dedup/watermarks still work.
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
const ORIGIN = 'https://codal.ir';
const SEARCH = 'https://search.codal.ir/api/search/v2/q';
function invalid() { return Object.assign(new Error('official announcement invalid schema'), { name: 'AnnouncementSchemaError' }); }
const digits = s => String(s ?? '').replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
function dateTime(value, required = false) {
  if (value == null || value === '') { if (required) throw invalid(); return [null, null]; }
  const m = digits(value).match(/^(1[34]\d{2}\/\d{2}\/\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) throw invalid();
  const [, month, day] = m[1].split('/').map(Number), [hour, min, sec] = m[2].split(':').map(Number);
  if (month<1 || month>12 || day<1 || day>31 || hour>23 || min>59 || sec>59) throw invalid();
  return [m[1], m[2]];
}
function link(value, required = false) {
  if (value == null || value === '') { if (required) throw invalid(); return null; }
  if (typeof value !== 'string' || value.trim() !== value) throw invalid();
  let url;
  try { url = new URL(value, ORIGIN); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !['codal.ir','www.codal.ir','excel.codal.ir'].includes(url.hostname)) throw invalid();
  // The database's existing Announcement.php identity uses codal.ir, not www.
  if (url.hostname === 'www.codal.ir') url.hostname = 'codal.ir';
  return url.href;
}
export function officialAnnouncementRows(body) {
  if (!body || body.IsAttacker === true || !Array.isArray(body.Letters) || !Number.isSafeInteger(body.Total) || body.Total < 0 || (body.Total === 0 && body.Letters.length)) throw invalid();
  return body.Letters.map(row => {
    if (!row || !Number.isSafeInteger(row.TracingNo) || row.TracingNo <= 0 || typeof row.Symbol !== 'string' || !row.Symbol.trim() || typeof row.Title !== 'string' || !row.Title.trim()) throw invalid();
    const [date_send,time_send] = dateTime(row.SentDateTime,true);
    const [date_publish,time_publish] = dateTime(row.PublishDateTime);
    return { l18:row.Symbol.trim(), l30:typeof row.CompanyName==='string'?row.CompanyName:null,
      title:row.Title, code:typeof row.LetterCode==='string'?row.LetterCode:null,
      link:link(row.Url,true), link_excel:link(row.ExcelUrl), link_pdf:link(row.PdfUrl),
      date_send,time_send,date_publish,time_publish,date_title:null };
  });
}
export function officialSearchUrl({l18,category,page=1,date_start}={}) {
  if (!Number.isSafeInteger(page) || page<1 || page>10000 || (category!=null && !/^(?:[1-9]|1[01])$/.test(String(category)))) throw invalid();
  if (l18!=null && (typeof l18!=='string'||!l18.trim()||l18.length>80)) throw invalid();
  if (date_start!=null && !/^1[34]\d{2}\/\d{2}\/\d{2}$/.test(digits(date_start))) throw invalid();
  const q = new URLSearchParams({Audited:'true',AuditorRef:'-1',Category:String(category??-1),Childs:'false',CompanyState:'-1',CompanyType:'-1',Consolidatable:'true',IsNotAudited:'false',Length:'-1',LetterType:'-1',Mains:'true',NotAudited:'true',NotConsolidatable:'true',PageNumber:String(page),Publisher:'false',ReportingType:'-1',TracingNo:'-1',search:'true'});
  if(l18)q.set('Symbol',l18); if(date_start)q.set('FromDate',digits(date_start));
  return SEARCH+'?'+q;
}
export function createOfficialAnnouncements({fetchImpl=globalThis.fetch,now=()=>performance.now(),wait=sleep}={}) {
  let tail=Promise.resolve(),next=0,blockedUntil=0,pending=0;
  const cache=new Map(),inflight=new Map();
  const defer=()=>Object.assign(new Error('official Codal source deferred'),{name:'AnnouncementSourceDeferred',noRetry:true});
  return function read(params) {
    const url=officialSearchUrl(params),hit=cache.get(url);
    if(hit&&now()-hit.at<300000)return Promise.resolve(structuredClone(hit.rows));
    if(inflight.has(url))return inflight.get(url).then(structuredClone);
    if(pending>=8||now()<blockedUntil)return Promise.reject(defer());
    pending++;
    const run=tail.then(async()=>{
      if(now()<blockedUntil)throw defer();
      const gap=next-now(); if(gap>0)await wait(gap);
      if(now()<blockedUntil)throw defer();
      try {
        const res=await fetchImpl(url,{headers:{Accept:'application/json',Referer:'https://www.codal.ir/'},redirect:'error',signal:AbortSignal.timeout(20000)});
        if(res.status===429||res.status===403){blockedUntil=now()+3600000;throw defer();}
        if(!res.ok)throw new Error(`official announcement HTTP ${res.status}`);
        let size=0; const chunks=[];
        for await(const part of res.body){size+=part.byteLength;if(size>5000000)throw invalid();chunks.push(part);}
        let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw invalid();}
        const rows=officialAnnouncementRows(body);
        if(cache.size>=64)cache.delete(cache.keys().next().value);
        cache.set(url,{at:now(),rows});return rows;
      } finally {next=now()+2100;}
    });
    tail=run.catch(()=>{}).finally(()=>{pending--;inflight.delete(url);});
    inflight.set(url,run);return run.then(structuredClone);
  };
}
