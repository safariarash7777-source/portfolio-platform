import {createServer,request} from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const privateDir=path.join(os.homedir(),'.codex/private/followup06-feed-market');
const secrets=JSON.parse(fs.readFileSync(path.join(privateDir,'secrets.json'))),origin=secrets.origin;
const faultFile=path.join(privateDir,'fault.json');
if(!fs.existsSync(faultFile))fs.writeFileSync(faultFile,'{}');
createServer((req,res)=>{
 const url=new URL(req.url,origin);let port=3398,route=req.url,service='app';
 if(url.pathname.startsWith('/supabase/')){
  if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('Origin forbidden');return}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info,x-supabase-api-version,x-upsert','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','Vary':'Origin'});res.end();return}
  if(url.pathname.startsWith('/supabase/auth/v1')){service='auth';port=54351;route=req.url.replace('/supabase/auth/v1','')||'/'}
  else if(url.pathname.startsWith('/supabase/rest/v1')){service='rest';port=54352;route=req.url.replace('/supabase/rest/v1','')||'/'}
  else if(url.pathname.startsWith('/supabase/storage/v1')){service='storage';port=54353;route=req.url.replace('/supabase/storage/v1','')||'/'}
  else{res.writeHead(404);res.end();return}
  if(port!==54353 && ![secrets.anon,secrets.service].includes(req.headers.apikey)){res.writeHead(401);res.end('API key required');return}
 }
 let faults={};try{faults=JSON.parse(fs.readFileSync(faultFile,'utf8'))}catch{faults={auth:true,storage:true,rest:true}}
 if(faults[service]){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"Owned sandbox upstream unavailable"}');return}
 const upstream=request({hostname:'127.0.0.1',port,path:route,method:req.method,headers:{...req.headers,'x-forwarded-host':'127.0.0.1:3399','x-forwarded-proto':'http'}},r=>{const headers={...r.headers};if(port!==3398){headers['access-control-allow-origin']=origin;headers.vary='Origin'}res.writeHead(r.statusCode,headers);r.pipe(res)});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Owned sandbox service unavailable"}')});req.pipe(upstream);
}).listen(3399,'127.0.0.1',()=>console.log('Owned limited native Auth/Storage gateway: http://127.0.0.1:3399'));
