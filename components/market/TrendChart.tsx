"use client";
// نمودار روند طلا و دلار — تصمیم T8: منبع ir_market_history (نمونه‌های رله).
// دادهٔ سری از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی) — الگوی HistoryChart.
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { TrendSeries } from "@/lib/core/trend";
import { toPersianDigits } from "@/lib/format";

// استثنای مستند C4: lightweight-charts روی canvas رنگ می‌کشد و CSS var را نمی‌فهمد؛
// این تابع مقدارِ خودِ توکن را در زمان اجرا می‌خواند و hex صرفاً fallback هم‌ارزش همان توکن است.
function palette() {
  const cs =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) =>
    cs?.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--surface", "#FFFFFF"),
    text: v("--text-2", "#334155"),
    line: v("--line", "#E5E3DC"),
    navy: v("--navy", "#1E3A8A"),
    gold: v("--gold", "#B8860B"),
  };
}

const SERIES_COLOR_KEY: Record<string, "gold" | "navy"> = {
  IR_GOLD_18K: "gold",
  USD: "navy",
};

export default function TrendChart({ series }: { series: TrendSeries[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const current = series[active] ?? null;

  useEffect(() => {
    if (!ref.current || !current || current.points.length === 0) return;
    const p = palette();
    const colorKey = SERIES_COLOR_KEY[current.id] ?? "navy";
    const color = colorKey === "gold" ? p.gold : p.navy;

    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { color: p.bg }, textColor: p.text },
      grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
      rightPriceScale: { borderColor: p.line },
      timeScale: { borderColor: p.line },
      autoSize: true,
      height: 280,
      localization: {
        priceFormatter: (v: number) => toPersianDigits(Math.round(v).toLocaleString("en-US")),
      },
    });
    const line = chart.addSeries(LineSeries, { color, lineWidth: 2 });
    line.setData(
      current.points.map((pt) => ({
        time: Math.floor(new Date(`${pt.date}T12:00:00Z`).getTime() / 1000) as UTCTimestamp,
        value: pt.price,
      }))
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [current]);

  if (series.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        {series.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(i)}
            className="rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors"
            style={
              i === active
                ? { background: "var(--navy)", color: "var(--text-on-navy)" }
                : { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" }
            }
          >
            {s.faName}
          </button>
        ))}
      </div>
      <div ref={ref} className="mt-3 w-full" style={{ minHeight: 280 }} />
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>
        قیمت به تومان — یک نقطه به‌ازای هر روز (آخرین نمونهٔ ثبت‌شده). تاریخچه از زمان راه‌اندازی
        سامانهٔ ثبت (تیر ۱۴۰۵) جمع می‌شود و تا ۱۸۰ روز نگه داشته می‌شود.
      </p>
    </div>
  );
}
