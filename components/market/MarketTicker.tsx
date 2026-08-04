"use client";

import { useEffect, useState } from "react";
import {
  formatToman, formatUsd, formatSignedPercent, deltaColor, toPersianDigits,
} from "@/lib/format";

interface GlobalRow { id: string; faName: string; price: number; change24h: number | null }
interface IrRow { id: string; faName: string; price: number; unit: "toman" | "usd"; change?: number | null; changePercent?: number | null }
interface Item { id: string; faName: string; priceText: string; change: number | null }

const REFRESH_MS = 5 * 60 * 1000; // هم‌گام با کشِ سرور

/**
 * نوارِ قیمتِ زنده — دادهٔ واقعی از /api/market: اولْ بازارِ ایران (طلا/ارز از
 * رلهٔ داخلی، اگر وصل باشد)، بعد انسِ جهانی و کریپتو. منبعْ قطع → اصلاً رندر
 * نمی‌شود (هیچ عددِ ساختگی، بدون CLS). حرکت فقط transform؛ hover مکث؛
 * reduced-motion خاموش.
 */
export default function MarketTicker() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market");
        const json = await res.json();
        if (!alive) return;
        const ir = json?.ir;
        const irItems: Item[] = [...(ir?.gold ?? []), ...(ir?.currency ?? [])].map((r: IrRow) => ({
          id: r.id,
          faName: r.faName,
          priceText: r.unit === "usd" ? formatUsd(r.price) : formatToman(r.price),
          change: r.changePercent ?? null, // درصد (نه مقدارِ مطلقِ تومان)
        }));
        const globalItems: Item[] = [...(json?.goldGlobal ?? []), ...(json?.crypto ?? [])].map(
          (r: GlobalRow) => ({
            id: r.id,
            faName: r.faName,
            priceText: formatUsd(r.price),
            change: r.change24h,
          })
        );
        const all = [...irItems, ...globalItems];
        setItems(all);
        setFetchedAt(all.length > 0 ? json.fetchedAt ?? Date.now() : null);
      } catch {
        if (alive) setItems([]);
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // لودینگ یا شکستِ منبع → نوار اصلاً ظاهر نمی‌شود (بدون CLS: ارتفاعِ صفر از ابتدا)
  if (!items || items.length === 0) return null;

  const ageMin = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 60000)) : null;

  const nodes = items.map((r) => (
    <span key={r.id} className="inline-flex items-center gap-2 px-5 text-xs whitespace-nowrap">
      <span className="font-bold" style={{ color: "var(--text)" }}>{r.faName}</span>
      <span style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
        {r.priceText}
      </span>
      {r.change != null && (
        <span className="font-bold" style={{ color: deltaColor(r.change), fontVariantNumeric: "tabular-nums" }}>
          {formatSignedPercent(r.change)}
        </span>
      )}
    </span>
  ));

  return (
    <div
      className="border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      aria-label="نوار وضعیت بازار"
    >
      <div className="flex items-center">
        {/* برچسبِ ثابتِ «زنده» — سمتِ راست در RTL */}
        <div
          className="relative z-10 flex items-center gap-2 flex-shrink-0 ps-5 pe-4 py-2.5 text-xs font-bold"
          style={{ background: "var(--surface)", color: "var(--navy-deep)", borderInlineEnd: "1px solid var(--line)" }}
        >
          <span className="live-dot" aria-hidden />
          وضعیت بازار
          {ageMin != null && (
            <span className="font-normal hidden sm:inline" style={{ color: "var(--text-3)" }}>
              · به‌روزرسانی {ageMin === 0 ? "هم‌اکنون" : `${toPersianDigits(ageMin)} دقیقه پیش`}
            </span>
          )}
        </div>
        <div className="ticker-wrap flex-1 py-2.5" dir="rtl">
          <div className="ticker-track">
            {nodes}
            {nodes}
          </div>
        </div>
      </div>
    </div>
  );
}
