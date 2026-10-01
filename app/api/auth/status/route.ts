import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const client=await createClient();const {data:{user},error}=await client.auth.getUser();
    if(error||!user)return NextResponse.json({authenticated:false,role:null},{headers:{'cache-control':'no-store'}});
    const {data:profile,error:profileError}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
    return NextResponse.json({authenticated:true,role:profileError?null:profile?.role??null,profileRead:profileError?'unavailable':'ok'},{headers:{'cache-control':'no-store'}});
  }catch{return NextResponse.json({authenticated:false,status:'network_or_configuration_error'},{status:503,headers:{'cache-control':'no-store'}});}
}
