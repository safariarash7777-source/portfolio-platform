"use client";
// منحنی ارزش سبد (با ریبالانس) در برابر نگه‌داری ساده — برای صفحهٔ تخصیص دارایی.
// داده از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی).
import { useEffect, useRef } from "react";
import {
  readChartPalette,
  chartThemeOptions,
  seriesColor,
  useThemeToken,
} from "@/lib/useChartTheme";
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

/*
 * پالتِ محلی حذف شد و جایش `lib/useChartTheme` نشست.
 *
 * نسخهٔ قبل سه اشکال داشت: (۱) `--navy` را می‌خواند، که روی سطحِ تمِ تیره
 * ۱٫۶:۱ می‌دهد و خطِ سری عملاً ناپیدا می‌شد؛ (۲) fallbackِ طلایی‌اش
 * `#D4A22B` بود ولی توکنِ `--gold` امروز `#B8860B` است — دو رنگِ متفاوت با
 * یک نام؛ (۳) رنگ‌ها فقط یک بار در mount خوانده می‌شدند، پس با تعویضِ تم
 * نمودار در تمِ قبلی جا می‌ماند.
 */
export default function AllocationChart({ points }: { points: AllocationChartPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useThemeToken();

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    const p = readChartPalette();
    const charts: IChartApi[] = [];

    const chart = createChart(ref.current, {
      ...chartThemeOptions(p),
      autoSize: true,
      height: 280,
    });
    charts.push(chart);
    chartRef.current = chart;

    const rebal = chart.addSeries(LineSeries, {
      color: seriesColor(p, 0),
      lineWidth: 2,
      title: "با ریبالانس",
    });
    rebal.setData(
      points.map((pt) => ({ time: pt.time as UTCTimestamp, value: pt.value }))
    );

    const hold = chart.addSeries(LineSeries, {
      color: seriesColor(p, 1),
      lineWidth: 2,
      title: "بدون ریبالانس",
    });
    hold.setData(
      points.map((pt) => ({ time: pt.time as UTCTimestamp, value: pt.holdValue }))
    );

    chart.timeScale().fitContent();
    return () => {
      charts.forEach((c) => c.remove());
      chartRef.current = null;
    };
  }, [points]);

  // تغییرِ تم فقط رنگ‌ها را عوض می‌کند. `applyOptions` نه به داده دست می‌زند
  // نه به بازهٔ دیدِ کاربر؛ بازساختنِ نمودار هر دو را دور می‌ریخت.
  useEffect(() => {
    if (!chartRef.current) return;
    const p = readChartPalette();
    chartRef.current.applyOptions(chartThemeOptions(p));
  }, [theme]);

  if (points.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-4 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "var(--data-1)" }} />
          سبد با ریبالانس فصلی (پایه ۱۰۰)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "var(--data-2)" }} />
          خرید و نگه‌داری (بدون ریبالانس)
        </span>
      </div>
      <div ref={ref} dir="ltr" />
    </div>
  );
}
