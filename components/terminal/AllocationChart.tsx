"use client";
// منحنی ارزش سبد (با ریبالانس) در برابر نگه‌داری ساده — برای صفحهٔ تخصیص دارایی.
// داده از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی).
import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface AllocationChartPoint {
  time: number; // epoch seconds
  value: number; // سبد با ریبالانس (پایه ۱۰۰)
  holdValue: number; // بدون ریبالانس (پایه ۱۰۰)
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
    gold: v("--gold", "#D4A22B"),
  };
}

export default function AllocationChart({ points }: { points: AllocationChartPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    const p = palette();
    const charts: IChartApi[] = [];

    const chart = createChart(ref.current, {
      layout: { background: { color: p.bg }, textColor: p.text },
      grid: {
        vertLines: { color: p.line },
        horzLines: { color: p.line },
      },
      rightPriceScale: { borderColor: p.line },
      timeScale: { borderColor: p.line },
      autoSize: true,
      height: 280,
    });
    charts.push(chart);

    const rebal = chart.addSeries(LineSeries, {
      color: p.navy,
      lineWidth: 2,
      title: "با ریبالانس",
    });
    rebal.setData(
      points.map((pt) => ({ time: pt.time as UTCTimestamp, value: pt.value }))
    );

    const hold = chart.addSeries(LineSeries, {
      color: p.gold,
      lineWidth: 2,
      title: "بدون ریبالانس",
    });
    hold.setData(
      points.map((pt) => ({ time: pt.time as UTCTimestamp, value: pt.holdValue }))
    );

    chart.timeScale().fitContent();
    return () => charts.forEach((c) => c.remove());
  }, [points]);

  if (points.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-4 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "var(--navy)" }} />
          سبد با ریبالانس فصلی (پایه ۱۰۰)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "var(--gold)" }} />
          خرید و نگه‌داری (بدون ریبالانس)
        </span>
      </div>
      <div ref={ref} dir="ltr" />
    </div>
  );
}
