import React from "react";
import type { CashFlowLane, CashFlowReport } from "@/lib/portfolio/cashFlow";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";

const stateLabel: Record<CashFlowLane["state"], string> = {
  complete: "پوشش کاملِ اعلام‌شده", partial: "اطلاعات جزئی", unknown: "پوشش نامعلوم",
  unavailable: "خواندن انجام نشد", invalid: "دوره یا محدوده معتبر نیست",
};
const amount = (value: number | null) => value === null ? "نامعلوم" : formatToman(value);
// Calendar days remain days; noon avoids turning a date-only value into yesterday.
const day = (value: string) => formatJalali(`${value}T12:00:00Z`);

function Lane({ label, lane }: { label: string; lane: CashFlowLane }) {
  const rows = [
    ["درآمد در اقلام معلوم", lane.incomeKnown], ["هزینه در اقلام معلوم", lane.expenseKnown],
    ["انتقال ورودی از بیرون محدوده", lane.transferInKnown], ["انتقال خروجی به بیرون محدوده", lane.transferOutKnown],
    ["خالص در اقلام معلوم", lane.knownNet], ["خالص با پوشش کامل", lane.netToman], ["ماندهٔ پایان دوره", lane.closingToman],
  ] as const;
  return <section className="card p-5 space-y-4" aria-label={label}>
    <h3 className="font-display text-xl font-bold">{label}</h3>
    <p className="text-sm font-bold">{stateLabel[lane.state]}</p>
    {lane.state !== "complete" && <p className="text-sm leading-7">اقلام معلوم حفظ شده‌اند؛ جمع آن‌ها کل جریان این دوره نیست. نبود مبلغ یا رکورد به معنی صفر نیست.</p>}
    <dl className="space-y-3">{rows.map(([title, value]) => <div key={title} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2" style={{ borderColor: "var(--line)" }}>
      <dt className="text-sm">{title}</dt><dd className="font-bold"><bdi>{amount(value)}</bdi></dd>
    </div>)}</dl>
    <p className="text-xs leading-7">{toPersianDigits(lane.includedEntries)} رویداد در محدوده و دوره؛ {toPersianDigits(lane.internalTransfers)} انتقال داخلی. انتقال بین دو حساب انتخاب‌شده درآمد یا هزینه نیست و خالص آن صفر است.</p>
    {lane.closingState !== "known" && <p className="text-xs leading-7">ماندهٔ پایان قطعی نیست؛ {lane.closingState === "opening_unknown" ? "موجودی افتتاحیه نامعلوم است." : lane.closingState === "opening_invalid" ? "منبع یا تاریخ موجودی افتتاحیه معتبر نیست." : lane.closingState === "unsafe" ? "جمع از محدودهٔ محاسبهٔ دقیق خارج است." : "پوشش جریان کامل یا معتبر نیست."}</p>}
  </section>;
}

/** Presentation only. All totals and unknown states come from the canonical kernel. */
export default function CashFlowSummary({ report }: { report: CashFlowReport }) {
  return <section aria-label="خلاصهٔ جریان نقد ثبت‌شده" className="space-y-4">
    <h2 className="font-display text-xl font-bold">برنامه و واقعیتِ دوره</h2>
    {report.period && <p className="text-sm leading-7">از <time dateTime={report.period.startOn}>{day(report.period.startOn)}</time> تا <time dateTime={report.period.endOn}>{day(report.period.endOn)}</time>، با احتساب هر دو روز؛ فقط حساب‌های انتخاب‌شده.</p>}
    <p className="text-sm leading-7">همهٔ مبلغ‌ها تومان‌اند. موجودی ابتدای دوره: <bdi className="font-bold">{amount(report.opening.amountToman)}</bdi>. این موجودی درآمد نیست؛ مبلغ برنامه‌ریزی‌شده نیز پرداخت واقعی نیست.</p>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Lane label="برنامه‌ریزی‌شده" lane={report.planned} /><Lane label="واقعی" lane={report.actual} /></div>
    <p className="card p-4 text-sm leading-7">اختلاف خالص واقعی منهای برنامه: <bdi className="font-bold">{amount(report.actualMinusPlanned)}</bdi>. این اختلاف فقط با خالص قطعی هر دو بخش محاسبه می‌شود؛ صفر با نامعلوم یکسان نیست.</p>
  </section>;
}
