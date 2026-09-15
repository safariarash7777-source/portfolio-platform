"use client";
// نمودار روند شاخص کل/هم‌وزن — M5 «رصد بازار». منبع: index_history (روزی یک ردیف EOD).
// تاریخ‌ها جلالی متن منبع‌اند؛ lightweight-charts زمان میلادی می‌خواهد، پس نقاط را با
// ایندکس روز رسم و برچسب محور را با جدول جلالی جایگزین می‌کنیم (بدون تبدیل تقویم حدسی).
import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useThemeToken, readChartPalette, chartThemeOptions } from "@/lib/useChartTheme";
import type { IndexSeries } from "@/lib/core/indexTrend";
import { toPersianDigits } from "@/lib/format";

/** «1405/04/27» → «۰۴/۲۷» برای برچسب محور؛ سال در تولتیپ کامل می‌آید. */
const shortJdate = (j: string) => toPersianDigits(j.slice(5));

export default function IndexTrendChart({ series }: { series: IndexSeries[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const theme = useThemeToken();
  const current = series[active] ?? null;

  useEffect(() => {
    if (!ref.current || !current || current.points.length === 0) return;
    const p = readChartPalette();
    const color = current.id === "equal_weight" ? p.gold : p.navy;
    // نگاشت ایندکس → jdate برای برچسب محور زمان
    const jdates = current.points.map((pt) => pt.jdate);
    const DAY = 86400;
    const base = Math.floor(Date.UTC(2026, 0, 1) / 1000); // مبدأ دلخواه — فقط فاصلهٔ یکنواخت مهم است
    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { color: p.bg }, textColor: p.text },
      grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
      rightPriceScale: { borderColor: p.line },
      timeScale: {
        borderColor: p.line,
        tickMarkFormatter: (t: UTCTimestamp) => {
          const i = Math.round((Number(t) - base) / DAY);
          return jdates[i] ? shortJdate(jdates[i]) : "";
        },
      },
      localization: {
        priceFormatter: (v: number) => toPersianDigits(Math.round(v).toLocaleString("en-US")),
        timeFormatter: (t: UTCTimestamp) => {
          const i = Math.round((Number(t) - base) / DAY);
          return jdates[i] ? toPersianDigits(jdates[i]) : "";
        },
      },
      autoSize: true,
      height: 280,
    });
    const line = chart.addSeries(LineSeries, { color, lineWidth: 2 });
    line.setData(
      current.points.map((pt, i) => ({
        time: (base + i * DAY) as UTCTimestamp,
        value: pt.value,
      })),
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

  /**
   * تغییرِ تم → فقط رنگ‌ها.
   *
   * عمداً `applyOptions` و نه ساختِ دوبارهٔ نمودار: داده و بازهٔ دیدِ کاربر
   * (زوم/اسکرول) دست‌نخورده می‌مانند. `current` در وابستگی هست تا اگر سری
   * عوض شد رنگِ خط هم با نوعِ تازه بخواند.
   */
  useEffect(() => {
    const chart = chartRef.current;
    const line = seriesRef.current;
    if (!chart || !line || !current) return;
    const p = readChartPalette();
    chart.applyOptions(chartThemeOptions(p));
    line.applyOptions({ color: current.id === "equal_weight" ? p.gold : p.navy });
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
        یک نقطه به‌ازای هر روز معاملاتی (رقم پایان روز). تاریخچه از زمان راه‌اندازی سامانهٔ ثبت
        جمع می‌شود — منبع: پایگاه دادهٔ ثبت روزانهٔ سکو.
      </p>
    </div>
  );
}
