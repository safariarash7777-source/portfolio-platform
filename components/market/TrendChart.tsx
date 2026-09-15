"use client";
// نمودار روند طلا و دلار — تصمیم T8: منبع ir_market_history (نمونه‌های رله).
// دادهٔ سری از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی) — الگوی HistoryChart.
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useThemeToken, readChartPalette, chartThemeOptions } from "@/lib/useChartTheme";
import type { TrendSeries } from "@/lib/core/trend";
import { toPersianDigits } from "@/lib/format";

const SERIES_COLOR_KEY: Record<string, "gold" | "navy"> = {
  IR_GOLD_18K: "gold",
  USD: "navy",
};

export default function TrendChart({ series }: { series: TrendSeries[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const theme = useThemeToken();

  const current = series[active] ?? null;

  useEffect(() => {
    if (!ref.current || !current || current.points.length === 0) return;
    const p = readChartPalette();
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
    chartRef.current = chart;
    seriesRef.current = line;
    return () => {
      chartRef.current = null;
      seriesRef.current = null;
      chart.remove();
    };
  }, [current]);

  // تغییرِ تم → فقط رنگ‌ها، با `applyOptions`. داده و بازهٔ دیدِ کاربر می‌مانند.
  useEffect(() => {
    const chart = chartRef.current;
    const line = seriesRef.current;
    if (!chart || !line || !current) return;
    const p = readChartPalette();
    chart.applyOptions(chartThemeOptions(p));
    const key = SERIES_COLOR_KEY[current.id] ?? "navy";
    line.applyOptions({ color: key === "gold" ? p.gold : p.navy });
  }, [theme, current]);

  if (series.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        {series.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(i)}
            className="inline-flex items-center rounded-full px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)]"
            style={
              // ۴۴ پیکسل: کمینهٔ هدفِ لمسی (پیش از این ۲۷ پیکسل بود).
              i === active
                ? { minHeight: 44, background: "var(--navy)", color: "var(--text-on-navy)" }
                : { minHeight: 44, background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--line)" }
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
