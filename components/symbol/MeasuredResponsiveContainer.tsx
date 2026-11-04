"use client";

import React, { useEffect, useRef, useState, type ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

type Size = { width: number; height: number };

/** Measure the real chart slot, including when its tab/details are hidden.
 * Only the chart subtree waits for positive size; parent controls stay mounted.
 * Numeric dimensions are observed values, not placeholder initial dimensions. */
export default function MeasuredResponsiveContainer({ children }: { children: ReactElement }) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let active = true;
    const measure = ({ width, height }: Size) => {
      if (!active) return;
      const next = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? { width, height } : null;
      setSize(previous => previous?.width === next?.width && previous?.height === next?.height ? previous : next);
    };
    const observer = new ResizeObserver(entries => {
      const entry = entries.find(item => item.target === element);
      if (entry) measure(entry.contentRect);
    });
    observer.observe(element);
    measure(element.getBoundingClientRect());
    return () => { active = false; observer.disconnect(); };
  }, []);

  return <div ref={host} style={{ width: "100%", height: "100%", minWidth: 0 }}>
    {/* Keep the chart's intrinsic width from preventing its slot from shrinking. */}
    <div style={{ width: 0, height: 0, overflow: "visible" }}>
      {size ? <ResponsiveContainer width={size.width} height={size.height}>{children}</ResponsiveContainer> : null}
    </div>
  </div>;
}
