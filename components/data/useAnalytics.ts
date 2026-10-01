"use client";
import { useEffect, useRef, useState } from "react";
import type { AnalyticKind, AnalyticsResponse } from "@/lib/data-analytics";

export function analyticKind(filter: string | null): AnalyticKind | null {
  return filter === "suspicious_volume" ? "volume" : filter === "monthly_rev_yoy" ? "monthly" : filter === "quarterly_rev_yoy" ? "quarterly" : null;
}

/** Per-mounted public explorer cache. Account presets remain inside ScreenerPanel. */
export default function useAnalytics(filter: string | null) {
  const kind = analyticKind(filter);
  const [reads, setReads] = useState<Partial<Record<AnalyticKind, AnalyticsResponse>>>({});
  const [pending, setPending] = useState<AnalyticKind | null>(null);
  const [failed, setFailed] = useState<AnalyticKind | null>(null);
  const [retry, setRetry] = useState(0);
  const readsRef = useRef(reads);
  useEffect(() => {
    const current = kind ? readsRef.current[kind] : undefined;
    const expiresAt = current ? (current.coverage.completedAt ?? 0) + current.provenance.ttlMs : 0;
    if (!kind || (expiresAt > Date.now() && current?.coverage.state === "complete")) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    let alive = true;
    setPending(kind); setFailed(null);
    (async () => {
      try {
        const res = await fetch(`/api/data/analytics?kind=${kind}`, { cache: "no-store", signal: controller.signal });
        const result = await res.json() as AnalyticsResponse;
        if (result.kind !== kind || !result.coverage || !result.provenance || !result.data || result.coverage.state === "error") throw new Error("analytics_unavailable");
        if (alive) {
          readsRef.current = { ...readsRef.current, [kind]: result };
          setReads(readsRef.current);
        }
        if (alive && result.coverage.state === "stale") setFailed(kind);
      } catch { if (alive) setFailed(kind); }
      finally { clearTimeout(timer); if (alive) setPending(null); }
    })();
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
    // Completion updates the cache; it must not auto-retry a stale/error read.
  }, [kind, retry]);
  return { reads, pending: pending === kind && kind !== null, failed: failed === kind && kind !== null, retry: () => setRetry(n => n + 1), kind };
}
