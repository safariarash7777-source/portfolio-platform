'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { toPersianDigits } from '@/lib/format';
import { publicationApi,type PublicationOverview } from './PublicationWorkbench';
export default function DailyPublicationLane(){
 const [data,setData]=useState<PublicationOverview|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let live=true;void publicationApi('/api/admin/intelligence/publications').then(r=>{if(live){if(r.status===200)setData(r.body as unknown as PublicationOverview);else setError(true);}}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[]);
 const questions=[
  {question:'چه تغییر کرده است؟',detail:'رصد بازار را باز کنید و نماد یا صندوق را با منبع و تاریخ بررسی کنید.',href:'/admin/radar'},
  {question:'کدام داده معتبر نیست؟',detail:'کهنگی، خطای دریافت و داده ناقص را از سلامت منابع بررسی کنید.',href:'#source-health'},
  {question:'چه چیزی نیاز به بررسی دارد؟',detail:data?.workbooksState==='available'?`${toPersianDigits(data.workbooks.filter(w=>!w.approved).length)} کاربرگ منتظر بازبینی انسانی است.`:'وضعیت کاربرگ‌ها هنوز قابل دریافت نیست.',href:'/admin/research'},
  {question:'کدام سناریو تغییر کرده است؟',detail:'شاهد مخالف و شرط بازنگری را در آخرین نسخه پژوهش ثبت کنید.',href:'/admin/intelligence'},
  {question:'چه خروجی منتظر تأیید یا انتشار است؟',detail:data?`${toPersianDigits(data.items.filter(p=>!p.approvalCurrent&&!['withdrawn'].includes(p.state)).length)} محتوا نیازمند تأیید معتبر؛ ${toPersianDigits(data.items.filter(p=>p.state==='ready').length)} نسخه آماده انتشار در فهرست اخیر.`:error?'دفتر انتشار در دسترس نیست؛ صف خالی فرض نشده است.':'در حال دریافت صف انتشار…',href:'/admin/publications'},
 ];
 return <section className="card p-5 space-y-4" aria-labelledby="daily-workflow"><h2 id="daily-workflow" className="font-display text-xl font-bold">از پرسش امروز تا محتوای دوره</h2><p className="text-sm leading-7" style={{color:'var(--text-2)'}}>پژوهش و تصمیم انسانی مستقل از عضویت آموزشی‌اند. ثبت منبع، نسخه دوم و تأیید، جای انتشار را نمی‌گیرند.</p><ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{questions.map((q,i)=><li key={q.href}><Link href={q.href} className="block h-full min-h-32 rounded-lg border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{borderColor:'var(--line)',background:'var(--surface-2)'}}><p className="text-sm font-bold">{toPersianDigits(i+1)}. {q.question}</p><p className="text-sm leading-7 mt-2" style={{color:'var(--text-2)'}}>{q.detail}</p></Link></li>)}</ol></section>;
}
