"use client";

import { AlertTriangle, RefreshCw, Clock } from "lucide-react";
import { toPersianDigits } from "@/lib/format";

interface Props {
  isExpired: boolean;
  daysLeft: number | null;
  onRetake: () => void;
}

// بنر اعتبارسنجی ۱۸۰روزه. منقضی → هشدارِ قوی؛ ≤۱۴ روز مانده → هشدارِ ملایم.
export default function RiskRevalidationBanner({ isExpired, daysLeft, onRetake }: Props) {
  const soonExpiring = !isExpired && daysLeft !== null && daysLeft <= 14 && daysLeft >= 0;
  if (!isExpired && !soonExpiring) return null;

  if (isExpired) {
    return (
      <div
        className="rounded-xl p-4 flex items-start gap-3 flex-wrap"
        style={{ background: "rgba(185,28,28,0.07)", border: "1px solid rgba(185,28,28,0.3)" }}
      >
        <AlertTriangle size={20} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1 min-w-[220px]">
          <div className="font-bold text-sm" style={{ color: "var(--danger)" }}>
            پروفایل ریسک شما منقضی شده است
          </div>
          <p className="text-sm mt-1 leading-7" style={{ color: "var(--text-2)" }}>
            بیش از ۱۸۰ روز از آخرین ارزیابی شما گذشته یا مشاور آن را برای بازنگری منقضی کرده است.
            برای به‌روزرسانی پرتفوی، لطفاً کوییز را دوباره کامل کنید.
          </p>
        </div>
        <button type="button" onClick={onRetake} className="btn btn-gold" style={{ fontSize: "0.8rem" }}>
          <RefreshCw size={14} />
          تکمیل مجدد کوییز
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3 flex-wrap"
      style={{ background: "var(--gold-tint)", border: "1px solid rgba(184,134,11,0.3)" }}
    >
      <Clock size={20} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-[220px]">
        <div className="font-bold text-sm" style={{ color: "var(--navy-deep)" }}>
          اعتبار پروفایل ریسک شما رو به پایان است
        </div>
        <p className="text-sm mt-1 leading-7" style={{ color: "var(--text-2)" }}>
          تا {toPersianDigits(daysLeft ?? 0)} روز دیگر پروفایل شما منقضی می‌شود. می‌توانید از همین حالا
          کوییز را به‌روز کنید.
        </p>
      </div>
      <button type="button" onClick={onRetake} className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
        <RefreshCw size={14} />
        به‌روزرسانی
      </button>
    </div>
  );
}
