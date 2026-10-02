import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {sameOrigin} from '@/lib/auth/mobile-server';
import {authSessionFailure} from '@/lib/auth/session-error';
const privateHeaders={'cache-control':'private, no-store'};
export async function POST(request:Request){
  if(!sameOrigin(request))return NextResponse.json({error:'مبدأ درخواست معتبر نیست.'},{status:403,headers:privateHeaders});
  let action:unknown;
  try{const body:unknown=await request.json();action=body&&typeof body==='object'&&'action' in body?body.action:null;}
  catch{return NextResponse.json({error:'درخواست معتبر نیست.'},{status:400,headers:privateHeaders});}
  if(action!=='signout'&&action!=='refresh')return NextResponse.json({error:'درخواست معتبر نیست.'},{status:400,headers:privateHeaders});
  try{
    const client=await createClient();
    if(action==='signout'){
      const {error}=await client.auth.signOut({scope:'local'});
      return NextResponse.json(error?{ok:false,code:'auth_unavailable',error:'خروج تأیید نشد. دوباره تلاش کنید.'}:{ok:true},{status:error?503:200,headers:privateHeaders});
    }
    const {error}=await client.auth.refreshSession();
    const failure=authSessionFailure(error);
    return NextResponse.json(failure?{ok:false,code:failure===401?'auth_session_required':'auth_unavailable',error:failure===401?'نشست معتبر نیست. دوباره وارد شوید.':'بررسی نشست اکنون انجام نشد. دوباره تلاش کنید.'}:{ok:true},{status:failure??200,headers:privateHeaders});
  }catch{return NextResponse.json({ok:false,code:'auth_unavailable',error:'ارتباط با سرویس نشست برقرار نشد.'},{status:503,headers:privateHeaders});}
}
