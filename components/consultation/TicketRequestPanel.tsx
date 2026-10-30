"use client";
import React from "react";
import type { ConsultationRead } from "@/lib/consultation/contracts";
import { formatJalali, toPersianDigits } from "@/lib/format";
import { resolveTicketRecommendation, ticketStatus, type TicketCommand, type TicketRead, type TicketRecommendation } from "@/lib/consultation/tickets";
import type { TicketInboxItem, TicketStorageCapability } from "@/lib/consultation/ticketStorageContracts";

export interface TicketDraft { kind: TicketCommand["kind"]; subject: string; text: string; recommendation: TicketRecommendation | null }
export const blankTicketDraft = (kind: TicketCommand["kind"] = "open"): TicketDraft => ({ kind, subject: "", text: "", recommendation: null });
const labels: Record<TicketCommand["kind"], string> = { open: "درخواست عضو", member_followup: "پیگیری عضو", advisor_clarification: "پاسخ مشاور", link_recommendation: "پیوند نسخهٔ مشخص", close: "بستن درخواست" };
export default function TicketRequestPanel({ source, items, data, capability, draft, locked, selectionLocked, needsRefresh, onDraft, onSelect, onNew, onSubmit, onDiscard }: {
  source: ConsultationRead; items: TicketInboxItem[] | null; data: TicketRead | null; capability: TicketStorageCapability;
  draft: TicketDraft; locked: boolean; selectionLocked: boolean; needsRefresh: boolean;
  onDraft: (value: TicketDraft) => void; onSelect: (id: string) => void; onNew: () => void;
  onSubmit: () => void; onDiscard: () => void;
}) {
  const relation = source.selected;
  if (!relation) return <p>رابطهٔ مجاز را انتخاب کنید. درخواست جدید رضایت ایجاد نمی‌کند.</p>;
  const member = source.actor.id === relation.clientId;
  const owner = source.actor.id === relation.advisorId && source.actor.isAdvisor && source.actor.isOwner;
  const closed = data ? ticketStatus(data) === "closed" : false;
  const kinds: TicketCommand["kind"][] = data ? member ? ["member_followup"] : owner ? ["advisor_clarification", "link_recommendation", "close"] : [] : member ? ["open"] : [];
  const activeKind = kinds.includes(draft.kind);
  const writeAllowed = capability.state === "owned_fixture" && !relation.revoked && !closed && activeKind && !needsRefresh;
  const availableReferences = source.sessions.filter(session => (session.state === "published" || session.state === "withdrawn") && session.approval && source.events.some(event => event.sessionId === session.id && event.kind === "publish"));
  const referenceValue = (reference: TicketRecommendation | null) => reference ? `${reference.sessionId}:${reference.version}:${reference.contentHash}` : "";
  const eventText = (command: TicketCommand) => command.kind === "open" ? command.text : command.kind === "close" ? command.reason : command.kind === "link_recommendation" ? null : command.text;
  return <div className="min-w-0 space-y-5">
    <section className="card space-y-3 p-4" aria-label="حدود حق خدمت">
      <h2 className="font-bold">درخواست مستقل و حق خدمت</h2>
      <p className="text-sm leading-7">درخواست، رضایتِ دسترسی به پرونده نیست. دسترسی تحلیلی یا نقش مدیریت هم حق مصرف همین خدمت را ایجاد نمی‌کند؛ حق واقعی این خدمت هنوز متصل نیست.</p>
      {capability.state === "owned_fixture" ? <p role="status" className="break-words text-sm leading-7">فقط مجوز صریح محیط تستِ مجزا برای همین هویت فعال است؛ ثبت‌ها آموزشی‌اند و حق تجاری ایجاد نمی‌کنند. شناسهٔ اجرا: <bdi>{capability.runId}</bdi></p> : <p role="status" className="text-sm leading-7">{capability.state === "unavailable" ? "بررسی مجوز ثبت در دسترس نیست؛ این وضعیت نبود یا وجود حق را تأیید نمی‌کند." : "تأمین‌کنندهٔ معتبر حق خدمت متصل نیست."} ثبت غیرفعال است. متن واردشده در همین نشست حفظ می‌شود.</p>}
      {relation.revoked && <p role="status" className="text-sm">رضایت این رابطه لغو شده است؛ عضو سابقهٔ خودش را می‌خواند و ثبت تازه انجام نمی‌شود.</p>}
      <a className="btn btn-outline max-w-full !whitespace-normal" href={`${source.actor.id === relation.advisorId ? "/admin" : "/dashboard"}/consultation?relation=${relation.id}`}>پرونده و نسخه‌های جمع‌بندی همین رابطه</a>
    </section>
    <section className="card space-y-3 p-4" aria-label="فهرست درخواست‌های همین رابطه">
      <h2 className="font-bold">درخواست‌های همین رابطه</h2>
      {items === null ? <p>فهرست تأیید نشده است؛ نامعلوم به معنی خالی نیست.</p> : items.length === 0 ? <p>در فهرست بازخوانی‌شدهٔ همین رابطه درخواستی وجود ندارد.</p> : <ul className="space-y-2">{items.map(item => <li key={item.requestId}><button type="button" disabled={selectionLocked || item.requestId === data?.requestId} className="btn btn-outline max-w-full !whitespace-normal break-words text-start" onClick={() => onSelect(item.requestId)}>{item.subject} · نسخهٔ {toPersianDigits(item.version)} · {item.state === "closed" ? "بسته" : "باز"}</button></li>)}</ul>}
      {member && <button type="button" disabled={selectionLocked} className="btn btn-outline" onClick={onNew}>آماده‌کردن درخواست تازه</button>}
    </section>
    {data && <section className="card space-y-3 p-4" aria-label="تاریخچهٔ نسخه‌دار درخواست">
      <h2 className="font-bold">تاریخچهٔ درخواست</h2><p className="break-all text-xs" dir="ltr">{data.requestId}</p>
      {data.history.state === "unavailable" ? <p role="alert">تاریخچه در دسترس نیست؛ سابقهٔ خالی تأیید نشده است.</p> : <ol className="space-y-3">{data.history.events.map(event => {
        const reference = event.command.kind === "link_recommendation" ? event.command.recommendation : event.command.kind === "open" ? event.command.recommendation : null;
        const resolved = reference ? resolveTicketRecommendation(reference, source) : null;
        return <li className="space-y-2 rounded-lg border border-line p-3" key={event.id}><h3 className="font-semibold">{labels[event.command.kind]} · نسخهٔ {toPersianDigits(event.version)}</h3><p className="text-xs">{formatJalali(event.createdAt)}</p>{event.command.kind === "open" && <p className="break-words font-semibold">{event.command.subject}</p>}{eventText(event.command) !== null && <p className="whitespace-pre-wrap break-words text-sm leading-7">{eventText(event.command)}</p>}{reference && <p className="break-words text-sm">جمع‌بندی مرتبط: نسخهٔ {toPersianDigits(reference.version)} · {resolved?.state === "resolved" ? "پیوند دقیق در مرجع مجاز تطبیق داده شد" : "مرجع این نسخه در خواندن فعلی کامل نیست؛ نسخهٔ تازه جایگزین آن نشده است"}<br/><bdi className="break-all text-xs">{reference.sessionId}</bdi></p>}</li>;
      })}</ol>}
    </section>}
    {kinds.length > 0 && !closed && !relation.revoked && <form className="card min-w-0 space-y-4 p-4" aria-label="ثبت درخواست یا پیگیری" onSubmit={event => { event.preventDefault(); if (!locked && writeAllowed) onSubmit(); }}>
      <h2 className="font-bold">{data ? "ثبت روی همین درخواست" : "درخواست تازهٔ عضو"}</h2>
      <fieldset className="space-y-3" disabled={locked}>
        {kinds.length > 1 && <label className="block space-y-1 text-sm">کنش<select className="input min-h-11 w-full" value={draft.kind} onChange={event => onDraft({ ...draft, kind: event.target.value as TicketCommand["kind"] })}>{kinds.map(kind => <option value={kind} key={kind}>{labels[kind]}</option>)}</select></label>}
        {draft.kind === "open" && <label className="block space-y-1 text-sm">موضوع<input className="input min-h-11 w-full" value={draft.subject} maxLength={400} onChange={event => onDraft({ ...draft, subject: event.target.value })}/></label>}
        {draft.kind !== "link_recommendation" && <label className="block space-y-1 text-sm">{draft.kind === "close" ? "دلیل پایان" : "متن"}<textarea className="input min-h-32 w-full" rows={5} value={draft.text} maxLength={4000} onChange={event => onDraft({ ...draft, text: event.target.value })}/></label>}
        {(draft.kind === "open" || draft.kind === "link_recommendation") && <label className="block space-y-1 text-sm">نسخهٔ مشخص جمع‌بندی {draft.kind === "open" ? "(اختیاری)" : ""}<select className="input min-h-11 w-full" value={referenceValue(draft.recommendation)} onChange={event => {
          const session = availableReferences.find(item => referenceValue({ sessionId: item.id, version: item.version, contentHash: item.contentHash }) === event.target.value);
          onDraft({ ...draft, recommendation: session ? { sessionId: session.id, version: session.version, contentHash: session.contentHash } : null });
        }}><option value="">بدون پیوند انتخاب‌شده</option>{availableReferences.map(session => <option key={session.id} value={referenceValue({ sessionId: session.id, version: session.version, contentHash: session.contentHash })}>نسخهٔ {toPersianDigits(session.version)} · {session.body.topic} · {formatJalali(session.createdAt)}</option>)}</select></label>}
        {needsRefresh && <p role="alert" className="text-sm">پیش از تلاش تازه، پرونده و نسخهٔ جاری دوباره خوانده شود. متن فعلی حفظ شده است.</p>}
        <div className="flex flex-wrap gap-3"><button type="submit" className="btn btn-gold" disabled={!writeAllowed || locked || draft.kind === "link_recommendation" && !draft.recommendation}>ثبت آزمایشی با بررسی سرور</button><button type="button" className="btn btn-outline" onClick={onDiscard}>لغو متن آماده‌نشده</button></div>
      </fieldset>
    </form>}
  </div>;
}
