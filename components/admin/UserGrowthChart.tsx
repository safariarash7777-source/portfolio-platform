"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { faNum, faWeekLabel } from "./adminFormat";

type Row = { week_start: string; signups: number };

/**
 * رشد کاربران (۹۰ روز، باکت هفتگی) — نمودار خطی.
 * برای RTL: محورِ افقی reversed (قدیمی‌ترین سمت راست) و محورِ عمودی سمت راست.
 */
export default function UserGrowthChart({ data }: { data: Row[] }) {
  return (
    <div dir="ltr" style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="week_start"
            reversed
            tickFormatter={faWeekLabel}
            tick={{ fill: "var(--text-3)", fontSize: 11 }}
            stroke="var(--line)"
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            orientation="right"
            allowDecimals={false}
            tickFormatter={(v) => faNum(v as number)}
            tick={{ fill: "var(--text-3)", fontSize: 11 }}
            stroke="var(--line)"
            width={36}
          />
          <Tooltip content={<GrowthTooltip />} />
          <Line
            type="monotone"
            dataKey="signups"
            stroke="var(--navy)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: "var(--navy)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--navy)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GrowthTooltip({
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
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
        هفتهٔ {faWeekLabel(label ?? "")}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy-deep)" }}>
        {faNum(payload[0].value)} کاربر جدید
      </div>
    </div>
  );
}
