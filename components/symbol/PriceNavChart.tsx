"use client";
// نمودار قیمت در برابر NAV ابطال صندوق — M6 رصد بازار.
// دادهٔ سری از سرور به‌صورت prop می‌آید (بدون fetch کلاینتی).
// اصل صداقت داده: فقط روزهایی که NAV واقعاً ثبت شده رسم می‌شود؛ هیچ درون‌یابی.
import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { toPersianDigits } from "@/lib/format";

export interface PriceNavPoint {
  time: number; // epoch seconds
  nav: number; // تومان
  close: number | null; // تومان
}

// استثنای مستند C4: lightweight-charts روی canvas رنگ می‌کشد و CSS var را نمی‌فهمد؛
// مقدار خود توکن در زمان اجرا خوانده می‌شود و hex صرفاً fallback هم‌ارزش همان توکن است.
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
    gold: v("--gold", "#B48A2C"),
  };
}

export default function PriceNavChart({ points }: { points: PriceNavPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    const p = palette();
    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { color: p.bg }, textColor: p.text },
      grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
      rightPriceScale: { borderColor: p.line },
      timeScale: { borderColor: p.line },
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
    return () => chart.remove();
  }, [points]);

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
      <div ref={ref} style={{ minHeight: 300 }} />
      {points.length < 15 && (
        <p className="mt-2 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
          انباشت تاریخچهٔ NAV به‌تازگی آغاز شده؛ نمودار با گذشت روزهای معاملاتی کامل‌تر می‌شود.
        </p>
      )}
    </div>
  );
}
