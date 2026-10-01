import Link from "next/link";
import { formatToman, formatJalali, toPersianDigits } from "@/lib/format";
import type { valuePositions } from "@/lib/portfolio/valuation";
export default function HoldingsSummary({ valuation, version, pricesFailed = false }: { valuation: ReturnType<typeof valuePositions>; version: number | null; pricesFailed?: boolean }) {
  return <section className="card p-5 space-y-4" aria-label="ارزش دارایی‌های ثبت‌شده">
    <h2 className="font-display text-xl font-bold">دارایی‌های من {version !== null && `· نسخهٔ ${toPersianDigits(version)}`}</h2>
    <p className="text-sm leading-7">نسخه یعنی یک ثبت ثابت از اقلام شما؛ اصلاح، نسخهٔ تازه می‌سازد و قبلی حفظ می‌شود. ارزش اقلام ثبت‌شده با کل ثروت شما یکسان فرض نمی‌شود.</p>
    {pricesFailed && <p role="alert">دریافت قیمت‌ها انجام نشد. ارزش‌گذاری قابل تأیید نیست.</p>}
    {valuation.positions.length === 0 ? <p>هنوز نسخه‌ای از دارایی‌ها ثبت نکرده‌اید.</p> : <>
      <p className="font-bold">{valuation.totalValue !== null ? `ارزش اقلام ثبت‌شده با پوشش کامل قیمت: ${formatToman(Math.round(valuation.totalValue))}` : "ارزش‌گذاری قابل تأیید نیست؛ پوشش قیمت ناقص است."}</p>
      {valuation.totalValue === null && valuation.subtotal !== null && <p>جمع اقلام دارای قیمت معتبر: {formatToman(Math.round(valuation.subtotal))}</p>}
      <ul className="space-y-4">{valuation.positions.map(p => <li key={p.position.positionKey} className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap justify-between gap-2"><span className="font-bold">{p.position.symbol ? <Link className="underline" href={`/symbol/${encodeURIComponent(p.position.symbol)}`}>{p.position.symbol}</Link> : p.position.manualLabel}</span><span>{toPersianDigits(p.position.qty)} {p.position.unit}</span></div>
        <p className="text-sm leading-7">{p.price ? `قیمت هر ${p.price.unit}: ${formatToman(Math.round(p.price.toman))} · منبع: ${p.price.source} · تاریخ قیمت: ${formatJalali(p.price.asOf)}` : "قیمت معتبر موجود نیست؛ قیمت قلم دستی یا دارایی فاقد منبع حدس زده نمی‌شود."}</p>
        <p className="text-sm">ارزش: {p.value === null ? "در دسترس نیست" : formatToman(Math.round(p.value))} · سهم از ارزش ثبت‌شده: {p.weightPct === null ? "نامعلوم" : `${toPersianDigits(p.weightPct.toFixed(1))}٪`}</p>
      </li>)}</ul>
    </>}
    <Link href="/dashboard/holdings" className="btn btn-outline min-h-11">ثبت و بازکردن دارایی‌ها</Link>
    <Link href="/market" className="btn btn-outline min-h-11 mr-2">اطلاعات بازار</Link>
    <p className="text-xs leading-7">قیمت‌های این بخش قیمت ثبت‌شدهٔ روز معاملاتی‌اند؛ ادعای قیمت لحظه‌ای یا سود سرمایه‌گذاری ندارند.</p>
  </section>;
}
