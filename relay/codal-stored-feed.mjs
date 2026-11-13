// Resume processing from the existing announcement ledger. No provider search,
// synthetic announcement date or separate queue/table is introduced.
export const validStoredCursor = value => value === null ||
  (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value));
const identifier = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  ? String(value) : typeof value === 'string' && validStoredCursor(value) ? value : null;
const text = (value,limit) => typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null;
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
export async function readStoredAnnouncements(cursor,{baseUrl,headers,fetch:read=globalThis.fetch}) {
  if(!validStoredCursor(cursor))throw Error('stored feed cursor invalid');
  const qs=new URLSearchParams({select:'id,symbol,company_name,title,report_code,link,link_excel,link_pdf,sent_date,sent_time,publish_date',
    order:'id.desc',limit:'100'});
  if(cursor!==null)qs.set('id',`lt.${cursor}`);
  const response=await read(`${baseUrl}/rest/v1/codal_feed?${qs}`,{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`stored feed HTTP ${response.status}`);
  const rows=await response.json();
  if(!Array.isArray(rows)||rows.length>100)throw Error('stored feed schema invalid');
  let before=cursor;
  return rows.map(row=>{
    const id=identifier(row?.id);
    if(!id || before!==null && BigInt(id)>=BigInt(before))throw Error('stored feed order invalid');
    before=id;
    return {id,announcement:announcement(row)};
  });
}
