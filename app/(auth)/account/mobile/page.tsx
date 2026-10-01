import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {mobileEnabled} from '@/lib/auth/mobile-server';
import {normalizeReturnPath,accountEntryHref} from '@/components/account/returnPath';
import MobileAccess from '@/components/account/MobileAccess';
import PrivateIdentityForm from '@/components/account/PrivateIdentityForm';
export const dynamic='force-dynamic';
export default async function AccountMobilePage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const returnTo=normalizeReturnPath((await searchParams).next);
  if(!mobileEnabled())return <main className="px-5 py-12"><h1>مسیر موبایلی هنوز فعال نشده است</h1><Link className="btn btn-outline mt-4" href={accountEntryHref('/login',returnTo)}>ورود قبلی</Link></main>;
  const client=await createClient();const {data:{user},error}=await client.auth.getUser();
  if(error||!user)redirect(accountEntryHref('/login','/account/mobile?next='+encodeURIComponent(returnTo)));
  return <main className="min-h-screen px-5 py-12 flex items-center justify-center" style={{background:'var(--bg)'}}><div className="w-full max-w-lg">{process.env.AUTH_MOBILE_LOCAL_SANDBOX==='true' && <p role="status" className="rounded-lg border p-3 mb-4 leading-7">محیط آزمایشی محلی — هویت و دادهٔ این نمونه مصنوعی است.</p>}{user.phone && user.phone_confirmed_at?<PrivateIdentityForm phone={user.phone} returnTo={returnTo}/>:<MobileAccess link returnTo={returnTo}/>}</div></main>;
}
