import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

for (const enabled of ['0', '1']) for (const scenario of ['cold', 'warm', 'stale']) {
  test(`actual server GET /market.json is passive with ${scenario} cache (client=${enabled})`, async () => {
    const source = new URL('./server.mjs', import.meta.url).href;
    const program = `
      import http from 'node:http';
      const scenario=${JSON.stringify(scenario)};
      let now=Date.parse('2026-10-11T06:00:00Z'), upstream=0, writes=0, dbReads=0;
      const RealDate=Date;
      globalThis.Date=class extends RealDate {constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
      const reply=x=>new Response(JSON.stringify(x),{status:200});
      globalThis.fetch=async(input,init={})=>{
        const u=new URL(input);
        if(u.hostname==='brsapi.ir'){
          upstream++;
          if(/Gold_Currency/.test(u.pathname))return reply({gold:[{symbol:'fixture-gold',price:100,date:'1405-07-19',time:'09:30:00'}],currency:[],cryptocurrency:[]});
          if(/AllSymbols|Option/.test(u.pathname))return reply([]);
          if(/Index/.test(u.pathname))return reply({index:100,index_change:0,date:'1405-07-19',time:'09:30:00'});
          return reply([]);
        }
        if(u.hostname!=='isolated.invalid')throw new Error('Unexpected host blocked');
        if(u.pathname.includes('/rpc/brsapi_budget_lease')){
          writes++;return reply([{granted:50,leased_before:0,hard_ceiling:9000}]);
        }
        if(init.method==='POST'){writes++;return reply([]);}
        dbReads++;return reply([]);
      };
      const {server,refresh}=await import(${JSON.stringify(source)});
      await new Promise(r=>server.listen(0,'127.0.0.1',r));
      const get=()=>new Promise((resolve,reject)=>{
        http.get({hostname:'127.0.0.1',port:server.address().port,path:'/market.json',headers:{Authorization:'Bearer synthetic'}},res=>{
          let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
        }).on('error',reject);
      });
      if(scenario!=='cold')await refresh();
      // Explicit refresh also starts background tasks. Let their queued mocked
      // sends finish before measuring effects attributable to GET.
      await new Promise(r=>setTimeout(r,1000));
      const before={upstream,writes,dbReads};
      if(scenario==='stale')now+=31*60000;
      const responses=await Promise.all([get(),get(),get()]);
      // Legacy spacing serializes sends. Observe beyond the first 100ms slot.
      await new Promise(r=>setTimeout(r,800));
      console.log('RESULT:'+JSON.stringify({before,after:{upstream,writes,dbReads},responses,now}));
      server.close(()=>process.exit(0));`;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '--eval', program], {
        env: {...process.env, RELAY_TOKEN:'synthetic', BRSAPI_KEY:'synthetic', BRSAPI_BASE:'https://brsapi.ir/Api',
          SUPABASE_URL:'https://isolated.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic', BRSAPI_CLIENT_ENABLED:enabled,
          BRSAPI_BUDGET_ENFORCE_LEGACY:'0', BRSAPI_COMMODITY_KEY:'', CODAL_ENABLED:'0', CANDLE_BACKFILL_ENABLED:'0',
          CODAL_ARCHIVE_ENABLED:'0', IME_ENABLED:'0', EOD_AFTER_HOUR:'25'},
        stdio:['ignore','pipe','pipe']});
      let out='',err='';
      const timeout=setTimeout(()=>{child.kill();reject(new Error('Offline probe timed out'));},20000);
      child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
      child.on('error',e=>{clearTimeout(timeout);reject(e);});
      child.on('close',code=>{
        clearTimeout(timeout);
        if(code!==0)return reject(new Error(err));
        const line=out.split(/\r?\n/).find(x=>x.startsWith('RESULT:'));
        if(!line)return reject(new Error('Missing offline result'));
        resolve(JSON.parse(line.slice(7)));
      });
    });
    assert.deepEqual(result.after, result.before, 'GET must cause no provider call or DB access/write');
    console.log('PASSIVE_GET_EVIDENCE:'+JSON.stringify({client:enabled,scenario,before:result.before,after:result.after,
      providerCallsFromGet:result.after.upstream-result.before.upstream,
      dbReadsFromGet:result.after.dbReads-result.before.dbReads,
      dbWritesFromGet:result.after.writes-result.before.writes,
      statuses:result.responses.map(r=>r.status)}));
    assert.equal(result.responses.length, 3);
    if(scenario==='cold') {
      assert.deepEqual(result.before,{upstream:0,writes:0,dbReads:0});
      for(const response of result.responses)assert.equal(response.status,503);
    } else {
      assert.ok(result.before.upstream>0, 'explicit offline refresh must exercise collector');
      for(const response of result.responses){
        assert.equal(response.status,200);
        assert.equal(response.body.gold.length,1);
        if(scenario==='stale')assert.ok(response.body.fetchedAt<result.now, 'reading must not restamp old data');
      }
    }
  });
}
