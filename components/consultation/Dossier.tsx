import React from "react";
import type { ConsultationDossier } from "@/lib/consultation/contracts";
import { cashFlowReport } from "@/lib/portfolio/cashFlowApiContract";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import CashFlowSummary from "@/components/portfolio/cashflow/CashFlowSummary";
import GoalsSummary from "@/components/portfolio/goals/GoalsSummary";

export default function Dossier({ data, ownerId }: { data: ConsultationDossier; ownerId: string }) {
  return <section className="min-w-0 space-y-4" aria-label="پروندهٔ مالی فقط خواندنی">
    <header className="space-y-2"><h2 className="font-display text-xl font-bold">پروندهٔ مالی مبنای بررسی</h2><p className="text-sm leading-7">این داده‌ها از نسخه‌های ثبت‌شدهٔ عضو خوانده شده‌اند. اصلاح مالی در دفتر خود عضو انجام می‌شود. نبود نسخه یا ارزش‌گذاری، صفر نیست.</p></header>
    <details className="card min-w-0 p-4" open><summary className="cursor-pointer font-bold">دارایی و بدهی {data.holdings ? `· نسخهٔ ${toPersianDigits(data.holdings.version)}` : "· نسخه‌ای ثبت نشده"}</summary>
      {data.holdings && <div className="mt-4 space-y-4"><h3 className="font-bold">اقلام دارایی</h3>{data.holdings.positions.length === 0 && <p className="text-sm">در این نسخه قلم دارایی ثبت نشده است؛ کل دارایی عضو صفر فرض نمی‌شود.</p>}
        {data.holdings.positions.map(position => <article key={position.key} className="min-w-0 space-y-2 border-b border-line pb-3 text-sm"><h4 className="break-words font-bold">{position.title}</h4><p>مقدار: <bdi>{position.quantity === null ? "نامعلوم" : toPersianDigits(position.quantity)}</bdi> {position.unit} · مالکیت: {toPersianDigits(position.ownershipPercent)}٪</p><p>ارزش اظهارشده: {position.declaredValueToman === null ? "نامعلوم؛ قیمت بازار در این پرونده محاسبه نشده" : formatToman(position.declaredValueToman)}</p><p className="break-words">منبع: {position.source ?? "نامعلوم"} · تاریخ: {position.asOf ? formatJalali(position.asOf) : "نامعلوم"}</p></article>)}
        <h3 className="font-bold">بدهی‌های ثبت‌شده</h3>{data.holdings.debts.length === 0 && <p className="text-sm">در این نسخه بدهی ثبت نشده است؛ به معنی نداشتن بدهی نیست.</p>}
        {data.holdings.debts.map(debt => <article key={debt.key} className="space-y-2 border-b border-line pb-3 text-sm"><h4 className="break-words font-bold">{debt.title}</h4><p>مانده: {formatToman(debt.balanceToman)} · {formatJalali(debt.balanceAsOf)}</p><p>قسط بعدی: {debt.nextInstallmentToman === null ? "نامعلوم" : formatToman(debt.nextInstallmentToman)} · موعد: {debt.nextDueOn ? formatJalali(debt.nextDueOn) : "نامعلوم"}</p></article>)}
      </div>}
    </details>
    <details className="card min-w-0 p-4"><summary className="cursor-pointer font-bold">جریان نقد {data.cashFlow ? `· نسخهٔ ${toPersianDigits(data.cashFlow.version)}` : "· این دوره نسخه ندارد"}</summary><div className="mt-4">{data.cashFlow ? <CashFlowSummary report={cashFlowReport(data.cashFlow.payload, ownerId)} /> : <p className="text-sm">در دورهٔ انتخابی نسخه ثبت نشده است؛ درآمد، هزینه و ظرفیت پس‌انداز نامعلوم‌اند.</p>}</div></details>
    <details className="card min-w-0 p-4"><summary className="cursor-pointer font-bold">هدف‌های مالی {data.goals ? `· نسخهٔ ${toPersianDigits(data.goals.version)}` : "· نسخه‌ای ثبت نشده"}</summary><div className="mt-4">{data.goals ? <GoalsSummary goals={data.goals.payload.goals} /> : <p className="text-sm">هنوز نسخه‌ای از هدف‌های عضو ثبت نشده است.</p>}</div></details>
  </section>;
}
