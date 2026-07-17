"use client";
// میز صنایع + نقشهٔ صنایع — ابرتسک «رصد بازار» M2 و M3.
// همهٔ اعداد از computeIndustryDesk (تابع خالص، تست‌شده) روی اسنپ‌شات محاسبه می‌شود.
// کلیک روی هر صنعت (کاشی یا ردیف) → فیلتر جدول نمادها در StocksBoard.

import { useMemo, useState } from "react";
import { Grid3x3, ArrowUpDown } from "lucide-react";
import {
  toPersianDigits,
  formatTomanShort,
  formatSignedPercent,
  deltaColor,
} from "@/lib/format";
import { computeIndustryDesk, type BreadthStockLike, type IndustryRow } from "@/lib/core/breadth";

/** رنگ کاشی نقشهٔ صنایع بر پایهٔ میانگین وزنی تغییر (همان منطق tile نقشهٔ نمادها) */
function tileColor(change: number | null): { bg: string; fg: string } {
  if (change == null) return { bg: "var(--surface-2)", fg: "var(--text-2)" };
  const mag = Math.min(Math.abs(change), 4) / 4;
  const a = 0.14 + mag * 0.66;
  const base = change > 0 ? "21,128,61" : change < 0 ? "185,28,28" : "100,116,139";
  return { bg: `rgba(${base},${a.toFixed(2)})`, fg: a > 0.5 ? "var(--text-on-navy)" : "var(--text)" };
}

type DeskSortKey = "netFlowToman" | "valueToman" | "weightedChangePct" | "symbolCount" | "marketCapToman";
type SizeMode = "value" | "mcap";

export default function IndustryDesk({
  stocks,
  onSelectIndustry,
  selectedIndustry,
}: {
  stocks: BreadthStockLike[];
  onSelectIndustry?: (industry: string) => void;
  selectedIndustry?: string;
}) {
  const [sizeMode, setSizeMode] = useState<SizeMode>("value");
  const [sortKey, setSortKey] = useState<DeskSortKey>("netFlowToman");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const desk = useMemo(() => computeIndustryDesk(stocks), [stocks]);

  const sortedRows = useMemo(() => {
    const arr = [...desk.rows];
    arr.sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? -Infinity;
      const bv = (b[sortKey] as number | null) ?? -Infinity;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [desk.rows, sortKey, sortDir]);

  const toggleSort = (key: DeskSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // نقشهٔ صنایع: چینش ردیفی وزن‌دار (flex-grow = اندازه) — بدون وابستگی جدید
  const mapRows = useMemo(() => {
    const sizeOf = (r: IndustryRow) => (sizeMode === "value" ? r.valueToman : r.marketCapToman);
    const rows = [...desk.rows].filter((r) => sizeOf(r) > 0).sort((a, b) => sizeOf(b) - sizeOf(a));
    const top = rows.slice(0, 24);
    // ردیف‌بندی: ۴ ردیف با تعداد کاشی صعودی (بزرگ‌ترها بالا و بزرگ‌تر)
    const layout = [4, 5, 7, 8];
    const out: IndustryRow[][] = [];
    let i = 0;
    for (const n of layout) {
      if (i >= top.length) break;
      out.push(top.slice(i, i + n));
      i += n;
    }
    return out;
  }, [desk.rows, sizeMode]);

  if (desk.rows.length === 0) return null;

  const sizeOf = (r: IndustryRow) => (sizeMode === "value" ? r.valueToman : r.marketCapToman);
  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, 15);

  return (
    <div className="space-y-6">
      {/* M2 — نقشهٔ صنایع */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
            >
              <Grid3x3 size={15} />
            </span>
            <h3 className="font-display font-bold" style={{ color: "var(--navy-deep)" }}>
              نقشهٔ صنایع
            </h3>
          </div>
          <div
            className="flex rounded-lg overflow-hidden text-[11.5px] font-medium"
            style={{ border: "1px solid var(--line)" }}
          >
            <button
              type="button"
              onClick={() => setSizeMode("value")}
              className="px-3 py-1.5"
              style={{
                background: sizeMode === "value" ? "var(--navy-deep)" : "var(--surface)",
                color: sizeMode === "value" ? "var(--text-on-navy)" : "var(--text-2)",
              }}
            >
              اندازه: ارزش معاملات
            </button>
            <button
              type="button"
              onClick={() => setSizeMode("mcap")}
              className="px-3 py-1.5"
              style={{
                background: sizeMode === "mcap" ? "var(--navy-deep)" : "var(--surface)",
                color: sizeMode === "mcap" ? "var(--text-on-navy)" : "var(--text-2)",
              }}
            >
              اندازه: ارزش بازار
            </button>
          </div>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>
          رنگ: میانگین وزنی تغییر صنعت (وزن = ارزش بازار) · کلیک روی صنعت، جدول نمادها را فیلتر می‌کند
        </p>
        <div className="space-y-1.5">
          {mapRows.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((r) => {
                const t = tileColor(r.weightedChangePct);
                const selected = selectedIndustry === r.industry;
                return (
                  <button
                    key={r.industry}
                    type="button"
                    onClick={() => onSelectIndustry?.(r.industry)}
                    className="rounded-md px-2 py-2 min-w-0 flex flex-col justify-center text-start"
                    style={{
                      flexGrow: Math.max(sizeOf(r), 1),
                      flexBasis: 0,
                      background: t.bg,
                      minWidth: 64,
                      minHeight: 56,
                      outline: selected ? "2px solid var(--gold)" : "none",
                      cursor: "pointer",
                    }}
                    title={`${r.industry} — ${
                      r.weightedChangePct != null ? formatSignedPercent(r.weightedChangePct) : "—"
                    } · ارزش معاملات ${formatTomanShort(r.valueToman)}`}
                  >
                    <span className="text-[11px] font-bold truncate w-full" style={{ color: t.fg }}>
                      {r.industry}
                    </span>
                    <span className="text-[10px]" style={{ color: t.fg, fontVariantNumeric: "tabular-nums" }}>
                      {r.weightedChangePct != null ? formatSignedPercent(r.weightedChangePct) : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* M3 — میز صنایع */}
      <div className="card overflow-x-auto">
        <div className="px-5 pt-5 pb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold" style={{ color: "var(--navy-deep)" }}>
              میز صنایع
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {toPersianDigits(desk.rows.length)} صنعت
              {desk.excludedNoIndustry > 0
                ? ` · ${toPersianDigits(desk.excludedNoIndustry)} نماد بدون صنعت از میز حذف شد`
                : ""}{" "}
              · پول حقیقی = (خرید حقیقی − فروش حقیقی) × قیمت پایانی
            </p>
          </div>
        </div>
        <table className="w-full text-sm" style={{ color: "var(--text)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th className="py-3 px-4 text-right text-xs font-medium" style={{ color: "var(--text-3)" }}>
                صنعت
              </th>
              <DeskTh label="پول حقیقی" k="netFlowToman" cur={sortKey} dir={sortDir} onSort={toggleSort} />
              <DeskTh label="تغییر وزنی" k="weightedChangePct" cur={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="py-3 px-3 text-left text-xs font-medium" style={{ color: "var(--text-3)" }}>
                مثبت/منفی
              </th>
              <DeskTh label="ارزش معاملات" k="valueToman" cur={sortKey} dir={sortDir} onSort={toggleSort} />
              <DeskTh label="نماد" k="symbolCount" cur={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr
                key={r.industry}
                className="hover:bg-[var(--surface-2)] cursor-pointer"
                style={{
                  borderBottom: "1px solid var(--line)",
                  background: selectedIndustry === r.industry ? "var(--gold-tint)" : undefined,
                }}
                onClick={() => onSelectIndustry?.(r.industry)}
                title={`فیلتر جدول نمادها روی ${r.industry}`}
              >
                <td className="py-2.5 px-4 font-bold" style={{ color: "var(--navy-deep)" }}>
                  {r.industry}
                  {r.valueSharePct != null && r.valueSharePct >= 0.1 ? (
                    <span className="block text-[10.5px] font-normal mt-0.5" style={{ color: "var(--text-3)" }}>
                      {toPersianDigits(r.valueSharePct)}٪ از ارزش معاملات بازار
                    </span>
                  ) : null}
                </td>
                <td
                  className="py-2.5 px-3 text-left font-bold"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color:
                      r.netFlowToman == null
                        ? "var(--text-3)"
                        : r.netFlowToman >= 0
                        ? "var(--success)"
                        : "var(--danger)",
                  }}
                >
                  {r.netFlowToman == null
                    ? "—"
                    : `${r.netFlowToman >= 0 ? "ورود" : "خروج"} ${formatTomanShort(Math.abs(r.netFlowToman))}`}
                </td>
                <td
                  className="py-2.5 px-3 text-left"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: r.weightedChangePct != null ? deltaColor(r.weightedChangePct) : "var(--text-3)",
                  }}
                >
                  {r.weightedChangePct != null ? formatSignedPercent(r.weightedChangePct) : "—"}
                </td>
                <td className="py-2.5 px-3 text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "var(--success)" }}>{toPersianDigits(r.upCount)}</span>
                  <span style={{ color: "var(--text-3)" }}> / </span>
                  <span style={{ color: "var(--danger)" }}>{toPersianDigits(r.downCount)}</span>
                </td>
                <td className="py-2.5 px-3 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                  {formatTomanShort(r.valueToman)}
                </td>
                <td className="py-2.5 px-3 text-left" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                  {toPersianDigits(r.symbolCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRows.length > 15 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full py-3 text-xs font-medium hover:bg-[var(--surface-2)]"
            style={{ color: "var(--navy)", borderTop: "1px solid var(--line)" }}
          >
            {showAll ? "نمایش کمتر" : `نمایش همهٔ ${toPersianDigits(sortedRows.length)} صنعت`}
          </button>
        )}
      </div>
    </div>
  );
}

function DeskTh({
  label,
  k,
  cur,
  dir,
  onSort,
}: {
  label: string;
  k: DeskSortKey;
  cur: DeskSortKey;
  dir: "asc" | "desc";
  onSort: (k: DeskSortKey) => void;
}) {
  const active = cur === k;
  return (
    <th className="py-3 px-3 text-left">
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: active ? "var(--navy-deep)" : "var(--text-3)" }}
      >
        <ArrowUpDown size={11} />
        {label}
        {active ? <span className="text-[9px]">{dir === "desc" ? "▼" : "▲"}</span> : null}
      </button>
    </th>
  );
}
