"use client";
// روند روزانهٔ خالص خرید حقیقی — منبع: market_breadth (روزی یک ردیف EOD رله).
// ستون‌های SVG: سبز=ورود، قرمز=خروج؛ محور صفر مشخص. رنگ‌ها فقط توکن CSS.
// دادهٔ کم → همان چند ستون واقعی با یادداشت «دادهٔ موجود از تاریخ X» — هیچ عدد ساختگی.
import type { FlowTrendPoint } from "@/lib/core/marketToday";
import { toPersianDigits } from "@/lib/format";

const shortJdate = (j: string) => toPersianDigits(j.slice(5).replace("-", "/"));

function fmtB(v: number): string {
  const abs = Math.abs(v);
  const body = abs >= 1000 ? `${(abs / 1000).toFixed(1)} همت` : `${Math.round(abs)} میلیارد تومان`;
  return toPersianDigits(body).replace(".", "٫");
}

export default function FlowTrendChart({ points }: { points: FlowTrendPoint[] }) {
  if (!points || points.length === 0) return null;
  const W = 640;
  const H = 180;
  const padX = 6;
  const padY = 18;
  const maxAbs = Math.max(1e-9, ...points.map((p) => Math.abs(p.netFlowBToman)));
  const zeroY = H / 2;
  const scale = (H / 2 - padY) / maxAbs;
  const n = points.length;
  const slot = (W - padX * 2) / n;
  const barW = Math.min(34, Math.max(6, slot * 0.6));
  const first = points[0];
  const last = points[n - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ display: "block", height: "auto" }}
        role="img"
        aria-label="نمودار روند روزانهٔ خالص خرید حقیقی"
      >
        {/* محور صفر */}
        <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth="1" />
        {points.map((p, i) => {
          // راست‌به‌چپ: جدیدترین روز سمت چپ نیست — قدیمی راست، جدید چپ؟ در نمودار مالی RTL
          // مرسومِ سایت‌های ایرانی، زمان از راست (قدیم) به چپ (جدید) می‌رود.
          const x = W - padX - (i + 1) * slot + (slot - barW) / 2;
          const h = Math.max(2, Math.abs(p.netFlowBToman) * scale);
          const pos = p.netFlowBToman >= 0;
          return (
            <g key={p.jdate}>
              <rect
                x={x}
                y={pos ? zeroY - h : zeroY}
                width={barW}
                height={h}
                rx="2"
                fill={pos ? "var(--success)" : "var(--danger)"}
                opacity="0.85"
              >
                <title>{`${toPersianDigits(p.jdate)} — ${pos ? "ورود" : "خروج"} ${fmtB(p.netFlowBToman)}`}</title>
              </rect>
              {/* برچسب تاریخ فقط برای تعداد کم یا سرها */}
              {(n <= 10 || i === 0 || i === n - 1 || i % Math.ceil(n / 8) === 0) && (
                <text
                  x={x + barW / 2}
                  y={H - 3}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--text-3)"
                >
                  {shortJdate(p.jdate)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span>
          آخرین روز: {toPersianDigits(last.jdate)} —{" "}
          <b style={{ color: last.netFlowBToman >= 0 ? "var(--success)" : "var(--danger)" }}>
            {last.netFlowBToman >= 0 ? "ورود " : "خروج "}
            {fmtB(last.netFlowBToman)}
          </b>
        </span>
        <span>دادهٔ موجود از تاریخ {toPersianDigits(first.jdate)} (روزی یک ردیف پایان بازار)</span>
      </div>
    </div>
  );
}
