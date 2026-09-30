'use client';
import { useEffect,useState } from 'react';
import { formatTehranDate } from '@/lib/consultation/time';
import { toPersianDigits } from '@/lib/format';
export default function PublicationRead({id}:{id:string}) {
  const [data,setData]=useState<{title:string;summary:string;content:string;version:number;sources:{url:string;asOf:string}[]}|null>(null),[message,setMessage]=useState('در حال دریافت محتوا…');
  useEffect(()=>{let live=true;setData(null);setMessage('در حال دریافت محتوا…');void fetch(`/api/publications/${encodeURIComponent(id)}`,{cache:'no-store'}).then(async r=>{const b=await r.json();if(!live)return;if(r.ok)setData(b.data);else setMessage(b.error??'محتوا در دسترس نیست.');}).catch(()=>{if(live)setMessage('دریافت محتوا انجام نشد.');});return()=>{live=false;};},[id]);
  return <article className="mx-auto max-w-3xl space-y-5 px-4 py-12" style={{color:'var(--text)'}}>{data?<><p className="text-sm">نسخه {toPersianDigits(data.version)}</p><h1 className="font-display text-2xl font-extrabold">{data.title}</h1><p className="text-lg leading-9">{data.summary}</p><div className="whitespace-pre-wrap leading-9">{data.content}</div><h2 className="font-bold">منابع و تاریخ</h2><ul>{data.sources.map((s,i)=><li key={i} className="min-h-11 break-words"><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">منبع {toPersianDigits(i+1)}</a> · {formatTehranDate(s.asOf)}</li>)}</ul></>:<p role="status">{message}</p>}</article>;
}
