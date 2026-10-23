"use client";
import React from "react";
import type { FinancialBasis } from "@/lib/consultation/contracts";
import { toPersianDigits } from "@/lib/format";
import Field from "./Field";
import type { RecommendationDraft } from "./draft";
export default function RecommendationEditor({ draft, basis, locked, onChange, onSave, onCancel }: { draft: RecommendationDraft; basis: FinancialBasis; locked: boolean; onChange: (draft: RecommendationDraft) => void; onSave: () => void; onCancel: () => void }) {
  const change = (key: keyof RecommendationDraft, value: string) => onChange({ ...draft, [key]: value });
  return <form className="card min-w-0 space-y-4 p-4 sm:p-5" aria-label="پیش‌نویس جمع‌بندی مشاوره" onSubmit={event => { event.preventDefault(); if (!locked) onSave(); }}>
    <h2 className="font-display text-xl font-bold">پیش‌نویس جمع‌بندی و اقدام بعدی</h2><p className="text-sm leading-7">ذخیره، نسخهٔ تازه می‌سازد؛ محتوا تا تأیید آرش و انتشار جداگانه برای عضو نمایش داده نمی‌شود. نسخهٔ پایه: {toPersianDigits(draft.baseVersion)}.</p>
    <p className="text-sm leading-7">مبنای ثبت، نسخه‌های پروندهٔ خوانده‌شدهٔ بالا است؛ دورهٔ جریان نقد <bdi>{toPersianDigits(basis.cashFlowPeriod.startOn)} — {toPersianDigits(basis.cashFlowPeriod.endOn)}</bdi>. نسخهٔ ناموجود «ندارد» ثبت می‌شود؛ جای آن عدد فرضی نمی‌گذاریم.</p>
    <fieldset disabled={locked} className="min-w-0 space-y-4"><legend className="sr-only">محتوای پیش‌نویس</legend>
      <Field label="موضوع" value={draft.topic} onChange={v => change("topic", v)} maxLength={300} />
      <Field label="هدف این جمع‌بندی" value={draft.goal} onChange={v => change("goal", v)} multiline maxLength={2000} />
      <Field label="متن قابل مشاهدهٔ عضو پس از انتشار" value={draft.clientSummary} onChange={v => change("clientSummary", v)} multiline maxLength={10000} />
      <Field label="دلیل و تناسب با وضعیت عضو" value={draft.rationale} onChange={v => change("rationale", v)} multiline maxLength={6000} />
      <Field label="محدودیت‌ها و اطلاعات ناقص" value={draft.limitations} onChange={v => change("limitations", v)} multiline />
      <Field label="موعد بازبینی (میلادی)" value={draft.reviewOn} onChange={v => change("reviewOn", v)} type="date" />
      <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-3"><legend className="px-2 font-bold">شاهدها و منابع</legend>
        {draft.evidence.map((item, index) => <div key={index} className="min-w-0 space-y-2 border-b border-line pb-3"><Field label={`نام منبع ${toPersianDigits(index + 1)}`} value={item.label} maxLength={300} onChange={label => onChange({ ...draft, evidence: draft.evidence.map((e, i) => i === index ? { ...e, label } : e) })} /><Field label="نشانی منبع (اختیاری)" value={item.url ?? ""} maxLength={1000} onChange={url => onChange({ ...draft, evidence: draft.evidence.map((e, i) => i === index ? { ...e, url: url || null } : e) })} /><Field label="تاریخ منبع (میلادی)" type="date" value={item.asOf} onChange={asOf => onChange({ ...draft, evidence: draft.evidence.map((e, i) => i === index ? { ...e, asOf } : e) })} />{draft.evidence.length > 1 && <button className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" type="button" onClick={() => onChange({ ...draft, evidence: draft.evidence.filter((_, i) => i !== index) })}>حذف این شاهد</button>}</div>)}
        <button className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" type="button" disabled={draft.evidence.length >= 20} onClick={() => onChange({ ...draft, evidence: [...draft.evidence, { label: "", url: null, asOf: "" }] })}>افزودن شاهد</button>
      </fieldset>
      <details className="space-y-2"><summary>پیوند نسخهٔ پژوهش (اختیاری)</summary><p className="text-xs leading-6">فقط شناسهٔ نسخه‌های پژوهش تأییدشده؛ اعتبار و مجوز آن‌ها هنگام ثبت بررسی می‌شود. این فیلد تأیید پژوهش را ایجاد نمی‌کند.</p><Field label="شناسهٔ نسخه‌های پژوهش؛ هر کدام یک خط" value={draft.researchIds} onChange={v => change("researchIds", v)} multiline /></details>
      <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-3"><legend className="px-2 font-bold">اقدام‌های قابل پیگیری</legend>
        {draft.actions.map((item, index) => <div key={item.actionKey} className="min-w-0 space-y-2 border-b border-line pb-3"><Field label={`اقدام ${toPersianDigits(index + 1)}`} maxLength={1000} value={item.title} onChange={title => onChange({ ...draft, actions: draft.actions.map((a, i) => i === index ? { ...a, title } : a) })} /><div className="grid min-w-0 gap-3 sm:grid-cols-2"><Field label="موعد اقدام (میلادی)" value={item.dueOn} type="date" onChange={dueOn => onChange({ ...draft, actions: draft.actions.map((a, i) => i === index ? { ...a, dueOn } : a) })} /><label className="block space-y-1 text-sm">مسئول اقدام<select className="input min-h-11 w-full" value={item.responsible} onChange={event => onChange({ ...draft, actions: draft.actions.map((a, i) => i === index ? { ...a, responsible: event.target.value as "member" | "advisor" } : a) })}><option value="member">عضو</option><option value="advisor">مشاور</option></select></label></div><button type="button" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" onClick={() => onChange({ ...draft, actions: draft.actions.filter((_, i) => i !== index) })}>حذف این اقدام از پیش‌نویس</button></div>)}
        <button className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" type="button" disabled={draft.actions.length >= 20} onClick={() => onChange({ ...draft, actions: [...draft.actions, { actionKey: crypto.randomUUID(), title: "", dueOn: "", responsible: "member" }] })}>افزودن اقدام</button>
      </fieldset>
      <Field label="یادداشت خصوصی مشاور؛ برای عضو منتشر نمی‌شود" value={draft.privateNote} onChange={v => change("privateNote", v)} multiline maxLength={10000} />
      <div className="flex flex-wrap gap-3"><button type="submit" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-gold">ذخیرهٔ نسخهٔ پیش‌نویس</button><button type="button" className="btn !whitespace-normal max-w-full min-w-0 break-words btn-outline" onClick={onCancel}>لغو تغییرات پیش‌نویس</button></div>
    </fieldset>
  </form>;
}
