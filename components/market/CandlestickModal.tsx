"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { X } from "lucide-react";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// پالتِ برند (hex، چون canvas متغیرِ CSS نمی‌گیرد). تم روشن/تیره خوانده می‌شود.
function palette() {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return {
    bg: dark ? "#131C30" : "#FFFFFF",
    text: dark ? "#CBD5E1" : "#334155",
    line: dark ? "#1E2A47" : "#E2E8F0",
    up: "#15803D", // success
    down: "#B91C1C", // danger
    navy: "#1E3A8A",
  };
}

export default function CandlestickModal({
  id,
  faName,
  onClose,
}: {
  id: string;
  faName: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let chart: IChartApi | null = null;
    let disposed = false;

    (async () => {
      let candles: Candle[] = [];
      try {
        const res = await fetch(`/api/market/ohlc?id=${encodeURIComponent(id)}`);
        const json = await res.json();
        candles = Array.isArray(json.candles) ? json.candles : [];
      } catch {
        candles = [];
      }
      if (disposed) return;
      if (candles.length === 0 || !containerRef.current) {
        setState("empty");
        return;
      }

      const c = palette();
      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 320,
        layout: { background: { color: c.bg }, textColor: c.text, attributionLogo: false },
        grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
        rightPriceScale: { borderColor: c.line },
        timeScale: { borderColor: c.line, timeVisible: false },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: c.up,
        downColor: c.down,
        borderUpColor: c.up,
        borderDownColor: c.down,
        wickUpColor: c.up,
        wickDownColor: c.down,
      });
      series.setData(
        candles.map((k) => ({
          time: k.time as UTCTimestamp,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        }))
      );
      chart.timeScale().fitContent();
      setState("ready");

      const onResize = () => {
        if (chart && containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      };
      window.addEventListener("resize", onResize);
      // cleanup handle
      (chart as unknown as { _cleanup?: () => void })._cleanup = () =>
        window.removeEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      if (chart) {
        (chart as unknown as { _cleanup?: () => void })._cleanup?.();
        chart.remove();
      }
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5" role="dialog" aria-label={`نمودار ${faName}`}>
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.5)" }} onClick={onClose} aria-hidden />
      <div className="card-elevated p-5 w-full max-w-2xl relative" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            نمودار کندل — {faName}
          </h3>
          <button type="button" onClick={onClose} aria-label="بستن" className="btn btn-ghost" style={{ padding: "0.4rem" }}>
            <X size={20} />
          </button>
        </div>

        {state === "empty" ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
            دادهٔ کندل برای این نماد در دسترس نیست.
          </div>
        ) : (
          <>
            <div ref={containerRef} style={{ width: "100%", minHeight: 320 }} />
            {state === "loading" && (
              <div className="py-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
                در حال بارگذاری نمودار...
              </div>
            )}
            <p className="text-[11px] mt-3" style={{ color: "var(--text-3)" }}>
              کندلِ روزانه (۳۰ روز اخیر، دلاری). داده صرفاً جنبهٔ اطلاع‌رسانی دارد.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
