import Link from 'next/link';
import MobileAccess from '@/components/account/MobileAccess';
import {mobileEnabled} from '@/lib/auth/mobile-server';
import {normalizeReturnPath,accountEntryHref} from '@/components/account/returnPath';
export const dynamic='force-dynamic';
export default async function MobileLoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const returnTo=normalizeReturnPath((await searchParams).next);
  return <main className="min-h-screen px-5 py-12 flex items-center justify-center" style={{background:'var(--bg)'}}><div className="w-full max-w-lg">
    {process.env.AUTH_MOBILE_LOCAL_SANDBOX==='true' && <p role="status" className="rounded-lg border p-3 mb-4 leading-7">محیط آزمایشی محلی — پیامک واقعی ارسال نمی‌شود؛ شماره‌ها و حساب‌ها مصنوعی‌اند.</p>}
    {mobileEnabled()?<MobileAccess returnTo={returnTo}/>:<section className="card-elevated p-8"><h1 className="text-2xl font-bold mb-4">ورود موبایلی در حال آماده‌سازی است</h1><p className="leading-8 mb-5">پیامک هنوز در این محیط فعال نشده است. حساب‌های قبلی از مسیر ایمیل و رمز سایت وارد می‌شوند.</p><Link className="btn btn-gold" href={accountEntryHref('/login',returnTo)}>ورود حساب قبلی</Link></section>}
  </div></main>;
}
