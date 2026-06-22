import { toPersianDigits } from "@/lib/format";

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: DonutSlice[];
  /** Big label shown in the donut center (e.g. "تخصیص"). */
  centerLabel?: string;
  /** Value shown under the center label (e.g. formatTomanShort(total)). */
  centerValue?: string;
}

// Palette derived from the brand tokens — institutional, no neon.
const PALETTE = [
  "var(--navy)",
  "var(--gold)",
  "var(--success)",
  "var(--navy-soft)",
  "var(--warning)",
  "var(--gold-soft)",
  "var(--text-3)",
];

const R = 52;
const C = 2 * Math.PI * R;

/** Dependency-free SVG donut for asset allocation. Direction-agnostic (RTL-safe). */
export default function AllocationDonut({ data, centerLabel, centerValue }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  const slices = data.map((d, i) => {
    const frac = d.value / total;
    const len = frac * C;
    const seg = {
      ...d,
      color: d.color ?? PALETTE[i % PALETTE.length],
      pct: +(frac * 100).toFixed(1),
      dasharray: `${len} ${C - len}`,
      dashoffset: -offset,
    };
    offset += len;
    return seg;
  });

  return (
    <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
      <div className="relative flex-shrink-0" style={{ width: 132, height: 132 }}>
        <svg width="132" height="132" viewBox="0 0 132 132" role="img"
             aria-label={`نمودار تخصیص دارایی: ${slices.map((s) => `${s.label} ${s.pct} درصد`).join("، ")}`}>
          <g transform="rotate(-90 66 66)">
            <circle cx="66" cy="66" r={R} fill="none" stroke="var(--line)" strokeWidth="13" />
            {slices.map((s, i) => (
              <circle
                key={i}
                cx="66"
                cy="66"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="13"
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
              >
                <title>{`${s.label} — ${toPersianDigits(s.pct)}٪`}</title>
              </circle>
            ))}
          </g>
        </svg>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerLabel && (
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{centerLabel}</span>
            )}
            {centerValue && (
              <span className="font-display text-sm font-bold" style={{ color: "var(--navy-deep)" }}>
                {centerValue}
              </span>
            )}
          </div>
        )}
      </div>

      <ul className="flex-1 min-w-0 space-y-2 w-full">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0" style={{ color: "var(--text-2)" }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="font-bold flex-shrink-0" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {toPersianDigits(s.pct)}٪
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
