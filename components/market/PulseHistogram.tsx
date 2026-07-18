"use client";
// نبض بازار — هیستوگرام پراکندگی بازدهی نمادها (مرجع بصری: داشبورد بازار بورس‌ویو).
// ستون‌ها با div و ارتفاع نسبی رندر می‌شوند (بدون کتابخانهٔ چارت)؛ رنگ‌ها فقط توکن CSS.
import type { MarketPulse } from "@/lib/core/marketToday";
import { toPersianDigits } from "@/lib/format";

const BAR_COLORS = [
  "var(--success)",
  "var(--success)",
  "var(--success)",
  "var(--gold)",
  "var(--danger)",
  "var(--danger)",
  "var(--danger)",
];

export default function PulseHistogram({ pulse }: { pulse: MarketPulse }) {
  const maxCount = Math.max(1, ...pulse.buckets.map((b) => b.count));
  const posPct = pulse.posShare;
  return (
    <div>
      {/* هیستوگرام — راست‌به‌چپ: مثبت‌ترین بازه سمت راست */}
      <div className="flex items-end justify-between gap-2" style={{ height: 150 }} dir="rtl" role="img"
        aria-label="هیستوگرام پراکندگی بازدهی نمادهای بازار">
        {pulse.buckets.map((b, i) => {
          const h = Math.max(b.count > 0 ? 8 : 2, Math.round((b.count / maxCount) * 118));
          return (
            <div key={b.label} className="flex flex-col items-center justify-end gap-1 flex-1 min-w-0" style={{ height: "100%" }}>
              <span className="text-[11px] font-bold" style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                {toPersianDigits(b.count)}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: h,
                  maxWidth: 52,
                  background: b.count > 0 ? BAR_COLORS[i] : "var(--line)",
                  opacity: b.count > 0 ? (i === 3 ? 0.75 : 0.9) : 1,
                }}
              />
              <span className="text-[10px] leading-4 text-center whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                {b.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* نوار سهم مثبت/منفی */}
      {posPct != null ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11.5px] mb-1" style={{ color: "var(--text-3)" }}>
            <span style={{ color: "var(--success)", fontWeight: 700 }}>
              ٪{toPersianDigits(Math.round(posPct))} نمادها مثبت
            </span>
            <span style={{ color: "var(--danger)", fontWeight: 700 }}>
              ٪{toPersianDigits(Math.round(100 - posPct))} منفی یا خنثی
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full" dir="rtl" aria-hidden>
            <div style={{ width: `${posPct}%`, background: "var(--success)" }} />
            <div style={{ width: `${100 - posPct}%`, background: "var(--danger)", opacity: 0.75 }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
