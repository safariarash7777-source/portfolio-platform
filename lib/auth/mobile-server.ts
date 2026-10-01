import 'server-only';
import {randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
export function mobileEnabled(){return process.env.AUTH_MOBILE_ENABLED==='true';}
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const configured=process.env.AUTH_ALLOWED_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL;
  const allowed=configured?configured.split(',').map(x=>x.trim()):[new URL(request.url).origin];
  return !!origin && allowed.includes(origin);
}
export async function admitMobile(request:Request, action:string, phone:string) {
  const endpoint=process.env.AUTH_SMS_CONTROL_URL;
  const secret=process.env.AUTH_SMS_CONTROL_SECRET;
  if(!endpoint || !secret)throw new Error('admission_unavailable');
  const url=new URL(endpoint);
  if(url.username || url.password || url.search || url.hash || (url.protocol!=='https:' && !(process.env.AUTH_MOBILE_LOCAL_SANDBOX==='true' && ['127.0.0.1','localhost'].includes(url.hostname))))throw new Error('admission_unavailable');
  const jar=await cookies();
  let device=jar.get('auth-device')?.value;
  if(!device || !/^[a-f0-9-]{36}$/.test(device)) {
    device=randomUUID();jar.set('auth-device',device,{httpOnly:true,secure:url.protocol==='https:',sameSite:'strict',path:'/',maxAge:86400});
  }
  // Only an operator-selected ingress header is trusted. No browser-provided IP parameter.
  const ip=process.env.AUTH_TRUSTED_IP_HEADER==='x-vercel-forwarded-for'?request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim():'shared-untrusted-ingress';
  const response=await fetch(new URL('/v1/admit',url),{method:'POST',redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({action,phone,device,ip:ip??'shared-untrusted-ingress'}),signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error(response.status===429?'rate_limited':'admission_unavailable');
}
