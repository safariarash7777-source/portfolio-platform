import React from "react";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import { goalProgress, type Goal } from "@/lib/portfolio/goalsApiContract";

export default function GoalsSummary({ goals }: { goals: Goal[] }) {
  return <section className="space-y-4" aria-label="خلاصهٔ هدف‌های ثبت‌شده"><h2 className="font-display text-xl font-bold">هدف‌های ثبت‌شده به ترتیب موعد</h2>
    <p className="text-sm leading-7">پیشرفت فقط نسبت مبلغ اظهارشده به مبلغ هدف است؛ موجودی تأییدشده، پیش‌بینی بازده یا تضمین رسیدن به هدف نیست. ممکن است یک مبلغ برای چند هدف اعلام شده باشد؛ جمع هدف‌ها موجودی قابل خرج نیست.</p>
    {goals.length === 0 && <p className="card p-5">در این نسخه هدفی ثبت نشده است.</p>}
    {[...goals].sort((a, b) => a.targetOn.localeCompare(b.targetOn)).map(goal => { const progress = goalProgress(goal); return <article key={goal.goalKey} className="card min-w-0 space-y-3 p-5">
      <h3 className="break-words font-bold">{goal.title}</h3>
      <p>موعد: <time dateTime={goal.targetOn}>{formatJalali(goal.targetOn)}</time></p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>مبلغ هدف</dt><dd><bdi>{formatToman(goal.targetAmountToman)}</bdi></dd></div><div><dt>کنارگذاشته‌شدهٔ اظهارشده</dt><dd><bdi>{goal.declaredSavedToman === null ? "نامعلوم" : formatToman(goal.declaredSavedToman)}</bdi></dd></div><div><dt>باقی‌مانده بر پایهٔ اظهار شما</dt><dd><bdi>{progress.remainingToman === null ? "نامعلوم" : formatToman(progress.remainingToman)}</bdi></dd></div><div><dt>پیشرفت اظهارشده</dt><dd>{progress.progressPercent === null ? "نامعلوم" : `${toPersianDigits(Number(progress.progressPercent.toFixed(1)))}٪`}</dd></div></dl>
      {goal.source && <p className="break-words text-sm">منبع اظهار: {goal.source.label} · تاریخ مشاهده: <time dateTime={goal.source.observedOn}>{formatJalali(goal.source.observedOn)}</time></p>}
      {goal.note && <p className="whitespace-pre-wrap break-words text-sm leading-7">{goal.note}</p>}
    </article>; })}
  </section>;
}
