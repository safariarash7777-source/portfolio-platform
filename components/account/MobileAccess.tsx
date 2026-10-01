"use client";
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {normalizeMobile} from '@/lib/auth/mobile';
import {normalizeReturnPath,accountEntryHref} from './returnPath';
export default function MobileAccess({returnTo,link=false}:{returnTo:string;link?:boolean}){
  const [phone,setPhone]=useState('');const [code,setCode]=useState('');const [password,setPassword]=useState('');
  const [mode,setMode]=useState<'otp'|'password'>('otp');const [requested,setRequested]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  async function command(action:string){
    setError('');setNotice('');if(!normalizeMobile(phone)){setError('شماره همراه معتبر وارد کنید.');return;}
    setBusy(true);
    try{
      const response=await fetch('/api/auth/mobile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,phone,code,password}),cache:'no-store'});
      const body=await response.json();if(!response.ok){setError(body.error??'درخواست انجام نشد.');return;}
      if(action==='send'||action==='link'){setRequested(true);setNotice('درخواست کد پذیرفته شد. پس از دریافت پیامک، کد را وارد کنید. برای ارسال دوباره حداقل یک دقیقه صبر کنید.');}
      else if(link){setNotice('شماره در همین حساب تأیید شد. برای تکمیل پروفایل صفحه را دوباره باز کنید.');window.location.reload();}
      else window.location.assign('/account/mobile?next='+encodeURIComponent(normalizeReturnPath(returnTo)));
    }catch{setError('ارتباط با سرویس ورود برقرار نشد. اطلاعات فرم حفظ شده است.');}finally{setBusy(false);}
  }
  function submit(event:FormEvent){event.preventDefault();void command(link?(requested?'verify-link':'link'):mode==='password'?'password':requested?'verify':'send');}
  return <section className="card-elevated p-6 sm:p-8">
    <h1 className="text-2xl font-bold mb-4">{link?'اتصال همراه به حساب فعلی':'ورود با شماره همراه'}</h1>
    <p className="leading-8 mb-5">{link?'ابتدا شماره را با کد پیامکی تأیید کنید. حساب، نقش و سوابق فعلی حفظ می‌شوند.':'کد پیامکی روش ورود است. ایمیل و رمز حساب‌های قدیمی همچنان در مسیر قبلی در دسترس‌اند.'}</p>
    {!link && <div className="flex gap-3 mb-5"><button type="button" className="btn btn-outline" aria-pressed={mode==='otp'} onClick={()=>{setMode('otp');setError('');}}>کد پیامکی</button><button type="button" className="btn btn-outline" aria-pressed={mode==='password'} onClick={()=>{setMode('password');setError('');}}>رمز اختیاری موبایل</button></div>}
    <form onSubmit={submit} className="space-y-5">
      <div><label htmlFor="mobile-phone" className="block mb-2 font-bold">شماره همراه</label><input id="mobile-phone" className="input text-base" type="tel" autoComplete="tel" dir="ltr" value={phone} disabled={busy||requested} onChange={e=>setPhone(e.target.value)} required aria-describedby="mobile-error"/></div>
      {mode==='password' && !link?<div><label htmlFor="mobile-password" className="block mb-2 font-bold">رمز حساب موبایلی</label><input id="mobile-password" className="input text-base" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} disabled={busy} required/><p className="text-sm mt-2 leading-7">اگر رمز تعیین نکرده‌اید یا فراموش شده، با کد پیامکی وارد شوید.</p></div>:requested?<div><label htmlFor="mobile-code" className="block mb-2 font-bold">کد شش‌رقمی پیامک</label><input id="mobile-code" className="input text-base" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={e=>setCode(e.target.value)} maxLength={6} disabled={busy} required/></div>:null}
      <p id="mobile-error" role="alert" style={{color:'var(--danger)'}}>{error}</p><p role="status" className="leading-7">{notice}</p>
      <button className="btn btn-gold w-full" disabled={busy}>{busy?'در حال بررسی…':mode==='password'&&!link?'ورود با رمز':requested?'تأیید کد':'درخواست کد ورود'}</button>
      {requested && <div className="flex flex-wrap gap-3"><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>void command(link?'link':'send')}>درخواست دوبارهٔ کد</button><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>{setRequested(false);setCode('');setNotice('');}}>اصلاح شماره</button></div>}
    </form>
    {!link && <Link className="btn btn-outline w-full mt-5" href={accountEntryHref('/login',returnTo)}>ورود قبلی با ایمیل و رمز سایت</Link>}
    <p className="text-sm leading-7 mt-5">تأیید شماره فقط دریافت کد روی سیم‌کارت را ثابت می‌کند. تأیید رسمی هویت و تطبیق مالکیت شماره هنوز در انتظار بررسی‌اند.</p>
  </section>;
}
