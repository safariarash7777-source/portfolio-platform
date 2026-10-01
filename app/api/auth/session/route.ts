import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {sameOrigin} from '@/lib/auth/mobile-server';
export async function POST(request:Request){
  if(!sameOrigin(request))return NextResponse.json({error:'مبدأ درخواست معتبر نیست.'},{status:403});
  try{
    const {action}=await request.json();const client=await createClient();
    if(action==='signout'){
      const {error}=await client.auth.signOut({scope:'local'});
      return NextResponse.json({ok:!error},{status:error?503:200,headers:{'cache-control':'no-store'}});
    }
    if(action!=='refresh')return NextResponse.json({error:'درخواست معتبر نیست.'},{status:400});
    const {error}=await client.auth.refreshSession();
    return NextResponse.json({ok:!error},{status:error?401:200,headers:{'cache-control':'no-store'}});
  }catch{return NextResponse.json({error:'ارتباط با سرویس نشست برقرار نشد.'},{status:503});}
}
