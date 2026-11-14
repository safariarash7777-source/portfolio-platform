import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function probe(scenario) {
  const source = new URL('./server.mjs', import.meta.url).href;
  const program = `
    import http from 'node:http';
    import { performance } from 'node:perf_hooks';
    import timers from 'node:timers/promises';
    import { syncBuiltinESMExports } from 'node:module';
    // Offline child only: advance the actual transport's monotonic clock port.
    // Production has no environment switch or shortened policy window.
    let transportClock = 0;
    Object.defineProperty(performance, 'now', { value: () => transportClock });
    timers.setTimeout = async (ms, value, options = {}) => {
      options.signal?.throwIfAborted(); transportClock += ms; options.signal?.throwIfAborted(); return value;
    };
    syncBuiltinESMExports();
    const scenario=${JSON.stringify(scenario)};
    const start=Date.parse('2026-10-06T06:00:00Z'); let now=start,phase=0;
    const RealDate=Date;
    globalThis.Date=class extends RealDate {constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
    const latest=[],history=[],daily=[]; let blockedHosts=0,initialReads=0,leased=0,partialGrant=false,navReads=0;
    const stock={l18:'isolated-stock',l30:'Synthetic',cs_id:1,pl:1000,pc:1000,tval:1000,tvol:10,date:'1405-07-14',time:'09:30:00'};
    const fund={...stock,l18:'isolated-fund',cs_id:68};
    const option={l18:'isolated-option',type:'call',pl:2000,date:'1405-07-14',time:'09:31:00'};
    const gc={gold:[{symbol:'isolated-gold',price:1000,date:'1405-07-14',time:'09:30:00'}],
      currency:[{symbol:'USD',price:2000,unit:'تومان',date:'1405-07-14',time:'09:30:00'}],
      cryptocurrency:[{symbol:'isolated-crypto',price:3000,date:'1405-07-14',time:'09:30:00'}]};
    const failure=()=>{ const e=new Error('synthetic timeout');e.name='TimeoutError';throw e; };
    const failed=()=>scenario==='cold-all-failed'||(['cold-partial','unknown-baseline','malformed-baseline','retry-baseline'].includes(scenario))||(phase===1&&['partial-recovery','warm-all-failed','hydrated-partial','daily-partial','daily-recovery','client-source-timeout'].includes(scenario));
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
    globalThis.fetch=async(input,init={})=>{
      const u=new URL(input);
      if(u.hostname==='brsapi.ir') {
        if(scenario==='client-budget-auxiliary'&&phase===0&&u.pathname.endsWith('/Symbol.php'))return reply({},400);
        const core=/Gold_Currency|AllSymbols|Index|Option/.test(u.pathname);
        if(core&&phase===1&&scenario==='malformed-sources')return reply(/Option/.test(u.pathname)?[{}]:{});
        if(core&&failed()&&(!/Option/.test(u.pathname)||scenario==='warm-all-failed'||scenario==='cold-all-failed'))failure();
        if(/Gold_Currency/.test(u.pathname)) {
          const currency=gc.currency.map(row=>({...row,
            ...(phase===2&&scenario==='daily-recovery'?{time:'14:30:00'}:{}),
            ...(scenario==='daily-old-fx'?{date:'1405-07-13'}:{}),
            ...(scenario==='daily-unknown-fx-unit'?{unit:null}:{}),
            ...(scenario==='daily-coerced-fx-price'?{price:true,time:'14:00:00'}:{}),
          }));
          return reply(phase===1&&scenario==='authoritative-empty'?{gold:[],currency:[],cryptocurrency:[]}:phase===1&&scenario==='missing-currency'?{gold:gc.gold,cryptocurrency:gc.cryptocurrency}:{...gc,currency});
        }
        if(/Nav/.test(u.pathname)&&scenario==='nav-http-recovery') {
          if(!u.searchParams.has('l18'))return reply({});
          navReads++;
          return phase<2?reply({error:'temporary provider failure'},503):reply({predtran:1000,psubtran:1010,date:'1405-07-14',time:'09:30:00'});
        }
        if(/Nav/.test(u.pathname)&&scenario.startsWith('nav-restart'))return reply(u.searchParams.has('l18')?{predtran:0}:[{l18:fund.l18,predtran:1200,psubtran:1210,date:'1405-07-14',time:'09:30:00'},{l18:'unavailable-fund',predtran:0}]);
        if(/AllSymbols/.test(u.pathname)&&scenario.startsWith('nav-restart'))return reply([stock,fund,{...fund,l18:'isolated-second-fund'}]);
        if(/AllSymbols/.test(u.pathname))return reply(phase===1&&scenario==='authoritative-empty'?[]:phase===1&&scenario==='invalid-fund'?[stock,{...fund,pl:0}]:[stock,fund]);
        if(/Index/.test(u.pathname))return reply({index:100,index_change:0,date:'1405-07-14',time:'09:30:00'});
        if(/Option/.test(u.pathname))return reply(phase===1&&scenario==='authoritative-empty'?[]:[{...option,pl:2000+phase*1000}]);
        return reply([]);
      }
      if(u.hostname!=='isolated.invalid') {blockedHosts++;throw new Error('Unexpected host blocked');}
      if(u.pathname.includes('/rpc/')) {
        if(scenario.startsWith('client-')&&u.pathname.endsWith('/brsapi_budget_lease')) {
          const starved=scenario==='client-budget-midcycle'&&phase===1;
          const granted=starved?(partialGrant?0:1):1;
          if(starved)partialGrant=true;
          const before=starved?1000-granted:scenario==='client-budget-auxiliary'&&phase===1?Math.max(900,leased):leased;leased=before+granted;
          return reply([{granted,leased_before:before,hard_ceiling:1000}]);
        }
        return reply({code:'PGRST202'},404);
      }
      if(init.method==='POST') {
        const rows=JSON.parse(init.body);
        if(u.pathname.endsWith('/ir_market_snapshots'))latest.push(...rows.filter(x=>x.key==='latest').map(x=>x.payload));
        else if(u.pathname.endsWith('/ir_market_history'))history.push(...rows);
        else daily.push({path:u.pathname,rows});
        return reply([],201);
      }
      if(u.pathname.endsWith('/ir_market_snapshots')&&u.searchParams.get('key')==='eq.latest') {
        initialReads++;
        if(scenario==='unknown-baseline'||scenario==='retry-baseline'&&phase===0)failure();
        if(scenario==='malformed-baseline')return reply([{payload:{}}]);
        if(scenario.startsWith('nav-restart'))return reply([{payload:{...gc,crypto:gc.cryptocurrency,stocks:[],options:[],indices:null,
          funds:[fund.l18,'isolated-second-fund'].map(id=>({id,faName:'Synthetic retained fund',unit:'toman',price:100,nav:100,navIssue:101,
            navDate:'1405-07-14',navTime:'08:00:00',...(scenario==='nav-restart-partial'?{navReceivedAt:start-3600000}:{})})),fetchedAt:start-3600000,
          snapshotQuality:{families:{funds:{state:'received',receivedAt:start-3600000,retained:false}}}}}]);
        if(scenario==='hydrated-partial'||scenario==='retry-baseline')return reply([{payload:{...gc,crypto:gc.cryptocurrency,
          stocks:[stock],funds:[fund],options:[option],indices:{date:'1405-07-14',time:'09:30:00'},fetchedAt:start-3600000}}]);
      }
      return reply([]);
    };
    const {server,refresh}=await import(${JSON.stringify(source)});
    const get=path=>new Promise((resolve,reject)=>{
      const req=http.get({hostname:'127.0.0.1',port:server.address().port,path,headers:{Authorization:'Bearer synthetic'}},r=>{
        let b='';r.on('data',d=>b+=d);r.on('end',()=>resolve({code:r.statusCode,body:JSON.parse(b)}));
      });req.on('error',reject);
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    if(scenario==='hydrated-partial')phase=1;
    await refresh();
    if(scenario.startsWith('nav-restart'))for(let i=0;i<100;i++) {
      if((await get('/debug')).body.sources.brsapi_nav?.updated===1)break;
      await new Promise(r=>setTimeout(r,5));if(i===99)throw Error('offline NAV round did not complete');
    }
    const drainNav=async()=>{
      for(let i=0;i<200;i++) {
        const d=(await get('/debug')).body;
        if(navReads>=phase+1 && (phase<2?d.sources.brsapi_nav?.failed===1:d.sources.brsapi_nav?.updated===1))return;
        await new Promise(r=>setTimeout(r,5));
      }
      throw Error('NAV eligibility did not recover');
    };
    if(scenario==='nav-http-recovery')await drainNav();
    const first=await get('/market.json');
    if(scenario.startsWith('client-')) {
      for(let i=0;i<500;i++) {
        const d=(await get('/debug')).body;
        if(d.brsapiClient.active===0&&d.brsapiClient.queueDepth===0)break;
        await new Promise(r=>setTimeout(r,10));
        if(i===499)throw new Error('Offline client did not drain');
      }
    }
    if(!scenario.startsWith('cold')&&scenario!=='hydrated-partial') {
      phase=1;now+=scenario==='nav-http-recovery'?61*60000:scenario==='client-budget-auxiliary'?12*3600000:scenario.startsWith('daily-')||scenario==='client-budget-midcycle'?5*3600000:31*60000;await refresh();
    }
    if(scenario==='nav-http-recovery')await drainNav();
    const second=await get('/market.json');const writesAfterSecond=latest.length;
    if(scenario==='partial-recovery'||scenario==='daily-recovery'){phase=2;now+=60000;await refresh();}
    if(scenario==='nav-http-recovery'){phase=2;now+=61*60000;await refresh();await drainNav();}
    const third=await get('/market.json'); const debug=(await get('/debug')).body;
    console.log('RESULT:'+JSON.stringify({start,now,first,second,third,latest,history,daily,writesAfterSecond,debug,blockedHosts,initialReads,navReads}));
    server.close(()=>process.exit(0));`;
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','--eval',program],{
      env:{...process.env,RELAY_TOKEN:'synthetic',BRSAPI_KEY:'synthetic',BRSAPI_BASE:'https://brsapi.ir/Api',
        SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',BRSAPI_CLIENT_ENABLED:scenario.startsWith('client-')?'1':'0',
        BRSAPI_LEASE_SIZE:'1',BRSAPI_DAILY_SOFT:'900',BRSAPI_DAILY_HARD:'1000',
        MCPFARSI_QUOTE_ENABLED:'1',MCP_FARSI_API_KEY:'synthetic',
        BRSAPI_BUDGET_ENFORCE_LEGACY:'0',BRSAPI_COMMODITY_KEY:'',CODAL_ENABLED:'0',CANDLE_BACKFILL_ENABLED:'0',
        IME_ENABLED:'0',EOD_AFTER_HOUR:scenario.startsWith('daily-')||scenario==='client-budget-midcycle'?'14':'25',IR_HISTORY_SECTIONS:'gold,currency,stocks,funds'},
      stdio:['ignore','pipe','pipe']});
    let out='',err='';const timeout=setTimeout(()=>{child.kill();reject(new Error('Offline server probe timed out'));},20000);
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
    child.on('error',e=>{clearTimeout(timeout);reject(e);});
    child.on('close',code=>{clearTimeout(timeout);if(code!==0)return reject(new Error(err));
      const line=out.split(/\r?\n/).find(x=>x.startsWith('RESULT:'));
      if(!line)return reject(new Error('Missing offline result'));resolve(JSON.parse(line.slice(7)));
    });
  });
}

test('actual relay: healthy → partial timeout → recovery preserves failed rows and advances options independently',async()=>{
  const r=await probe('partial-recovery');
  assert.equal(r.blockedHosts,0);
  assert.equal(r.debug.mcpfarsiQuote.enabled,false,'retired MCP stays disabled even with the old deployed flag');
  assert.equal(r.debug.mcpfarsiQuote.requests,0);
  assert.equal(r.second.body.stocks.length,1);
  assert.deepEqual(r.second.body.stocks,r.first.body.stocks);
  assert.deepEqual(r.second.body.funds,r.first.body.funds);
  assert.equal(r.second.body.options[0].price,300);
  assert.equal(r.second.body.snapshotQuality.state,'partial');
  assert.equal(r.second.body.snapshotQuality.families.stocks.state,'stale');
  assert.equal(r.second.body.snapshotQuality.families.stocks.receivedAt,r.start);
  assert.equal(r.second.body.snapshotQuality.families.options.receivedAt,r.start+31*60000);
  assert.equal(r.second.body.fetchedAt,r.start);
  assert.equal(r.second.body.stocks[0].sourceDate,'1405-07-14');
  assert.equal(r.second.body.stocks[0].sourceTime,'09:30:00');
  assert.equal(r.third.body.snapshotQuality.state,'complete');
  assert.equal(r.third.body.snapshotQuality.families.stocks.state,'received');
  assert.equal(r.third.body.fetchedAt,r.now);
  assert.equal(r.history.length,8,'retained families were not appended as newly received history');
  assert.ok(r.debug.lastAttempt>0);
});

test('actual relay: all sources fail in a warm cycle; served metadata reports error and no snapshot/history write',async()=>{
  const r=await probe('warm-all-failed');
  assert.deepEqual(r.second.body.stocks,r.first.body.stocks);
  assert.equal(r.second.body.snapshotQuality.state,'error');
  assert.equal(r.second.body.fetchedAt,r.start);
  assert.equal(r.writesAfterSecond,1);
  assert.equal(r.history.length,4);
  assert.ok(r.debug.lastError);
});

test('actual relay: cold all-source failure yields 503 and leaves persisted snapshots untouched',async()=>{
  const r=await probe('cold-all-failed');
  assert.equal(r.first.code,503);
  assert.equal(r.latest.length,0);
  assert.equal(r.history.length,0);
  assert.equal(r.debug.snapshotQuality.state,'error');
});

test('actual relay: explicit successful empty arrays clear old data rather than pretending failure',async()=>{
  const r=await probe('authoritative-empty');
  assert.deepEqual(r.second.body.stocks,[]);
  assert.deepEqual(r.second.body.options,[]);
  assert.equal(r.second.body.snapshotQuality.state,'complete');
  assert.equal(r.second.body.snapshotQuality.families.stocks.state,'empty');
  assert.equal(r.writesAfterSecond,2);
});

test('actual relay: cold partial cycle keeps the successful options independently and marks other families unavailable',async()=>{
  const r=await probe('cold-partial');
  assert.equal(r.first.code,200);
  assert.equal(r.first.body.options.length,1);
  assert.equal(r.first.body.snapshotQuality.state,'partial');
  assert.equal(r.first.body.snapshotQuality.families.stocks.state,'unavailable');
  assert.equal(r.first.body.snapshotQuality.families.stocks.receivedAt,null);
});

test('actual relay: restart hydrates stored rows before a partial source failure, preserving their prior receipt/source clock',async()=>{
  const r=await probe('hydrated-partial');
  assert.equal(r.initialReads,1);
  assert.equal(r.first.body.stocks.length,1);
  assert.equal(r.first.body.stocks[0].time,'09:30:00');
  assert.equal(r.first.body.snapshotQuality.families.stocks.state,'stale');
  assert.equal(r.first.body.snapshotQuality.families.stocks.receivedAt,r.start-3600000);
  assert.equal(r.first.body.fetchedAt,r.start-3600000);
});

test('actual relay: one missing currency field retains only currency while gold and stocks advance', async()=>{
  const r=await probe('missing-currency');
  assert.equal(r.second.body.snapshotQuality.families.currency.state,'stale');
  assert.equal(r.second.body.snapshotQuality.families.currency.receivedAt,r.start);
  assert.equal(r.second.body.snapshotQuality.families.gold.state,'received');
  assert.equal(r.second.body.snapshotQuality.families.stocks.receivedAt,r.now);
  assert.equal(r.history.filter(x=>x.section==='currency').length,1);
});

for(const scenario of ['unknown-baseline','malformed-baseline'])test('actual relay: '+scenario+' blocks partial latest replacement',async()=>{
  const r=await probe(scenario);
  assert.equal(r.first.code,200);
  assert.equal(r.latest.length,0);
  assert.equal(r.debug.baseline.state,'unknown');
  assert.ok(r.first.body.options.length);
});

test('actual relay: next natural cycle retries baseline and fills unknown families without replacing current healthy options',async()=>{
  const r=await probe('retry-baseline');
  assert.equal(r.initialReads,2);
  assert.equal(r.latest.length,1);
  assert.equal(r.first.body.stocks.length,0);
  assert.equal(r.second.body.stocks.length,1);
  assert.equal(r.second.body.options[0].price,300);
  assert.equal(r.second.body.snapshotQuality.families.stocks.receivedAt,r.start-3600000);
});

test('actual relay: malformed nonempty option and core responses cannot clear warm data',async()=>{
  const r=await probe('malformed-sources');
  assert.equal(r.second.body.snapshotQuality.state,'error');
  assert.deepEqual(r.second.body.options,r.first.body.options);
  assert.deepEqual(r.second.body.stocks,r.first.body.stocks);
  assert.equal(r.writesAfterSecond,1);
});

test('actual relay: retained rows do not become EOD stock/FX/index/breadth records after close',async()=>{
  const r=await probe('daily-partial');
  assert.equal(r.second.body.stocks.length,1);
  assert.equal(r.second.body.snapshotQuality.families.stocks.state,'stale');
  assert.deepEqual(r.daily,[]);
});

test('actual relay: recovered sources do reach the existing EOD writers after close',async()=>{
  const r=await probe('daily-recovery');
  for(const path of ['symbol_history','fx_rates','index_history','market_breadth'])assert.ok(r.daily.some(x=>x.path.endsWith('/'+path)),path);
});

test('actual relay: fresh transport cannot relabel yesterday USD as today or attest an absent source unit',async()=>{
  for(const [scenario,reason] of [['daily-old-fx','usd-source-not-today'],['daily-unknown-fx-unit','unverified-usd-unit']]) {
    const r=await probe(scenario);
    assert.equal(r.daily.some(x=>x.path.endsWith('/fx_rates')),false);
    assert.equal(r.debug.fxRates.lastDate,null);
    assert.equal(r.debug.fxRates.error,reason);
    assert.equal(r.blockedHosts,0);
  }
});

test('actual relay: boolean source USD price cannot become a synthetic daily observation',async()=>{
  const r=await probe('daily-coerced-fx-price');
  assert.equal(r.daily.some(x=>x.path.endsWith('/fx_rates')),false);
  assert.equal(r.debug.fxRates.lastDate,null);
  assert.equal(r.debug.fxRates.error,'invalid-usd-price');
  assert.equal(r.blockedHosts,0);
});

test('actual relay: valid stocks cannot disguise an unusable nonempty fund family',async()=>{
  const r=await probe('invalid-fund');
  assert.deepEqual(r.second.body.funds,r.first.body.funds);
  assert.equal(r.second.body.snapshotQuality.families.funds.state,'stale');
  assert.equal(r.second.body.snapshotQuality.families.stocks.state,'received');
  assert.equal(r.history.filter(x=>x.section==='funds').length,1);
  assert.equal(r.history.filter(x=>x.section==='stocks').length,2);
});

test('actual relay CLIENT_ENABLED=1: mid-cycle budget rejection blocks partial latest/history/EOD writes despite successful families',async()=>{
  const r=await probe('client-budget-midcycle');
  assert.equal(r.blockedHosts,0);
  assert.equal(r.first.body.snapshotQuality.state,'complete');
  assert.equal(r.second.body.snapshotQuality.state,'partial');
  assert.ok(Object.values(r.second.body.snapshotQuality.families).some(f=>f.state==='received'));
  assert.ok(r.debug.brsapiClient.rejectedByBudget>0);
  assert.equal(r.debug.brsapiBudgetStop.active,true,JSON.stringify({latestWrites:r.writesAfterSecond,historyRows:r.history.length,dailyPaths:r.daily.map(x=>x.path)}));
  assert.ok(r.debug.brsapiBudgetStop.producers.options>0,'pre-queue rejection reaches the cycle gate');
  assert.ok(r.debug.brsapiBudgetStop.producers['market-index']>0,'reserve-at-send rejection reaches the cycle gate');
  assert.equal(r.writesAfterSecond,1,'no latest write from the budget-stopped cycle');
  assert.equal(r.history.length,4,'no fresh-family history from the stopped cycle');
  assert.deepEqual(r.daily,[],'no EOD/FX/index/breadth from the stopped cycle');
});

test('actual relay CLIENT_ENABLED=1: ordinary source timeout remains a partial update without a budget stop',async()=>{
  const r=await probe('client-source-timeout');
  assert.equal(r.blockedHosts,0);
  assert.equal(r.second.body.snapshotQuality.state,'partial');
  assert.equal(r.debug.brsapiBudgetStop.active,false);
  assert.equal(r.writesAfterSecond,2);
  assert.equal(r.second.body.options[0].price,300);
  assert.deepEqual(r.second.body.stocks,r.first.body.stocks);
});

test('complete core snapshot persists when optional enrichment exhausts its budget',async()=>{
  const r=await probe('client-budget-auxiliary');
  assert.equal(r.blockedHosts,0);
  assert.equal(r.second.body.snapshotQuality.state,'complete');
  assert.equal(r.debug.brsapiBudgetStop.active,true);
  assert.ok(r.debug.brsapiBudgetStop.producers['fund-meta']>0);
  assert.equal(r.debug.sources.brsapi_fund_meta.error,'budget_deferred');
  assert.equal(r.debug.sources.brsapi_fund_meta.ok,false);
  assert.equal(r.writesAfterSecond,2);
  assert.equal(r.latest[1].fetchedAt,r.second.body.fetchedAt);
  assert.equal(r.latest[1].options[0].price,300);
  assert.equal(r.history.length,4,'budget stop still prevents follow-on history writes');
});


for(const scenario of ['nav-restart-partial','nav-restart-legacy'])test(`restart NAV actual server: ${scenario} retains only truly received NAV through partial fresh rotation`,async()=>{
  const r=await probe(scenario);assert.equal(r.blockedHosts,0);assert.equal(r.initialReads,1);
  const row=r.second.body.funds.find(f=>f.id==='isolated-second-fund');
  assert.equal(row.price,100); assert.equal(row.unit,'toman');
  if(scenario==='nav-restart-partial') {
    assert.equal(row.nav,100); assert.equal(row.navIssue,101); assert.equal(row.navDate,'1405-07-14');
    assert.equal(row.navTime,'08:00:00'); assert.equal(row.navRetained,true); assert.equal(row.navReceivedAt,r.start-3600000);
  } else { assert.equal(row.nav,undefined); assert.equal(row.navDate,undefined); assert.equal(row.navReceivedAt,undefined); }
  assert.equal(r.second.body.funds.find(f=>f.id==='isolated-fund').nav,120);
  assert.equal(r.second.body.funds.find(f=>f.id==='isolated-fund').navReceivedAt,r.start);
  assert.equal(r.latest.at(-1).funds.find(f=>f.id==='isolated-second-fund').navReceivedAt,row.navReceivedAt);
  assert.equal(r.second.body.snapshotQuality.families.funds.receivedAt,r.now);
});


test('actual relay: two HTTP failures cannot permanently suppress the next valid NAV', async()=>{
  const r=await probe('nav-http-recovery');
  assert.equal(r.navReads,3);
  assert.equal(r.blockedHosts,0);
  assert.equal(r.debug.sources.brsapi_nav.updated,1);
  assert.equal(r.debug.navBlacklist.size,0);
});
