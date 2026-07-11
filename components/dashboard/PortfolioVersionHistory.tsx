"use client";

import { History } from "lucide-react";
import { formatJalali, toPersianDigits } from "@/lib/format";

interface Allocation {
  asset: string;
  pct: number;
  note?: string;
}

interface PortfolioVersion {
  id: string;
  allocations: Allocation[];
  notes?: string;
  created_at: string;
}

interface Props {
  versions: PortfolioVersion[];
}

/**
 * تاریخچه نسخه‌های پرتفوی — نمایش فشرده از تمام نسخه‌های صادرشده توسط مشاور.
 * آخرین نسخه (فعلی) با بج «فعال» مشخص می‌شود.
 */
export default function PortfolioVersionHistory({ versions }: Props) {
  if (!versions || versions.length <= 1) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <History size={16} style={{ color: "var(--gold)" }} />
        <h3 className="font-display font-bold text-base" style={{ color: "var(--navy-deep)" }}>
          تاریخچه نسخه‌های پرتفوی
        </h3>
      </div>

      <div className="space-y-3">
        {versions.map((v, idx) => {
          const isCurrent = idx === 0;
          return (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 text-sm py-3 px-4 rounded-xl"
              style={{
                background: isCurrent ? "rgba(30,58,138,0.04)" : "var(--surface-2)",
                border: isCurrent ? "1px solid var(--navy)" : "1px solid var(--line)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="flex-shrink-0 text-xs font-bold px-2 py-1 rounded-md"
                  style={{
                    background: isCurrent ? "var(--navy)" : "var(--surface)",
                    color: isCurrent ? "var(--text-on-navy)" : "var(--text-3)",
                    border: isCurrent ? "none" : "1px solid var(--line)",
                  }}
                >
                  {isCurrent ? "فعال" : `v${toPersianDigits(versions.length - idx)}`}
                </span>
                <span className="truncate" style={{ color: "var(--text-2)" }}>
                  {v.allocations.map((a) => `${a.asset} ${toPersianDigits(a.pct)}٪`).join(" · ")}
                </span>
              </div>
              <span className="flex-shrink-0 text-xs" style={{ color: "var(--text-3)" }}>
                {formatJalali(v.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
