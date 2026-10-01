import Link from "next/link";
import { formatToman, formatJalali, toPersianDigits } from "@/lib/format";
import type { valuePositions } from "@/lib/portfolio/valuation";
export default function HoldingsSummary({ valuation, version, pricesFailed = false, readOnly = false }: { valuation: ReturnType<typeof valuePositions>; version: number | null; pricesFailed?: boolean; readOnly?: boolean }) {
  return <section className="card p-5 space-y-4" aria-label="ارزش دارایی‌های ثبت‌شده">
    <h2 className="font-display text-xl font-bold">{readOnly ? "دارایی‌های پرونده" : "دارایی‌های من"} {version !== null && `· نسخهٔ ${toPersianDigits(version)}`}</h2>
    <p className="text-sm leading-7">نسخه یعنی یک ثبت ثابت از اقلام شما؛ اصلاح، نسخهٔ تازه می‌سازد و قبلی حفظ می‌شود. ارزش اقلام ثبت‌شده با کل ثروت شما یکسان فرض نمی‌شود.</p>
    {pricesFailed && <p role="alert">دریافت قیمت‌ها انجام نشد. ارزش‌گذاری قابل تأیید نیست.</p>}
    {valuation.positions.length === 0 ? <p>هنوز نسخه‌ای از دارایی‌ها ثبت نکرده‌اید.</p> : <>
      <p className="font-bold">{valuation.totalValue !== null ? `ارزش دارایی‌های دارای ارزش‌گذاری: ${formatToman(Math.round(valuation.totalValue))}` : "ارزش‌گذاری همهٔ اقلام موجود نیست؛ جمع دارایی‌ها جزئی است."}</p>
      {valuation.totalValue === null && valuation.subtotal !== null && <p>جمع اقلام دارای ارزش‌گذاری: {formatToman(Math.round(valuation.subtotal))}</p>}
      {valuation.estimatedCount > 0 && <p role="alert">این جمع شامل {toPersianDigits(valuation.estimatedCount)} ارزش‌گذاری تخمینی است.</p>}
      <ul className="space-y-4">{valuation.positions.map(p => <li key={p.position.positionKey} className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap justify-between gap-2"><span className="font-bold">{p.position.title && `${p.position.title} · `}{p.position.symbol ? <Link className="underline" href={`/symbol/${encodeURIComponent(p.position.symbol)}`}>{p.position.symbol}</Link> : p.position.manualLabel}</span><span>{p.position.qty === null ? "فقط ارزش اظهارشده" : `${toPersianDigits(p.position.qty)} ${p.position.unit}`}</span></div>
        <p className="text-sm leading-7">{p.price ? `${p.price.basis === "total" ? "ارزش اظهارشدهٔ کل قلم" : `قیمت هر ${p.price.unit}`}: ${formatToman(Math.round(p.price.toman))} · منبع: ${p.price.source} · تاریخ ارزش‌گذاری: ${formatJalali(p.price.asOf)} · وضعیت: ${p.price.status === "estimated" ? "تخمینی" : "معتبر طبق منبع ثبت‌شده"}` : "قیمت ناموجود؛ این قلم حفظ شده و ارزش آن صفر فرض نشده است."}</p>
        <p className="text-sm">مالکیت شما: {toPersianDigits(p.position.ownershipPct ?? 100)}٪ · ارزش سهم شما: {p.value === null ? "نامعلوم" : formatToman(Math.round(p.value))} · سهم از ارزش ثبت‌شده: {p.weightPct === null ? "نامعلوم" : `${toPersianDigits(p.weightPct.toFixed(1))}٪`}</p>
      </li>)}</ul>
    </>}
    {!readOnly && <Link href="/dashboard/holdings" className="btn btn-outline min-h-11">ثبت و بازکردن دارایی و بدهی</Link>}
    <Link href="/market" className="btn btn-outline min-h-11 mr-2">اطلاعات بازار</Link>
    <p className="text-xs leading-7">ارزش‌ها به منبع و تاریخ هر قلم وابسته‌اند. قیمت بازار مربوط به روز معاملاتی ثبت‌شده است؛ ارزش اظهارشده مطابق منبع خودتان است. این ارقام، سود سرمایه‌گذاری نیستند.</p>
  </section>;
}
