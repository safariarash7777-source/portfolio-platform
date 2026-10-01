'use client';
import { useEffect,useState } from 'react';
import { isFeedPage,type PublicationFeedPage } from '@/lib/intelligence/publication-feed';
import { publicationData } from '@/lib/member/publication';
import { memberErrorStatus,type MemberRequest } from '@/lib/member/http';
import { formatTehranDate } from '@/lib/consultation/time';
import { toPersianDigits } from '@/lib/format';
type State={state:'loading'}|{state:'error';status:number}|{state:'ready';data:PublicationFeedPage};
export default function PublicationFeed({cohortId,request,preview=false}:{cohortId:string;request?:MemberRequest;preview?:boolean}){
 const [cursor,setCursor]=useState<string|null>(null),[refresh,setRefresh]=useState(0),[result,setResult]=useState<State>({state:'loading'});
 useEffect(()=>{
  const abort=new AbortController();let current=true;setResult({state:'loading'});
  publicationData(`/api/cohorts/${cohortId}/publications${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,isFeedPage,request,{signal:abort.signal})
   .then(data=>{if(current)setResult({state:'ready',data});}).catch(e=>{if(current)setResult({state:'error',status:memberErrorStatus(e)});});
  return()=>{current=false;abort.abort();};
 },[cohortId,cursor,request,refresh]);
 return <section className="card space-y-4 p-5" aria-labelledby="member-publications-title">
  <h2 id="member-publications-title" className="font-display text-xl font-bold">تحلیل‌های منتشرشدهٔ این دوره</h2>
  <p className="text-sm">فقط نسخهٔ فعلیِ تأییدشده و مجاز همین دوره نمایش داده می‌شود. «خوانده‌شده» وقتی ثبت می‌شود که داخل متن، دکمهٔ «خواندم» را بزنید؛ نسخهٔ جدید دوباره خوانده‌نشده است.</p>
  {preview?<p className="text-sm">پیش‌نمایش ساختگی؛ وضعیت حساب واقعی نیست.</p>:null}
  {result.state==='loading'?<p role="status">در حال بررسی دسترسی و دریافت تحلیل‌ها…</p>:null}
  {result.state==='error'?<div role="alert"><p>{result.status===401?'برای مشاهدهٔ تحلیل‌ها دوباره وارد حساب شوید.':result.status===403||result.status===404?'در این درخواست اجازهٔ مشاهدهٔ تحلیل‌های این دوره تأیید نشد. وضعیت دسترسی دوره را بررسی کنید.':'فهرست تحلیل‌ها دریافت نشد؛ این به معنی نبود تحلیل یا آرام‌بودن بازار نیست.'}</p></div>:null}
  {result.state==='ready'?<>
   {result.data.items.length===0?<p>{cursor?'در ادامهٔ این فهرست، تحلیل مجاز دیگری یافت نشد.':'هنوز تحلیل منتشرشده و مجازی برای این دوره یافت نشد؛ این به معنی آرام‌بودن بازار نیست.'}</p>:null}
   <ul className="space-y-5">{result.data.items.map(item=><li key={item.versionId} className="space-y-2 border-t pt-4">
    <h3 className="font-bold break-words">{item.title}</h3><p className="leading-8 break-words">{item.summary}</p>
    <p className="text-sm">نسخه {toPersianDigits(item.version)} · انتشار: {formatTehranDate(item.publishedAt)}</p>
    <p className="text-sm">{item.hasBeenRead?`خوانده‌شده در ${formatTehranDate(item.readAt!)}`:'خوانده‌نشده'}</p>
    <p className="text-sm">منابع و تاریخ معتبرشان در متن تحلیل آمده‌اند.</p>
    <a className="inline-flex min-h-12 items-center underline" href={item.detailHref}>خواندن متن و منابع</a>
   </li>)}</ul>
   {result.data.nextCursor?<button className="btn btn-outline min-h-12" onClick={()=>{setResult({state:'loading'});setCursor(result.data.nextCursor);}}>صفحهٔ بعدی تحلیل‌ها</button>:null}
  </>:null}
  <div className="flex flex-wrap gap-3"><button className="btn btn-outline min-h-12" onClick={()=>{setResult({state:'loading'});setRefresh(n=>n+1);}}>تازه‌کردن فهرست و وضعیت خواندن</button>{cursor?<button className="btn btn-outline min-h-12" onClick={()=>{setResult({state:'loading'});setCursor(null);}}>بازگشت به تازه‌ترین تحلیل‌ها</button>:null}</div>
  <p className="text-sm">این فهرست وضعیت خواندن تحلیل‌ها را نشان می‌دهد. اعلان‌های دوره در اتصال جداگانهٔ محصول تکمیل می‌شوند.</p>
 </section>;
}
