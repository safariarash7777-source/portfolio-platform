'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {formatJalali,toPersianDigits} from '@/lib/format';
type Connection={linked:boolean;legacyConnection:boolean;course:boolean;updates:boolean};
type Notice={id:string;kind:string;version:number;created_at:string;acknowledged:boolean;site_path:string|null;telegram_status:string};
export default function NotificationCenter({connectionOnly=false}:{connectionOnly?:boolean}){
 const [connection,setConnection]=useState<Connection|null>(null),[notices,setNotices]=useState<Notice[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[challenge,setChallenge]=useState<{challengeId:string;token:string}|null>(null),[confirmation,setConfirmation]=useState('');
 const refresh=useCallback(async()=>{
  const requests=[fetch('/api/notifications?view=connection',{cache:'no-store'}),...(!connectionOnly?[fetch('/api/notifications',{cache:'no-store'})]:[])];
  const responses=await Promise.all(requests);const bodies=await Promise.all(responses.map(r=>r.json()));
  responses.forEach((r,i)=>{if(!r.ok)throw new Error(bodies[i].error);});setConnection(bodies[0].data);if(!connectionOnly)setNotices(bodies[1].data);
 },[connectionOnly]);
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[refresh]);
 async function command(body:Record<string,unknown>){
  setBusy(true);setError('');try{const r=await fetch('/api/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw new Error(b.error);
   if(body.action==='start')setChallenge(b.data);if(body.action==='confirm'||body.action==='unlink'){setChallenge(null);setConfirmation('');}await refresh();
  }catch(e){setError(e instanceof Error?e.message:'عملیات انجام نشد.');}finally{setBusy(false);}
 }
 const status:Record<string,string>={accepted:'تلگرام پیام را پذیرفت؛ خواندن فرد معلوم نیست.',pending:'در حال بررسی نتیجه ارسال.',retry:'ارسال محدود دوباره بررسی می‌شود.',exhausted:'سقف تلاش ارسال تمام شده است.',failed:'ارسال انجام نشد.',unknown:'نتیجه ارسال نامعلوم؛ دوباره‌فرستی خودکار متوقف است.',cancelled:'ارسال لغو شد.',not_sent:'هنوز به تلگرام ارسال نشده است.'};
 return <div className="space-y-6">
  <nav className="flex gap-4 flex-wrap"><Link href="/dashboard" className="btn btn-outline">خانه حساب</Link><Link href={connectionOnly?'/notifications':'/account/telegram'} className="btn btn-outline">{connectionOnly?'مرکز اعلان':'اتصال تلگرام'}</Link></nav>
  {error&&<p role="alert" className="card-elevated p-4">{error} <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}>دریافت دوباره</button></p>}
  {!connection&&!error&&<p role="status">در حال دریافت…</p>}
  {connection&&<section className="card-elevated p-6 space-y-4" aria-labelledby="tg-heading"><h2 id="tg-heading" className="text-xl font-bold">اتصال و ترجیح تلگرام</h2>
   <p>{connection.linked?'اتصال دوطرفه تأیید شده است.':connection.legacyConnection?'اتصال قدیمی نیازمند تأیید دوباره است؛ ابتدا قطع و سپس متصل کنید.':'حساب تلگرام متصل نیست.'}</p>
   <p>اعلان تلگرام اختیاری است. متن پیام اطلاعات مالی شخصی ندارد؛ محتوا در حساب سایت باز می‌شود.</p>
   {(connection.linked||connection.legacyConnection)?<button type="button" className="btn btn-outline min-h-11" disabled={busy} onClick={()=>command({action:'unlink'})}>قطع اتصال و توقف اعلان تلگرام</button>:<button type="button" className="btn btn-gold min-h-11" disabled={busy} onClick={()=>command({action:'start'})}>{busy?'در حال انجام…':'شروع اتصال دوطرفه'}</button>}
   {challenge&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();command({action:'confirm',challengeId:challenge.challengeId,confirmation:confirmation.trim()});}}>
    <p>این فرمان را فقط در گفت‌وگوی خصوصی بات آزمایشی تعیین‌شده بفرستید، یا در صفحه اتصال مینی‌اپ وارد کنید. اعتبار آن ده دقیقه است.</p>
    <label className="block" htmlFor="link-token">فرمان اتصال</label><textarea id="link-token" readOnly dir="ltr" className="input w-full break-all" value={'/link '+challenge.token} />
    <p>بات یا مینی‌اپ یک کد تأیید برمی‌گرداند. فقط اگر خودتان این اتصال را آغاز کرده‌اید، آن را در همین صفحه وارد کنید.</p>
    <label className="block" htmlFor="link-confirmation">کد تأیید سمت تلگرام</label><input id="link-confirmation" dir="ltr" autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="input w-full" required />
    <button type="submit" className="btn btn-gold min-h-11" disabled={busy}>تأیید نهایی اتصال</button>
   </form>}
   {connection.linked&&<fieldset className="space-y-3" disabled={busy}><legend className="font-bold">ارسال اختیاری به تلگرام</legend>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={connection.course} onChange={e=>command({action:'preferences',course:e.target.checked,updates:connection.updates})}/>محتوای آموزشی دوره و تغییر وضعیت آن</label>
    <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={connection.updates} onChange={e=>command({action:'preferences',course:connection.course,updates:e.target.checked})}/>یادداشت‌ها و نسخه‌های تازه آن‌ها</label>
   </fieldset>}
  </section>}
  {!connectionOnly&&notices&&<section aria-labelledby="notice-heading" className="space-y-4"><h2 id="notice-heading" className="text-xl font-bold">اعلان‌های حساب</h2>
   <p>علامت مشاهده اینجا فقط درباره اعلان است؛ خواندن پژوهش جدا ثبت می‌شود. آخرین {toPersianDigits(100)} اعلان نمایش داده می‌شود.</p>
   {notices.length===0&&<p className="card-elevated p-6">هنوز اعلانی برای حساب شما ثبت نشده است.</p>}
   {notices.map(n=><article key={n.id} className="card-elevated p-5 space-y-3"><h3 className="font-bold">{n.kind==='withdrawn'?'توقف محتوای قبلی':n.version>1?'نسخه تازه محتوا':'محتوای تازه'}</h3><p>نسخه {toPersianDigits(n.version)} · {formatJalali(n.created_at)}</p><p>{status[n.telegram_status]??'در حال بررسی ارسال.'}</p>
    {n.site_path?<Link className="btn btn-outline min-h-11" href={n.site_path}>مشاهده محتوا در سایت</Link>:<p>این محتوا اکنون در دسترس حساب شما نیست؛ ممکن است نسخه یا دسترسی آن تغییر کرده باشد.</p>}
    {n.acknowledged?<p>مشاهده اعلان ثبت شده است.</p>:<button type="button" className="btn btn-outline min-h-11" disabled={busy} onClick={()=>command({action:'acknowledge',noticeId:n.id})}>اعلان را دیدم</button>}
   </article>)}
  </section>}
 </div>;
}
