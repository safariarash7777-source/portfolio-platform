"use client";

import { TrendingUp } from "lucide-react";
import { formatJalali, toPersianDigits } from "@/lib/format";

export interface ScorePoint {
  total_score: number;
  risk_category: string;
  created_at: string;
}

// نمودار سادهٔ خطیِ تکاملِ امتیاز ریسک + فهرست تاریخ‌دار. رنگ‌ها از توکن‌ها.
export default function ScoreEvolution({ history }: { history: ScorePoint[] }) {
  if (!history || history.length === 0) return null;

  const maxScore = 110;
  const w = 320;
  const h = 90;
  const pad = 8;
  const pts = history.map((p, i) => {
    const x =
      history.length === 1
        ? w / 2
        : pad + (i * (w - 2 * pad)) / (history.length - 1);
    const y = h - pad - (Math.min(p.total_score, maxScore) / maxScore) * (h - 2 * pad);
    return { x, y, p };
  });
  const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const latest = history[history.length - 1];
  const first = history[0];
  const delta = latest.total_score - first.total_score;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} style={{ color: "var(--gold)" }} />
        <h3 className="font-display font-bold text-base" style={{ color: "var(--navy-deep)" }}>
          تکامل امتیاز ریسک
        </h3>
        {history.length > 1 && (
          <span
            className="mr-auto text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: delta >= 0 ? "rgba(21,128,61,0.1)" : "rgba(180,83,9,0.1)",
              color: delta >= 0 ? "var(--success)" : "var(--warning)",
            }}
          >
            {delta >= 0 ? "▲" : "▼"} {toPersianDigits(Math.abs(delta))}
          </span>
        )}
      </div>

      {history.length > 1 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full mb-4" style={{ height: 90 }}>
          <path d={path} fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((pt, i) => (
            <circle key={i} cx={pt.x} cy={pt.y} r="3" fill="var(--gold)" stroke="var(--surface)" strokeWidth="1.5" />
          ))}
        </svg>
      )}

      <ul className="space-y-2">
        {[...history].reverse().map((p, i) => (
          <li
            key={i}
            className="flex items-center justify-between text-sm py-2 px-3 rounded-lg"
            style={{ background: "var(--surface-2)" }}
          >
            <span style={{ color: "var(--text-3)" }}>{formatJalali(p.created_at)}</span>
            <span className="flex items-center gap-3">
              <span style={{ color: "var(--text-2)" }}>{p.risk_category}</span>
              <span className="font-display font-bold" style={{ color: "var(--navy)" }}>
                {toPersianDigits(p.total_score)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
