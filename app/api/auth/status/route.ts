import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {authSessionFailure} from '@/lib/auth/session-error';
import {freshEmailRecoveryProof} from '@/lib/auth/email';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const client=await createClient();const {data:{user},error}=await client.auth.getUser();
    const authFailure=authSessionFailure(error);
    if(authFailure===503)return NextResponse.json({authenticated:false,status:'network_or_configuration_error'},{status:503,headers:{'cache-control':'no-store'}});
    if(authFailure||!user)return NextResponse.json({authenticated:false,role:null},{headers:{'cache-control':'no-store'}});
    if(request && new URL(request.url).searchParams.get('scope')==='email-recovery'){
      const {data:claims,error:claimsError}=await client.auth.getClaims();
      const failure=authSessionFailure(claimsError);
      if(failure)return NextResponse.json({authenticated:false,status:failure===503?'network_or_configuration_error':'proof_required'},{status:failure,headers:{'cache-control':'no-store'}});
      return NextResponse.json({authenticated:true,recovery:user.email_confirmed_at && freshEmailRecoveryProof(claims?.claims?.amr)?'ready':'proof_required'},{headers:{'cache-control':'no-store'}});
    }
    const {data:profile,error:profileError}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
    return NextResponse.json({authenticated:true,role:profileError?null:profile?.role??null,profileRead:profileError?'unavailable':'ok'},{headers:{'cache-control':'no-store'}});
  }catch{return NextResponse.json({authenticated:false,status:'network_or_configuration_error'},{status:503,headers:{'cache-control':'no-store'}});}
}
