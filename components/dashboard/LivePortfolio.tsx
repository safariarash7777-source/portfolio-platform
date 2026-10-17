import KpiCard from "./KpiCard";
import AllocationDonut from "./AllocationDonut";
import PerformanceChart from "./PerformanceChart";
import HoldingsTable from "./HoldingsTable";
import { Wallet } from "lucide-react";
import { formatTomanShort, formatToman, formatJalali, formatSignedPercent, toPersianDigits } from "@/lib/format";
import ReadError from "./ReadError";

export interface HoldingDB {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  qty: number;
  avg_price: number;
  current_price: number;
  day_change_pct: number;
}
export interface SnapshotDB { as_of: string; value: number }
export interface TxDB {
  id: string;
  type: string;
  instrument: string | null;
  amount: number;
  occurred_at: string;
  status: string;
}

interface Props {
  holdings: HoldingDB[];
  snapshots: SnapshotDB[];
  transactions: TxDB[];
  readErrors?: Partial<Record<"holdings" | "snapshots" | "transactions", boolean>>;
}

const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Legacy holdings/performance only; never merged with the versioned balance sheet. */
export default function LivePortfolio({ holdings, snapshots, transactions, readErrors = {} }: Props) {
  const emptyState = !readErrors.holdings && !readErrors.snapshots && holdings.length === 0 && snapshots.length === 0 ? (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
             style={{ width: 56, height: 56, background: "var(--gold-tint)", color: "var(--navy-deep)" }}>
          <Wallet size={24} />
        </div>
        <h3 className="font-display font-bold text-lg mb-2" style={{ color: "var(--navy-deep)" }}>
          سوابق قبلی سبد هنوز خالی است
        </h3>
        <p className="text-sm leading-7 max-w-sm mx-auto" style={{ color: "var(--text-2)" }}>
          این بخش سوابق قبلی سبد را نشان می‌دهد. برای ثبت و اصلاح دارایی و بدهی خود، از پروندهٔ مالی بالای صفحه استفاده کنید؛ ثبت‌های نسخه‌دار به این سوابق تبدیل نمی‌شوند.
        </p>
      </div>
    ) : null;

  const withValue = holdings.map((h) => ({ ...h, value: h.qty * h.current_price }));
  const valuesKnown = holdings.length > 0 && withValue.every(h => nonnegative(h.qty) && nonnegative(h.current_price) && nonnegative(h.value));
  const totalCandidate = valuesKnown ? withValue.reduce((s, h) => s + h.value, 0) : null;
  const total = totalCandidate !== null && nonnegative(totalCandidate) ? totalCandidate : null;
  const dayPnlCandidate = valuesKnown && withValue.every(h => Number.isFinite(h.day_change_pct))
    ? withValue.reduce((s, h) => s + (h.value * h.day_change_pct) / 100, 0) : null;
  const dayPnl = dayPnlCandidate !== null && Number.isFinite(dayPnlCandidate) ? dayPnlCandidate : null;
  const dayChangeCandidate = total !== null && total > 0 && dayPnl !== null ? (dayPnl / total) * 100 : null;
  const dayChangePct = dayChangeCandidate !== null && Number.isFinite(dayChangeCandidate) ? dayChangeCandidate : null;

  const seriesKnown = snapshots.every(s => nonnegative(s.value));
  const periodCandidate =
    seriesKnown && snapshots.length >= 2 && snapshots[0].value > 0
      ? ((snapshots[snapshots.length - 1].value - snapshots[0].value) / snapshots[0].value) * 100
      : null;
  const periodReturn = periodCandidate !== null && Number.isFinite(periodCandidate) ? periodCandidate : null;

  // allocation grouped by asset class
  const byClass = new Map<string, number>();
  for (const h of withValue) byClass.set(h.asset_class, (byClass.get(h.asset_class) ?? 0) + h.value);
  const allocation = [...byClass.entries()].map(([label, value]) => ({ label, value }));

  const holdingRows = withValue.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    qty: h.qty,
    price: h.current_price,
    value: h.value,
    dayChangePct: h.day_change_pct,
    weight: total !== null && total > 0 ? +((h.value / total) * 100).toFixed(1) : 0,
  }));

  const perf = snapshots.map((s) => ({ date: s.as_of, value: s.value }));

  return (
    <div className="space-y-5">
      {emptyState ?? <>
      <div>
        <span className="eyebrow">سوابق قبلی سبد</span>
        <h2 className="font-display text-xl md:text-2xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          دارایی و عملکرد ثبت‌شده در سوابق قبلی
        </h2>
        <p className="text-sm leading-7 mt-2" style={{ color: "var(--text-3)" }}>این سوابق از ثبت‌های نسخه‌دار دارایی و بدهی بالای صفحه جداست. ارقام این بخش، خالص ثروت یا ارزش کل دارایی‌های شما نیست.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!readErrors.holdings && <KpiCard label="ارزش ثبت‌شدهٔ دارایی" value={total === null ? "نامشخص" : formatTomanShort(total)} />}
        {!readErrors.snapshots && (!readErrors.holdings || snapshots.length > 0) && <KpiCard label="بازده دوره" value={periodReturn === null ? "نامشخص" : formatSignedPercent(periodReturn)} hint={periodReturn === null ? "برای بازده، حداقل دو ثبت معتبر با مقدار آغازین مثبت لازم است." : "بر اساس روند ثبت‌شدهٔ قبلی"} />}
        {!readErrors.holdings && <KpiCard label="سود/زیان ثبت‌شدهٔ روز" value={dayPnl === null ? "نامشخص" : formatToman(Math.round(dayPnl))} delta={dayChangePct ?? undefined} />}
        {!readErrors.holdings && <KpiCard label="تعداد دارایی" value={toPersianDigits(holdings.length)} hint="نماد فعال در سبد" />}
      </div>

      {/* Donut + performance */}
      <div className="grid gap-5 lg:grid-cols-3">
        {readErrors.holdings ? <ReadError label="دارایی‌ها" code="DASHBOARD_HOLDINGS" /> : <div className="card p-5 lg:col-span-1">
          <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
            تخصیص دارایی
          </h3>
          {total !== null && total > 0 ? <AllocationDonut data={allocation} centerLabel="ارزش ثبت‌شده" centerValue={formatTomanShort(total)} /> : <p className="text-sm">اطلاعات کافی برای نمایش ترکیب دارایی در سوابق قبلی موجود نیست.</p>}
        </div>}
        <div className="lg:col-span-2">
          {readErrors.snapshots ? <ReadError label="روند ارزش سبد" code="DASHBOARD_SNAPSHOTS" /> : seriesKnown && (snapshots.length < 2 || periodReturn !== null)
            ? <PerformanceChart data={perf} />
            : <div className="card p-5 space-y-3">
              <h3 className="font-display font-bold text-lg">ثبت‌های ارزش در سوابق قبلی</h3>
              <p role="status" className="text-sm leading-7">{!seriesKnown ? "بخشی از مقادیر ثبت‌شده نامعتبر است؛ نمودار و بازده قابل تأیید نیست." : snapshots[0]?.value === 0 ? "ثبت آغازین صفر است؛ درصد بازده از این مبنا قابل محاسبه نیست. ثبت‌های ارزش حفظ شده‌اند." : "نسبت تغییر این مقادیر قابل محاسبه نیست؛ نمودار درصدی نمایش داده نمی‌شود و ثبت‌های ارزش حفظ شده‌اند."}</p>
              <ul className="text-sm space-y-2">{snapshots.map((s, i) => <li key={`${s.as_of}-${i}`}>{formatJalali(s.as_of)} · ارزش ثبت‌شده: {nonnegative(s.value) ? formatToman(s.value) : "نامشخص"}</li>)}</ul>
            </div>}
        </div>
      </div>

      {/* Holdings */}
      {!readErrors.holdings && holdingRows.length > 0 && (valuesKnown && total !== null && total > 0 && withValue.every(h => Number.isFinite(h.day_change_pct))
        ? <HoldingsTable rows={holdingRows} />
        : <div className="card p-5 space-y-4">
          <h3 className="font-display font-bold text-lg">اقلام ثبت‌شده در سوابق قبلی</h3>
          <p role="status" className="text-sm leading-7">اطلاعات معتبر برای نمایش همهٔ جمع‌ها و درصدها موجود نیست. اقلام حذف نشده‌اند؛ هر مقدار ناموجود یا نامعتبر «نامشخص» می‌ماند.</p>
          <ul className="space-y-4">{withValue.map(h => {
            const valueKnown = nonnegative(h.qty) && nonnegative(h.current_price) && nonnegative(h.value);
            return <li key={h.id} className="border-t pt-3 space-y-2" style={{ borderColor: "var(--line)" }}>
              <p className="font-bold">{h.symbol} · {h.name}</p>
              <p className="text-sm">تعداد: {nonnegative(h.qty) ? toPersianDigits(h.qty) : "نامشخص"} · قیمت ثبت‌شده: {nonnegative(h.current_price) ? formatToman(h.current_price) : "نامشخص"}</p>
              <p className="text-sm">ارزش ثبت‌شده: {valueKnown ? formatToman(h.value) : "نامشخص"} · تغییر روز: {Number.isFinite(h.day_change_pct) ? formatSignedPercent(h.day_change_pct) : "نامشخص"} · وزن: {valueKnown && total !== null && total > 0 ? `${toPersianDigits(((h.value / total) * 100).toFixed(1))}٪` : "نامشخص"}</p>
            </li>;
          })}</ul>
        </div>)}
      </>}

      {/* Recent transactions */}
      {readErrors.transactions ? <ReadError label="تراکنش‌های اخیر" code="DASHBOARD_TRANSACTIONS" /> : transactions.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
            تراکنش‌های اخیر
          </h3>
          <ul className="space-y-2">
            {transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm py-1"
                  style={{ borderTop: "1px solid var(--line)" }}>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="text-xs px-2 py-1 rounded-md font-bold flex-shrink-0"
                        style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
                    {t.type}
                  </span>
                  <span className="truncate" style={{ color: "var(--text-2)" }}>{t.instrument ?? "—"}</span>
                </span>
                <span className="flex items-center gap-4 flex-shrink-0">
                  <span className="font-bold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {formatToman(t.amount)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>{formatJalali(t.occurred_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>
        * عملکرد گذشته تضمین‌کننده‌ی بازده آینده نیست. ارقام جنبه‌ی اطلاع‌رسانی دارند.
      </p>
    </div>
  );
}
