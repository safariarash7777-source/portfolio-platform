import {toLatinDigits} from '@/lib/format';
export function normalizeMobile(value:string):string|null {
  const digits=toLatinDigits(value).replace(/[\s()-]/g,'').replace(/^(?:\+98|0098|98|0)/,'');
  return /^9\d{9}$/.test(digits)?'+98'+digits:null;
}
export function nationalIdFormatValid(value:string):boolean {
  const id=toLatinDigits(value);
  if(!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id))return false;
  const remainder=[...id.slice(0,9)].reduce((sum,digit,i)=>sum+Number(digit)*(10-i),0)%11;
  return Number(id[9])===(remainder<2?remainder:11-remainder);
}
export function authMessage(error:{code?:string;status?:number;message?:string}|null):string {
  if(!error)return '';
  if(error.status===429 || /rate|too_many/.test(error.code??''))return 'تعداد تلاش‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.';
  if(error.code==='otp_expired')return 'کد نامعتبر، منقضی یا قبلاً استفاده شده است. کد تازه درخواست کنید.';
  if(error.code==='invalid_credentials')return 'اطلاعات ورود معتبر نیست. روش ورود و رمز خود سایت را بررسی کنید.';
  if(error.code==='email_not_confirmed')return 'ایمیل این حساب هنوز تأیید نشده است.';
  if(error.code==='phone_not_confirmed')return 'شماره همراه هنوز تأیید نشده است.';
  if((error.status??0)>=500 || error.code==='hook_timeout' || error.code==='hook_timeout_after_retry')return 'سرویس ورود اکنون پاسخ نمی‌دهد. اطلاعات شما حفظ شده؛ دوباره تلاش کنید.';
  return 'ورود انجام نشد. اطلاعات را بررسی کنید یا دوباره تلاش کنید.';
}
