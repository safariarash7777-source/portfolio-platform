import {createClient} from '@/lib/supabase/server';
import {redirect} from 'next/navigation';
import NotificationCenter from '@/components/notifications/NotificationCenter';
export const dynamic='force-dynamic';
export default async function Page(){const db=await createClient();const r=await db.auth.getUser();if(r.error?.name==='AuthSessionMissingError')redirect('/login?next='+encodeURIComponent('/notifications'));if(r.error)return <main className="container py-12">بررسی نشست انجام نشد؛ دوباره تلاش کنید.</main>;if(!r.data.user)redirect('/login?next=%2Fnotifications');return <main className="container mx-auto max-w-3xl px-4 py-12 space-y-6"><h1 className="text-2xl sm:text-3xl font-bold">مرکز اعلان</h1><NotificationCenter/></main>;}
