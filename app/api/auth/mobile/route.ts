import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {toLatinDigits} from '@/lib/format';
import {normalizeMobile,authMessage} from '@/lib/auth/mobile';
import {mobileEnabled,sameOrigin,admitMobile} from '@/lib/auth/mobile-server';
import {authSessionFailure,authActionFailure} from '@/lib/auth/session-error';
export const runtime='nodejs';
export async function POST(request:Request) {
  const reply=(status:number,body:object)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});
  if(!mobileEnabled())return reply(503,{error:'ورود موبایلی هنوز فعال نشده است. ورود قبلی در دسترس است.'});
  if(!sameOrigin(request))return reply(403,{error:'مبدأ درخواست معتبر نیست.'});
  try {
    if(Number(request.headers.get('content-length')??0)>4096)return reply(413,{error:'درخواست بیش از حد بزرگ است.'});
    const body=await request.json();
    const action=body.action;
    const phone=typeof body.phone==='string'?normalizeMobile(body.phone):null;
    if(!phone || !['send','verify','password','link','verify-link','set-password'].includes(action))return reply(400,{error:'شماره همراه یا نوع درخواست معتبر نیست.'});
    await admitMobile(request,action==='verify-link'?'verify':action==='set-password'?'password':action,phone);
    const supabase=await createClient();
    if(action==='link' || action==='verify-link' || action==='set-password') {
      const {data:{user},error}=await supabase.auth.getUser();
      const failure=authSessionFailure(error);
      if(failure===503)return reply(503,{error:'بررسی نشست اکنون انجام نشد. اطلاعات فرم حفظ شده است.'});
      if(failure===401 || !user)return reply(401,{error:'برای این کار ابتدا وارد حساب فعلی شوید.'});
      if(action==='link' && user.phone && normalizeMobile(user.phone)!==phone)return reply(409,{error:'تغییر شمارهٔ تأییدشده به بررسی و بازیابی جدا نیاز دارد.'});
      if(action==='verify-link' && normalizeMobile(user.phone??'')!==phone && normalizeMobile(user.new_phone??'')!==phone)return reply(403,{error:'درخواست اتصال شماره برای این حساب نیست.'});
      if(action==='set-password') {
        const {data:claims,error:claimsError}=await supabase.auth.getClaims();
        const claimsFailure=authSessionFailure(claimsError);
        if(claimsFailure)return reply(claimsFailure,{error:claimsFailure===503?'بررسی نشست اکنون انجام نشد. اطلاعات فرم حفظ شده است.':'نشست معتبر نیست. دوباره وارد شوید.'});
        const amr=claims?.claims?.amr as {method:string;timestamp:number}[]|undefined;
        if(normalizeMobile(user.phone??'')!==phone || !user.phone_confirmed_at || !amr?.some(x=>x.method==='otp' && x.timestamp>Date.now()/1000-300))return reply(403,{error:'برای تعیین رمز، ابتدا با کد پیامکی تازه وارد شوید.'});
      }
    }
    let result;
    if(action==='send')result=await supabase.auth.signInWithOtp({phone,options:{shouldCreateUser:process.env.AUTH_MOBILE_ALLOW_SIGNUP==='true'}});
    else if(action==='link')result=await supabase.auth.updateUser({phone});
    else if(action==='verify' || action==='verify-link') {
      const token=toLatinDigits(String(body.code??''));
      if(!/^\d{6}$/.test(token))return reply(400,{error:'کد ورود باید شش رقم باشد.'});
      result=await supabase.auth.verifyOtp({phone,token,type:action==='verify-link'?'phone_change':'sms'});
    } else {
      if(typeof body.password!=='string' || body.password.length<12 || body.password.length>128)return reply(400,{error:'رمز باید بین ۱۲ تا ۱۲۸ نویسه باشد.'});
      result=action==='password'?await supabase.auth.signInWithPassword({phone,password:body.password}):await supabase.auth.updateUser({password:body.password});
    }
    const failure=authActionFailure(result.error);
    if(failure)return reply(failure,{error:failure===503?'سرویس ورود اکنون پاسخ نمی‌دهد. اطلاعات فرم حفظ شده است.':authMessage(result.error)});
    // Never return session, token, contact details or provider receipt.
    return reply(200,{ok:true,status:action==='send'||action==='link'?'code_requested':'completed',identity:'pending'});
  } catch(error) {
    const limited=error instanceof Error && error.message==='rate_limited';
    return reply(limited?429:503,{error:limited?'تعداد تلاش‌ها زیاد است. چند دقیقه صبر کنید.':'ارتباط با سرویس ورود برقرار نشد. اطلاعات فرم حفظ شده است.'});
  }
}
