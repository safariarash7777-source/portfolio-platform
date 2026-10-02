import {normalizeReturnPath} from '@/components/account/returnPath';
export function emailReturnPath(value:string|null|undefined) {
  const path=normalizeReturnPath(value);
  const pathname=path.split(/[?#]/,1)[0];
  return ['/dashboard','/market','/funds','/stocks','/courses','/consulting','/admin','/symbol','/terminal','/data','/webinars','/consultation','/learn','/publications','/insights'].some(root=>pathname===root || pathname.startsWith(root+'/'))?path:'/dashboard';
}
export function recoveryPageHref(value:string|null|undefined) {
  const next=emailReturnPath(value);
  return next==='/dashboard'?'/reset-password':'/reset-password?next='+encodeURIComponent(next);
}
export function recoveryDestination(value:string|null|undefined,origin:string) {
  try {
    const recovery=new URL(value??'/reset-password',origin);
    if(recovery.origin===origin && recovery.pathname==='/reset-password')return recoveryPageHref(recovery.searchParams.get('next'));
  }catch{/* Invalid destinations cannot break an already-consumed recovery link. */}
  return '/reset-password';
}
export function freshEmailRecoveryProof(amr:unknown,now=Date.now()/1000):boolean {
  return Array.isArray(amr) && amr.some(value=>value && typeof value==='object' &&
    ['otp','recovery'].includes(value.method) && typeof value.timestamp==='number' &&
    Number.isFinite(value.timestamp) && value.timestamp<=now && value.timestamp>now-300);
}
export type RecoveryCheck = 'ready'|'proof_required'|'unavailable';
export async function recoveryCheck(response:Response):Promise<RecoveryCheck> {
  if(!response.ok)return response.status===401?'proof_required':'unavailable';
  try {
    const data:unknown=await response.json();
    if(!data || typeof data!=='object' || !('authenticated' in data))return 'unavailable';
    if(data.authenticated===false)return 'proof_required';
    if(data.authenticated===true && 'recovery' in data && data.recovery==='ready')return 'ready';
    if(data.authenticated===true && 'recovery' in data && data.recovery==='proof_required')return 'proof_required';
  }catch{/* Transport/shape is not evidence of an expired link. */}
  return 'unavailable';
}
export function emailLinkDestination(fragment:string,origin:string) {
  const params=new URLSearchParams(fragment.replace(/^#/,''));
  const type=params.get('type');
  const token=params.get('token_hash');
  if(!['signup','recovery'].includes(type??'') || !token || !/^(?:pkce_)?[a-f0-9]{40,128}$/.test(token))return null;
  let next='/dashboard';
  if(type==='recovery')next='/reset-password';
  try {
    const redirect=new URL(params.get('redirect')??'',origin);
    if(redirect.origin===origin && redirect.pathname==='/auth/callback') {
      if(type==='signup')next=emailReturnPath(redirect.searchParams.get('next'));
      else {
        next=recoveryDestination(redirect.searchParams.get('next'),origin);
      }
    }
  }catch{/* fixed fallback */}
  return {type:type as 'signup'|'recovery',token,next};
}
