// Synthetic-only repro: no owner account, credential or Production request.
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {randomInt} from 'node:crypto';
import fs from 'node:fs/promises';
const dir='.task/auth-sandbox',name='followup-auth-rate-probe';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const original=JSON.parse(docker(['inspect','followup-auth-gotrue']))[0];
if(!original.NetworkSettings.Networks['followup-auth-network'])throw Error('Expected local synthetic network missing');
if(docker(['ps','-a','--format','{{.Names}}']).split('\n').includes(name))throw Error('Inspect existing synthetic rate probe first');
const env=Object.fromEntries(original.Config.Env.map(item=>{const i=item.indexOf('=');return[item.slice(0,i),item.slice(i+1)];}));
env.GOTRUE_RATE_LIMIT_HEADER='X-Auth-Client-IP';env.GOTRUE_RATE_LIMIT_VERIFY='30';
// Infrastructure config remains in process only. Never print Docker failures with env args.
try{docker(['run','-d','--name',name,'--network','followup-auth-network','--add-host','host.docker.internal:host-gateway','-p','127.0.0.1:8793:9999',...Object.entries(env).flatMap(([key,value])=>['-e',key+'='+value]),original.Image]);}
catch{throw Error('Local rate probe startup failed; sensitive arguments suppressed');}
let gateway;
try{
  for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8793/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
  gateway=createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const headers={...req.headers,'x-auth-client-ip':req.socket.remoteAddress};delete headers.host;delete headers['content-length'];
      const response=await fetch('http://127.0.0.1:8793/verify',{method:'POST',headers,body:Buffer.concat(chunks)});
      res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());
    }catch{res.writeHead(503);res.end('{}');}
  });
  await new Promise(resolve=>gateway.listen(8794,'127.0.0.1',resolve));
  const {anon}=JSON.parse(await fs.readFile(dir+'/secrets.private.json','utf8'));
  let limited=false,attempts=0;
  for(let i=0;i<35;i++){
    const response=await fetch('http://127.0.0.1:8794/verify',{method:'POST',headers:{apikey:anon,'content-type':'application/json','x-auth-client-ip':'spoof-'+i},body:JSON.stringify({type:'sms',phone:'989009999999',token:String(randomInt(100000,1000000))})});
    attempts++;if(response.status===429){limited=true;break;}
    if(response.status!==403 && response.status!==400)throw Error('Unexpected local verification status '+response.status);
  }
  const result={synthetic:true,gotrue:'v2.197.0',at:new Date().toISOString(),trustedHeaderOverwrite:true,clientHeaderSpoofRejected:limited,directVerifyNativeRateLimit:limited,requests:attempts,rateLimitVerify:30};
  await fs.writeFile('docs/ops/seasonal-program/followup-auth-evidence/native-rate-limit-fixed.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));if(!limited)throw Error('Native rate limiter was not enforced');
}finally{
  gateway?.close();docker(['stop',name]);
  // Retain this synthetic container stopped for inspectable evidence, no remove.
}
