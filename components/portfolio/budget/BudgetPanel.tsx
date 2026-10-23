import React from "react";
import type { CashFlowRead } from "@/lib/portfolio/cashFlowApiContract";
import { buildBudget, type BudgetAmount, type BudgetRow } from "@/lib/portfolio/budget";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";

const money = (value: number | null) => value === null ? "نامعلوم" : formatToman(value);
function Amount({ value }: { value: BudgetAmount }) {
  return <><bdi className="font-bold">{money(value.totalToman ?? value.knownToman)}</bdi>{value.totalToman === null && value.knownToman !== null && <span className="block text-xs leading-6">فقط مبلغ ثبت‌شده؛ جمع نهایی نامعلوم</span>}</>;
}
function Row({ row, total = false }: { row: BudgetRow; total?: boolean }) {
  return <article className="rounded-xl border border-line p-4">
    <h4 className="font-bold">{total ? `جمع ${row.kind === "income" ? "درآمد" : "هزینه"}` : row.category ?? "بدون دسته‌بندی"}</h4>
    <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      <div><dt className="mb-1 text-muted">برنامهٔ دوره</dt><dd><Amount value={row.planned} /></dd></div>
      <div><dt className="mb-1 text-muted">عملکرد واقعی</dt><dd><Amount value={row.actual} /></dd></div>
      <div><dt className="mb-1 text-muted">{row.kind === "expense" ? "باقی‌مانده از بودجه" : "اختلاف تحقق درآمد"}</dt><dd><bdi className="font-bold">{money(row.differenceToman)}</bdi>{row.differenceToman !== null && row.differenceToman < 0 && <span className="block text-xs leading-6">{row.kind === "expense" ? "هزینه بیشتر از برنامه است" : "درآمد کمتر از برنامه است"}</span>}</dd></div>
    </dl>
    {!total && row.sources.length > 0 && <details className="mt-3 text-xs leading-6"><summary className="cursor-pointer">منابع ردیف‌های این دسته</summary><ul className="mt-2 space-y-1">{row.sources.map((source, index) => <li key={index} className="break-words">{source.label} · تاریخ مشاهده: <time dateTime={source.observedOn}>{formatJalali(source.observedOn)}</time></li>)}</ul></details>}
  </article>;
}

export default function BudgetPanel({ data, stale = false, dirty = false }: { data: CashFlowRead; stale?: boolean; dirty?: boolean }) {
  const snapshot = data.snapshot;
  const report = snapshot ? buildBudget({ period: snapshot.payload.period, scope: { ownerId: data.ownerId, accountKeys: snapshot.payload.scopeAccountKeys },
    readState: stale ? "unavailable" : "ready", opening: snapshot.payload.opening, coverage: snapshot.payload.coverage,
    entries: snapshot.payload.entries.map(entry => ({ ...entry, ownerId: data.ownerId })) }) : null;
  return <section id="period-budget" aria-label="بودجهٔ دوره" className="card min-w-0 scroll-mt-6 space-y-4 p-5">
    <h2 className="font-display text-xl font-bold">بودجهٔ دوره: برنامه در برابر عملکرد</h2>
    <p className="text-sm leading-7">برای بودجه، درآمد و هزینهٔ مورد انتظار را در فرم پایین با وضعیت «برنامه‌ریزی‌شده» و پرداخت‌ها را جدا با وضعیت «واقعی» ثبت کنید؛ نام دسته‌ها را یکسان بنویسید. انتقال بین حساب‌ها درآمد یا هزینه نیست و در این مقایسه نمی‌آید.</p>
    <p className="text-sm leading-7">باقی‌ماندهٔ هزینه = برنامه منهای واقعی؛ اختلاف درآمد = واقعی منهای برنامه. این اعداد موجودی قابل خرج نیستند. مقایسهٔ قطعی فقط با پوشش کامل و اطلاعات معتبر هر دو بخش نمایش داده می‌شود.</p>
    {!snapshot && <p role="status">بودجه‌ای برای این دوره ثبت نشده است؛ نبود اطلاعات به معنی بودجهٔ صفر نیست.</p>}
    {snapshot && <p className="text-sm leading-7">مبنا: نسخهٔ {toPersianDigits(snapshot.version)} جریان نقد، ثبت‌شده در <time dateTime={snapshot.createdAt}>{formatJalali(snapshot.createdAt)}</time>؛ دورهٔ <time dateTime={data.period.startOn}>{formatJalali(data.period.startOn)}</time> تا <time dateTime={data.period.endOn}>{formatJalali(data.period.endOn)}</time>. {data.latest.state === "ready" && data.latest.version !== snapshot.version ? "این نسخه تاریخی و فقط خواندنی است." : ""}</p>}
    {dirty && <p role="status" className="text-sm leading-7">فرم تغییر کرده است؛ بودجهٔ زیر هنوز از نسخهٔ ذخیره‌شده خوانده می‌شود و پیش‌نویس را شامل نمی‌شود.</p>}
    {stale && <p role="alert">خواندن تازه تأیید نشده است؛ محاسبهٔ بودجه تا بازخوانی موفق نمایش داده نمی‌شود.</p>}
    {report && !stale && <>
      {report.missingCategory && <p role="status" className="text-sm leading-7">بعضی ردیف‌ها دسته‌بندی ندارند؛ تا اصلاح آن‌ها، مقایسهٔ قطعی دسته‌ها نامعلوم می‌ماند.</p>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">{report.totals.map(row => <Row key={row.kind} row={row} total />)}</div>
      {(["expense", "income"] as const).map(kind => <div key={kind} className="space-y-3"><h3 className="font-bold">{kind === "expense" ? "دسته‌های هزینه" : "دسته‌های درآمد"}</h3>{report.rows.filter(row => row.kind === kind).length === 0 ? <p className="text-sm">ردیفی در این بخش ثبت نشده است.</p> : report.rows.filter(row => row.kind === kind).map(row => <Row key={JSON.stringify(row.category)} row={row} />)}</div>)}
    </>}
    <a href="#cashflow-editor" className="btn btn-outline">ثبت یا اصلاح برنامه و عملکرد در فرم جریان نقد</a>
  </section>;
}
