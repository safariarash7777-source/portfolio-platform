import {
  formatToman, formatTomanShort, formatSignedPercent, describeDelta, deltaColor, toPersianDigits,
} from "@/lib/format";

export interface HoldingRow {
  symbol: string;
  name: string;
  qty: number;
  price: number;
  value: number;
  dayChangePct: number;
  weight: number;
}

const tnum = { fontVariantNumeric: "tabular-nums" as const };

/** Holdings table matching the project's card/CSS-variable styling. Columns flow right→left. */
export default function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-5 pb-3">
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          دارایی‌های پرتفوی
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="text-xs" style={{ color: "var(--text-3)", background: "var(--surface-2)" }}>
              <th className="px-4 py-2.5 text-start font-bold">نماد</th>
              <th className="px-4 py-2.5 text-start font-bold">نام</th>
              <th className="px-4 py-2.5 text-end font-bold">تعداد</th>
              <th className="px-4 py-2.5 text-end font-bold">قیمت روز</th>
              <th className="px-4 py-2.5 text-end font-bold">ارزش</th>
              <th className="px-4 py-2.5 text-end font-bold">تغییر روز</th>
              <th className="px-4 py-2.5 text-end font-bold">درصد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.symbol} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-bold" style={{ color: "var(--navy)" }}>{h.symbol}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{h.name}</td>
                <td className="px-4 py-3 text-end" style={{ color: "var(--text-2)", ...tnum }}>
                  {toPersianDigits(h.qty.toLocaleString("en-US"))}
                </td>
                <td className="px-4 py-3 text-end" style={{ color: "var(--text-2)", ...tnum }}>
                  {formatToman(h.price)}
                </td>
                <td className="px-4 py-3 text-end font-bold" style={{ color: "var(--text)", ...tnum }}>
                  {formatTomanShort(h.value)}
                </td>
                <td className="px-4 py-3 text-end font-bold" style={{ color: deltaColor(h.dayChangePct), ...tnum }}>
                  <span aria-hidden="true">{formatSignedPercent(h.dayChangePct)}</span>
                  <span className="sr-only">{describeDelta(h.dayChangePct)}</span>
                </td>
                <td className="px-4 py-3 text-end" style={{ color: "var(--text-3)", ...tnum }}>
                  {toPersianDigits(h.weight.toFixed(1))}٪
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
