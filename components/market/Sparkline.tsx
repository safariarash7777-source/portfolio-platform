"use client";
// اسپارک‌لاین کوچک SVG برای کارت‌های نوار وضعیت «امروز بازار».
// دادهٔ کمتر از ۲ نقطه → هیچ‌چیز رندر نمی‌شود (حالت خالی صادق — نه خط ساختگی).
// رنگ‌ها فقط توکن CSS؛ SVG سبک است و نیازی به کتابخانهٔ چارت ندارد.

export default function Sparkline({
  values,
  up,
  width = 96,
  height = 30,
}: {
  values: number[];
  /** جهت رنگ: true=سبز، false=قرمز، undefined=طلایی خنثی */
  up?: boolean;
  width?: number;
  height?: number;
}) {
  const pts = (values || []).filter((v) => typeof v === "number" && isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (pts.length - 1);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = up === undefined ? "var(--gold)" : up ? "var(--success)" : "var(--danger)";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + (pts.length - 1) * step} cy={y(pts[pts.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}
