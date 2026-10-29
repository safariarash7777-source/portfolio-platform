import http from 'node:http';
import next from 'next';
import {getRequestMeta} from 'next/dist/server/request-meta.js';
const origin='http://localhost:32189';
const app=next({dev:true,hostname:'localhost',port:32189});
await app.prepare();
const handle=app.getRequestHandler();
let commandRpcCalls=0; // Test transport telemetry only; never inspect or change a request body.
const server=http.createServer((req,res)=>{
 if(req.url==='/__consultation_lab_identity'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({runId:process.env.LAB_RUN_ID,sha:process.env.LAB_SHA,commandRpcCalls}));return;}
 if(req.url.split('?')[0]==='/rest/v1/rpc/command_consultation')commandRpcCalls++;
 if(!req.url.startsWith('/auth/v1/')&&!req.url.startsWith('/rest/v1/')){if(req.url.startsWith('/api/consultation'))res.on('finish',()=>{const raw=getRequestMeta(req,'initURL');console.log(JSON.stringify({labDiagnostic:'origin',initOrigin:typeof raw==='string'?new URL(raw).origin:null,originHeader:req.headers.origin??null,status:res.statusCode}));});void handle(req,res);return;}
 res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version');
 res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const port=32190;
 const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});
server.listen(32189,'127.0.0.1');
process.on('SIGTERM',()=>{server.close();void app.close();});
