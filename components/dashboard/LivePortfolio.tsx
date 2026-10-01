import Link from "next/link";
import { formatToman, formatJalali, toPersianDigits } from "@/lib/format";
import { snapshotValueChange, type ValueSnapshot } from "@/lib/portfolio/valuation";
import type { SectionStates } from "@/lib/read-state";
import ReadError from "./ReadError";
export interface HoldingDB { id: string; symbol: string; name: string; asset_class: string; qty: number; avg_price: number; current_price: number; day_change_pct: number }
export type SnapshotDB = ValueSnapshot;
export interface TxDB { id: string; type: string; instrument: string | null; amount: number; occurred_at: string; status: string }
interface Props { holdings: HoldingDB[]; snapshots: SnapshotDB[]; transactions: TxDB[]; sections: SectionStates }
export default function LivePortfolio({ holdings, snapshots, transactions, sections }: Props) {
  const change = sections.snapshots?.status === "error" ? null : snapshotValueChange(snapshots);
  return <div className="space-y-5">
    <h2 className="font-display text-xl font-bold">دارایی‌های ثبت‌شدهٔ قبلی</h2>
    <p className="text-sm leading-7">این اطلاعات از جدول قدیمی خوانده شده است. ثبت و نمایش اصلی دارایی‌ها در <Link href="/dashboard/holdings" className="underline">دارایی‌های من</Link> انجام می‌شود؛ انتقال خودکار انجام نشده است.</p>
    {sections.holdings?.status === "error" ? <ReadError label="دارایی‌های قبلی" code={sections.holdings.code} /> : holdings.length === 0 ?
      <p className="card p-5">در جدول قبلی دارایی ثبت نشده است.</p> : <>
        <p className="card p-5">ارزش‌گذاری قابل تأیید نیست: قیمت‌های قبلی زمان و منبع معتبر ندارند.</p>
        <ul className="card p-5 space-y-3">{holdings.map(h => <li key={h.id} className="flex flex-wrap justify-between gap-2">
          <span>{h.symbol} · {h.name}</span><span>مقدار ثبت‌شده: {Number.isFinite(h.qty) ? toPersianDigits(h.qty) : "نامعتبر"} · قیمت و ارزش: در دسترس نیست</span>
        </li>)}</ul>
      </>}
    {sections.snapshots?.status === "error" && <ReadError label="تاریخچهٔ ارزش" code={sections.snapshots.code} />}
    {change && <p className="card p-5">تغییر ارزش ثبت‌شده از {formatJalali(change.from)} تا {formatJalali(change.to)}: {formatToman(change.change)}. این مقدار شامل اثر ورود و خروج دارایی است.</p>}
    <p className="text-sm leading-7" style={{ color: "var(--text-3)" }}>بازده و سود دوره در دسترس نیست؛ جریان کامل واریز و برداشت ثبت نشده است. سود یا زیان امروز نیز بدون ارزش معتبر ابتدای روز و تغییر مقدار قابل محاسبه نیست.</p>
    {sections.transactions?.status === "error" ? <ReadError label="فعالیت‌های اخیر" code={sections.transactions.code} /> : transactions.length > 0 &&
      <div className="card p-5"><h3 className="font-bold mb-3">فعالیت‌های اخیر</h3><p className="text-xs mb-3">حداکثر پنج مورد اخیر؛ این فهرست تاریخچهٔ کامل جریان نقد نیست.</p>
        <ul className="space-y-3">{transactions.map(t => <li key={t.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{t.instrument ?? "—"}</span><span>{Number.isFinite(t.amount) ? formatToman(t.amount) : "—"} · {formatJalali(t.occurred_at)}</span></li>)}</ul>
      </div>}
  </div>;
}
