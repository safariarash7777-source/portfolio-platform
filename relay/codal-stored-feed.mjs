// Resume processing from the existing announcement ledger. No provider search,
// synthetic announcement date or separate queue/table is introduced.
export const validStoredCursor = value => value === null ||
  (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value));
const identifier = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  ? String(value) : typeof value === 'string' && validStoredCursor(value) ? value : null;
const text = (value,limit) => typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null;
const persianDateFormat = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',
});
const dateAlphabets = ['0123456789','۰۱۲۳۴۵۶۷۸۹','٠١٢٣٤٥٦٧٨٩'];
const recentMonthlyDays = 35;

function publicationDay(at) {
  const parts=Object.fromEntries(persianDateFormat.formatToParts(at).map(({type,value})=>[type,value]));
  return `${parts.year}/${parts.month}/${parts.day}`;
}

export function recentMonthlyBounds(now) {
  if(!Number.isSafeInteger(now)||now<=0||now>8_640_000_000_000_000)return null;
  return {since:publicationDay(now-recentMonthlyDays*86400000),until:publicationDay(now)};
}

function dateRangeFilter({since,until}) {
  const ranges=[];
  for(const alphabet of dateAlphabets) for(const separator of ['/','-']){
    const encode = day => day.replaceAll('/',separator).replace(/\d/g,digit=>alphabet[Number(digit)]);
    ranges.push(`and(publish_date.gte.${encode(since)},publish_date.lte.${encode(until)})`);
  }
  return `(${ranges.join(',')})`;
}

function publicationInRange(value,{since,until}) {
  if(typeof value!=='string')return false;
  const normalized=value.replace(/[۰-۹٠-٩]/g,digit=>String(Math.max(dateAlphabets[1].indexOf(digit),dateAlphabets[2].indexOf(digit))))
    .replaceAll('-','/');
  const parts=/^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.exec(normalized);
  return !!parts&&Number(parts[2])<=(Number(parts[1])<=6?31:30)&&normalized>=since&&normalized<=until;
}

function announcement(row) {
  const symbol=text(row.symbol,120), company=text(row.company_name,500), title=text(row.title,5000);
  const link=text(row.link,4096), excel=text(row.link_excel,4096);
  if (!symbol || !company || !title || !link || !excel) return null;
  try {
    const a=new URL(link), b=new URL(excel);
    if(a.protocol!=='https:' || !['codal.ir','www.codal.ir'].includes(a.hostname) ||
       a.pathname!=='/Reports/Decision.aspx' || a.username || a.password || a.port || a.hash ||
       b.protocol!=='https:' || b.hostname!=='excel.codal.ir' || b.username || b.password || b.port || b.search || b.hash) return null;
    const pairs=a.search.slice(1).split('&').map(p=>p.split('='));
    const serials=pairs.filter(p=>p[0]==='LetterSerial');
    const path=/^\/service\/Excel\/GetAll\/([^/]+)\/0$/.exec(b.pathname);
    if(serials.length!==1 || serials[0].length!==2 || !path ||
       decodeURIComponent(serials[0][1])!==decodeURIComponent(path[1]))return null;
  } catch {return null;}
  return {l18:symbol,l30:company,title,code:row.report_code,link,link_excel:excel,
    link_pdf:text(row.link_pdf,4096),date_send:row.sent_date,time_send:row.sent_time,date_publish:row.publish_date};
}

export function verifiedMonthlyDiscovery(candidate,bounds,marketSymbols) {
  if(!publicationInRange(candidate?.date_publish,bounds)||
     typeof candidate.code!=="string"||!/^ن-[3۳٣][0۰٠]$/.test(candidate.code.trim()))return null;
  const symbol=marketSymbols.get(canonicalMarketSymbol(candidate.l18));
  if(!symbol)return null;
  const verified=announcement({symbol,company_name:candidate.l30,title:candidate.title,
    report_code:"ن-۳۰",link:candidate.link,link_excel:candidate.link_excel,link_pdf:candidate.link_pdf,
    sent_date:candidate.date_send,sent_time:candidate.time_send,publish_date:candidate.date_publish});
  return verified&&new URL(verified.link).searchParams.get("let")==="58"?verified:null;
}

export const canonicalMarketSymbol=value=>String(value??"").trim().normalize("NFC").replace(/[يى]/g,"ی").replace(/ك/g,"ک");
export async function readStoredAnnouncements(cursor,{baseUrl,headers,fetch:read=globalThis.fetch,monthlyOnly=false,interimSince=null,monthlyBounds=null,pageSize=100}) {
  if(!validStoredCursor(cursor))throw Error('stored feed cursor invalid');
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw Error('stored feed page size invalid');
  const qs=new URLSearchParams({select:'id,symbol,company_name,title,report_code,link,link_excel,link_pdf,sent_date,sent_time,publish_date',
    order:'id.desc',limit:String(pageSize)});
  if(monthlyOnly)qs.set('category','eq.ماهانه');
  if(monthlyBounds!==null)qs.set('or',dateRangeFilter(monthlyBounds));
  if(interimSince!==null){
    qs.set('category','eq.صورت مالی');
    qs.set('created_at',`gte.${interimSince}`);
  }
  if(cursor!==null)qs.set('id',`lt.${cursor}`);
  const response=await read(`${baseUrl}/rest/v1/codal_feed?${qs}`,{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`stored feed HTTP ${response.status}`);
  const rows=await response.json();
  if(!Array.isArray(rows)||rows.length>pageSize)throw Error('stored feed schema invalid');
  let before=cursor;
  return rows.map(row=>{
    const id=identifier(row?.id);
    if(!id || before!==null && BigInt(id)>=BigInt(before))throw Error('stored feed order invalid');
    before=id;
    return {id,announcement:monthlyBounds!==null&&!publicationInRange(row.publish_date,monthlyBounds)?null:announcement(row)};
  });
}
