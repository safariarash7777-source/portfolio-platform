import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {authOrigin} from '@/lib/auth/origin';
import {sameOrigin} from '@/lib/auth/mobile-server';
import {emailReturnPath,recoveryPageHref,recoveryDestination,freshEmailRecoveryProof} from '@/lib/auth/email';
import {emailSignupReady,readEmailAction} from '@/lib/auth/email-server';
import {recordEmailFailure} from '@/lib/auth/email-health';
import {authSessionFailure,authActionFailure} from '@/lib/auth/session-error';
export const runtime='nodejs';
const reply=(status:number,body:object)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});
export async function POST(request:Request){
  if(!sameOrigin(request))return reply(403,{error:'مبدأ درخواست معتبر نیست.'});
  try {
    const input=await readEmailAction(request);
    if(input.status)return reply(input.status,{error:input.status===413?'درخواست بیش از حد بزرگ است.':'درخواست معتبر نیست.'});
    const body=input.body!;
    if(typeof body.action!=='string' || !['signup','recover','verify','set-password'].includes(body.action) ||
      ('next' in body && (typeof body.next!=='string' || body.next.length>2048)))return reply(400,{error:'درخواست معتبر نیست.'});
    const next=typeof body.next==='string'?body.next:undefined;
    if(body.action==='signup'){
      if(Object.keys(body).some(key=>!['action','email','password','fullName','next'].includes(key)) ||
        typeof body.fullName!=='string' || !body.fullName.trim() || body.fullName.trim().length>120 ||
        typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
        typeof body.password!=='string' || body.password.length<12 || body.password.length>128)return reply(400,{error:'نام، ایمیل و رمز ۱۲ تا ۱۲۸ نویسه را بررسی کنید.'});
      if(!await emailSignupReady())return reply(503,{error:'ثبت‌نام ایمیلی هنوز آماده نیست. ورود حساب‌های موجود برقرار است.'});
      const client=await createClient();const origin=authOrigin(request.url);
      const {error}=await client.auth.signUp({email:body.email.trim(),password:body.password,options:{
        emailRedirectTo:origin+'/auth/callback?next='+encodeURIComponent(emailReturnPath(next)),
        data:{full_name:body.fullName.trim()},
      }});
      const failure=authActionFailure(error);
      const duplicate=error?.status===400 && ['user_already_exists','email_exists'].includes(error.code??'');
      if(failure && !duplicate)return reply(failure,{error:failure===503?'سرویس ثبت‌نام اکنون پاسخ نمی‌دهد. اطلاعات فرم حفظ شده است.':failure===429?'تعداد تلاش‌ها زیاد است. کمی صبر کنید.':'درخواست ثبت‌نام پذیرفته نشد. ورودی‌ها را بررسی کنید یا وارد حساب موجود شوید.'});
      // A receipt is neither delivery nor membership; native Auth owns confirmation/UUID.
      return reply(200,{ok:true,status:'confirmation_requested',message:'اگر ثبت‌نام پذیرفته شده باشد و سرویس ایمیل آماده باشد، لینک تأیید دریافت می‌کنید.'});
    }
    const client=await createClient();
    if(body.action==='set-password'){
      const {data:{user},error}=await client.auth.getUser();
      const failure=authSessionFailure(error);
      if(failure)return reply(failure,{error:failure===401?'نشست معتبر نیست. دوباره وارد شوید.':'بررسی نشست اکنون انجام نشد. دوباره تلاش کنید.'});
      if(!user)return reply(401,{error:'ابتدا وارد شوید.'});
      const {data:claims,error:claimsError}=await client.auth.getClaims();
      const claimsFailure=authSessionFailure(claimsError);
      if(claimsFailure)return reply(claimsFailure,{error:claimsFailure===401?'نشست معتبر نیست. دوباره وارد شوید.':'بررسی نشست اکنون انجام نشد. دوباره تلاش کنید.'});
      if(!user.email_confirmed_at || !freshEmailRecoveryProof(claims?.claims?.amr))return reply(403,{error:'برای انتخاب رمز، ابتدا لینک بازیابی تازه را مصرف کنید.'});
      if(typeof body.password!=='string' || body.password.length<12 || body.password.length>128)return reply(400,{error:'رمز باید بین ۱۲ تا ۱۲۸ نویسه باشد.'});
      const {error:saveError}=await client.auth.updateUser({password:body.password});
      const saveFailure=authActionFailure(saveError);
      return saveFailure?reply(saveFailure,{error:saveFailure===503?'سرویس ورود اکنون پاسخ نمی‌دهد. ورودی‌ها حفظ شده‌اند.':saveFailure===429?'تعداد تلاش‌ها زیاد است. کمی صبر کنید.':'رمز ذخیره نشد. ورودی‌ها حفظ شده‌اند.'}):reply(200,{ok:true});
    }
    if(body.action==='recover'){
      if(typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))return reply(400,{error:'ایمیل معتبر وارد کنید.'});
      // Fixed callback destination; neither an arbitrary redirect nor a contact in logs.
      const origin=authOrigin(request.url);
      try{const {error}=await client.auth.resetPasswordForEmail(body.email,{redirectTo:origin+'/auth/callback?next='+encodeURIComponent(recoveryPageHref(next))});if(error)recordEmailFailure();}catch{recordEmailFailure();}
      // Same response for missing account, configured SMTP failure and accepted request.
      return reply(200,{ok:true,status:'recovery_requested',message:'اگر حسابی وجود داشته باشد و سرویس ایمیل آماده باشد، لینک بازیابی دریافت می‌کنید.'});
    }
    if(process.env.AUTH_EMAIL_ENABLED!=='true')return reply(503,{error:'مسیر تازهٔ لینک ایمیل هنوز آماده نشده است. ورود با رمز فعلی برقرار است.'});
    if(body.action!=='verify' || typeof body.type!=='string' || !['signup','recovery'].includes(body.type) || typeof body.tokenHash!=='string' || !/^(?:pkce_)?[a-f0-9]{40,128}$/.test(body.tokenHash))return reply(400,{error:'لینک معتبر نیست.'});
    const {error}=await client.auth.verifyOtp({token_hash:body.tokenHash,type:body.type as 'signup'|'recovery'});
    const failure=authActionFailure(error);
    if(failure)return reply(failure,{error:failure===503?'سرویس ورود اکنون پاسخ نمی‌دهد. دوباره لینک اصلی را باز کنید.':failure===429?'تعداد تلاش‌ها زیاد است. کمی صبر کنید.':'لینک نامعتبر، منقضی یا قبلاً استفاده شده است.'});
    const destination=body.type==='recovery'?recoveryDestination(next,authOrigin(request.url)):emailReturnPath(next);
    return reply(200,{ok:true,next:destination});
  }catch{return reply(503,{error:'سرویس ورود اکنون پاسخ نمی‌دهد.'});}
}
