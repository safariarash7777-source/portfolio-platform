import 'server-only';

export async function readEmailAction(request:Request):Promise<{body:Record<string,unknown>|null;status:400|413|null}> {
  if(Number(request.headers.get('content-length')??0)>4096)return {body:null,status:413};
  const reader=request.body?.getReader();
  if(!reader)return {body:null,status:400};
  const decoder=new TextDecoder();let bytes=0,raw='';
  try {
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      bytes+=chunk.value.byteLength;
      if(bytes>4096){await reader.cancel();return {body:null,status:413};}
      raw+=decoder.decode(chunk.value,{stream:true});
    }
    raw+=decoder.decode();
    const body:unknown=JSON.parse(raw);
    return body && typeof body==='object' && !Array.isArray(body)?{body:body as Record<string,unknown>,status:null}:{body:null,status:400};
  }catch{return {body:null,status:400};}finally{reader.releaseLock();}
}

/** GoTrue v2.197.0 public settings; only booleans leave this boundary. */
export async function emailSignupReady():Promise<boolean> {
  if(process.env.AUTH_EMAIL_ALLOW_SIGNUP!=='true' || process.env.AUTH_EMAIL_ENABLED!=='true')return false;
  try {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url || !key)return false;
    const response=await fetch(url.replace(/\/$/,'')+'/auth/v1/settings',{
      headers:{apikey:key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),
    });
    if(!response.ok)return false;
    const settings=await response.json();
    return settings?.external?.email===true && settings.disable_signup===false && settings.mailer_autoconfirm===false;
  }catch{return false;}
}
