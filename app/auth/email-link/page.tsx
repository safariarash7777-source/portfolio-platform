'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {emailLinkDestination} from '@/lib/auth/email';
export default function EmailLinkPage(){
  const started=useRef(false);const [error,setError]=useState('');
  useEffect(()=>{
    if(started.current)return;started.current=true;
    const value=emailLinkDestination(window.location.hash,window.location.origin);
    // Fragment never reaches HTTP access logs; remove before analytics/navigation.
    window.history.replaceState(null,'',window.location.pathname);
    if(!value){setError('لینک معتبر نیست. درخواست تازه ثبت کنید.');return;}
    (async()=>{try{
      const response=await fetch('/api/auth/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'verify',type:value.type,tokenHash:value.token,next:value.next})});
      const data=await response.json();if(!response.ok){setError(data.error??'لینک قابل استفاده نیست.');return;}window.location.assign(data.next);
    }catch{setError('ارتباط برقرار نشد. دوباره لینک اصلی ایمیل را باز کنید.');}})();
  },[]);
  return <main className="min-h-screen flex items-center justify-center p-5" dir="rtl"><div className="card-elevated p-8 max-w-md w-full"><h1 className="text-xl font-bold">تأیید لینک ایمیل</h1><p role={error?'alert':'status'} className="leading-8 my-5">{error || 'در حال بررسی لینک و ایجاد نشست…'}</p><Link className="btn btn-outline" href="/forgot-password">درخواست بازیابی تازه</Link><Link className="btn" href="/login">ورود با رمز فعلی</Link></div></main>;
}
