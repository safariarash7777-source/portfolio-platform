import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {quote as normalizeQuote} from './mcpfarsi-adapter.mjs';

export const MCP_QUOTE_KEY='mcpfarsi_quotes';
const SYMBOL='فملی',CODE='35425587644337450',TTL=15*60_000;
const endpoint='https://mcp.mcpfarsi.ir/mcp';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function validDay(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value??''))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validMcpQuote(q,now=Date.now()){
 return object(q)&&q.symbol===SYMBOL&&q.instrumentCode===CODE&&q.unit==='rial'
  &&q.server==='tsetmc-mcp'&&q.tool==='ts_get_quote'&&q.sourceAtUtc===null
  &&q.freshness==='unknown'&&q.sourceDateCalendar==='gregorian'
  &&validDay(q.sourceDateRaw)&&Date.parse(q.sourceDateRaw+'T00:00:00Z')<=now+86400000
  &&/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(q.sourceTimeRaw??'')
  &&((typeof q.lastRial==='number'&&q.lastRial>0)||(typeof q.closeRial==='number'&&q.closeRial>0))
  &&[q.lastRial,q.closeRial].every(value=>value===null||(typeof value==='number'&&value>0))
  &&['lastRial','closeRial','lastToman','closeToman','volume','valueRial','trades','lastChangePct','closeChangePct']
    .every(key=>q[key]===null||(typeof q[key]==='number'&&Number.isFinite(q[key])))
  &&(q.lastRial===null?q.lastToman===null:q.lastToman===q.lastRial/10)
  &&(q.closeRial===null?q.closeToman===null:q.closeToman===q.closeRial/10);
}
// Only canonical/candidate quotes validated against the injected clock reach rank.
const rank=q=>q.sourceDateRaw+'T'+q.sourceTimeRaw;
const stable=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)
 ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stable(value[key]))])):value);
export async function runtimeHeaders(env){
 if(env.MCP_FARSI_API_KEY!==undefined){
  const key=env.MCP_FARSI_API_KEY;
  if(typeof key!=='string'||!key||key!==key.trim()||/\s/.test(key)||key.length>16000)throw Error('mcpfarsi_credentials_unavailable');
  return {Authorization:`Bearer ${key}`};
 }
 return privateHeaders(env.MCPFARSI_HEADERS_FILE);
}
export async function privateHeaders(path){
 if(!path||!isAbsolute(path))throw Error('mcpfarsi_credentials_unavailable');
 try{
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>32000)throw Error();
  const value=JSON.parse(await readFile(path,'utf8'));
  const auth=Object.entries(value).find(([key])=>key.toLowerCase()==='authorization')?.[1];
  if(typeof auth!=='string'||!auth.trim()||auth.length>16000||/[\r\n]/.test(auth))throw Error();
  return {Authorization:auth};
 }catch{throw Error('mcpfarsi_credentials_unavailable');}
}
export function createQuoteRpc({fetchImpl=globalThis.fetch,headers,sleepImpl=sleep}={}){
 let session=null,version='2025-03-26',initialized=false,id=0;
 async function rpc(method,params,signal){
  const requestId=method.startsWith('notifications/')?undefined:++id;
  const auth=await headers();
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal,
   headers:{...auth,'Content-Type':'application/json',Accept:'application/json, text/event-stream',
    ...(session?{'Mcp-Session-Id':session}:{}),...(method!=='initialize'?{'MCP-Protocol-Version':version}:{})},
   body:JSON.stringify({jsonrpc:'2.0',...(requestId===undefined?{}:{id:requestId}),method,params})});
  if(!response.ok)throw Error('mcpfarsi_transport_error');
  session=response.headers.get('mcp-session-id')??session;
  if(requestId===undefined&&!response.body)return;
  if(!response.body)throw Error('mcpfarsi_empty_response');
  let length=0,parts=[];
  for await(const part of response.body){length+=part.byteLength;if(length>256000)throw Error('mcpfarsi_response_bound');parts.push(part);}
  const raw=Buffer.concat(parts).toString('utf8');
  if(requestId===undefined)return;
  const envelopes=raw.trim().startsWith('{')?[JSON.parse(raw)]:raw.split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5)));
  const data=envelopes.find(x=>x.id===requestId);
  if(!data||data.error||data.result?.isError)throw Error('mcpfarsi_provider_error');
  return {status:response.status,data};
 }
 return async function get(signal){
  try{
   if(!initialized){
    const init=await rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'portfolio-quote-cache',version:'1'}},signal);
    version=init.data.result.protocolVersion;
    await sleepImpl(2500,undefined,{signal});await rpc('notifications/initialized',{},signal);
    await sleepImpl(2500,undefined,{signal});
    const discovery=await rpc('tools/call',{name:'search_tools',arguments:{query:'get_quote',limit:2}},signal);
    const content=JSON.parse(discovery.data.result.content[0].text);
    if(!content.results?.some(x=>x.server==='tsetmc-mcp'&&x.tool==='ts_get_quote'))throw Error('mcpfarsi_quote_not_available');
    initialized=true;
   }
   await sleepImpl(2500,undefined,{signal});
   return await rpc('tools/call',{name:'call_tool',arguments:{server:'tsetmc-mcp',tool:'ts_get_quote',arguments:{symbol:SYMBOL}}},signal);
  }catch{
   initialized=false;session=null;throw Error('mcpfarsi_quote_unavailable');
  }
 };
}
export function createMcpQuoteBridge({env=process.env,fetchImpl=globalThis.fetch,now=Date.now,getQuote=null}={}){
 const enabled=env.MCPFARSI_QUOTE_ENABLED==='1';
 const configured=Boolean((env.MCP_FARSI_API_KEY||env.MCPFARSI_HEADERS_FILE)&&env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY);
 const auth={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
 const base=(env.SUPABASE_URL??'').replace(/\/+$/,'');
 const get=getQuote??createQuoteRpc({fetchImpl,headers:()=>runtimeHeaders(env)});
 let cached=null,pending=null,pendingCandidate=null,nextAt=0,lastError=null,publication='none',requests=0;
 async function stored(){
  const response=await fetchImpl(`${base}/rest/v1/ir_market_snapshots?key=eq.${MCP_QUOTE_KEY}&select=payload&limit=2`,
   {headers:auth,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error();const rows=await response.json();
  if(!Array.isArray(rows)||rows.length>1)throw Error();
  if(!rows.length)return null;
  const payload=rows[0]?.payload;
  if(payload?.schema!=='mcpfarsi-quotes.v1'||!object(payload.quotes)||Object.keys(payload.quotes).some(key=>key!==SYMBOL))throw Error();
  const q=payload.quotes[SYMBOL];if(!validMcpQuote(q,now()))throw Error();return q;
 }
 async function work(){
  nextAt=now()+TTL;
  try{
   const previous=await stored();
   if(previous&&(!cached||rank(previous)>=rank(cached))){cached=previous;publication='confirmed';}
   if(pendingCandidate){
    if(previous&&stable(previous)===stable(pendingCandidate)){pendingCandidate=null;publication='confirmed';lastError=null;return;}
    if(previous&&rank(previous)>=rank(pendingCandidate)){pendingCandidate=null;publication='superseded';lastError=null;return;}
    publication='pending_unconfirmed';lastError='mcpfarsi_publication_requires_readback';return;
   }
   const received=Date.parse(cached?.receivedAtUtc??'');
   if(Number.isFinite(received)&&received<=now()&&now()-received<TTL){publication='confirmed';lastError=null;return;}
   requests++;
   const candidate=normalizeQuote(await get(AbortSignal.timeout(20000)),new Date(now()).toISOString(),SYMBOL);
   if(!validMcpQuote(candidate,now()))throw Error();
   if(cached&&rank(candidate)<=rank(cached)){lastError=null;return;}
   // Re-read, then use an insert-if-absent or a source-clock compare-and-swap.
   // This protects against concurrent publishers after this read as well.
   const canonical=await stored();
   if(canonical&&rank(canonical)>=rank(candidate)){cached=canonical;publication='confirmed';lastError=null;return;}
   pendingCandidate=candidate;
   publication='unknown';
   const filter=new URLSearchParams({key:`eq.${MCP_QUOTE_KEY}`});
   if(canonical){
    filter.set(`payload->quotes->${SYMBOL}->>sourceDateRaw`,`eq.${canonical.sourceDateRaw}`);
    filter.set(`payload->quotes->${SYMBOL}->>sourceTimeRaw`,`eq.${canonical.sourceTimeRaw}`);
   }
   let transportOk=false;
   try{
    const response=await fetchImpl(`${base}/rest/v1/ir_market_snapshots?${canonical?filter:'on_conflict=key'}`,{
     method:canonical?'PATCH':'POST',redirect:'error',headers:{...auth,'Content-Type':'application/json',
      Prefer:canonical?'return=minimal':'resolution=ignore-duplicates,return=minimal'},
     signal:AbortSignal.timeout(8000),body:JSON.stringify({...(!canonical?{key:MCP_QUOTE_KEY}:{}),
      payload:{schema:'mcpfarsi-quotes.v1',quotes:{[SYMBOL]:candidate}},updated_at:new Date(now()).toISOString()})});
    transportOk=response.ok;
   }catch{ /* The write may have committed: read canonical storage once below. */ }
   const confirmed=await stored();
   if(confirmed&&stable(confirmed)===stable(candidate)){
    cached=confirmed;pendingCandidate=null;publication='confirmed';lastError=null;return;
   }
   if(confirmed&&rank(confirmed)>=rank(candidate)){
    cached=confirmed;pendingCandidate=null;publication='superseded';lastError=null;return;
   }
   if(transportOk){pendingCandidate=null;publication='conflict';}
   lastError='mcpfarsi_publication_requires_readback';
  }catch{lastError='mcpfarsi_quote_refresh_failed';}
 }
 return {
  refresh(){if(!enabled||!configured)return Promise.resolve();if(pending)return pending;if(now()<nextAt)return Promise.resolve();
   pending=work().finally(()=>{pending=null;});return pending;},
  peek(symbol){return symbol===SYMBOL&&cached?{quote:cached,live:false,publication}:null;},
  status(){return {enabled,configured,symbol:SYMBOL,requests,publication,lastError,pendingPublication:Boolean(pendingCandidate),nextAttemptAt:nextAt||null,
   sourceAtUtc:cached?.sourceAtUtc??null,sourceDateRaw:cached?.sourceDateRaw??null,sourceTimeRaw:cached?.sourceTimeRaw??null};},
 };
}
