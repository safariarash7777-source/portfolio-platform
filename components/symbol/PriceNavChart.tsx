"use client";
// نمودار قیمت در برابر NAV ابطال صندوق — M6 رصد بازار.
// دادهٔ سری از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی).
// اصل صداقت داده: فقط روزهایی که NAV واقعاً ثبت شده رسم می‌شود؛ هیچ درون‌یابی.
import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type Time,
  type UTCTimestamp,
  type ISeriesApi,
} from "lightweight-charts";
import { toPersianDigits } from "@/lib/format";
import { useThemeToken, readChartPalette, chartThemeOptions } from "@/lib/useChartTheme";
import { chartAxisDateLabel, chartTooltipDateLabel } from "./chartDate";

export interface PriceNavPoint {
  time: number; // epoch seconds
  nav: number; // تومان
  close: number | null; // تومان
}

export default function PriceNavChart({ points }: { points: PriceNavPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const navRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceRef = useRef<ISeriesApi<"Line"> | null>(null);
  const theme = useThemeToken();

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    const p = readChartPalette();
    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { color: p.bg }, textColor: p.text },
      localization: {
        priceFormatter: (value: number) => toPersianDigits(Math.round(value).toLocaleString("en-US")).replace(/,/g, "٬"),
        timeFormatter: (time: Time) => chartTooltipDateLabel(time),
      },
      grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
      rightPriceScale: { borderColor: p.line },
      timeScale: {
        borderColor: p.line,
        tickMarkFormatter: (time: Time) => chartAxisDateLabel(time),
      },
      autoSize: true,
      height: 300,
    });

    const navSeries = chart.addSeries(LineSeries, {
      color: p.gold,
      lineWidth: 2,
      title: "NAV",
    });
    navSeries.setData(
      points.map((d) => ({ time: d.time as UTCTimestamp, value: d.nav }))
    );

    const priceSeries = chart.addSeries(LineSeries, {
      color: p.navy,
      lineWidth: 2,
      title: "قیمت",
    });
    priceSeries.setData(
      points
        .filter((d) => d.close != null)
        .map((d) => ({ time: d.time as UTCTimestamp, value: d.close as number }))
    );

    chart.timeScale().fitContent();
    chartRef.current = chart;
    navRef.current = navSeries;
    priceRef.current = priceSeries;
    return () => {
      chartRef.current = null;
      navRef.current = null;
      priceRef.current = null;
      chart.remove();
    };
  }, [points]);

  // تغییرِ تم → فقط رنگ‌ها. دادهٔ دو سری و بازهٔ دیدِ کاربر دست‌نخورده می‌مانند.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const p = readChartPalette();
    chart.applyOptions(chartThemeOptions(p));
    navRef.current?.applyOptions({ color: p.gold });
    priceRef.current?.applyOptions({ color: p.navy });
  }, [theme]);

  if (points.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed p-6 text-center text-sm"
        style={{ borderColor: "var(--line-strong)", color: "var(--text-3)" }}
      >
        تاریخچهٔ NAV این صندوق هنوز در سامانه ثبت نشده است؛ انباشت روزانه از این پس
        به‌صورت خودکار انجام می‌شود.
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--text-2)" }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--navy)" }} />
            قیمت پایانی (تومان)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--gold)" }} />
            NAV ابطال (تومان)
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
          {toPersianDigits(points.length)} روز ثبت‌شده
        </span>
      </div>
      <div
        ref={ref}
        style={{ minHeight: 300 }}
        role="img"
        aria-label={`نمودار قیمت پایانی و NAV ابطال در ${toPersianDigits(points.length)} روز ثبت‌شده؛ هر دو بر حسب تومان`}
      />
      {points.length < 15 && (
        <p className="mt-2 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
          انباشت تاریخچهٔ NAV به‌تازگی آغاز شده؛ نمودار با گذشت روزهای معاملاتی کامل‌تر می‌شود.
        </p>
      )}
    </div>
  );
}
