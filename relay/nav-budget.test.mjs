import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { BrsApiClient, DailyBudget } from './brsapi-client.mjs';
import { LegacyMeter } from './brsapi-legacy-meter.mjs';

// Real NAV producer and budget store; every HTTP boundary is replaced before import.
// No server.listen, provider call, SQL, account data or scheduler runs in these children.
function probe(enabled, scenario) {
  const program = `
    import assert from 'node:assert/strict';
    import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
    const deny=()=>{throw Error('network denied')};
    http.request=http.get=https.request=https.get=net.connect=net.createConnection=deny;
    const scenario=${JSON.stringify(scenario)};
    let bulk=0, singles=[], leaseCalls=0, dbWrites=0, leased=0;
    const reply=(x,status=200)=>new Response(JSON.stringify(x),{status});
    globalThis.fetch=async(input,init={})=>{
      const u=new URL(input);
      if(u.hostname==='isolated.invalid'){
        if(u.pathname.endsWith('/rpc/brsapi_budget_lease')){
          leaseCalls++;
          if(scenario==='unknown-lease')throw Error('unknown lease response');
          const denied=scenario==='denied';
          const body=JSON.parse(init.body);const before=leased;
          if(!denied)leased+=body.p_want;
          return reply([{granted:denied?0:body.p_want,leased_before:denied?9000:before,hard_ceiling:9000}]);
        }
        if(init.method==='POST'){dbWrites++;return reply([]);}
        throw Error('unexpected database route');
      }
      assert.equal(u.hostname,'api.brsapi.ir');
      assert.equal(u.pathname,'/Tsetmc/Nav.php');
      const symbol=u.searchParams.get('l18');
      if(symbol){
        singles.push(symbol);
        if(scenario==='single-fails')throw Error('timeout after send');
        return reply({predtran:1000,psubtran:1001,date:'1405-08-13',time:'12:00:00'});
      }
      bulk++;
      if(scenario==='timeout')throw Object.assign(Error('timeout'),{name:'TimeoutError'});
      if(scenario==='http500')return reply({error:'upstream'},500);
      if(scenario==='malformed')return new Response('{');
      if(scenario==='shape')return reply({status:false});
      if(scenario==='empty')return reply([]);
      if(scenario==='bulk')return reply(['یکم','دوم','سوم'].map(l18=>({l18,predtran:1000})));
      return reply({l18:'یکم',predtran:1000,date:'1405-08-13',time:'12:00:00'});
    };
    const {refreshNavFamily,server}=await import(${JSON.stringify(new URL('./server.mjs',import.meta.url).href)});
    const names=scenario==='completion' ? ['یکم',...Array.from({length:151},(_,i)=>'صندوق'+String.fromCharCode(97+Math.floor(i/26),97+i%26))] : ['یکم','دوم','سوم','دوم'];
    const funds=names.map(id=>({id,price:100,value:100}));
    await Promise.all([refreshNavFamily(funds),refreshNavFamily(funds)]);
    // Same natural interval must not repeat unknown bulk/single attempts.
    await refreshNavFamily(funds);
    const debug=await new Promise(resolve=>server.emit('request',
      {url:'/debug',method:'GET',headers:{authorization:'Bearer synthetic'}},
      {setHeader(){},writeHead(){},end(body){resolve(JSON.parse(body))}}));
    const budget=debug.brsapiClient.budget??debug.brsapiLegacy.budget;
    console.log('RESULT:'+JSON.stringify({bulk,singles,leaseCalls,leased,dbWrites,used:budget.used,
      completion:debug.navCompletion,nav:debug.sources.brsapi_nav,coreStopped:debug.brsapiBudgetStop.active}));
  `;
  const r=spawnSync(process.execPath,['--input-type=module','--eval',program],{
    env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,
      RELAY_TOKEN:'synthetic',BRSAPI_KEY:'synthetic', BRSAPI_BASE:'https://api.brsapi.ir',
      SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',
      BRSAPI_CLIENT_ENABLED:enabled,BRSAPI_BUDGET_ENFORCE_LEGACY:'0',
      BRSAPI_COMMODITY_KEY:'',CODAL_ENABLED:'0',IME_ENABLED:'0',CANDLE_BACKFILL_ENABLED:'0'},
    encoding:'utf8',timeout:45000,windowsHide:true,
  });
  assert.equal(r.error,undefined);
  assert.equal(r.status,0,r.stderr);
  const line=r.stdout.split(/\r?\n/).find(x=>x.startsWith('RESULT:'));
  assert.ok(line,'missing bounded offline receipt');
  return JSON.parse(line.slice(7));
}

for(const enabled of ['0','1']) {
  for(const scenario of ['denied','unknown-lease','timeout','http500','malformed','shape']) {
    test(`NAV ${scenario}: no fallback or completion (client=${enabled})`,()=>{
      const r=probe(enabled,scenario);
      assert.equal(r.bulk,['denied','unknown-lease'].includes(scenario)?0:1);
      assert.deepEqual(r.singles,[]);
      assert.equal(r.dbWrites,0);
      assert.equal(r.coreStopped,false,'NAV denial must not stop independently healthy prices');
    });
  }
  for(const scenario of ['empty','bulk']) test(`NAV valid ${scenario}: no unnecessary single calls (client=${enabled})`,()=>{
    const r=probe(enabled,scenario);assert.equal(r.bulk,1);assert.deepEqual(r.singles,[]);
  });
  test(`NAV partial identified reply: each missing symbol exactly once (client=${enabled})`,()=>{
    const r=probe(enabled,'partial');assert.equal(r.bulk,1);assert.deepEqual(r.singles.sort(),['دوم','سوم'].sort());
    assert.equal(r.used,3);assert.equal(r.nav.updated,3);assert.ok(r.leaseCalls>0);
  });
  test(`NAV single timeout: no retry or completion duplicate (client=${enabled})`,()=>{
    const r=probe(enabled,'single-fails');assert.equal(r.bulk,1);assert.equal(new Set(r.singles).size,r.singles.length);
    assert.ok(r.singles.length>0 && r.singles.length<=2);
  });
  test(`NAV completion uses same budget, without repeating the top round (client=${enabled})`,()=>{
    const r=probe(enabled,'completion');assert.equal(r.bulk,1);assert.equal(r.singles.length,151);
    assert.equal(new Set(r.singles).size,151);assert.equal(r.used,152);
    assert.equal(r.completion.targeted,1);assert.equal(r.completion.updated,1);
  });
}

for(const mode of ['timeout','http500','http429','body']) test(`client noRetry ${mode} counts a single attempt`,async()=>{
  let sent=0;const budget=new DailyBudget({softBudget:100,hardCeiling:100});
  const client=new BrsApiClient({base:'https://isolated.invalid',key:'synthetic',budget,sleep:async()=>{},
    fetchImpl:async()=>{sent++;if(mode==='timeout')throw Error('timeout');
      if(mode==='body')return {ok:true,json:async()=>{throw Error('bad JSON')}};
      return {ok:false,status:mode==='http429'?429:500,headers:new Headers()};}});
  await assert.rejects(client.request({endpoint:'Tsetmc/Nav.php',noRetry:true}));
  assert.equal(sent,1);assert.equal(budget.snapshot().used,1);assert.equal(client.metrics().retries,0);
});

test('one-attempt requests cannot join retry-policy jobs',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve});let sent=0;
  const client=new BrsApiClient({base:'https://isolated.invalid',key:'synthetic',sleep:async()=>{},
    fetchImpl:async()=>{sent++;await gate;return {ok:true,json:async()=>[]};}});
  const retry=client.request({endpoint:'Tsetmc/Nav.php'});
  const once=client.request({endpoint:'Tsetmc/Nav.php',noRetry:true});
  release();await Promise.all([retry,once]);assert.equal(sent,2);
  await assert.rejects(client.request({endpoint:'Tsetmc/Nav.php',noRetry:'true'}),/boolean/);
});

test('NAV admission opt-in rejects missing or denied budget even in observe-only mode',async()=>{
  for(const budget of [null,new DailyBudget({softBudget:0,hardCeiling:0})]){
    const meter=new LegacyMeter(()=>budget,{enforced:()=>false});
    await assert.rejects(meter.count('nav-single','standard',{requireAdmission:true}));
    await meter.count('unchanged-observer','standard');
    assert.equal(meter.snapshot().enforced,false);
  }
});
