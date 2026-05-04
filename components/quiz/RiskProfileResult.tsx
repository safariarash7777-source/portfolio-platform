"use client";

import { useCallback } from "react";
import {
  CheckCircle,
  RotateCcw,
  TrendingUp,
  Package,
  CreditCard,
  Lightbulb,
} from "lucide-react";
import type { RiskProfile } from "./quizData";

interface Props {
  profile: RiskProfile;
  totalScore: number;
  onRestart: () => void;
}

const PORTFOLIO_COLORS = [
  "#1E3A8A", // navy
  "#B8860B", // gold
  "#15803D", // success
  "#0EA5E9", // sky
  "#7C3AED", // violet
  "#EA580C", // orange
];

function extractPct(text: string): number {
  const m = text.match(/(\d+)٪/);
  if (m) return parseInt(m[1]);
  // fallback for ASCII percent
  const m2 = text.match(/(\d+)%/);
  return m2 ? parseInt(m2[1]) : 0;
}

function ScoreRing({ score, max, accent }: { score: number; max: number; accent: string }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="130" height="130" className="-rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c}`}
          strokeDashoffset={c - dash}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-display text-3xl font-bold"
          style={{ color: "var(--navy-deep)" }}
        >
          {score}
        </span>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>
          از {max}
        </span>
      </div>
    </div>
  );
}

export default function RiskProfileResult({
  profile,
  totalScore,
  onRestart,
}: Props) {
  const handlePrint = useCallback(() => window.print(), []);

  return (
    <div className="space-y-5 print:space-y-3">
      {/* Hero card */}
      <div
        className="card-elevated p-7"
        style={{
          background:
            "linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)",
        }}
      >
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold mb-5"
          style={{
            background: "rgba(21,128,61,0.1)",
            color: "var(--success)",
            border: "1px solid rgba(21,128,61,0.25)",
          }}
        >
          <CheckCircle size={14} />
          پرسشنامه با موفقیت تکمیل شد
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-7">
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <ScoreRing score={totalScore} max={110} accent={profile.accent} />
            <span className="text-sm" style={{ color: "var(--text-3)" }}>
              امتیاز کل
            </span>
          </div>

          <div className="flex-1 text-center md:text-right">
            <p className="text-xs font-bold tracking-widest uppercase mb-1"
               style={{ color: "var(--text-3)" }}>
              پروفایل ریسک شما
            </p>
            <h2
              className="font-display text-3xl md:text-4xl font-bold mb-3"
              style={{ color: profile.accent }}
            >
              {profile.category}
            </h2>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold mb-4"
              style={{
                background: "var(--gold-tint)",
                color: "var(--navy-deep)",
                border: "1px solid rgba(184,134,11,0.3)",
              }}
            >
              بازه امتیاز: {profile.scoreRange}
            </div>
            <p className="text-sm md:text-base leading-7" style={{ color: "var(--text-2)" }}>
              {profile.description}
            </p>
          </div>
        </div>
      </div>

      {/* Portfolio + Products */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ width: 32, height: 32, background: "var(--gold-tint)", color: "var(--navy-deep)" }}
            >
              <TrendingUp size={16} />
            </div>
            <h3 className="font-display font-bold" style={{ color: "var(--navy-deep)" }}>
              ترکیب پیشنهادی سبد
            </h3>
          </div>
          <div className="space-y-4">
            {profile.portfolio.map((item, i) => {
              const pct = extractPct(item);
              const label = item.replace(/^\d+٪\s*/, "").replace(/^\d+%\s*/, "");
              const color = PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length];
              return (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm" style={{ color: "var(--text)" }}>
                      {label}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy-deep)" }}>
                      {pct}٪
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ width: 32, height: 32, background: "var(--gold-tint)", color: "var(--navy-deep)" }}
            >
              <Package size={16} />
            </div>
            <h3 className="font-display font-bold" style={{ color: "var(--navy-deep)" }}>
              محصولات پیشنهادی
            </h3>
          </div>
          <ul className="space-y-3">
            {profile.products.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "var(--text-2)" }}>
                <span
                  className="flex-shrink-0 mt-1.5"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: profile.accent,
                  }}
                />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Plan */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{ width: 44, height: 44, background: "var(--navy-deep)", color: "var(--gold-soft)" }}
          >
            <CreditCard size={20} />
          </div>
          <div>
            <p className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
              {profile.plan}
            </p>
            <p className="text-sm mt-1 leading-7" style={{ color: "var(--text-2)" }}>
              {profile.planDetail}
            </p>
          </div>
        </div>
      </div>

      {/* Tip */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--gold-tint)", border: "1px solid rgba(184,134,11,0.3)" }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, background: "var(--gold)", color: "var(--navy-deep)" }}
          >
            <Lightbulb size={18} />
          </div>
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: "var(--navy-deep)" }}>
              توصیه مشاور — آرش صفری
            </p>
            <p className="text-sm leading-7" style={{ color: "var(--navy-deep)" }}>
              {profile.tip}
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p
        className="text-xs leading-7 text-center px-4 py-3 rounded-xl"
        style={{ color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--line)" }}
      >
        پروفایل ریسک شما ثابت نیست. توصیه می‌شود هر ۶ تا ۱۲ ماه یک‌بار این پرسشنامه را مجدداً تکمیل کنید.
        برای مشاوره تخصصی، از داشبورد کاربری خود اقدام کنید.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 no-print">
        <button type="button" onClick={handlePrint} className="btn btn-outline flex-1">
          چاپ نتیجه
        </button>
        <button type="button" onClick={onRestart} className="btn btn-gold flex-1">
          <RotateCcw size={16} />
          شروع مجدد
        </button>
      </div>
    </div>
  );
}
