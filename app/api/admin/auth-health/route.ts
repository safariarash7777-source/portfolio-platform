import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {emailFailureStatus} from '@/lib/auth/email-health';
export async function GET(){
  const headers={'cache-control':'no-store'};
  const client=await createClient();const {data:{user},error}=await client.auth.getUser();
  if(error || !user)return NextResponse.json({error:'unauthorized'},{status:401,headers});
  const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).single();
  if(profile?.role!=='admin')return NextResponse.json({error:'forbidden'},{status:403,headers});
  return NextResponse.json({schema:'auth.channels.v1',password:{preserved:true},email:{featureEnabled:process.env.AUTH_EMAIL_ENABLED==='true',realDeliveryOwnerConfirmed:process.env.AUTH_EMAIL_DELIVERY_READY==='true',...emailFailureStatus()},mobile:{featureEnabled:process.env.AUTH_MOBILE_ENABLED==='true',admissionConfigured:!!(process.env.AUTH_SMS_CONTROL_URL && process.env.AUTH_SMS_CONTROL_SECRET),realDeliveryOwnerConfirmed:process.env.AUTH_SMS_DELIVERY_READY==='true'},identity:{writerConfigured:!!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.AUTH_IDENTITY_ENCRYPTION_KEY && process.env.AUTH_IDENTITY_HMAC_KEY),officialMatch:'pending'},note:'Readiness declarations are not a live delivery probe.'},{headers});
}
