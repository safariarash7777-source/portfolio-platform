"use client";

import { Lightbulb, Package, Sparkles } from "lucide-react";
import type { RiskProfile } from "@/components/quiz/quizData";

interface Props {
  profile: RiskProfile;
}

/**
 * کارت پلن و محصولات پیشنهادی — نمایش plan, planDetail, products و tip
 * بر اساس پروفایل ریسک کاربر. بخشی از داشبورد محصولی.
 */
export default function RiskPlanCard({ profile }: Props) {
  return (
    <div className="card p-6 space-y-5">
      {/* Plan header */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-xl"
          style={{ width: 44, height: 44, background: profile.accent + "18", color: profile.accent }}
        >
          <Sparkles size={20} />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
            {profile.plan}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            {profile.planDetail}
          </p>
        </div>
      </div>

      {/* Products */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Package size={14} style={{ color: "var(--gold)" }} />
          <span className="text-xs font-bold" style={{ color: "var(--text-3)" }}>
            ابزارهای رایج این پروفایل
          </span>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {profile.products.map((p) => (
            <li
              key={p}
              className="flex items-center gap-2 text-sm py-2 px-3 rounded-lg"
              style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
            >
              <span
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ background: profile.accent }}
              />
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* Tip */}
      <div
        className="flex items-start gap-3 rounded-xl p-4"
        style={{
          background: "var(--gold-tint)",
          border: "1px solid rgba(184,134,11,0.2)",
        }}
      >
        <Lightbulb size={16} className="flex-shrink-0 mt-0.5" style={{ color: "var(--gold)" }} />
        <p className="text-sm leading-7" style={{ color: "var(--navy-deep)" }}>
          {profile.tip}
        </p>
      </div>
    </div>
  );
}
