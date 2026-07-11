"use client";

import { useEffect, useState } from "react";
import { formatUsd, formatSignedPercent, deltaColor, toPersianDigits } from "@/lib/format";

interface Row {
  id: string;
  faName: string;
  price: number;
  change24h: number | null;
}

const REFRESH_MS = 5 * 60 * 1000; // هم‌گام با کشِ سرور

/**
 * نوارِ قیمتِ زنده — دادهٔ واقعی از /api/market (کشِ ۵دقیقه).
 * اگر منبع در دسترس نباشد چیزی رندر نمی‌شود (هیچ عددِ ساختگی).
 * حرکتِ marquee فقط transform است و زیر reduced-motion خاموش می‌شود؛
 * hover مکث می‌کند. لیست دوبار تکرار می‌شود تا حلقه بی‌درز باشد.
 */
export default function MarketTicker() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market");
        const json = await res.json();
        if (!alive) return;
        if (json?.ok && Array.isArray(json.crypto) && json.crypto.length > 0) {
          setRows(json.crypto);
          setFetchedAt(json.fetchedAt ?? Date.now());
        } else {
          setRows([]);
        }
      } catch {
        if (alive) setRows([]);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // لودینگ یا شکستِ منبع → نوار اصلاً ظاهر نمی‌شود (بدون CLS: ارتفاعِ صفر از ابتدا)
  if (!rows || rows.length === 0) return null;

  const ageMin = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 60000)) : null;

  const items = rows.map((r) => (
    <span key={r.id} className="inline-flex items-center gap-2 px-5 text-xs whitespace-nowrap">
      <span className="font-bold" style={{ color: "var(--text)" }}>{r.faName}</span>
      <span style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
        {formatUsd(r.price)}
      </span>
      {r.change24h != null && (
        <span className="font-bold" style={{ color: deltaColor(r.change24h), fontVariantNumeric: "tabular-nums" }}>
          {formatSignedPercent(r.change24h)}
        </span>
      )}
    </span>
  ));

  return (
    <div
      className="ticker-wrap border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      aria-label="نوار قیمت لحظه‌ای بازار"
    >
      <div className="flex items-center">
        {/* برچسبِ ثابتِ «زنده» — سمتِ راست در RTL */}
        <div
          className="relative z-10 flex items-center gap-2 flex-shrink-0 ps-5 pe-4 py-2.5 text-xs font-bold"
          style={{ background: "var(--surface)", color: "var(--navy-deep)", borderInlineEnd: "1px solid var(--line)" }}
        >
          <span className="live-dot" aria-hidden />
          بازار · زنده
          {ageMin != null && (
            <span className="font-normal hidden sm:inline" style={{ color: "var(--text-3)" }}>
              · به‌روزرسانی {ageMin === 0 ? "هم‌اکنون" : `${toPersianDigits(ageMin)} دقیقه پیش`}
            </span>
          )}
        </div>
        <div className="ticker-wrap flex-1 py-2.5" dir="rtl">
          <div className="ticker-track">
            {items}
            {items}
          </div>
        </div>
      </div>
    </div>
  );
}
