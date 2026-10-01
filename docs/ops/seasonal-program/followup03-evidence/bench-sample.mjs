// Synthetic equal-volume bench. All fetches are intercepted; NEVER live upstream.
import { performance } from 'node:perf_hooks';
import Module from 'node:module';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), originalResolve=Module._resolveFilename;
Module._resolveFilename=function(spec,...args){return spec==='server-only'?require.resolve('next/dist/compiled/server-only/empty.js'):originalResolve.call(this,spec,...args);};
const mode=process.argv[2]??'data';
const post=process.argv[3]==='after';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const counts={stocks:760,funds:333,history45:29610,monthly:5981,quarterly:3638};
let calls=0;
process.env.NEXT_PUBLIC_SUPABASE_URL='http://synthetic.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-public-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.IR_MARKET_RELAY_URL;
const snapshot={fetchedAt:Date.now()-300000,stocks:Array.from({length:counts.stocks},(_,i)=>({id:`نمونه${i}`,faName:'نمونه',price:100,unit:'toman',changePercent:null,sourceDate:'1405-07-09',sourceTime:'15:00:00'})),funds:Array.from({length:counts.funds},(_,i)=>({id:`صندوق${i}`,faName:'نمونه',price:100,unit:'toman',nav:null})),gold:[],currency:[],crypto:[],options:[]};
const history=Array.from({length:counts.history45},(_,i)=>({id:i+1,symbol:`نمونه${Math.floor(i/30)}`,trade_date:new Date(Date.now()-(i%30)*86400000).toISOString().slice(0,10),volume:1000}));
const codal=n=>Array.from({length:n},(_,i)=>({id:i+1,symbol:`نمونه${Math.floor(i/2)}`,captured_at:'2026-09-30T12:00:00Z',data:{period_end:i%2?'1404-06-31':'1405-06-31',period_total_amount:100,period_months:3,standalone:{revenue:100}}}));
const monthly=codal(counts.monthly),quarterly=codal(counts.quarterly);
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input)); calls++;
 const latency=u.hostname==='api.coingecko.com'?4000:40;
 await new Promise((resolve,reject)=>{let timer=setTimeout(resolve,latency);const abort=()=>{clearTimeout(timer);reject(new DOMException('synthetic abort','AbortError'));};if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true});});
 if(u.hostname==='api.coingecko.com')return Response.json([{id:'bitcoin',symbol:'btc',current_price:100,price_change_percentage_24h:null,image:null}]);
 if(u.hostname!=='synthetic.invalid')throw new Error('Live fetch prohibited');
 const table=u.pathname.split('/').at(-1);
 if(table==='ir_market_snapshots')return Response.json([{payload:snapshot}]);
 let rows=table==='symbol_history'?history:table==='codal_reports'?(u.searchParams.get('report_kind')==='eq.ن-۳۰'?monthly:quarterly):[];
 if(u.searchParams.get('order')==='id.desc')rows=rows.slice(-1);
 else {const cursor=Number(u.searchParams.get('and')?.match(/id.gt.(\d+)/)?.[1]??u.searchParams.get('id')?.replace('gt.','')??0);rows=rows.filter(r=>r.id>cursor).slice(0,Math.min(1000,Number(u.searchParams.get('limit')??1000)));}
 return Response.json(rows);
};
const {getIrMarket}=await import('../../../../lib/market-ir');
const {getAvgVolume30}=await import('../../../../lib/core/avgVolume');
const {getFundamentalYoY}=await import('../../../../lib/core/fundamentalData');
const {getMarketData}=await import('../../../../lib/market');
const bounded=post?await import('../../../../lib/market-bounded'):null;
const run=async()=>{
 const start=performance.now(),before=calls;
 const result=mode==='data'?(post?[await getIrMarket()]:await Promise.all([getIrMarket(),getAvgVolume30(),getFundamentalYoY()])):(post?await Promise.all([bounded.readIranMarket().then(x=>x.data),bounded.readGlobalMarket().then(x=>x.data)]):await Promise.all([getIrMarket(),getMarketData()]));
 return {ms:+(performance.now()-start).toFixed(2),requests:calls-before,stocks:result[0]?.stocks.length??0,funds:result[0]?.funds.length??0,...(!post && mode==='data'?{avgSymbols:result[1].size,monthlyRows:result[2].coverage.monthly.rows,quarterlyRows:result[2].coverage.quarterly.rows}:{} )};
};
const cold=await run(),warm=[];for(let i=0;i<24;i++)warm.push(await run());
let full=null;if(post&&mode==='data'){const begin=performance.now();const [avg,yoy]=await Promise.all([getAvgVolume30(),getFundamentalYoY()]);full={ms:+(performance.now()-begin).toFixed(2),avgSymbols:avg.size,monthlyRows:yoy.coverage.monthly.rows,quarterlyRows:yoy.coverage.quarterly.rows};if(full.avgSymbols!==987||full.monthlyRows!==counts.monthly||full.quarterlyRows!==counts.quarterly)throw new Error('Coverage regression');}
process.stdout.write(JSON.stringify({mode,full,counts,network:{dbRequestMs:40,globalRequestMs:4000,postgrestCap:1000},cold,warm})+'\n');
