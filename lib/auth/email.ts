import {normalizeReturnPath} from '@/components/account/returnPath';
export function emailReturnPath(value:string|null|undefined) {
  const path=normalizeReturnPath(value);
  const pathname=path.split(/[?#]/,1)[0];
  return ['/dashboard','/market','/funds','/stocks','/courses','/consulting','/admin'].some(root=>pathname===root || pathname.startsWith(root+'/'))?path:'/dashboard';
}
export function emailLinkDestination(fragment:string,origin:string) {
  const params=new URLSearchParams(fragment.replace(/^#/,''));
  const type=params.get('type');
  const token=params.get('token_hash');
  if(!['signup','recovery'].includes(type??'') || !token || !/^(?:pkce_)?[a-f0-9]{40,128}$/.test(token))return null;
  let next='/dashboard';
  if(type==='recovery')next='/reset-password';
  else {try{const redirect=new URL(params.get('redirect')??'',origin);if(redirect.origin===origin && redirect.pathname==='/auth/callback')next=emailReturnPath(redirect.searchParams.get('next'));}catch{/* fixed fallback */}}
  return {type:type as 'signup'|'recovery',token,next};
}
