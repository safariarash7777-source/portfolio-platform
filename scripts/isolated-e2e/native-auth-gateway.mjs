// Shared native Next gateway. Fixed pf10/p09 profiles only; no mock responses.
import http from 'node:http';
const origin='http://localhost:32189';
export function gatewayProfile(profile){
 if(profile==='pf10')return {identityPath:'/__pf10_native_identity',routes:['/api/personal-finance/debt-payments','/api/personal-finance/cash-flow','/api/portfolio/holdings','/api/portfolio/debts']};
 if(profile==='p09')return {identityPath:'/__p09_native_identity',routes:['/api/admin/intelligence/workbooks']};
 throw Error('pf10_native_unknown_gateway_profile');
}
export async function startNativeAuthGateway(profile){
 const config=gatewayProfile(profile);
 if(process.platform!=='linux'||process.env.NATIVE_AUTH_PROFILE!==profile||process.env.NATIVE_AUTH_ORIGIN!==origin||!/^[a-f0-9]{40}$/.test(process.env.NATIVE_AUTH_SHA??''))throw Error('pf10_native_gateway_environment');
 const {default:next}=await import('next');
 const app=next({dev:true,hostname:'127.0.0.1',port:32189});
 await app.prepare();const handle=app.getRequestHandler(),allowed=new Set(config.routes);
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,origin).pathname;
 if(path===config.identityPath){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({profile,runId:process.env.NATIVE_AUTH_RUN,sha:process.env.NATIVE_AUTH_SHA}));return;}
 if(path.startsWith('/auth/v1/')||path.startsWith('/rest/v1/')){
  const upstream=http.request({hostname:'127.0.0.1',port:32190,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);return;
 }
 if(!allowed.has(path)){res.writeHead(404);res.end();return;}
 void handle(req,res);
});
server.listen(32189,'127.0.0.1');
process.on('SIGTERM',()=>{server.close();void app.close();});
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await startNativeAuthGateway(process.env.NATIVE_AUTH_PROFILE);
