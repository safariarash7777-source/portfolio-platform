import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {sameOrigin} from '@/lib/auth/mobile-server';
import {emailReturnPath} from '@/lib/auth/email';
import {recordEmailFailure} from '@/lib/auth/email-health';
export const runtime='nodejs';
const reply=(status:number,body:object)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});
export async function POST(request:Request){
  if(!sameOrigin(request))return reply(403,{error:'مبدأ درخواست معتبر نیست.'});
  try {
    if(Number(request.headers.get('content-length')??0)>4096)return reply(413,{error:'درخواست بیش از حد بزرگ است.'});
    const body=await request.json();const client=await createClient();
    if(body.action==='set-password'){
      const {data:{user},error}=await client.auth.getUser();
      const {data:claims}=await client.auth.getClaims();
      const amr=claims?.claims?.amr as {method:string;timestamp:number}[]|undefined;
      if(error || !user?.email_confirmed_at || !amr?.some(value=>['otp','recovery'].includes(value.method) && value.timestamp>Date.now()/1000-300))return reply(403,{error:'برای انتخاب رمز، ابتدا لینک بازیابی تازه را مصرف کنید.'});
      if(typeof body.password!=='string' || body.password.length<12 || body.password.length>128)return reply(400,{error:'رمز باید بین ۱۲ تا ۱۲۸ نویسه باشد.'});
      const {error:saveError}=await client.auth.updateUser({password:body.password});
      return saveError?reply(400,{error:'رمز ذخیره نشد. ورودی‌ها حفظ شده‌اند.'}):reply(200,{ok:true});
    }
    if(body.action==='recover'){
      if(typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))return reply(400,{error:'ایمیل معتبر وارد کنید.'});
      // Fixed callback destination; neither an arbitrary redirect nor a contact in logs.
      const origin=new URL(process.env.NEXT_PUBLIC_APP_URL??request.url).origin;
      try{const {error}=await client.auth.resetPasswordForEmail(body.email,{redirectTo:origin+'/auth/callback?next=%2Freset-password'});if(error)recordEmailFailure();}catch{recordEmailFailure();}
      // Same response for missing account, configured SMTP failure and accepted request.
      return reply(200,{ok:true,status:'recovery_requested',message:'اگر حسابی وجود داشته باشد و سرویس ایمیل آماده باشد، لینک بازیابی دریافت می‌کنید.'});
    }
    if(process.env.AUTH_EMAIL_ENABLED!=='true')return reply(503,{error:'مسیر تازهٔ لینک ایمیل هنوز آماده نشده است. ورود با رمز فعلی برقرار است.'});
    if(body.action!=='verify' || !['signup','recovery'].includes(body.type) || typeof body.tokenHash!=='string' || !/^(?:pkce_)?[a-f0-9]{40,128}$/.test(body.tokenHash))return reply(400,{error:'لینک معتبر نیست.'});
    const {error}=await client.auth.verifyOtp({token_hash:body.tokenHash,type:body.type});
    if(error)return reply(error.status===429?429:400,{error:'لینک نامعتبر، منقضی یا قبلاً استفاده شده است.'});
    return reply(200,{ok:true,next:body.type==='recovery'?'/reset-password':emailReturnPath(body.next)});
  }catch{return reply(503,{error:'سرویس ورود اکنون پاسخ نمی‌دهد.'});}
}
