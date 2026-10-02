'use client';
import { useEffect,useState } from 'react';
import { isFeedPage,type PublicationFeedPage } from '@/lib/intelligence/publication-feed';
import { publicationData } from '@/lib/member/publication';
import { memberErrorStatus,type MemberRequest } from '@/lib/member/http';
import { formatTehranDate } from '@/lib/consultation/time';
import { toPersianDigits } from '@/lib/format';
type State={state:'loading'}|{state:'error';status:number}|{state:'ready';data:PublicationFeedPage};
const contentLabels={brief:'تحلیل و یادداشت',lesson:'درس',webinar_plan:'برنامهٔ وبینار'};
export default function PublicationFeed({cohortId,request,preview=false}:{cohortId:string;request?:MemberRequest;preview?:boolean}){
 const [cursor,setCursor]=useState<string|null>(null),[refresh,setRefresh]=useState(0),[result,setResult]=useState<State>({state:'loading'});
 const [kind,setKind]=useState('all');
 const items=result.state==='ready'?result.data.items.filter(item=>kind==='all'||item.contentKind===kind):[];
 useEffect(()=>{
  const abort=new AbortController();let current=true;setResult({state:'loading'});
  publicationData(`/api/cohorts/${cohortId}/publications${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,isFeedPage,request,{signal:abort.signal})
   .then(data=>{if(current)setResult({state:'ready',data});}).catch(e=>{if(current)setResult({state:'error',status:memberErrorStatus(e)});});
  return()=>{current=false;abort.abort();};
 },[cohortId,cursor,request,refresh]);
 return <section className="card space-y-4 p-5" aria-labelledby="member-publications-title">
  <h2 id="member-publications-title" className="font-display text-xl font-bold">محتوای منتشرشدهٔ این دوره</h2>
  <p className="text-sm">فقط نسخهٔ فعلیِ تأییدشده و مجاز همین دوره نمایش داده می‌شود. «خوانده‌شده» وقتی ثبت می‌شود که داخل متن، دکمهٔ «خواندم» را بزنید؛ نسخهٔ جدید دوباره خوانده‌نشده است.</p>
  {preview?<p className="text-sm">پیش‌نمایش ساختگی؛ وضعیت حساب واقعی نیست.</p>:null}
  {result.state==='loading'?<p role="status">در حال بررسی دسترسی و دریافت محتوا…</p>:null}
  {result.state==='error'?<div role="alert"><p>{result.status===401?'برای مشاهدهٔ محتوا دوباره وارد حساب شوید.':result.status===403||result.status===404?'در این درخواست اجازهٔ مشاهدهٔ محتوای این دوره تأیید نشد. وضعیت دسترسی دوره را بررسی کنید.':'فهرست محتوا دریافت نشد؛ این به معنی نبود محتوا نیست.'}</p></div>:null}
  {result.state==='ready'?<>
   {result.data.items.length>0?<label className="block space-y-2"><span>نوع محتوای همین صفحه</span><select className="input min-h-12 w-full" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">همهٔ محتوا</option><option value="brief">تحلیل و یادداشت</option><option value="lesson">درس</option><option value="webinar_plan">برنامهٔ وبینار</option></select><span className="block text-sm">این فیلتر فقط محتوای صفحهٔ جاری را نشان می‌دهد؛ صفحه‌های بعدی ممکن است محتوای دیگری داشته باشند.</span></label>:null}
   {result.data.items.length===0?<p>{cursor?'در ادامهٔ این فهرست، محتوای مجاز دیگری یافت نشد.':'هنوز محتوای منتشرشده و مجازی برای این دوره یافت نشد؛ این به معنی نبود داده یا آرام‌بودن بازار نیست.'}</p>:null}
   {result.data.items.length>0&&items.length===0?<p>در صفحهٔ جاری محتوایی از نوع انتخاب‌شده نیست؛ همهٔ محتوا یا صفحهٔ بعدی را بررسی کنید.</p>:null}
   <ul className="space-y-5">{items.map(item=><li key={item.versionId} className="space-y-2 border-t pt-4">
    <h3 className="font-bold break-words">{item.title}</h3><p className="leading-8 break-words">{item.summary}</p>
    <p className="text-sm">{contentLabels[item.contentKind]} · نسخه {toPersianDigits(item.version)} · انتشار: {formatTehranDate(item.publishedAt)}</p>
    <p className="text-sm">{item.hasBeenRead?`خوانده‌شده در ${formatTehranDate(item.readAt!)}`:'خوانده‌نشده'}</p>
    <p className="text-sm">منابع و تاریخ معتبرشان در متن محتوا آمده‌اند.</p>
    <a className="inline-flex min-h-12 items-center underline" href={item.detailHref}>خواندن متن و منابع</a>
   </li>)}</ul>
   {result.data.nextCursor?<button className="btn btn-outline min-h-12" onClick={()=>{setResult({state:'loading'});setCursor(result.data.nextCursor);}}>صفحهٔ بعدی محتوا</button>:null}
  </>:null}
  <div className="flex flex-wrap gap-3"><button className="btn btn-outline min-h-12" onClick={()=>{setResult({state:'loading'});setRefresh(n=>n+1);}}>تازه‌کردن فهرست و وضعیت خواندن</button>{cursor?<button className="btn btn-outline min-h-12" onClick={()=>{setResult({state:'loading'});setCursor(null);}}>بازگشت به تازه‌ترین محتوا</button>:null}</div>
  <p className="text-sm">این فهرست وضعیت خواندن محتوا را نشان می‌دهد. اعلان‌های دوره در اتصال جداگانهٔ محصول تکمیل می‌شوند.</p>
 </section>;
}
