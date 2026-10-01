'use client';
import { useEffect,useRef,useState } from 'react';
import { formatTehranDate } from '@/lib/consultation/time';
import { toPersianDigits } from '@/lib/format';
import { isPublicationDetail,isReadReceipt,type PublicationDetail } from '@/lib/intelligence/publication-feed';
import { publicationData } from '@/lib/member/publication';
import { memberErrorStatus } from '@/lib/member/http';
export default function PublicationRead({id,cohortId}:{id:string;cohortId?:string}){
 const [data,setData]=useState<PublicationDetail|null>(null),[message,setMessage]=useState('در حال دریافت محتوا…');
 const [refresh,setRefresh]=useState(0),[saving,setSaving]=useState(false),[receipt,setReceipt]=useState('');
 const current=useRef(true);
 useEffect(()=>{
  const abort=new AbortController();current.current=true;let live=true;setData(null);setReceipt('');setMessage('در حال دریافت محتوا…');
  publicationData(`/api/publications/${encodeURIComponent(id)}${cohortId!==undefined?`?cohort=${encodeURIComponent(cohortId)}`:''}`,isPublicationDetail,undefined,{signal:abort.signal})
   .then(value=>{if(live&&value.id===id)setData(value);else if(live)setMessage('دریافت محتوا انجام نشد.');})
   .catch(e=>{if(live)setMessage(memberErrorStatus(e)===503?'دریافت محتوا انجام نشد؛ دوباره تلاش کنید.':'محتوا در این درخواست در دسترس نیست؛ مجوز و نسخهٔ فعلی را بررسی کنید.');});
  return()=>{live=false;current.current=false;abort.abort();};
 },[id,cohortId,refresh]);
 async function markRead(){
  if(!data||cohortId===undefined||saving)return;setSaving(true);setReceipt('');
  try{
   const r=await publicationData(`/api/publications/${encodeURIComponent(id)}/read`,isReadReceipt,undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cohortId})});
   if(current.current)setReceipt(`خوانده‌شدن این نسخه ثبت شد: ${formatTehranDate(r.readAt)}`);
  }catch(e){if(current.current){setData(null);setMessage(memberErrorStatus(e)===503?'ثبت خواندن انجام نشد؛ برای بررسی دوباره محتوا را دریافت کنید.':'مجوز یا اعتبار این نسخه تغییر کرده است؛ محتوا در این درخواست در دسترس نیست.');}}
  finally{if(current.current)setSaving(false);}
 }
 return <article className="mx-auto max-w-3xl space-y-5 px-4 py-12" style={{color:'var(--text)'}}>
  {cohortId!==undefined?<a className="inline-flex min-h-12 items-center underline" href={`/dashboard?cohort=${encodeURIComponent(cohortId)}`}>بازگشت به خانه و وضعیت خواندن</a>:null}
  {data?<><p className="text-sm">نسخه {toPersianDigits(data.version)}</p><h1 className="font-display text-2xl font-extrabold">{data.title}</h1><p className="text-lg leading-9">{data.summary}</p><div className="whitespace-pre-wrap leading-9">{data.content}</div><h2 className="font-bold">منابع و تاریخ</h2><ul>{data.sources.map((s,i)=><li key={i} className="min-h-11 break-words"><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">منبع {toPersianDigits(i+1)}</a> · {formatTehranDate(s.asOf)}</li>)}</ul>
   {cohortId!==undefined?<div className="space-y-3"><p className="text-sm">اگر متن و منابع را خواندید، وضعیت همین نسخه را ثبت کنید. بازکردن صفحه به‌تنهایی وضعیت را تغییر نمی‌دهد.</p><button className="btn btn-primary min-h-12" disabled={saving} onClick={()=>void markRead()}>{saving?'در حال ثبت و بررسی مجوز…':'خواندم'}</button><p role="status">{receipt}</p></div>:null}
  </>:<div><p role="status">{message}</p><button className="btn btn-outline min-h-12" onClick={()=>setRefresh(n=>n+1)}>دریافت دوبارهٔ محتوا</button></div>}
 </article>;
}
