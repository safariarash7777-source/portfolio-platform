import {notFound} from 'next/navigation';
import NotificationCenter from '@/components/notifications/NotificationCenter';
export const dynamic='force-dynamic';
export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.NEXT09_QA!=='true')notFound();return <main className="container mx-auto max-w-3xl px-4 py-12 space-y-6"><p className="card-elevated p-4">نمونه نمایشی با هویت و اعلان مصنوعی؛ هیچ اتصال یا ارسال واقعی ندارد.</p><h1 className="text-2xl sm:text-3xl font-bold">مرکز اعلان — نمونه نمایشی</h1><NotificationCenter/></main>;}
