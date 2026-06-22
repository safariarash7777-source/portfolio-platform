import KpiCard from "./KpiCard";
import AllocationDonut from "./AllocationDonut";
import PerformanceChart from "./PerformanceChart";
import HoldingsTable from "./HoldingsTable";
import { Wallet } from "lucide-react";
import { formatTomanShort, formatToman, formatJalali, toPersianDigits } from "@/lib/format";

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
}

/** "پرتفوی زنده" — KPI cards, allocation donut, performance chart, holdings & transactions.
 *  Computed from live Supabase data; falls back to a friendly empty state. */
export default function LivePortfolio({ holdings, snapshots, transactions }: Props) {
  if (holdings.length === 0 && snapshots.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
             style={{ width: 56, height: 56, background: "var(--gold-tint)", color: "var(--navy-deep)" }}>
          <Wallet size={24} />
        </div>
        <h3 className="font-display font-bold text-lg mb-2" style={{ color: "var(--navy-deep)" }}>
          پرتفوی زنده‌ی شما هنوز خالی است
        </h3>
        <p className="text-sm leading-7 max-w-sm mx-auto" style={{ color: "var(--text-2)" }}>
          پس از ثبت دارایی‌ها توسط مشاور، ارزش لحظه‌ای، تخصیص دارایی و روند عملکرد سبد شما در همین بخش
          نمایش داده خواهد شد.
        </p>
      </div>
    );
  }

  const withValue = holdings.map((h) => ({ ...h, value: h.qty * h.current_price }));
  const total = withValue.reduce((s, h) => s + h.value, 0);
  const dayPnl = withValue.reduce((s, h) => s + (h.value * h.day_change_pct) / 100, 0);
  const dayChangePct = total ? (dayPnl / total) * 100 : 0;

  const periodReturn =
    snapshots.length >= 2
      ? ((snapshots[snapshots.length - 1].value - snapshots[0].value) / snapshots[0].value) * 100
      : 0;

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
    weight: total ? +((h.value / total) * 100).toFixed(1) : 0,
  }));

  const perf = snapshots.map((s) => ({ date: s.as_of, value: s.value }));

  return (
    <div className="space-y-5">
      <div>
        <span className="eyebrow">پرتفوی زنده</span>
        <h2 className="font-display text-xl md:text-2xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          نمای کلی دارایی‌ها
        </h2>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="ارزش کل دارایی" value={formatTomanShort(total)} />
        <KpiCard label="بازده دوره" value={formatTomanShort(snapshots.at(-1)?.value ?? total).replace(" تومان", " ت")} delta={periodReturn} hint="بر اساس روند ثبت‌شده" />
        <KpiCard label="سود/زیان امروز" value={formatToman(Math.round(dayPnl))} delta={dayChangePct} />
        <KpiCard label="تعداد دارایی" value={toPersianDigits(holdings.length)} hint="نماد فعال در سبد" />
      </div>

      {/* Donut + performance */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
            تخصیص دارایی
          </h3>
          <AllocationDonut data={allocation} centerLabel="ارزش کل" centerValue={formatTomanShort(total)} />
        </div>
        <div className="lg:col-span-2">
          <PerformanceChart data={perf} />
        </div>
      </div>

      {/* Holdings */}
      {holdingRows.length > 0 && <HoldingsTable rows={holdingRows} />}

      {/* Recent transactions */}
      {transactions.length > 0 && (
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
