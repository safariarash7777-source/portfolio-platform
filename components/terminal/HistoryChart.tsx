"use client";
// نمودار قیمت + خالص ورود پول حقیقی برای ترمینال تحلیلگر.
// دادهٔ سری از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی).
import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface HistoryPoint {
  time: number; // epoch seconds
  close: number | null;
  netFlow: number | null; // خالص ورود پول حقیقی (ریال)
}

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
    up: v("--success", "#15803D"),
    down: v("--danger", "#B91C1C"),
  };
}

export default function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const priceRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!priceRef.current || !flowRef.current || points.length === 0) return;
    const p = palette();
    const charts: IChartApi[] = [];

    const common = {
      layout: { background: { color: p.bg }, textColor: p.text },
      grid: {
        vertLines: { color: p.line },
        horzLines: { color: p.line },
      },
      rightPriceScale: { borderColor: p.line },
      timeScale: { borderColor: p.line },
      autoSize: true,
    } as const;

    const priceChart = createChart(priceRef.current, { ...common, height: 320 });
    charts.push(priceChart);
    const priceSeries = priceChart.addSeries(AreaSeries, {
      lineColor: p.navy,
      topColor: `${p.navy}33`,
      bottomColor: `${p.navy}05`,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    priceSeries.setData(
      points
        .filter((d) => d.close != null)
        .map((d) => ({ time: d.time as UTCTimestamp, value: d.close as number }))
    );
    priceChart.timeScale().fitContent();

    const flowChart = createChart(flowRef.current, { ...common, height: 160 });
    charts.push(flowChart);
    const flowSeries = flowChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
    });
    flowSeries.setData(
      points
        .filter((d) => d.netFlow != null)
        .map((d) => ({
          time: d.time as UTCTimestamp,
          value: (d.netFlow as number) / 1e9, // میلیارد ریال
          color: (d.netFlow as number) >= 0 ? p.up : p.down,
        }))
    );
    flowChart.timeScale().fitContent();

    return () => charts.forEach((c) => c.remove());
  }, [points]);

  if (points.length === 0) {
    return (
      <div
        className="card flex h-40 items-center justify-center text-[13px]"
        style={{ color: "var(--text-3)" }}
      >
        تاریخچه‌ای برای این نماد ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <p className="mb-2 text-[12px] font-bold" style={{ color: "var(--text-2)" }}>
          قیمت پایانی (ریال)
        </p>
        <div ref={priceRef} className="w-full" style={{ minHeight: 320 }} />
      </div>
      <div className="card p-3">
        <p className="mb-2 text-[12px] font-bold" style={{ color: "var(--text-2)" }}>
          خالص ورود پول حقیقی (میلیارد ریال در روز)
        </p>
        <div ref={flowRef} className="w-full" style={{ minHeight: 160 }} />
      </div>
    </div>
  );
}
