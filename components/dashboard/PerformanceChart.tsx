"use client";

import { useState, useId } from "react";
import { formatTomanShort, formatJalali, formatJalaliShort, toPersianDigits } from "@/lib/format";

export interface PerfPoint {
  date: string;
  value: number;
}

const PERIODS = [
  { key: "3m", label: "۳ ماه", n: 4 },
  { key: "6m", label: "۶ ماه", n: 7 },
  { key: "1y", label: "۱ سال", n: 13 },
  { key: "all", label: "کل", n: Infinity },
];

const W = 600, H = 200, padTop = 14, padBottom = 26, padLeft = 14, padRight = 70;
const plotW = W - padLeft - padRight;
const plotH = H - padTop - padBottom;
const baseY = padTop + plotH;

/** Dependency-free SVG area chart of portfolio value over time. RTL: time reads right→left. */
export default function PerformanceChart({ data }: { data: PerfPoint[] }) {
  const [period, setPeriod] = useState("1y");
  const gradId = useId().replace(/:/g, "");
  const n = PERIODS.find((p) => p.key === period)!.n;
  const pts = n === Infinity ? data : data.slice(-n);

  if (pts.length < 2) {
    return (
      <div className="card p-5">
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          روند ارزش پرتفوی
        </h3>
        <p className="text-sm mt-4" style={{ color: "var(--text-3)" }}>
          داده‌ی کافی برای رسم نمودار وجود ندارد.
        </p>
      </div>
    );
  }

  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // RTL: oldest (i=0) on the right, newest on the left.
  const x = (i: number) => W - padRight - (i / (pts.length - 1)) * plotW;
  const y = (v: number) => padTop + plotH - ((v - min) / span) * plotH;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(pts.length - 1).toFixed(1)} ${baseY} L ${x(0).toFixed(1)} ${baseY} Z`;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const changePct = ((last.value - first.value) / first.value) * 100;

  const yTicks = [min, min + span / 2, max];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          روند ارزش پرتفوی
        </h3>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="rounded-md px-2.5 py-1 text-xs font-bold transition-colors"
              style={
                period === p.key
                  ? { background: "var(--surface)", color: "var(--navy)", boxShadow: "var(--shadow-sm)" }
                  : { color: "var(--text-3)" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm font-bold mb-3" style={{ color: changePct >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
        <span aria-hidden="true">{changePct >= 0 ? "▲" : "▼"} ٪{toPersianDigits(Math.abs(changePct).toFixed(1)).replace(".", "٫")}</span>
        <span className="sr-only">{`تغییر دوره ${changePct >= 0 ? "مثبت" : "منفی"}`}</span>
        <span className="font-normal me-2" style={{ color: "var(--text-3)" }}> در این بازه</span>
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }} role="img"
           aria-label={`نمودار روند ارزش پرتفوی از ${formatJalali(first.date)} تا ${formatJalali(last.date)}`}>
        <defs>
          <linearGradient id={`g${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--navy)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padLeft} x2={W - padRight} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={W - padRight + 6} y={y(t) + 4} fontSize="11" fill="var(--text-3)" style={{ direction: "rtl" }}>
              {formatTomanShort(t).replace(" تومان", "")}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#g${gradId})`} />
        <path d={line} fill="none" stroke="var(--navy)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(last.value)} r="3.5" fill="var(--navy)" />
        {/* x labels: newest (left) and oldest (right) */}
        <text x={padLeft} y={H - 6} fontSize="11" fill="var(--text-3)">{formatJalaliShort(last.date)}</text>
        <text x={W - padRight} y={H - 6} fontSize="11" fill="var(--text-3)" textAnchor="end">{formatJalaliShort(first.date)}</text>
      </svg>
    </div>
  );
}
