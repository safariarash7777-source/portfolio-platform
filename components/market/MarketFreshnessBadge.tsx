"use client";
import { useEffect, useState } from "react";
import { computeFreshness } from "@/lib/market-freshness";
export default function FreshnessBadge({ fetchedAt, initialNow }: { fetchedAt: number | null; initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    tick();
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const f = computeFreshness({
    irFetchedAt: fetchedAt,
    usesIr: true,
    usesGlobal: false,
    now,
  });
  const tone =
    f.state === "fresh"
      ? { dot: "var(--success)", text: "var(--text-2)" }
      : f.state === "stale"
        ? { dot: "var(--warning)", text: "var(--warning)" }
        : { dot: "var(--text-3)", text: "var(--text-3)" };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: tone.text }}
    >
      {/* رنگ تنها حاملِ معنا نیست: متنِ کنارش همیشه وضعیت را می‌گوید. */}
      <span aria-hidden className="inline-block rounded-full" style={{ width: 6, height: 6, background: tone.dot }} />
      {f.state === "fresh" ? "دریافت بسته در ۳۰ دقیقهٔ اخیر" : f.state === "stale" ? "دریافت بسته قدیمی است" : "زمان دریافت بسته نامشخص"}
    </span>
  );
}
