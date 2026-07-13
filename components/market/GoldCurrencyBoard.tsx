"use client";
import { useState } from "react";
import { Coins, Clock } from "lucide-react";
import {
  toPersianDigits,
  formatToman,
  formatSignedPercent,
  deltaColor,
  formatJalali,
} from "@/lib/format";

interface IrRow {
  id: string;
  faName: string;
  price: number;
  unit: "toman" | "usd";
  change?: number | null;
  changePercent?: number | null;
}

interface Props {
  gold: IrRow[];
  currency: IrRow[];
  fetchedAt: number;
}

type Tab = "gold" | "currency";

export default function GoldCurrencyBoard({ gold, currency, fetchedAt }: Props) {
  const [tab, setTab] = useState<Tab>("gold");
  const rows = tab === "gold" ? gold : currency;

  if (gold.length === 0 && currency.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
          >
            <Coins size={18} />
          </span>
          <h2 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            طلا و ارز
          </h2>
        </div>
        {fetchedAt && (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            <Clock size={12} />
            <span>آخرین به‌روزرسانی: {formatJalali(fetchedAt)}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <TabBtn active={tab === "gold"} onClick={() => setTab("gold")} label="طلا و سکه" count={gold.length} />
        <TabBtn active={tab === "currency"} onClick={() => setTab("currency")} label="ارز" count={currency.length} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => {
          const pct = r.changePercent ?? null;
          return (
            <div key={r.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-bold text-sm block truncate" style={{ color: "var(--text)" }}>
                  {r.faName}
                </span>
                <span className="text-xs mt-0.5 block" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                  {r.unit === "usd"
                    ? `$${toPersianDigits(r.price.toLocaleString("en-US")).replace(/,/g, "٬")}`
                    : formatToman(r.price)}
                </span>
              </div>
              {pct != null && (
                <span
                  className="text-sm font-bold flex-shrink-0"
                  style={{ color: deltaColor(pct), fontVariantNumeric: "tabular-nums" }}
                >
                  {formatSignedPercent(pct)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-bold transition-colors"
      style={{
        background: active ? "var(--navy-deep)" : "var(--surface-2)",
        color: active ? "var(--text-on-navy)" : "var(--text-2)",
      }}
    >
      {label} ({toPersianDigits(count)})
    </button>
  );
}
