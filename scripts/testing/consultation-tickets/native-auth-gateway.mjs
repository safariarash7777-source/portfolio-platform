// P03 test-only derivative; no browser profile enabled.
// Shared native Next gateway. Fixed pf10/p09 profiles only; no mock responses.
import http from 'node:http';
const origin='http://localhost:32189';
export function gatewayProfile(profile){
 if(profile!=='consultation-ticket')throw Error('p03_ticket_native_unknown_profile');
 return {"identityPath": "/__p03_ticket_native_identity", "routes": ["/api/consultation", "/api/consultation/roster", "/api/consultation/replies", "/api/consultation/tickets", "/api/portfolio/holdings", "/api/portfolio/debts", "/api/personal-finance/cash-flow", "/api/personal-finance/goals"]};
}
// Opt-in p09 page only. Raw paths are checked before URL normalization.
export function browserRequestAllowed(value,method='GET'){
 if(!['GET','HEAD'].includes(method)||typeof value!=='string')return false;
 try{
  const url=new URL(value,origin);if(url.origin!==origin||url.username||url.password||url.hash)return false;
  const raw=value.startsWith(origin)?value.slice(origin.length):value;
  if(!raw.startsWith('/')||raw.startsWith('//'))return false;
  if(/%(?:2e|2f|5c|25|00)/i.test(raw.split('?')[0]))return false;
  const path=decodeURIComponent(raw.split('?')[0]);
  if(/[\\%\u0000-\u0020]/.test(path)||path.split('/').some(x=>x==='.'||x==='..'))return false;
  for(const [key,v] of url.searchParams)if(key!=='v'||!/^\d{1,20}$/.test(v))return false;
  if(path==='/admin/research')return !url.search;
  if(['/fonts/Vazirmatn-Variable.woff2','/fonts/Pelak-Bold.woff2','/fonts/Pelak-ExtraBold.woff2','/fonts/Pelak-Black.woff2','/brand/mark.png'].includes(path))return !url.search;
  return path.startsWith('/_next/static/')&&/^\/[a-zA-Z0-9_./()[\]@-]+$/.test(path);
 }catch{return false;}
}
export async function startNativeAuthGateway(profile){
 const config=gatewayProfile(profile);
 const browserMode=process.env.NATIVE_AUTH_BROWSER_MODE==='true';
 if((process.env.NATIVE_AUTH_BROWSER_MODE!==undefined&&!['true','false'].includes(process.env.NATIVE_AUTH_BROWSER_MODE))||(browserMode&&profile!=='p09'))throw Error('p09_browser_gateway_mode');
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
 if(!allowed.has(path)&&!(browserMode&&browserRequestAllowed(req.url,req.method))){res.writeHead(404);res.end();return;}
 void handle(req,res);
});
server.listen(32189,'127.0.0.1');
process.on('SIGTERM',()=>{server.close();void app.close();});
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await startNativeAuthGateway(process.env.NATIVE_AUTH_PROFILE);
