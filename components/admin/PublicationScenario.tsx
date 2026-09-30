'use client';
import {useMemo,useState} from 'react';
import PublicationWorkbench,{type PublicationTransport,type PublicationOverview} from './PublicationWorkbench';
import {publicationCommand,type PublicationRow} from '@/lib/intelligence/publication';
const W='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export default function PublicationScenario(){
 const [state,setState]=useState('available'),[reset,setReset]=useState(0);
 const transport=useMemo<PublicationTransport>(()=>{
  const overview:PublicationOverview={items:[],workbooksState:'available',cohortsState:'available',workbooks:[{id:W,workbookId:W,version:2,title:'پژوهش نمونه: تفاوت قیمت صندوق با ارزش خالص دارایی',approved:true,sources:[{url:'https://example.invalid/synthetic-fund',asOf:'2026-09-30'}]}],cohorts:[{id:C,title:'دوره آزمایشی مسیر راه',starts_at:'2026-09-23T00:00:00+03:30',ends_at:'2026-12-22T00:00:00+03:30'}]};
  return async(path,init)=>{
   if(state==='unavailable')return {status:503,body:{error:'دفتر انتشار در دسترس نیست.'}};
   if(path.includes('course-needs'))return {status:200,body:{state:'available',data:{submittedCount:2,interests:[{topic:'صندوق',count:2}],questions:['چرا قیمت صندوق با NAV متفاوت است؟']}}};
   if(!init?.method)return {status:200,body:state==='empty'?{...overview,items:[],workbooks:[],cohorts:[]}:structuredClone(overview) as unknown as Record<string,unknown>};
   try{const payload=JSON.parse(String(init.body));const cmd=publicationCommand(payload);if(payload.action==='save'){const p:PublicationRow={...cmd.args.p_body as PublicationRow,id:crypto.randomUUID(),publicationId:payload.publicationId??crypto.randomUUID(),version:payload.baseVersion+1,createdAt:new Date().toISOString(),state:'draft',approvalCurrent:true};overview.items=overview.items.filter(x=>x.publicationId!==p.publicationId);overview.items.unshift(p);return {status:201,body:{receipt:p.id}};}
   const row=overview.items.find(x=>x.id===payload.versionId);if(!row)return {status:404,body:{error:'نسخه در دسترس نیست.'}};row.state=payload.action==='ready'?'ready':payload.action==='publish'?'published':'withdrawn';return {status:201,body:{receipt:crypto.randomUUID()}};
   }catch(e){return {status:422,body:{error:e instanceof Error?e.message:'فرمان معتبر نیست.'}};}
  };
 },[state]);
 return <main dir="rtl" className="min-h-screen px-4 py-8" style={{background:'var(--bg)'}}><div className="mx-auto max-w-6xl mb-6 p-4 border rounded-xl" style={{background:'var(--surface)',color:'var(--text)',borderColor:'var(--line)'}}><p className="font-bold">NEXT-08 · آزمایش محلی UI با داده مصنوعی؛ این صفحه به پایگاه داده متصل نیست.</p><label className="block mt-3">حالت آزمایش<select aria-label="حالت آزمایش" className="min-h-11 border p-2 rounded-lg mr-3" style={{background:'var(--surface)',color:'var(--text)'}} value={state} onChange={e=>{setState(e.target.value);setReset(x=>x+1);}}><option value="available">داده نمونه آماده</option><option value="empty">فهرست خالی</option><option value="unavailable">خطای دریافت</option></select></label><p className="mt-2 leading-7">تأیید کاربرگ نسخه ۲ صرفاً fixture است؛ صحت ذخیره و مجوزها در آزمون PostgreSQL مستقل سنجیده شده است.</p></div><PublicationWorkbench key={reset} transport={transport} sample/></main>;
}
