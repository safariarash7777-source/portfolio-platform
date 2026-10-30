"use client";

import { useState } from "react";
import Link from "next/link";
import type { ArashDeskData } from "@/lib/desk/workspace-model";
import { toPersianDigits } from "@/lib/format";

/** Existing authorized reads only. Display controls never create tasks or service rights. */
export default function AdminWorkdayPath({ data }: { data: ArashDeskData }) {
  const [first, setFirst] = useState('research');
  const [paused, setPaused] = useState<string[]>([]);
  const marketReady = data.market.availability.state === 'ready';
  const researchFailed = data.research.unavailableReason !== null;
  const rows = [
    { id:'research', title:'بازبینی پژوهش', href:'/admin/research', action:'بازکردن کاربرگ و منشأ نسخه',
      reason:researchFailed ? 'خواندن پیش‌نویس‌ها موفق نشده؛ خالی‌بودن صف احراز نشده است.'
        : data.research.invalidCount > 0 ? `${toPersianDigits(data.research.invalidCount)} رکورد قابل نمایش نبود؛ صف خالی احراز نشده است. منشأ را در میز پژوهش بررسی کنید.`
        : data.research.drafts.length ? `${toPersianDigits(data.research.drafts.length)} پیش‌نویس تاریخی خوانده شد؛ این شمار، صف کار باز یا تأیید تحلیل نیست.` : 'پیش‌نویس تاریخی در این خواندن نیست؛ مأموریت‌های باز از این فهرست معلوم نمی‌شوند.' },
    { id:'consultation', title:'پرونده و پیگیری مشاوره', href:'/admin/consultation', action:'بررسی پروندهٔ مجاز و پیگیری ثبت‌شده',
      reason:'صف و موعد مشاوره در این خلاصه خوانده نشده؛ آن‌ها را در میز تخصصی بررسی کنید.' },
    { id:'service', title:'بررسی خدمت عضو', href:'/admin/users', action:'بازکردن عضو و بررسی حق همان خدمت',
      reason:'حق خدمت نامعلوم است؛ نقش، فیلتر و اولویت این نما مجوز خدمت ایجاد نمی‌کنند.' },
    { id:'health', title:'سلامت داده و عملیات', href:'/admin/health', action:'بررسی خطای منبع و گیت مصرف داده',
      reason:marketReady ? 'reader بازار آماده گزارش شده؛ این وضعیت، پذیرش پژوهش یا کامل‌بودن همه منابع نیست.' : 'دادهٔ بازار آمادهٔ مصرف تأیید نشده است؛ پیش از نتیجه‌گیری، وضعیت منبع را بررسی کنید.' },
  ];
  const ordered=[...rows].sort((a,b)=>Number(b.id===first)-Number(a.id===first));
  return <section aria-labelledby="workday-title" className="my-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h2 id="workday-title" className="text-lg font-bold">مسیر روز کاری مدیر</h2>
    <p className="mt-2 text-sm leading-7">راهنمای ورود به میزهای موجود؛ صف عملیاتی تجمیع‌شده نیست. اولویت و توقف فقط در این نما و موقت‌اند؛ با خروج از صفحه از بین می‌روند و در پرونده ثبت نمی‌شوند.</p>
    <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">اولویت نمایشی
      <select className="min-h-11 max-w-full rounded-lg border border-border bg-background px-3" value={first} onChange={event=>setFirst(event.target.value)}>
        {rows.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}
      </select>
    </label>
    <ul className="mt-4 grid gap-3 lg:grid-cols-2">
      {ordered.map(row=>{const stopped=paused.includes(row.id);return <li key={row.id} className="min-w-0 rounded-xl border border-border p-4">
        <h3 className="font-bold">{row.title}</h3>
        <p className="mt-2 text-sm leading-7">علت: {row.reason}</p>
        <dl className="mt-2 text-sm leading-7"><div><dt className="inline">موعد: </dt><dd className="inline">نامعلوم</dd></div><div><dt className="inline">مسئول ثبت‌شده: </dt><dd className="inline">نامعلوم؛ در میز تخصصی بررسی شود</dd></div><div><dt className="inline">قدم بعد: </dt><dd className="inline">{row.action}</dd></div></dl>
        <p role="status" className="mt-2 text-sm">{stopped?'توقف نمایشی؛ علت و مسئول واقعی در پرونده ثبت نشده است.':'پیگیری از میز تخصصی؛ وضعیت انجام از این نما معلوم نیست.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={row.href} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm">{row.action}</Link>
          <button type="button" aria-pressed={stopped} onClick={()=>setPaused(values=>stopped?values.filter(id=>id!==row.id):[...values,row.id])} className="min-h-11 rounded-lg border border-border px-3 text-sm">{stopped?'برداشتن توقف نمایشی':'توقف در این نما'}</button>
        </div>
      </li>;})}
    </ul>
    <p className="mt-3 text-xs leading-6">محصول، درآمد، هزینه، تقویم و حق خدمت از این خلاصه احراز نمی‌شوند. پذیرش، تأیید یا ارسال پیام فقط از گردش مجاز همان میز انجام می‌شود.</p>
  </section>;
}
