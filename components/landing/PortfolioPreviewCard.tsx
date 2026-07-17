import { ArrowLeft } from "lucide-react";

/**
 * امضای صفحه — پیش‌نمایش محصول: «نتیجهٔ آزمون ریسک ← سبد پیشنهادی».
 * تمام اعداد صرفاً نمونهٔ نمایشی‌اند و با برچسب صریح مشخص شده‌اند (الزام قانونی).
 * بدون کتابخانهٔ چارت — همه با CSS و توکن‌های برند (LCP سبک).
 */

const RISK_LEVELS = ["خیلی محافظه‌کار", "محافظه‌کار", "متعادل", "جسور", "تهاجمی"];
const ACTIVE_RISK = 2; // «متعادل»

const ALLOCATION = [
  { label: "سهام", pct: 45, color: "var(--navy)" },
  { label: "صندوق‌های سرمایه‌گذاری", pct: 30, color: "var(--navy-soft)" },
  { label: "طلا", pct: 15, color: "var(--gold)" },
  { label: "درآمد ثابت", pct: 10, color: "var(--line-strong)" },
];

export default function PortfolioPreviewCard() {
  return (
    <div
      className="relative rounded-2xl p-6 sm:p-7"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {/* Header: label + demo badge */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <span className="eyebrow">پیش‌نمایش محصول</span>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{
            background: "var(--gold-tint)",
            color: "var(--text-on-gold)",
            border: "1px solid rgba(184,134,11,0.35)",
          }}
        >
          نمونهٔ نمایشی
        </span>
      </div>

      {/* A — risk result */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-bold" style={{ color: "var(--text-2)" }}>
          نتیجهٔ آزمون ریسک
        </span>
        <span
          className="font-display text-base font-bold"
          style={{ color: "var(--navy-deep)" }}
        >
          پروفایل: متعادل
        </span>
      </div>

      {/* risk meter */}
      <div className="grid grid-cols-5 gap-1.5 mb-1">
        {RISK_LEVELS.map((lvl, i) => (
          <div
            key={lvl}
            className="h-2 rounded-full"
            style={{
              background: i === ACTIVE_RISK ? "var(--gold)" : "var(--line)",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mb-6 text-[10px]" style={{ color: "var(--text-3)" }}>
        <span>کم‌ریسک</span>
        <span>پرریسک</span>
      </div>

      {/* flow arrow */}
      <div className="flex items-center gap-2 mb-5">
        <div className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span
          className="inline-flex items-center gap-1.5 text-xs font-bold"
          style={{ color: "var(--navy)" }}
        >
          نمونهٔ ساختار سبد
          <ArrowLeft size={14} />
        </span>
        <div className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      {/* B — allocation stacked bar */}
      <div
        className="flex h-3.5 w-full overflow-hidden rounded-full mb-4"
        style={{ border: "1px solid var(--line)" }}
        role="img"
        aria-label="نمونهٔ تخصیص دارایی: سهام ۴۵٪، صندوق‌ها ۳۰٪، طلا ۱۵٪، درآمد ثابت ۱۰٪"
      >
        {ALLOCATION.map((a) => (
          <div key={a.label} style={{ width: `${a.pct}%`, background: a.color }} />
        ))}
      </div>

      {/* legend */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
        {ALLOCATION.map((a) => (
          <li key={a.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2" style={{ color: "var(--text-2)" }}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ background: a.color }}
              />
              {a.label}
            </span>
            <span className="font-bold" style={{ color: "var(--navy-deep)" }}>
              ٪{toFa(a.pct)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[11px] leading-6" style={{ color: "var(--text-3)" }}>
        اعداد این کارت صرفاً برای نمایش‌اند و توصیهٔ سرمایه‌گذاری محسوب نمی‌شوند.
      </p>
    </div>
  );
}

function toFa(n: number) {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
