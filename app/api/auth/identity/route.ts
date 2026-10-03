import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {mobileEnabled,sameOrigin} from '@/lib/auth/mobile-server';
import {nationalIdFormatValid} from '@/lib/auth/mobile';
import {encryptIdentity,decryptIdentity,identityKeysReady} from '@/lib/auth/identity-crypto';
import {profileReadEnabled} from '@/lib/auth/profile-server';
import {toLatinDigits} from '@/lib/format';
import {authSessionFailure} from '@/lib/auth/session-error';
export const runtime='nodejs';
const reply=(status:number,body:object)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});
export async function GET(){
  try {
    const client=await createClient();const {data:{user},error}=await client.auth.getUser();
    const authFailure=authSessionFailure(error);
    if(authFailure===503)return reply(503,{error:'سرویس ورود اکنون در دسترس نیست؛ دوباره تلاش کنید.'});
    if(authFailure || !user)return reply(401,{error:'ابتدا وارد شوید.'});
    if(!profileReadEnabled())return reply(503,{code:'profile_disabled',error:'پروفایل خصوصی در این محیط فعال نشده است.'});
    if(!identityKeysReady())return reply(503,{error:'پروفایل خصوصی اکنون در دسترس نیست.'});
    const {data,error:readError}=await client.rpc('auth_read_private_identity').abortSignal(AbortSignal.timeout(5000));
    if(readError)return reply(503,{error:'پروفایل خصوصی اکنون در دسترس نیست.'});
    const capabilities={profileWriteEnabled:mobileEnabled()};
    if(data===null)return reply(200,{profile:null,phoneVerified:!!user.phone_confirmed_at,identityMatch:'pending',phoneNationalIdMatch:'pending',...capabilities});
    if(!data || !Number.isInteger(data.version) || data.version<1 || typeof data.ciphertext!=='string' || typeof data.keyVersion!=='string' || data.identityMatch!=='pending' || data.phoneNationalIdMatch!=='pending')return reply(503,{error:'پروفایل خصوصی اکنون در دسترس نیست.'});
    const profile=decryptIdentity(user.id,data.ciphertext,data.keyVersion);
    if(!profile || ![profile.firstName,profile.lastName,profile.nationalId].every(value=>typeof value==='string' && value.trim().length>0))return reply(503,{error:'پروفایل خصوصی اکنون در دسترس نیست.'});
    return reply(200,{profile,version:data.version,phoneVerified:!!user.phone_confirmed_at,nationalIdFormatValid:true,identityMatch:data.identityMatch,phoneNationalIdMatch:data.phoneNationalIdMatch,...capabilities});
  }catch{return reply(503,{error:'پروفایل خصوصی اکنون در دسترس نیست.'});}
}
export async function POST(request:Request){
  if(!mobileEnabled())return reply(503,{error:'مسیر موبایلی فعال نشده است.'});
  if(!sameOrigin(request))return reply(403,{error:'مبدأ درخواست معتبر نیست.'});
  try {
    const client=await createClient();const {data:{user},error}=await client.auth.getUser();
    const authFailure=authSessionFailure(error);
    if(authFailure===503)return reply(503,{error:'سرویس ورود اکنون در دسترس نیست؛ ورودی‌ها حفظ شده‌اند.'});
    if(authFailure || !user || !user.phone_confirmed_at)return reply(401,{error:'ابتدا شماره همراه را در حساب خود تأیید کنید.'});
    if(Number(request.headers.get('content-length')??0)>4096)return reply(413,{error:'درخواست بیش از حد بزرگ است.'});
    const body=await request.json();
    if(Object.keys(body).some(k=>!['firstName','lastName','nationalId','baseVersion','consent'].includes(k)))return reply(400,{error:'فیلد نامعتبر در درخواست.'});
    const value={firstName:String(body.firstName??'').trim(),lastName:String(body.lastName??'').trim(),nationalId:toLatinDigits(String(body.nationalId??''))};
    if(!value.firstName || value.firstName.length>80 || !value.lastName || value.lastName.length>100 || !nationalIdFormatValid(value.nationalId) || !Number.isInteger(body.baseVersion) || body.baseVersion<0 || body.consent!=='identity-v1')return reply(400,{error:'نام، نام خانوادگی، کد ملی و رضایت نگهداری را بررسی کنید.'});
    const encrypted=encryptIdentity(user.id,value);
    // Explicitly authorized identity writer, using canonical server-only service-role client.
    const admin=createAdminClient();
    const {data,error:saveError}=await admin.rpc('auth_save_private_identity',{p_user:user.id,p_base:body.baseVersion,p_ciphertext:encrypted.ciphertext,p_digest:encrypted.digest,p_key_version:encrypted.keyVersion,p_consent:body.consent}).abortSignal(AbortSignal.timeout(5000));
    if(saveError)return reply(saveError.code==='23505'?409:saveError.code==='42501'?403:503,{error:saveError.code==='23505'?'نسخهٔ تازه‌تر ذخیره شده؛ پروفایل را دوباره باز کنید.':'ذخیره انجام نشد؛ در صورت تعارض هویت، بررسی مالک لازم است.'});
    return reply(200,{ok:true,version:data,phoneNationalIdMatch:'pending',identityMatch:'pending'});
  }catch{return reply(503,{error:'ذخیرهٔ پروفایل خصوصی اکنون در دسترس نیست. ورودی‌ها حفظ شده‌اند.'});}
}
