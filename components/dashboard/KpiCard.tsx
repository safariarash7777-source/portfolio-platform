import { formatSignedPercent, describeDelta, deltaColor } from "@/lib/format";

interface Props {
  label: string;
  value: string; // pre-formatted (e.g. formatTomanShort(...))
  delta?: number; // percent; renders a colored ▲/▼ line when provided
  hint?: string;
}

/** Dashboard KPI card — matches the project's .card / CSS-variable design system. */
export default function KpiCard({ label, value, delta, hint }: Props) {
  return (
    <div className="card p-5">
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        {label}
      </p>
      <p
        className="font-display text-2xl md:text-3xl font-bold mt-2"
        style={{ color: "var(--navy-deep)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      {typeof delta === "number" && (
        <p
          className="text-sm font-bold mt-1"
          style={{ color: deltaColor(delta), fontVariantNumeric: "tabular-nums" }}
        >
          <span aria-hidden="true">{formatSignedPercent(delta)}</span>
          <span className="sr-only">{describeDelta(delta)}</span>
        </p>
      )}
      {hint && (
        <p className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
