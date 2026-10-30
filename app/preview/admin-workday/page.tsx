"use client";
// LAB ONLY / DO NOT MERGE: actual product component with synthetic read states.
import { useState } from 'react';
import AdminWorkdayPath from '@/components/admin/AdminWorkdayPath';
import type { ArashDeskData } from '@/lib/desk/workspace-model';
export default function AdminWorkdayWalkthrough(){
  const [scenario,setScenario]=useState('error');
  const data:ArashDeskData={market:{data:null,availability:{state:scenario==='empty'?'empty':'error',sourceAt:null,receivedAt:null,validAt:null,readAt:0}},
    chart:{state:'unavailable',data:[],reason:'synthetic'},reports:{state:'unavailable',data:[],reason:'synthetic'},readAt:'2026-10-30T00:00:00Z',
    research:{drafts:[],unavailableReason:scenario==='error'?'synthetic read failure':null,invalidCount:scenario==='omitted'?2:0}};
  return <main dir="rtl" className="mx-auto max-w-6xl p-3 sm:p-6">
    <header className="rounded-xl border border-border p-4">
      <h1 className="text-xl font-bold">نمونهٔ نمایشی میز روزکاری — آزمایشگاه مستقل</h1>
      <p className="mt-2 leading-7">داده‌ها کاملاً مصنوعی‌اند. این صفحه به حساب، صف واقعی، حق خدمت یا backend عملیاتی متصل نیست. اولویت و توقف ذخیره نمی‌شوند. هیچ پیام، پرداخت یا درخواست مدل اجرا نمی‌شود.</p>
      <p className="mt-2 text-sm">همان component محصول PR338؛ این شاخه آزمایشگاهی نباید وارد main شود. لینک‌های میزهای تخصصی واقعی‌اند و دسترسی مدیر را دور نمی‌زنند.</p>
      <label className="mt-3 flex flex-wrap items-center gap-2">وضعیت آزمایشی
        <select className="min-h-11 max-w-full rounded-lg border border-border bg-background px-3" value={scenario} onChange={event=>setScenario(event.target.value)}>
          <option value="error">خطای خواندن؛ خالی احراز نشده</option><option value="empty">خواندن خالی؛ حق خدمت نامعلوم</option><option value="omitted">رکورد غیرقابل نمایش؛ صف خالی نیست</option>
        </select>
      </label>
    </header>
    <AdminWorkdayPath key={scenario} data={data}/>
    <p className="text-sm leading-7">راه رفتن نمونه: وضعیت را انتخاب کنید، اولویت نمایشی را تغییر دهید، توقف را بگذارید و بردارید، سپس مسیر تخصصی را باز کنید. خروج از صفحه تنظیم موقت را پاک می‌کند. پذیرش بصری و پذیرش backend واقعی دو شاهد جدا هستند.</p>
  </main>;
}
