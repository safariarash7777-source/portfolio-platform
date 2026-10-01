import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('actual server cold-start budget rejection sends no upstream and writes no empty snapshot', async () => {
  const serverUrl = new URL('./server.mjs', import.meta.url).href;
  const probe = `
    import http from 'node:http';
    let upstream = 0, writes = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (url.hostname === 'brsapi.ir') { upstream++; throw new Error('unexpected mocked upstream'); }
      if (url.hostname !== 'isolated.invalid') throw new Error('unexpected network host');
      if (url.pathname.includes('/rpc/')) return { ok:false, status:400, json:async()=>({code:'BRSB4'}) };
      if (init.method === 'POST') { writes++; return {ok:true,status:201,json:async()=>[]}; }
      return {ok:true,status:200,json:async()=>[]};
    };
    const {server} = await import(${JSON.stringify(serverUrl)});
    const request = path => new Promise((resolve,reject)=>{
      const req = http.get({hostname:'127.0.0.1',port:server.address().port,path,headers:{Authorization:'Bearer isolated-test'}}, res=>{
        let body=''; res.on('data',d=>body+=d); res.on('end',()=>resolve({code:res.statusCode,body}));
      }); req.on('error',reject);
    });
    server.listen(0,'127.0.0.1',async()=>{
      try {
        const market=await request('/market.json');
        const d=JSON.parse((await request('/debug')).body);
        console.log('RESULT:'+JSON.stringify({upstream,writes,marketStatus:market.code,warmedUp:d.warmedUp,
          lastRefresh:d.lastRefresh,stopped:d.brsapiBudgetStop.active,remaining:d.brsapiLegacy.budget?.remaining,
          known:d.brsapiLegacy.budget?.remainingKnown}));
        server.close(()=>process.exit(0));
      } catch(e) { console.error(e); server.close(()=>process.exit(1)); }
    });`;
  const result = await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','--eval',probe],{
      env:{...process.env,RELAY_TOKEN:'isolated-test',BRSAPI_KEY:'synthetic',BRSAPI_BASE:'https://brsapi.ir/Api',
        BRSAPI_COMMODITY_KEY:'',BRSAPI_COMMODITY_BASE:'https://brsapi.ir/Api',BRSAPI_CLIENT_ENABLED:'0',
        BRSAPI_BUDGET_ENFORCE_LEGACY:'1',BRSAPI_DEGRADED_CEILING:'100',
        SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',CODAL_ENABLED:'0'},
      stdio:['ignore','pipe','pipe']});
    let out='',err=''; const timeout=setTimeout(()=>{child.kill();reject(new Error('isolated server timeout'));},20000);
    child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d);
    child.on('error',e=>{clearTimeout(timeout);reject(e);});
    child.on('close',code=>{clearTimeout(timeout);
      if(code!==0)return reject(new Error(err));
      const line=out.split(/\r?\n/).find(x=>x.startsWith('RESULT:'));
      if(!line)return reject(new Error('missing probe result'));
      resolve(JSON.parse(line.slice(7)));
    });
  });
  assert.deepEqual(result,{upstream:0,writes:0,marketStatus:503,warmedUp:false,lastRefresh:0,stopped:true,remaining:null,known:false});
});
