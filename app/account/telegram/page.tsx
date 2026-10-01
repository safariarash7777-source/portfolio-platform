import {notificationSessionStatus} from '@/lib/notifications/session-status';
import {createClient} from '@/lib/supabase/server';
import {redirect} from 'next/navigation';
import NotificationCenter from '@/components/notifications/NotificationCenter';
export const dynamic='force-dynamic';
export default async function Page(){const db=await createClient();const r=await db.auth.getUser();const status=notificationSessionStatus(r.data.user,r.error);if(status===401)redirect('/login?next='+encodeURIComponent('/account/telegram'));if(status===503)return <main className="container py-12">بررسی نشست انجام نشد؛ دوباره تلاش کنید.</main>;if(!r.data.user)redirect('/login?next=%2Faccount%2Ftelegram');return <main className="container mx-auto max-w-3xl px-4 py-12 space-y-6"><h1 className="text-2xl sm:text-3xl font-bold">اتصال حساب تلگرام</h1><NotificationCenter connectionOnly/></main>;}
