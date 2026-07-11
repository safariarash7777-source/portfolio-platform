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

/**
 * دارایی‌های پرتفوی — در دسکتاپ جدول، در موبایل کارتِ عمودی (بدون جدولِ فشرده و بدون اسکرول افقی).
 * چیدمان RTL؛ اعداد فارسی و tabular. ستون‌ها راست‌به‌چپ.
 */
export default function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-5 pb-3">
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          دارایی‌های پرتفوی
        </h3>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 pb-6 pt-2 text-sm" style={{ color: "var(--text-3)" }}>
          هنوز دارایی‌ای در پرتفوی ثبت نشده است.
        </div>
      ) : (
        <>
          {/* ─── موبایل: کارت عمودی برای هر دارایی ─── */}
          <ul className="md:hidden divide-y" style={{ borderColor: "var(--line)" }}>
            {rows.map((h) => (
              <li key={h.symbol} className="px-4 py-3.5" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold" style={{ color: "var(--navy)" }}>{h.symbol}</div>
                    <div className="text-xs truncate" style={{ color: "var(--text-3)" }}>{h.name}</div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="font-bold" style={{ color: "var(--text)", ...tnum }}>
                      {formatTomanShort(h.value)}
                    </div>
                    <div className="text-sm font-bold" style={{ color: deltaColor(h.dayChangePct), ...tnum }}>
                      <span aria-hidden="true">{formatSignedPercent(h.dayChangePct)}</span>
                      <span className="sr-only">{describeDelta(h.dayChangePct)}</span>
                    </div>
                  </div>
                </div>
                <dl className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt style={{ color: "var(--text-3)" }}>تعداد</dt>
                    <dd className="font-bold mt-0.5" style={{ color: "var(--text-2)", ...tnum }}>
                      {toPersianDigits(h.qty.toLocaleString("en-US"))}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: "var(--text-3)" }}>قیمت روز</dt>
                    <dd className="font-bold mt-0.5" style={{ color: "var(--text-2)", ...tnum }}>
                      {formatToman(h.price)}
                    </dd>
                  </div>
                  <div className="text-end">
                    <dt style={{ color: "var(--text-3)" }}>وزن</dt>
                    <dd className="font-bold mt-0.5" style={{ color: "var(--text-2)", ...tnum }}>
                      {toPersianDigits(h.weight.toFixed(1))}٪
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* ─── دسکتاپ: جدول کامل ─── */}
          <div className="hidden md:block overflow-x-auto">
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
        </>
      )}
    </div>
  );
}
