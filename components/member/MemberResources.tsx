"use client";
import { useState } from "react";
import { formatJalali, formatTehranClock } from "@/lib/format";
import { type MemberResource, type Result } from "@/lib/member/home";
import { searchResources } from "@/lib/member/start";
import type { MemberRequest } from "@/lib/member/http";
import AuthorizedLink from "./AuthorizedLink";

export default function MemberResources({ resources, cohortId, allowed, retry, request }: { resources: Result<MemberResource[]>; cohortId: string; allowed: boolean; retry: () => void; request?: MemberRequest }) {
  const [query, setQuery] = useState("");
  const visible = resources.state === "ready" ? searchResources(resources.data, query) : [];
  return <section id="member-resources" className="card space-y-4 p-5" aria-labelledby="member-resources-title">
    <h2 id="member-resources-title" className="font-display text-xl font-bold">منابع و آرشیو منتشرشدهٔ دوره</h2>
    <p className="text-sm">فقط منابع منتشرشده و مجاز همین دوره را می‌بینید. ضبط جلسه تا انتشار آن تضمین نشده است؛ راه دریافت هر فایل را هنگام نیاز بررسی کنید.</p>
    {resources.state === "loading" ? <p role="status">در حال دریافت منابع…</p> : null}
    {resources.state === "error" ? <div role="alert"><p>فهرست منابع قابل دریافت نیست؛ این به معنی نبود محتوا نیست.</p><button className="btn btn-outline min-h-12" onClick={retry}>دریافت دوبارهٔ منابع</button></div> : null}
    {resources.state === "ready" && resources.data.length === 0 ? <p>{allowed ? "هنوز منبع مجازی برای این دوره منتشر نشده است." : "در این درخواست منبعی در دسترس حساب شما نیست؛ وضعیت دسترسی دوره را بررسی کنید."}</p> : null}
    {resources.state === "ready" && resources.data.length > 0 ? <><label className="block space-y-2"><span>جست‌وجو در عنوان منابع همین دوره</span><input type="search" className="input min-h-12 w-full" value={query} onChange={e => setQuery(e.target.value)} maxLength={200} /></label><p role="status" className="text-sm">{visible.length.toLocaleString("fa-IR")} منبع از {resources.data.length.toLocaleString("fa-IR")} منبع مجاز</p>{visible.length === 0 ? <p>عنوانی مطابق جست‌وجوی شما پیدا نشد. <button className="min-h-12 underline" onClick={() => setQuery("")}>پاک‌کردن جست‌وجو</button></p> : null}<ul className="space-y-4">{visible.map(r => <li key={r.resourceRef} className="space-y-2 border-t pt-4"><h3 className="font-bold break-words">{r.title}</h3><p className="text-sm">ثبت منبع: {formatJalali(r.createdAt)}، {formatTehranClock(r.createdAt)}</p><AuthorizedLink path={r.resourcePath} cohortId={cohortId} label={`دریافت لینک ${r.title}`} request={request} /></li>)}</ul></> : null}
  </section>;
}
