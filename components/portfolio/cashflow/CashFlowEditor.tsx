"use client";
import React from "react";
import { toPersianDigits } from "@/lib/format";
import { blankEntry, invalidateCoverage, type CashFlowDraft, type SourceDraft, type EntryDraft } from "./draft";

function SourceFields({ value, onChange }: { value: SourceDraft; onChange: (next: SourceDraft) => void }) {
  return <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm">منبع (خالی یعنی نامعلوم)<input className="input w-full min-w-0" maxLength={160} value={value.label} onChange={event => onChange({ ...value, label: event.target.value })} /></label>
    <label className="space-y-1 text-sm">روز مشاهدهٔ منبع (میلادی)<input type="date" className="input w-full min-w-0" value={value.observedOn} onChange={event => onChange({ ...value, observedOn: event.target.value })} /></label>
  </div>;
}

export default function CashFlowEditor({ draft, locked, onChange, onSave, onCancel }: {
  draft: CashFlowDraft; locked: boolean; onChange: (next: CashFlowDraft) => void; onSave: () => void; onCancel: () => void;
}) {
  const revise = (next: CashFlowDraft) => onChange(invalidateCoverage(next));
  const entry = (index: number, patch: Partial<EntryDraft>) => onChange(invalidateCoverage({ ...draft, entries: draft.entries.map((value, i) => i === index ? { ...value, ...patch } : value) }, [...new Set([draft.entries[index].basis, patch.basis ?? draft.entries[index].basis])]));
  const accounts = (selected: string) => <><option value="">حساب را انتخاب کنید</option>{draft.accounts.map(account => <option key={account.accountKey} value={account.accountKey}>{account.label || "حسابِ هنوز نام‌گذاری‌نشده"}{draft.scopeAccountKeys.includes(account.accountKey) ? " · در محدوده" : " · بیرون محدوده"}</option>)}{selected && !draft.accounts.some(account => account.accountKey === selected) && <option value={selected}>مرجع حساب نامعتبر؛ اصلاح کنید</option>}</>;
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!locked) onSave(); }} aria-label="نسخهٔ جریان نقد" aria-describedby="cashflow-form-help">
    <h2 className="font-display text-xl font-bold">نسخهٔ جریان نقد</h2>
    <p id="cashflow-form-help" className="text-sm leading-7">همهٔ ورودی‌های پولی تومان صحیح‌اند؛ خالی یعنی نامعلوم. روزها را با تقویم میلادی وارد کنید. حذف یا اصلاح فقط نسخهٔ تازه می‌سازد؛ سابقه پاک نمی‌شود. هر تغییر مرتبط، تأیید قبلی پوشش کامل را باطل می‌کند.</p>
    <fieldset disabled={locked} className="min-w-0 space-y-5">
      <legend className="font-bold">حساب‌ها، محدوده و اقلام</legend>
      <section className="card min-w-0 space-y-4 p-5" aria-label="حساب‌های نقدی و محدوده">
        <h3 className="font-bold">کدام حساب‌های نقدی؟</h3><p className="text-sm leading-7">برای هر حساب یک نام بنویسید و حساب‌های داخل محدوده را علامت بزنید. دو طرف انتقال باید از حساب‌های خودتان باشند؛ حساب بیرون محدوده نیز در فهرست می‌ماند.</p>
        {draft.accounts.map((account, index) => {
          const referenced = draft.entries.some(row => row.kind === "transfer" ? row.fromAccountKey === account.accountKey || row.toAccountKey === account.accountKey : row.accountKey === account.accountKey);
          return <div key={account.accountKey} className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 space-y-1 text-sm">نام حساب {toPersianDigits(index + 1)}<input className="input w-full min-w-0" maxLength={160} value={account.label} onChange={event => revise({ ...draft, accounts: draft.accounts.map((row, i) => i === index ? { ...row, label: event.target.value } : row) })} /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.scopeAccountKeys.includes(account.accountKey)} onChange={event => revise({ ...draft, scopeAccountKeys: event.target.checked ? [...draft.scopeAccountKeys, account.accountKey] : draft.scopeAccountKeys.filter(key => key !== account.accountKey) })} />در محدوده</label>
            <button type="button" className="btn btn-outline" disabled={referenced} onClick={() => revise({ ...draft, accounts: draft.accounts.filter(row => row.accountKey !== account.accountKey), scopeAccountKeys: draft.scopeAccountKeys.filter(key => key !== account.accountKey) })}>حذف حساب {toPersianDigits(index + 1)}</button>
            {referenced && <p className="w-full text-xs leading-6">برای حذف این حساب، ابتدا مرجع آن را در رویدادها اصلاح کنید؛ هیچ ارجاعی خودکار پاک نمی‌شود.</p>}
          </div>;
        })}
        <button type="button" className="btn btn-outline" disabled={draft.accounts.length >= 50} onClick={() => revise({ ...draft, accounts: [...draft.accounts, { accountKey: crypto.randomUUID(), label: "" }] })}>افزودن حساب نقدی</button>
      </section>
      <section className="card min-w-0 space-y-4 p-5" aria-label="موجودی افتتاحیه">
        <h3 className="font-bold">موجودی ابتدای دوره</h3>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.opening.enabled} onChange={event => revise({ ...draft, opening: { ...draft.opening, enabled: event.target.checked } })} />ثبت موجودی افتتاحیه با منبع (اختیاری)</label>
        <p className="text-xs leading-7">موجودی افتتاحیه می‌تواند منفی باشد؛ درآمد نیست. بدون آن، حتی با جریان کامل ماندهٔ پایان قطعی ساخته نمی‌شود.</p>
        {draft.opening.enabled && <div className="space-y-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">موجودی ابتدای دوره (تومان؛ خالی یعنی نامعلوم)<input className="input w-full min-w-0" inputMode="text" dir="ltr" value={draft.opening.amount} onChange={event => revise({ ...draft, opening: { ...draft.opening, amount: event.target.value } })} /></label>
          <label className="space-y-1 text-sm">روز افتتاحیه (میلادی؛ ابتدای روز شروع دوره)<input type="date" className="input w-full min-w-0" value={draft.opening.atStartOn} onChange={event => revise({ ...draft, opening: { ...draft.opening, atStartOn: event.target.value } })} /></label>
        </div><SourceFields value={draft.opening.source} onChange={source => revise({ ...draft, opening: { ...draft.opening, source } })} /></div>}
      </section>
      <section className="space-y-4" aria-label="رویدادهای برنامه و واقعیت">
        <h3 className="font-bold">درآمد، هزینه و انتقال</h3>
        {draft.entries.length === 0 && <p className="text-sm leading-7">در این پیش‌نویس رویدادی وارد نشده است؛ این به معنی نبود درآمد یا هزینه نیست.</p>}
        {draft.entries.map((row, index) => <section key={row.entryKey} className="card min-w-0 space-y-4 p-5" aria-label={`رویداد ${index + 1}`}>
          <h4 className="font-bold">رویداد {toPersianDigits(index + 1)}</h4>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">برنامه یا واقعیت<select className="input w-full min-w-0" value={row.basis} onChange={event => entry(index, { basis: event.target.value as EntryDraft["basis"] })}><option value="planned">برنامه‌ریزی‌شده</option><option value="actual">واقعی</option></select></label>
            <label className="space-y-1 text-sm">نوع رویداد<select className="input w-full min-w-0" value={row.kind} onChange={event => entry(index, { kind: event.target.value as EntryDraft["kind"] })}><option value="income">درآمد</option><option value="expense">هزینه</option><option value="transfer">انتقال بین حساب‌های خودم</option></select></label>
            {row.kind === "transfer" ? <><label className="space-y-1 text-sm">حساب مبدأ<select className="input w-full min-w-0" value={row.fromAccountKey} onChange={event => entry(index, { fromAccountKey: event.target.value })}>{accounts(row.fromAccountKey)}</select></label><label className="space-y-1 text-sm">حساب مقصد<select className="input w-full min-w-0" value={row.toAccountKey} onChange={event => entry(index, { toAccountKey: event.target.value })}>{accounts(row.toAccountKey)}</select></label></>
              : <label className="space-y-1 text-sm">حساب رویداد<select className="input w-full min-w-0" value={row.accountKey} onChange={event => entry(index, { accountKey: event.target.value })}>{accounts(row.accountKey)}</select></label>}
            <label className="space-y-1 text-sm">مبلغ (تومان؛ خالی یعنی نامعلوم)<input className="input w-full min-w-0" inputMode="numeric" dir="ltr" value={row.amount} onChange={event => entry(index, { amount: event.target.value })} /></label>
            <label className="space-y-1 text-sm">روز وقوع یا برنامه (میلادی؛ خالی یعنی نامعلوم)<input type="date" className="input w-full min-w-0" value={row.occurredOn} onChange={event => entry(index, { occurredOn: event.target.value })} /></label>
            <label className="space-y-1 text-sm">دسته (اختیاری)<input className="input w-full min-w-0" maxLength={160} value={row.category} onChange={event => entry(index, { category: event.target.value })} /></label>
          </div><SourceFields value={row.source} onChange={source => entry(index, { source })} />
          <label className="block space-y-1 text-sm">یادداشت (اختیاری)<textarea className="input w-full min-w-0" maxLength={2000} value={row.note} onChange={event => entry(index, { note: event.target.value })} /></label>
          <button type="button" className="btn btn-outline" onClick={() => onChange(invalidateCoverage({ ...draft, entries: draft.entries.filter((_, i) => i !== index) }, [row.basis]))}>حذف رویداد {toPersianDigits(index + 1)} از نسخهٔ تازه</button>
        </section>)}
        <button type="button" className="btn btn-outline" disabled={draft.entries.length >= 500} onClick={() => onChange(invalidateCoverage({ ...draft, entries: [...draft.entries, blankEntry(crypto.randomUUID())] }, ["actual"]))}>افزودن رویداد</button>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="اعلام پوشش اطلاعات">
        {(["planned", "actual"] as const).map(basis => { const value = draft.coverage[basis]; return <fieldset key={basis} className="card min-w-0 space-y-3 p-5">
          <legend className="font-bold">پوشش {basis === "planned" ? "برنامه‌ریزی‌شده" : "واقعی"}</legend>
          <label className="block space-y-1 text-sm">میزان پوشش<select className="input w-full min-w-0" value={value.status} onChange={event => onChange({ ...draft, coverage: { ...draft.coverage, [basis]: { ...value, status: event.target.value, memberAffirmed: false } } })}><option value="unknown">نامعلوم</option><option value="partial">جزئی</option><option value="complete">کامل؛ نیازمند تأیید من</option></select></label>
          <SourceFields value={value.source} onChange={source => onChange({ ...draft, coverage: { ...draft.coverage, [basis]: { ...value, source, memberAffirmed: false } } })} />
          {value.status === "complete" && <label className="flex min-h-11 items-start gap-2 text-sm leading-7"><input type="checkbox" checked={value.memberAffirmed} onChange={event => onChange({ ...draft, coverage: { ...draft.coverage, [basis]: { ...value, memberAffirmed: event.target.checked } } })} />من تأیید می‌کنم تمام رویدادهای این بخش، در تمام حساب‌های انتخاب‌شده و کل دوره، با مبلغ، روز و منبع معلوم ثبت شده‌اند؛ فهرست خالی را فقط در صورت واقعاً نداشتن رویداد تأیید می‌کنم.</label>}
        </fieldset>; })}
      </section>
      <div className="flex flex-wrap gap-3"><button type="submit" className="btn btn-gold">ثبت نسخهٔ تازه</button><button type="button" className="btn btn-outline" onClick={onCancel}>لغو تغییرات پیش‌نویس</button></div>
    </fieldset>
  </form>;
}
