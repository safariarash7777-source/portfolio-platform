'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toPersianDigits } from '@/lib/format';
import { formatTehranDate } from '@/lib/consultation/time';
import type { PublicationDraft, PublicationRow } from '@/lib/intelligence/publication';

export interface PublicationOverview {
  items: PublicationRow[];
  workbooksState: string; cohortsState: string;
  workbooks: { id: string; workbookId: string; version: number; title: string; approved: boolean; sources: PublicationDraft['sources'] }[];
  cohorts: { id: string; title: string; starts_at: string; ends_at: string }[];
}
export type PublicationTransport = (path: string, init?: RequestInit) => Promise<{ status: number; body: Record<string, unknown> }>;
export const publicationApi: PublicationTransport = async (path, init) => {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json' }, cache: 'no-store' });
  return { status: r.status, body: await r.json() as Record<string,unknown> };
};
const API='/api/admin/intelligence/publications';
const empty: PublicationDraft = { workbookVersionId: '',contentKind:'brief',title:'',summary:'',content:'',sources:[{url:'',asOf:''}],audience:'public',cohortIds:[],channels:['site'] };
const labels = { draft:'پیش‌نویس',ready:'آماده انتشار',published:'منتشرشده در سایت',withdrawn:'متوقف‌شده',approval_invalid:'تأیید معتبر نیست' };
const control='w-full min-h-11 rounded-lg border px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const style={background:'var(--surface)',color:'var(--text)',borderColor:'var(--line)'};
function CourseNeeds({data}:{data:unknown}){
  const summary=data as {submittedCount?:number;interests?:{topic:string;count:number}[];questions?:string[]}|null;
  if(!summary||typeof summary.submittedCount!=='number')return <p>ساختار پاسخ قابل نمایش نیست؛ دوباره دریافت کنید.</p>;
  const topics:Record<string,string>={funds:'صندوق‌ها',stocks:'سهام',gold:'طلا',currency:'ارز',portfolio:'سبد دارایی'};
  return <div className="space-y-3 text-sm leading-7"><p>{toPersianDigits(summary.submittedCount)} پاسخ ثبت‌شده</p>{summary.submittedCount===0?<p>هنوز پاسخ ثبت‌شده‌ای برای این دوره وجود ندارد.</p>:<><ul>{summary.interests?.map(i=><li key={i.topic}>{topics[i.topic]??i.topic} · {toPersianDigits(i.count)} پاسخ</li>)}</ul><h3 className="font-bold">پرسش‌های اعضا برای تنظیم وبینار</h3><p>این متن‌ها تنها در نمای داخلی دیده می‌شوند؛ انتشار پرسش نیاز به بازبینی و حذف مشخصات فرد دارد.</p><ul className="list-disc list-inside">{summary.questions?.map((q,i)=><li key={i}>{q}</li>)}</ul></>}</div>;
}
export default function PublicationWorkbench({ transport=publicationApi, sample=false }: {transport?:PublicationTransport;sample?:boolean}) {
  const [overview,setOverview]=useState<PublicationOverview|null>(null);
  const [draft,setDraft]=useState<PublicationDraft>(empty);
  const [selected,setSelected]=useState<PublicationRow|null>(null);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [reason,setReason]=useState(''),[privacy,setPrivacy]=useState(false),[needs,setNeeds]=useState<Record<string,unknown>|null>(null);
  const busyRef=useRef(false);
  const requestKey=useRef<{body:string;key:string}|null>(null);
  async function refresh() {
    try { const r=await transport(API); if(r.status!==200) throw new Error(String(r.body.error??'دفتر انتشار در دسترس نیست.')); setOverview(r.body as unknown as PublicationOverview); return r.body as unknown as PublicationOverview; }
    catch(e){setMessage(e instanceof Error?e.message:'ارتباط برقرار نشد.'); return null;}
  }
  useEffect(()=>{void refresh(); /* A transport is stable for this workspace. */},[transport]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    const guard=(event:MouseEvent)=>{const anchor=event.target instanceof Element?event.target.closest('a'):null;if(!anchor||anchor.target==='_blank'||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const target=new URL(anchor.href,window.location.href);if(target.pathname===window.location.pathname&&target.search===window.location.search)return;if(!window.confirm('تغییرهای متن هنوز ذخیره نشده‌اند؛ از صفحه خارج شوید؟')){event.preventDefault();event.stopPropagation();}};
    window.addEventListener('beforeunload',warn);document.addEventListener('click',guard,true);return()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',guard,true);};
  },[dirty]);
  function change(update:Partial<PublicationDraft>) {setDraft(p=>({...p,...update}));setDirty(true);setPrivacy(false);setMessage('');}
  async function command(action:'save'|'ready'|'publish'|'withdraw') {
    if(busyRef.current)return;
    if(action==='publish'&&!window.confirm('این نسخه برای مخاطب انتخاب‌شده در سایت منتشر شود؟ ارسال تلگرام جداگانه است.'))return;
    busyRef.current=true;setBusy(true);
    const payload=action==='save'?{action,publicationId:selected?.publicationId??null,baseVersion:selected?.version??0,draft}:{action,versionId:selected?.id,reason,privacyConfirmed:privacy};
    const body=JSON.stringify(payload);
    if(requestKey.current?.body!==body)requestKey.current={body,key:crypto.randomUUID()};
    try {
      const r=await transport(API,{method:'POST',body:JSON.stringify({...payload,idempotencyKey:requestKey.current.key})});
      if(r.status!==201)throw new Error(String(r.body.error??'اقدام انجام نشد.'));
      const data=await refresh();
      if(!data){setMessage('اقدام در سرور ثبت شد ولی نتیجه قابل دریافت نیست؛ متن و کلید تکرار حفظ شده‌اند. دوباره دریافت یا همان اقدام را تکرار کنید.');return;}
      if(action==='save'){const row=data.items.find(i=>i.id===r.body.receipt);if(!row){setMessage('ذخیره انجام شد؛ نسخه جدیدتری در فهرست موجود است. متن حفظ شد؛ نسخه تازه را پیش از ادامه بازبینی کنید.');return;}setSelected(row);setDraft(row);setDirty(false);}
      else if(selected){const row=data.items.find(i=>i.publicationId===selected.publicationId);if(row){setSelected(row);setDraft(row);}}
      requestKey.current=null;
      setPrivacy(false);setReason('');setMessage(action==='save'?'نسخه تازه ذخیره شد؛ تأیید پژوهش و انتشار دو اقدام جدا هستند.':action==='ready'?'نسخه آماده است؛ هنوز هیچ مخاطبی آن را نمی‌بیند.':action==='publish'?'نسخه در سایت ثبت شد؛ هیچ پیام تلگرامی از این ابزار ارسال نشده است.':'انتشار متوقف شد؛ پیوند مستقیم نیز محتوا را نمایش نمی‌دهد.');
    }catch(e){setMessage(`${e instanceof Error?e.message:'ارتباط برقرار نشد.'} متن شما حفظ شد.`);}finally{busyRef.current=false;setBusy(false);}
  }
  async function readNeeds(cohort:string){setNeeds(null);try{const r=await transport(`/api/admin/intelligence/course-needs?cohort=${encodeURIComponent(cohort)}`);setNeeds(r.status===200?r.body:{state:'unavailable'});}catch{setNeeds({state:'unavailable'});}}
  const wb=overview?.workbooks.find(w=>w.id===draft.workbookVersionId);
  const eligible=!!selected&&!dirty&&!busy&&selected.approvalCurrent&&privacy&&reason.trim().length>=5;
  const field=(key:'title'|'summary'|'content',label:string,multiline=false)=><label className="block space-y-2"><span className="font-bold text-sm">{label}</span>{multiline?<textarea className={control} style={style} rows={key==='content'?7:3} maxLength={key==='content'?20000:2000} value={draft[key]} onChange={e=>change({[key]:e.target.value})}/>:<input className={control} style={style} maxLength={300} value={draft[key]} onChange={e=>change({[key]:e.target.value})}/>}</label>;
  return <section className="mx-auto max-w-6xl space-y-5" style={{color:'var(--text)'}} aria-labelledby="publication-heading">
    <header className="space-y-3"><p className="text-sm" style={{color:'var(--gold-ink)'}}>رصد ← پژوهش نسخه‌دار ← تأیید داخلی ← آماده‌سازی انتشار</p><h1 id="publication-heading" className="font-display text-2xl font-extrabold">محتوای دوره و دفتر انتشار</h1><p className="text-base leading-8">متن مخاطب را جدا از یادداشت پژوهش بنویسید؛ عنوان، نسخه، منبع، مخاطب و زمان هر اقدام ثبت می‌شود.</p>
      {sample&&<p className="rounded-lg border p-3 font-bold" style={style}>نمونهٔ نمایشی؛ اطلاعات و اقدام‌ها آزمایشی‌اند و به اعضای واقعی ارسال نمی‌شوند.</p>}
      <nav className="flex flex-wrap gap-3" aria-label="مسیر پژوهش"><Link className="btn btn-secondary min-h-11" href="/admin/desk">میز روزانه</Link><Link className="btn btn-secondary min-h-11" href="/admin/radar">رصد بازار</Link><Link className="btn btn-secondary min-h-11" href="/market/funds">صندوق‌ها</Link><Link className="btn btn-secondary min-h-11" href="/codal">کدال</Link><Link className="btn btn-secondary min-h-11" href="/admin/research">کاربرگ پژوهش</Link></nav>
    </header>
    {!overview&&<div className="card p-5"><p role="status">{message||'در حال دریافت دفتر انتشار…'}</p><button className="btn btn-secondary min-h-11 mt-3" onClick={()=>void refresh()}>دریافت دوباره</button></div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="card space-y-5 p-5 min-w-0">
        <h2 className="font-bold text-lg">متن قابل مشاهده برای مخاطب</h2>
        <label className="block space-y-2"><span className="font-bold text-sm">عنوان و نسخه پژوهش</span><select className={control} style={style} value={draft.workbookVersionId} onChange={e=>{const w=overview?.workbooks.find(w=>w.id===e.target.value);change({workbookVersionId:e.target.value,sources:w?.sources.length?w.sources:[{url:'',asOf:''}]});}}><option value="">پژوهش را انتخاب کنید</option>{overview?.workbooks.map(w=><option key={w.id} value={w.id}>{w.title} · نسخه {toPersianDigits(w.version)} · {w.approved?'تأیید داخلی':'منتظر بازبینی'}</option>)}</select></label>
        {overview?.workbooksState==='unavailable'&&<p className="text-sm">نسخه‌های پژوهش قابل دریافت نیستند؛ انتخاب نسخه و آماده‌سازی متوقف است.</p>}
        {wb&&<Link className="inline-flex min-h-11 underline" href={`/admin/research?workbook=${encodeURIComponent(wb.workbookId)}`}>بازبینی همین کاربرگ</Link>}
        <label className="block space-y-2"><span className="font-bold text-sm">نوع محتوا</span><select className={control} style={style} value={draft.contentKind} onChange={e=>change({contentKind:e.target.value as PublicationDraft['contentKind']})}><option value="brief">خلاصه آموزشی بازار</option><option value="lesson">محتوای آموزشی</option><option value="webinar_plan">برنامه و پرسش وبینار</option></select></label>
        {field('title','عنوان')}{field('summary','خلاصه برای مخاطب',true)}{field('content','متن نهایی مخاطب',true)}
        <fieldset className="space-y-3"><legend className="font-bold mb-3">منابع و تاریخ معتبر</legend>{draft.sources.map((s,i)=><div key={i} className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2 text-sm">نشانی منبع<input className={control} style={style} type="url" dir="ltr" value={s.url} onChange={e=>change({sources:draft.sources.map((x,j)=>i===j?{...x,url:e.target.value}:x)})}/></label><label className="block space-y-2 text-sm">تاریخ منبع · روز تقویمی<input className={control} style={style} type="date" value={s.asOf} onChange={e=>change({sources:draft.sources.map((x,j)=>i===j?{...x,asOf:e.target.value}:x)})}/></label></div>)}<button className="btn btn-ghost min-h-11" type="button" disabled={draft.sources.length>=20} onClick={()=>change({sources:[...draft.sources,{url:'',asOf:''}]})}>افزودن منبع</button></fieldset>
        <fieldset className="space-y-3"><legend className="font-bold mb-3">مخاطب</legend><label className="block space-y-2 text-sm">سطح دسترسی<select className={control} style={style} value={draft.audience} onChange={e=>change({audience:e.target.value as PublicationDraft['audience'],cohortIds:[]})}><option value="public">عمومی</option><option value="cohort">اعضای دوره انتخاب‌شده</option></select></label>{draft.audience==='cohort'&&(overview?.cohortsState==='unavailable'?<p>فهرست دوره‌ها دریافت نشد؛ انتخاب دوره متوقف است.</p>:overview?.cohorts.length===0?<p>هنوز دوره‌ای برای انتخاب ثبت نشده است.</p>:overview?.cohorts.map(c=><label key={c.id} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.cohortIds.includes(c.id)} onChange={e=>change({cohortIds:e.target.checked?[...draft.cohortIds,c.id]:draft.cohortIds.filter(id=>id!==c.id)})}/><span>{c.title} · {formatTehranDate(c.starts_at)}</span></label>))}</fieldset>
        <fieldset><legend className="font-bold mb-2">کانال</legend><p className="text-sm leading-7">نسخه سایت مرجع محتواست؛ انتخاب تلگرام فقط رویداد توزیع می‌سازد.</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked disabled/>سایت</label><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.channels.includes('telegram')} onChange={e=>change({channels:e.target.checked?['site','telegram']:['site']})}/>اعلان تلگرام با پیوند</label></fieldset>
        <button className="btn btn-primary min-h-11" disabled={busy||!overview} onClick={()=>void command('save')}>ذخیره نسخه تازه</button>{dirty&&<p className="text-sm">تغییرها هنوز ذخیره نشده‌اند؛ اقدام انتشار تا ذخیره متوقف است.</p>}
      </div>
      <aside className="space-y-5 min-w-0">
        <section className="card space-y-3 p-5"><h2 className="font-bold text-lg">اقدام بعدی</h2><p>{selected?`${labels[selected.state]} · نسخه ${toPersianDigits(selected.version)}`:'ابتدا متن را ذخیره کنید.'}</p>{selected&&!selected.approvalCurrent&&<p className="text-sm leading-7">آخرین نسخه پژوهش باید تأیید داخلی معتبر داشته باشد. نسخه قدیمی یا تأیید بازگردانده‌شده آماده انتشار نمی‌شود.</p>}
          <label className="block space-y-2 text-sm">دلیل اقدام<textarea className={control} style={style} rows={3} value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
          <label className="flex min-h-11 gap-3 items-start py-2 text-sm leading-7"><input className="mt-2" type="checkbox" checked={privacy} onChange={e=>setPrivacy(e.target.checked)}/>متن، منابع، مخاطب و نبود اطلاعات خصوصی مشتری را بررسی کرده‌ام.</label>
          <button className="btn btn-secondary min-h-11 w-full" disabled={!eligible||selected?.state!=='draft'} onClick={()=>void command('ready')}>آماده برای انتشار</button>
          <button className="btn btn-primary min-h-11 w-full" disabled={!eligible||selected?.state!=='ready'} onClick={()=>void command('publish')}>انتشار همین نسخه در سایت</button>
          <button className="btn btn-ghost min-h-11 w-full" disabled={!selected||busy||reason.trim().length<5||!['ready','published','approval_invalid'].includes(selected.state)} onClick={()=>void command('withdraw')}>توقف انتشار با دلیل</button>
          {selected?.state==='published'&&<Link className="inline-flex min-h-11 underline" href={`/publications/${selected.id}`}>مشاهده نسخه مخاطب</Link>}
          <p role="status" className="text-sm leading-7">{message}</p>
        </section>
        <section className="card space-y-3 p-5"><h2 className="font-bold text-lg">نسخه‌های محتوا</h2><button className="btn btn-ghost min-h-11" onClick={()=>{if(dirty&&!window.confirm('تغییرهای ذخیره‌نشده کنار گذاشته شوند؟'))return;setDraft(empty);setSelected(null);setDirty(false);setPrivacy(false);}}>محتوای تازه</button>{overview?.items.length===0&&<p className="text-sm">هنوز محتوایی ذخیره نشده است.</p>}<ul className="space-y-2">{overview?.items.map(p=><li key={p.id}><button className="w-full min-h-11 text-start underline text-sm leading-7" onClick={()=>{if(dirty&&!window.confirm('تغییرهای ذخیره‌نشده کنار گذاشته شوند؟'))return;setSelected(p);setDraft(p);setDirty(false);setPrivacy(false);setMessage('');}}>{p.title} · {labels[p.state]} · نسخه {toPersianDigits(p.version)}</button></li>)}</ul></section>
        <section className="card space-y-3 p-5"><h2 className="font-bold text-lg">نیازها و پرسش‌های دوره</h2><label className="block space-y-2 text-sm">دوره<select className={control} style={style} defaultValue="" onChange={e=>void readNeeds(e.target.value)}><option value="">انتخاب دوره</option>{overview?.cohorts.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><p className="text-sm leading-7">{!needs?'برای تنظیم برنامه وبینار، دوره را انتخاب کنید.':needs.state==='unavailable'?'نیازسنجی قابل دریافت نیست؛ نبود پاسخ را صفر فرض نمی‌کنیم.':'پاسخ‌های آموزشی تجمیع‌شده؛ بدون نام یا اطلاعات مالی مشتری.'}</p>{needs?.state==='available'&&<CourseNeeds data={needs.data}/>}</section>
        <section className="card p-5 space-y-2"><h2 className="font-bold text-lg">کارهای خدمت</h2><Link className="block min-h-11 underline" href="/admin/leads">درخواست‌های مشاوره و پیگیری</Link><Link className="block min-h-11 underline" href="/dashboard/consultation">پرونده‌های مرتبط و اقدام‌های موعددار</Link><p className="text-sm leading-7">پرونده فقط با رابطه مشاور باز می‌شود؛ دسترسی مدیریتی جای رضایت مشتری نیست.</p></section>
      </aside>
    </div>
  </section>;
}
