"use client";

import { useEffect, useState } from "react";
import { browserPollEnvironment, startVisiblePoll } from "@/lib/visible-poll";
import { MONTHLY_SCREEN_RETAIN_MS } from "@/lib/fundamental/monthly-sales-clocks";

export function salesResultExpiry(clocks: readonly (string | undefined)[], now: number): number | null {
  const times = clocks.map(clock => Date.parse(clock ?? ""));
  if (!times.length || times.some(at => !Number.isFinite(at) || at > now + 1000)) return null;
  const expires = Math.min(...times) + MONTHLY_SCREEN_RETAIN_MS;
  return expires > now ? expires : null;
}

export function useSalesRead<T>(load: (signal: AbortSignal) => Promise<{data: T; clocks: (string | undefined)[]}>) {
  const [snapshot, setSnapshot] = useState<{data: T; expires: number} | null>(null);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => startVisiblePoll(async signal => {
    const request = AbortSignal.any([signal, AbortSignal.timeout(55_000)]);
    try {
      const { data, clocks } = await load(request);
      const expires = salesResultExpiry(clocks, Date.now());
      if (!expires) throw new Error("مهلت نمایش نتیجهٔ قبلی گذشته یا زمان آن نامشخص است.");
      if (!signal.aborted) { setSnapshot({data, expires}); setExpired(false); setError(""); }
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error && cause.name === "Error" ? cause.message : "دریافت داده ممکن نشد.");
    }
  }, browserPollEnvironment(), 5 * 60_000, true), [load, attempt]);
  useEffect(() => {
    if (!snapshot) return;
    const timer = window.setTimeout(() => {
      setExpired(true);
      setSnapshot(previous => previous === snapshot ? null : previous);
    }, Math.max(0, snapshot.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [snapshot]);
  return { data: snapshot && snapshot.expires > Date.now() ? snapshot.data : null, error: error || (expired && !snapshot ? "مهلت نمایش آخرین نتیجهٔ کامل گذشته است." : ""), retry: () => setAttempt(n => n + 1) };
}
