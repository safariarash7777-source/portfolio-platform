"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { faNum } from "./adminFormat";

type Row = { risk_category: string; users: number };

// رنگ هر پروفایل از توکن‌های سمنتیک/برند (هم‌راستا با جدولِ کاربرانِ ادمین).
const COLORS: Record<string, string> = {
  "محافظه‌کار": "var(--success)",
  "متعادل": "var(--navy)",
  "تهاجمی": "var(--warning)",
  "بسیار تهاجمی": "var(--danger)",
};
const ORDER = ["محافظه‌کار", "متعادل", "تهاجمی", "بسیار تهاجمی"];

/**
 * توزیع پروفایل ریسک (بر اساس آخرین ارزیابیِ هر کاربر) — نمودار ستونی.
 * برای RTL: محورِ افقی reversed و محورِ عمودی سمت راست.
 */
export default function RiskDistributionChart({ data }: { data: Row[] }) {
  const sorted = [...data].sort((a, b) => {
    const ia = ORDER.indexOf(a.risk_category);
    const ib = ORDER.indexOf(b.risk_category);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <div dir="ltr" style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={sorted} margin={{ top: 10, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="risk_category"
            reversed
            tick={{ fill: "var(--text-2)", fontSize: 11 }}
            stroke="var(--line)"
            interval={0}
          />
          <YAxis
            orientation="right"
            allowDecimals={false}
            tickFormatter={(v) => faNum(v as number)}
            tick={{ fill: "var(--text-3)", fontSize: 11 }}
            stroke="var(--line)"
            width={36}
          />
          <Tooltip content={<DistTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="users" radius={[6, 6, 0, 0]} maxBarSize={64}>
            {sorted.map((r) => (
              <Cell key={r.risk_category} fill={COLORS[r.risk_category] ?? "var(--text-3)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DistTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      dir="rtl"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy-deep)" }}>
        {faNum(payload[0].value)} کاربر
      </div>
    </div>
  );
}
