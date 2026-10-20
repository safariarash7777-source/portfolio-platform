import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import type { DebtPosition } from "@/lib/portfolio/balanceSheet";
import { buildRecordedPayments } from "@/lib/portfolio/paymentSchedule";

export default function DebtSchedule({ debts, ready, version, referenceDay, historical = false }: {
  debts: readonly DebtPosition[]; ready: boolean; version: number | null; referenceDay: string | null; historical?: boolean;
}) {
  const schedule = buildRecordedPayments({ debts, ready, recorded: version !== null, referenceDay });
  return <section className="card p-5 space-y-4" aria-label="اقساط بعدی ثبت‌شده">
    <h2 className="font-display text-lg font-bold">اقساط بعدیِ ثبت‌شده {version !== null && `· نسخهٔ ${toPersianDigits(version)}`}</h2>
    <p className="text-sm leading-7">برای هر بدهی فقط همان قسط بعدیِ ثبت‌شده آمده است. پرداخت‌شدن قسط و موعد تکرار بعدی از این فهرست معلوم نیست.</p>
    {historical && <p role="status" className="text-sm leading-7">این فهرست مربوط به نسخهٔ قبلی است؛ وضعیت پرداخت امروز را نشان نمی‌دهد.</p>}
    {schedule.status === "unavailable" ? <p role="alert">اطلاعات اقساط ناقص است؛ دریافت بدهی‌ها انجام نشد. جمع یا موعدی تأیید نمی‌شود.</p>
      : schedule.status === "unrecorded" ? <p>پس از ثبت نخستین تصویر مالی، اقساط همان نسخه اینجا دیده می‌شوند.</p>
      : schedule.status === "empty" ? <p>در این نسخه بدهی ثبت نشده است؛ از این فهرست نمی‌توان نداشتن تعهد مالی را نتیجه گرفت.</p>
      : <>
        <p className="font-bold">جمع مبالغ اقساط معلوم: {schedule.knownAmountTotal === null ? "قابل محاسبه نیست" : formatToman(schedule.knownAmountTotal)}</p>
        <p className="text-xs leading-6">این جمع فقط مبلغ یک قسط بعدی برای هر بدهی را پوشش می‌دهد. خالص ثروت از ماندهٔ بدهی محاسبه می‌شود؛ مبلغ این قسط جداگانه دوباره کسر نمی‌شود.</p>
        {schedule.incompleteCount > 0 && <p role="alert" className="text-sm leading-7">برای {toPersianDigits(schedule.incompleteCount)} بدهی، مبلغ یا موعد معتبر قسط بعدی مشخص نیست. جمع بالا فقط مبالغ معلوم را پوشش می‌دهد.</p>}
        {schedule.overflow && <p role="alert">جمع مبالغ خارج از محدودهٔ قابل محاسبه است؛ مبلغ‌های ثبت‌شده جداگانه حفظ شده‌اند.</p>}
        {!schedule.referenceKnown && <p role="alert">مقایسهٔ موعدها با امروز ممکن نیست؛ تاریخ‌های ثبت‌شده حفظ شده‌اند.</p>}
        <ul className="space-y-3">{schedule.items.map((item, index) => <li key={`${item.debtKey}-${index}`} className="rounded-xl border p-3 min-w-0 space-y-2 break-words" style={{ borderColor: "var(--line)" }}>
          <p className="font-bold">{item.title}</p>
          <p>قسط بعدی: {item.amountToman === null ? "مبلغ معلوم نیست" : formatToman(item.amountToman)}</p>
          <p>موعد: {item.dueOn === null ? "موعد معتبر ثبت نشده" : <time dateTime={item.dueOn}>{formatJalali(item.dueOn)}</time>}</p>
          {item.relation === "past" && <p className="text-xs leading-6">موعد ثبت‌شده گذشته؛ وضعیت پرداخت نامعلوم است.</p>}
          {item.relation === "today" && <p className="text-xs">موعد ثبت‌شده امروز است؛ وضعیت پرداخت نامعلوم است.</p>}
        </li>)}</ul>
      </>}
    <a className="btn btn-outline" href="#debt-editor">{historical || !ready ? "مشاهدهٔ بخش بدهی این نسخه" : "ثبت یا اصلاح مبلغ و موعد قسط"}</a>
  </section>;
}
