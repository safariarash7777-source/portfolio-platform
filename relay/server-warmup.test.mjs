import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('actual startup serves the original baseline and arms provider jobs only after the full cold window', async () => {
  const source = new URL('./server.mjs', import.meta.url).href;
  const program = `
    import http from 'node:http';
    import { fileURLToPath } from 'node:url';
    import { performance } from 'node:perf_hooks';
    import timers from 'node:timers/promises';
    import { syncBuiltinESMExports } from 'node:module';
    let clock=0,releaseWarmup,provider=0,writes=0,released=false;
    const starts=[],armed=[];
    Object.defineProperty(performance,'now',{value:()=>clock});
    timers.setTimeout=async(ms,value,options={})=>{
      options.signal?.throwIfAborted();
      if(!released&&ms>=300000)await new Promise(resolve=>{releaseWarmup=()=>{released=true;clock+=ms;resolve();};});
      else clock+=ms;
      options.signal?.throwIfAborted();return value;
    };
    syncBuiltinESMExports();
    const realTimeout=globalThis.setTimeout,realInterval=globalThis.setInterval;
    globalThis.setTimeout=(fn,ms,...args)=>{armed.push(ms);return realTimeout(fn,ms,...args);};
    globalThis.setInterval=(fn,ms,...args)=>{armed.push(ms);return realInterval(fn,ms,...args);};
    const receipt=Date.now()-3600000;
    const baseline={gold:[{id:'old-gold',faName:'old',price:90,unit:'toman'}],currency:[],crypto:[],stocks:[],funds:[],options:[],indices:null,fetchedAt:receipt};
    const reply=x=>Response.json(x);
    globalThis.fetch=async(input,init={})=>{
      const u=new URL(input);
      if(u.hostname==='provider.invalid'){
        provider++;starts.push(clock);
        if(/Gold_Currency/.test(u.pathname))return reply({gold:[{symbol:'new-gold',price:100,date:'1405-08-13',time:'09:30:00'}],currency:[],cryptocurrency:[]});
        if(/Index/.test(u.pathname))return reply({index:100,index_change:0,date:'1405-08-13',time:'09:30:00'});
        if(/Commodity/.test(u.pathname))return reply({metal_precious:[],metal_base:[],energy:[]});
        return reply([]);
      }
      if(u.hostname!=='storage.invalid')throw Error('UNMOCKED_HOST');
      if(init.method==='POST'){
        writes++;
        if(u.pathname.includes('/rpc/brsapi_budget_lease'))return reply([{granted:50,leased_before:0,hard_ceiling:9000}]);
        return reply([]);
      }
      return reply(u.searchParams.get('key')==='eq.latest'?[{payload:baseline}]:[]);
    };
    process.argv[1]=fileURLToPath(${JSON.stringify(source)});
    const {server}=await import(${JSON.stringify(source)});
    const get=path=>new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:server.address().port,path,headers:{Authorization:'Bearer synthetic'}},r=>{
        let b='';r.on('data',d=>b+=d);r.on('end',()=>resolve({status:r.statusCode,body:JSON.parse(b)}));
      }).on('error',reject);
    });
    for(let i=0;!releaseWarmup;i++){if(i>200)throw Error('READINESS_NOT_REACHED');await new Promise(r=>realTimeout(r,5));}
    const before=await get('/market.json');
    const beforeCounts={provider,writes,armed:armed.slice()};
    releaseWarmup();
    let after;
    for(let i=0;i<200;i++){
      after=await get('/market.json');
      if(after.body.gold?.[0]?.id==='new-gold'&&writes>0)break;
      await new Promise(r=>realTimeout(r,5));
    }
    console.log('RESULT:'+JSON.stringify({before,after,beforeCounts,provider,starts,armed,receipt}));
    server.close(()=>process.exit(0));
  `;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', program], {
      env: { ...process.env, PORT:'0', RELAY_TOKEN:'synthetic', BRSAPI_KEY:'synthetic', BRSAPI_BASE:'https://provider.invalid',
        BRSAPI_COMMODITY_BASE:'https://provider.invalid', BRSAPI_COMMODITY_KEY:'', BRSAPI_COMMODITY_ENABLED:'1',
        SUPABASE_URL:'https://storage.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic',
        BRSAPI_CLIENT_ENABLED:'0', BRSAPI_BUDGET_ENFORCE_LEGACY:'0', CODAL_ENABLED:'1', CODAL_ARCHIVE_ENABLED:'0',
        CANDLE_BACKFILL_ENABLED:'0', IME_ENABLED:'0', EOD_AFTER_HOUR:'25' }, stdio:['ignore','pipe','pipe'],
    });
    let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('OFFLINE_STARTUP_DEADLINE'));},10000);
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error(err));
      const row=out.split(/\r?\n/).find(s=>s.startsWith('RESULT:'));
      if(!row)return reject(Error('MISSING_STARTUP_RECEIPT'));resolve(JSON.parse(row.slice(7)));});
  });
  assert.equal(result.before.status,200);assert.equal(result.before.body.fetchedAt,result.receipt);
  assert.equal(result.before.body.gold[0].id,'old-gold');
  assert.equal(result.beforeCounts.provider,0);assert.equal(result.beforeCounts.writes,0);
  assert.equal(result.beforeCounts.armed.includes(90000),false);
  assert.equal(result.beforeCounts.armed.includes(45000),false);
  assert.ok(result.armed.includes(90000));assert.ok(result.armed.includes(45000));
  assert.equal(result.after.status,200);assert.equal(result.after.body.gold[0].id,'new-gold');
  assert.ok(result.starts[0]>=300000);
  assert.ok(result.starts.slice(1).every((v,i)=>v-result.starts[i]>=300));
});
