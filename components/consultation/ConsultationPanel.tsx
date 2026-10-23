"use client";
import React, { useState } from "react";
import type { ConsultationCommand, ConsultationRead, ConsultationSession } from "@/lib/consultation/contracts";
import { dateInput } from "@/lib/portfolio/financialInput";
import { toPersianDigits } from "@/lib/format";
import Field from "./Field";
import Dossier from "./Dossier";
import SessionCard from "./SessionCard";
import RecommendationEditor from "./RecommendationEditor";
import { draftBody, recommendationDraft, type RecommendationDraft } from "./draft";

export default function ConsultationPanel({ data, locked, selectionLocked, onCommand, onSelect, onDirty, onPeriod, onDiscard }: {
  data: ConsultationRead; locked: boolean; selectionLocked: boolean; onCommand: (command: ConsultationCommand) => Promise<boolean>;
  onSelect: (relationshipId: string) => void; onDirty: () => void; onPeriod: (period: { startOn: string; endOn: string }) => void; onDiscard: () => void;
}) {
  const [search, setSearch] = useState(""), [relationStatus, setRelationStatus] = useState("active");
  const [advisorId, setAdvisorId] = useState(""), [clientLabel, setClientLabel] = useState(""), [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState<RecommendationDraft | null>(null), [formError, setFormError] = useState("");
  const [period, setPeriod] = useState(data.dossier?.basis.cashFlowPeriod ?? { startOn: "", endOn: "" });
  const [reviewFilter, setReviewFilter] = useState("all");
  const relation = data.selected, advisor = Boolean(relation && relation.advisorId === data.actor.id), member = Boolean(relation && relation.clientId === data.actor.id);
  const hasActiveOwnerRelationship = data.relationships.some(item => !item.revoked && item.clientId === data.actor.id && data.advisors.some(person => person.isOwner && person.id === item.advisorId));
  const matches = data.relationships.filter(item => item.clientLabel.includes(search.trim()) && (relationStatus === "all" || (relationStatus === "revoked" ? item.revoked : !item.revoked)));
  const edit = (session?: ConsultationSession) => { if (locked || !advisor || !data.dossier || relation?.revoked) return; setDraft(recommendationDraft(session?.sessionKey ?? crypto.randomUUID(), session, data.notes.find(note => note.sessionId === session?.id)?.note)); onDirty(); setFormError(""); };
  const save = async () => {
    if (!draft || !relation || !data.dossier || locked) return;
    try { const body = draftBody(draft, data.dossier.basis); setFormError(""); await onCommand({ kind: "save", relationshipId: relation.id, sessionKey: draft.sessionKey, baseVersion: draft.baseVersion, body, privateNote: draft.privateNote.trim() || null }); }
    catch (error) { setFormError(error instanceof Error ? error.message : "فرم کامل نیست."); }
  };
  // Tehran date is used only for this explicit review filter; no financial projection or return assumption.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const sessions = data.sessions.filter(session => reviewFilter !== "due" || session.body.reviewOn <= today);
  return <div className="min-w-0 space-y-6">
    <section className="card min-w-0 space-y-4 p-4 sm:p-5" aria-label="پرونده‌های مجاز"><h2 className="font-display text-xl font-bold">پرونده‌های مجاز شما</h2><p className="text-sm leading-7">فقط رابطه‌های مجاز نمایش داده می‌شوند. جست‌وجو، مجوز تازه‌ای ایجاد نمی‌کند. فیلتر ریسک، دارایی و نقص اطلاعات هنوز در این فهرست فراهم نیست؛ آن‌ها نامعلوم تلقی می‌شوند.</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2"><Field label="جست‌وجوی نام پرونده" value={search} maxLength={120} onChange={setSearch} /><label className="space-y-1 text-sm">وضعیت رابطه<select className="input min-h-11 w-full" value={relationStatus} onChange={event => setRelationStatus(event.target.value)}><option value="active">فعال</option><option value="revoked">لغوشده</option><option value="all">همهٔ رابطه‌های مجاز</option></select></label></div>
      {matches.length === 0 ? <p className="text-sm">پرونده‌ای مطابق این فیلتر در فهرست مجاز خوانده‌شده نیست.</p> : <ul className="flex flex-wrap gap-3">{matches.map(item => <li key={item.id} className="max-w-full"><button type="button" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline text-start" disabled={selectionLocked || item.id === relation?.id} onClick={() => onSelect(item.id)}>{item.clientLabel} · {item.revoked ? "لغوشده" : "فعال"}{item.advisorId === data.actor.id ? " · شما مشاورید" : " · شما عضوید"}</button></li>)}</ul>}
      {selectionLocked && !locked && <p className="text-xs leading-6">برای تغییر پرونده یا دوره، تغییرات فرم را ثبت یا لغو کنید.</p>}
    </section>
    {!data.actor.isAdvisor && !hasActiveOwnerRelationship && <form className="card min-w-0 space-y-4 p-4 sm:p-5" aria-label="رضایت و دسترسی مشاور" onSubmit={event => { event.preventDefault(); if (!locked && consent && advisorId && clientLabel.trim()) void onCommand({ kind: "grant", advisorId, clientLabel: clientLabel.trim() }); }}><h2 className="font-bold">دادن دسترسی به مشاور</h2><p className="text-sm leading-7">مشاور منتخب با رضایت شما نسخه‌های مالی و پروندهٔ مشاوره را می‌بیند. داشتن اشتراک به‌تنهایی این دسترسی را ایجاد نمی‌کند. می‌توانید دسترسی را لغو کنید؛ سابقهٔ منتشرشدهٔ خودتان حفظ می‌شود.</p><fieldset disabled={locked} className="space-y-3"><legend className="sr-only">انتخاب مشاور</legend><Field label="نام شما برای پرونده" maxLength={120} value={clientLabel} onChange={value => { setClientLabel(value); onDirty(); }} /><label className="block space-y-1 text-sm">مشاور<select className="input min-h-11 w-full" value={advisorId} onChange={event => { setAdvisorId(event.target.value); onDirty(); }}><option value="">انتخاب مشاور</option>{data.advisors.filter(item => item.isOwner).map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>{data.advisors.filter(item => item.isOwner).length === 0 && <p className="text-sm">دسترسی آرش برای این محیط هنوز در فهرست مشاوران فعال ثبت نشده است؛ امکان ایجاد رابطه وجود ندارد.</p>}<label className="flex items-start gap-2 text-sm leading-7"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); onDirty(); }} /><span>دیدن پروندهٔ مالی و ثبت جمع‌بندی توسط همین مشاور را می‌پذیرم.</span></label><div className="flex flex-wrap gap-3"><button type="submit" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-gold" disabled={!consent || !advisorId || !clientLabel.trim()}>ثبت رضایت و دسترسی</button><button type="button" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" onClick={onDiscard}>لغو تغییرات فرم</button></div></fieldset></form>}
    {relation && data.dossier && <>
      <section className="card space-y-3 p-4 sm:p-5"><h2 className="break-words text-xl font-bold">پروندهٔ {relation.clientLabel}</h2><p className="text-sm">نقش در این پرونده: {advisor ? "مشاور" : "عضو"}{advisor && data.actor.isOwner ? " · مجاز به تأیید آرش طبق ثبت نقش" : ""}</p>{relation.revoked ? <p role="status">دسترسی مشاور لغو شده است. سابقهٔ قابل مشاهدهٔ عضو حفظ شده؛ ثبت تازه در این رابطه بسته است.</p> : member && <button type="button" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" disabled={locked || selectionLocked} onClick={() => void onCommand({ kind: "revoke", relationshipId: relation.id })}>لغو دسترسی این مشاور</button>}</section>
      <form className="card space-y-3 p-4 sm:p-5" aria-label="دورهٔ پروندهٔ مالی" onSubmit={event => { event.preventDefault(); if (selectionLocked) return; try { const startOn = dateInput(period.startOn), endOn = dateInput(period.endOn); if (startOn > endOn) throw Error("پایان دوره باید پس از شروع باشد."); setFormError(""); onPeriod({ startOn, endOn }); } catch { setFormError("شروع و پایان معتبر دوره را با تقویم میلادی انتخاب کنید."); } }}><h3 className="font-bold">دورهٔ جریان نقد مبنای بررسی</h3><fieldset disabled={selectionLocked} className="grid min-w-0 gap-3 sm:grid-cols-3"><legend className="sr-only">انتخاب دوره</legend><Field label="شروع دوره (میلادی)" type="date" value={period.startOn} onChange={startOn => setPeriod({ ...period, startOn })} /><Field label="پایان دوره (میلادی)" type="date" value={period.endOn} onChange={endOn => setPeriod({ ...period, endOn })} /><button type="submit" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline self-end">خواندن این دوره</button></fieldset></form>
      <Dossier data={data.dossier} ownerId={relation.clientId} />
      {formError && <p role="alert" className="card p-4 text-sm">{formError}</p>}
      {advisor && !relation.revoked && !draft && <button type="button" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-gold" disabled={locked} onClick={() => edit()}>پیش‌نویس جمع‌بندی تازه</button>}
      {draft && <RecommendationEditor draft={draft} basis={data.dossier.basis} locked={locked} onChange={next => { if (!locked) { setDraft(next); onDirty(); } }} onSave={() => void save()} onCancel={onDiscard} />}
      <section className="min-w-0 space-y-4" aria-label="نسخه‌ها و پیگیری"><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-xl font-bold">نسخه‌ها و پیگیری ({toPersianDigits(sessions.length)})</h2><label className="text-sm">موعد بازبینی<select className="input min-h-11 w-full" value={reviewFilter} onChange={event => setReviewFilter(event.target.value)}><option value="all">همهٔ نسخه‌های مجاز</option><option value="due">موعد رسیده یا گذشته</option></select></label></div>{sessions.length === 0 && <p className="card p-4 text-sm">نسخه‌ای مطابق این فیلتر در پروندهٔ خوانده‌شده نیست.</p>}
        {sessions.map(session => <SessionCard key={session.id} session={session} latest={!data.sessions.some(item => item.sessionKey === session.sessionKey && item.version > session.version)} advisor={advisor} owner={data.actor.isOwner} revoked={relation.revoked} basis={data.dossier!.basis} feedback={data.actions.filter(action => action.sessionId === session.id)} privateNote={data.notes.find(note => note.sessionId === session.id)?.note} locked={locked || draft !== null} onCommand={onCommand} onEdit={() => edit(session)} onDirty={onDirty} />)}
      </section>
    </>}
  </div>;
}
