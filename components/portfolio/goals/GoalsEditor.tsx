"use client";
import React from "react";
import { toPersianDigits } from "@/lib/format";
import { emptyGoal, type GoalsDraft } from "./draft";

export default function GoalsEditor({ draft, locked, onChange, onSave, onCancel }: { draft: GoalsDraft; locked: boolean; onChange: (next: GoalsDraft) => void; onSave: () => void; onCancel: () => void }) {
  return <form className="card space-y-5 p-5" aria-label="ویرایش هدف‌های مالی" onSubmit={event => { event.preventDefault(); if (!locked) onSave(); }}>
    <h2 className="font-display text-xl font-bold">هدف‌های من</h2>
    <p className="text-sm leading-7">مبلغ‌ها تومان صحیح‌اند. خالی بودن مبلغ کنارگذاشته‌شده یعنی نامعلوم؛ صفر یعنی مبلغ صفرِ اظهارشده با منبع و تاریخ. حذف هدف فقط در نسخهٔ تازه اعمال می‌شود و سابقه حفظ می‌شود.</p>
    <fieldset disabled={locked} className="min-w-0 space-y-5"><legend className="sr-only">فهرست هدف‌ها</legend>
      {draft.goals.length === 0 && <p className="text-sm">هدف تازه اضافه کنید. ثبت فهرست خالی نیز یک نسخهٔ مستقل است.</p>}
      {draft.goals.map((goal, index) => {
        const change = (key: keyof typeof goal, value: string) => onChange({ goals: draft.goals.map((item, position) => position === index ? { ...item, [key]: value } : item) });
        return <fieldset key={goal.goalKey} className="min-w-0 space-y-3 rounded-xl border border-line p-4"><legend className="px-2 font-bold">هدف {toPersianDigits(index + 1)}</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">عنوان هدف<input className="input w-full min-w-0" maxLength={160} value={goal.title} onChange={e => change("title", e.target.value)} /></label>
            <label className="space-y-1 text-sm">مبلغ هدف (تومان)<input className="input w-full min-w-0" inputMode="numeric" value={goal.targetAmountToman} onChange={e => change("targetAmountToman", e.target.value)} /></label>
            <label className="space-y-1 text-sm">موعد هدف (میلادی)<input type="date" className="input w-full min-w-0" value={goal.targetOn} onChange={e => change("targetOn", e.target.value)} /></label>
            <label className="space-y-1 text-sm">مبلغ کنارگذاشته‌شده (تومان؛ خالی = نامعلوم)<input className="input w-full min-w-0" inputMode="numeric" value={goal.declaredSavedToman} onChange={e => change("declaredSavedToman", e.target.value)} /></label>
            <label className="space-y-1 text-sm">منبع مبلغ کنارگذاشته‌شده<input className="input w-full min-w-0" maxLength={160} value={goal.sourceLabel} onChange={e => change("sourceLabel", e.target.value)} /></label>
            <label className="space-y-1 text-sm">تاریخ مشاهدهٔ مبلغ (میلادی)<input type="date" className="input w-full min-w-0" value={goal.observedOn} onChange={e => change("observedOn", e.target.value)} /></label>
          </div>
          <label className="block space-y-1 text-sm">یادداشت یا اقدام بعدی (اختیاری)<textarea className="input w-full min-w-0" maxLength={2000} value={goal.note} onChange={e => change("note", e.target.value)} /></label>
          <button type="button" className="btn btn-outline" onClick={() => onChange({ goals: draft.goals.filter((_, position) => position !== index) })}>حذف هدف {toPersianDigits(index + 1)} از پیش‌نویس</button>
        </fieldset>;
      })}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={draft.goals.length >= 50} className="btn btn-outline" onClick={() => onChange({ goals: [...draft.goals, emptyGoal(crypto.randomUUID())] })}>افزودن هدف</button><button type="submit" className="btn btn-gold">ثبت نسخهٔ هدف‌ها</button><button type="button" className="btn btn-outline" onClick={onCancel}>لغو تغییرات پیش‌نویس</button></div>
    </fieldset>
  </form>;
}
