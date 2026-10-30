// PF10 adapter of START-A's lab-host-gateway.mjs. Test-only, no mock responses.
import http from 'node:http';
import next from 'next';
const origin='http://localhost:32189';
if(process.platform!=='linux'||process.env.PF10_NATIVE_ORIGIN!==origin||!/^[a-f0-9]{40}$/.test(process.env.PF10_NATIVE_SHA??''))throw Error('pf10_native_gateway_environment');
const app=next({dev:true,hostname:'127.0.0.1',port:32189});
await app.prepare();const handle=app.getRequestHandler();
const allowed=new Set(['/api/personal-finance/debt-payments','/api/personal-finance/cash-flow','/api/portfolio/holdings','/api/portfolio/debts']);
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,origin).pathname;
 if(path==='/__pf10_native_identity'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({runId:process.env.PF10_NATIVE_RUN,sha:process.env.PF10_NATIVE_SHA}));return;}
 if(path.startsWith('/auth/v1/')||path.startsWith('/rest/v1/')){
  const upstream=http.request({hostname:'127.0.0.1',port:32190,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);return;
 }
 if(!allowed.has(path)){res.writeHead(404);res.end();return;}
 void handle(req,res);
});
server.listen(32189,'127.0.0.1');
process.on('SIGTERM',()=>{server.close();void app.close();});
