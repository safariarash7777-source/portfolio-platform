import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMcpQuoteBridge,createQuoteRpc,validMcpQuote,runtimeHeaders} from './mcpfarsi-quote.mjs';
import {quote as normalizeQuote} from './mcpfarsi-adapter.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/mcpfarsi-fmli-20261104.json',import.meta.url),'utf8'));
const initialTime=Date.parse('2026-11-05T10:00:00Z');
const env={MCPFARSI_QUOTE_ENABLED:'1',MCPFARSI_HEADERS_FILE:'/private/not-read-in-test.json',SUPABASE_URL:'https://db-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'};
const normalized=()=>normalizeQuote(raw,new Date(initialTime).toISOString(),'فملی');
function setup(opts={}){
 let now=initialTime,stored=opts.stored??null,posts=0,mcp=0;const requests=[];
 const fetchImpl=async(url,init={})=>{
  requests.push(String(url));assert.ok(String(url).startsWith(env.SUPABASE_URL));
  if(init.method==='POST'||init.method==='PATCH'){
   posts++;
   if(opts.concurrentNewer)stored=opts.concurrentNewer;
   const query=new URL(url).searchParams;
   const canWrite=init.method==='POST'?!stored:stored?.quotes['فملی']?.sourceDateRaw===query.get('payload->quotes->فملی->>sourceDateRaw')?.slice(3)
    &&stored?.quotes['فملی']?.sourceTimeRaw===query.get('payload->quotes->فملی->>sourceTimeRaw')?.slice(3);
   if(canWrite)stored=JSON.parse(init.body).payload;
   if(opts.unknownPublish)throw Error('private-body-must-not-leak');return {ok:true};
  }
  if(opts.readbackFails&&posts>0)throw Error('readback unavailable');
  if(opts.badBaseline)return {ok:true,json:async()=>[{payload:{bad:true}}]};
  return {ok:true,json:async()=>stored?[{payload:stored}]:[]};
 };
 const bridge=createMcpQuoteBridge({env:{...env,...opts.env},fetchImpl,now:()=>now,getQuote:async()=>{mcp++;if(opts.failMcp)throw Error('secret-never-logged');return opts.quote??raw;}});
 return {bridge,fetchImpl,advance:ms=>{now+=ms;},stored:()=>stored,posts:()=>posts,mcp:()=>mcp,requests};
}
test('enabled actual bridge publishes observed dated FMLI quote into existing snapshot table',async()=>{
 const x=setup();await x.bridge.refresh();assert.equal(x.mcp(),1);assert.equal(x.posts(),1);
 const q=x.stored().quotes['فملی'];assert.equal(q.lastRial,29170);assert.equal(q.lastToman,2917);
 assert.equal(q.sourceDateRaw,'2026-11-04');assert.equal(q.sourceTimeRaw,'13:16:54');assert.equal(q.sourceAtUtc,null);
 assert.equal(q.freshness,'unknown');assert.equal(x.bridge.peek('فملی').live,false);
 assert.equal(x.bridge.peek('فولاد'),null);assert.equal(x.bridge.status().publication,'confirmed');
});

test('a future-dated provider quote cannot poison subsequent valid publications',async()=>{
 const future=structuredClone(raw);
 const body=JSON.parse(future.data.result.content[0].text);body.date='2099-01-01';
 future.data.result.content[0].text=JSON.stringify(body);
 const options={quote:future};const x=setup(options);
 await x.bridge.refresh();assert.equal(x.posts(),0);assert.equal(x.bridge.peek('فملی'),null);
 options.quote=raw;x.advance(15*60_000);await x.bridge.refresh();
 assert.equal(x.posts(),1);assert.equal(x.bridge.status().publication,'confirmed');
 assert.equal(x.bridge.peek('فملی').quote.sourceDateRaw,'2026-11-04');
});
test('default-off and missing secure configuration perform zero calls',async()=>{
 for(const cfg of [{MCPFARSI_QUOTE_ENABLED:'0'},{MCPFARSI_HEADERS_FILE:''}]){
  const x=setup({env:cfg});await x.bridge.refresh();assert.equal(x.requests.length,0);assert.equal(x.mcp(),0);
 }
});
test('concurrent refresh deduplicates; passive reads and TTL do not call any provider',async()=>{
 const x=setup();await Promise.all([x.bridge.refresh(),x.bridge.refresh(),x.bridge.refresh()]);
 for(let i=0;i<20;i++){x.bridge.peek('فملی');await x.bridge.refresh();}
 assert.equal(x.mcp(),1);assert.equal(x.posts(),1);assert.ok(x.requests.every(url=>!url.includes('BrsApi')));
});
test('unknown canonical baseline prevents vendor call and publication',async()=>{
 const x=setup({badBaseline:true});await x.bridge.refresh();assert.equal(x.mcp(),0);assert.equal(x.posts(),0);
 assert.equal(x.bridge.status().lastError,'mcpfarsi_quote_refresh_failed');
});
test('older source quote cannot replace newer stored quote or advance source clocks',async()=>{
 const newer={...normalized(),sourceDateRaw:'2026-11-05',receivedAtUtc:null};
 const x=setup({stored:{schema:'mcpfarsi-quotes.v1',quotes:{'فملی':newer}}});await x.bridge.refresh();
 assert.equal(x.posts(),0);assert.deepEqual(x.bridge.peek('فملی').quote,newer);
});
test('unknown publication outcome is confirmed only by authoritative stored readback',async()=>{
 const x=setup({unknownPublish:true});await x.bridge.refresh();assert.equal(x.posts(),1);
 assert.equal(x.bridge.status().publication,'confirmed');await x.bridge.refresh();assert.equal(x.posts(),1);
 assert.equal(x.bridge.status().lastError,null);
 assert.ok(!JSON.stringify(x.bridge.status()).includes('private-body'));
});
test('unconfirmed publication never exposes uncommitted memory as canonical or retries writes',async()=>{
 const x=setup({unknownPublish:true,readbackFails:true});await x.bridge.refresh();
 assert.equal(x.bridge.peek('فملی'),null);assert.equal(x.bridge.status().pendingPublication,true);
 assert.equal(x.bridge.status().publication,'unknown');x.advance(15*60_000);await x.bridge.refresh();
 assert.equal(x.posts(),1);assert.equal(x.mcp(),1);
});
test('concurrent newer insert wins; conditional update carries exact source-clock filters',async()=>{
 const newer={...normalized(),sourceDateRaw:'2026-11-06',receivedAtUtc:null};
 const x=setup({concurrentNewer:{schema:'mcpfarsi-quotes.v1',quotes:{'فملی':newer}}});await x.bridge.refresh();
 assert.equal(x.posts(),1);assert.equal(x.bridge.peek('فملی').quote.sourceDateRaw,'2026-11-06');
 const old={...normalized(),sourceDateRaw:'2026-11-03',receivedAtUtc:null};
 const y=setup({stored:{schema:'mcpfarsi-quotes.v1',quotes:{'فملی':old}}});await y.bridge.refresh();
 assert.equal(y.posts(),1);assert.ok(y.requests.some(url=>new URL(url).searchParams.has('payload->quotes->فملی->>sourceDateRaw')));
 assert.equal(y.bridge.status().publication,'confirmed');
 const z=setup({stored:{schema:'mcpfarsi-quotes.v1',quotes:{'فملی':old}},
  concurrentNewer:{schema:'mcpfarsi-quotes.v1',quotes:{'فملی':newer}}});await z.bridge.refresh();
 assert.equal(z.posts(),1);assert.equal(z.stored().quotes['فملی'].sourceDateRaw,'2026-11-06');
 assert.equal(z.bridge.status().publication,'superseded');
});
test('runtime uses one strict env API key and never falls back from a malformed supplied key',async()=>{
 assert.deepEqual(await runtimeHeaders({MCP_FARSI_API_KEY:'synthetic-key'}),{Authorization:'Bearer synthetic-key'});
 for(const key of [' synthetic-key','synthetic-key ','bad\r\nheader','two tokens',''])
  await assert.rejects(runtimeHeaders({MCP_FARSI_API_KEY:key,MCPFARSI_HEADERS_FILE:'/must-not-read'}),/credentials_unavailable/);
});
test('RPC handshake/discovery calls only verified one-symbol readonly quote tool',async()=>{
 const calls=[],sleeps=[];
 const rpc=createQuoteRpc({headers:async()=>({Authorization:'synthetic-only'}),sleepImpl:async ms=>{sleeps.push(ms);},
 fetchImpl:async(url,init)=>{
  assert.equal(url,'https://mcp.mcpfarsi.ir/mcp');assert.equal(init.redirect,'error');const body=JSON.parse(init.body);calls.push(body);
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  const result=body.method==='initialize'?{protocolVersion:'2025-03-26'}:body.params.name==='search_tools'?
   {content:[{type:'text',text:JSON.stringify({results:[{server:'tsetmc-mcp',tool:'ts_get_quote'}]})}]}:raw.data.result;
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});
 }});
 const q=normalizeQuote(await rpc(AbortSignal.timeout(1000)),new Date(initialTime).toISOString(),'فملی');
 assert.equal(q.lastRial,29170);assert.equal(calls.length,4);assert.deepEqual(sleeps,[2500,2500,2500]);
 const actual=calls.filter(c=>c.params?.name==='call_tool');assert.equal(actual.length,1);
 assert.deepEqual(actual[0].params.arguments,{server:'tsetmc-mcp',tool:'ts_get_quote',arguments:{symbol:'فملی'}});
});
test('schema rejects wrong identity/unit, impossible date and all missing prices',()=>{
 const q=normalized();assert.equal(validMcpQuote(q),true);
 for(const changed of [{instrumentCode:'other'},{unit:'toman'},{sourceDateRaw:'2026-99-99'},
  {lastRial:null,lastToman:null,closeRial:null,closeToman:null}])assert.equal(validMcpQuote({...q,...changed}),false);
});
