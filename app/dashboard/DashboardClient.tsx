"use client";

import { useState } from "react";
import {
  PieChart,
  ShieldCheck,
  Wallet,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ClipboardList,
} from "lucide-react";
import RiskProfileQuiz from "@/components/quiz/RiskProfileQuiz";

type Tab = "overview" | "risk" | "portfolio";

interface DashboardClientProps {
  userId?: string;
  userName?: string;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",  label: "نمای کلی",         icon: <Activity size={16} /> },
  { id: "risk",      label: "ارزیابی ریسک",     icon: <ClipboardList size={16} /> },
  { id: "portfolio", label: "پرتفوی پیشنهادی",   icon: <PieChart size={16} /> },
];

export default function DashboardClient({
  userId,
  userName = "سرمایه‌گذار",
}: DashboardClientProps) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
        <div>
          <span className="eyebrow">داشبورد کاربری</span>
          <h1
            className="font-display text-2xl md:text-3xl font-bold mt-1"
            style={{ color: "var(--navy-deep)" }}
          >
            خوش آمدید، {userName}
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
            تحلیل پروفایل ریسک، طراحی سبد پیشنهادی و مدیریت سرمایه‌گذاری شما در یک پنل یکپارچه.
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-3)",
            border: "1px solid var(--line)",
          }}
        >
          <ShieldCheck size={14} style={{ color: "var(--success)" }} />
          داده‌های شما رمزنگاری شده است
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 mb-6 p-1 rounded-xl"
        style={{ background: "var(--surface-2)", border: "1px solid var(--line)", width: "fit-content" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: tab === t.id ? "var(--surface)" : "transparent",
              color: tab === t.id ? "var(--navy-deep)" : "var(--text-2)",
              boxShadow: tab === t.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "overview" && <Overview />}
      {tab === "risk" && <RiskProfileQuiz userId={userId} />}
      {tab === "portfolio" && <PortfolioPlaceholder />}
    </div>
  );
}

// ─── Overview tab ────────────────────────────────────────────────────────
function Overview() {
  const KPIs = [
    {
      label: "وضعیت پروفایل ریسک",
      value: "هنوز ارزیابی نشده",
      hint: "از تب «ارزیابی ریسک» شروع کنید",
      icon: <ClipboardList size={18} />,
      tone: "neutral" as const,
    },
    {
      label: "ارزش سبد پیشنهادی",
      value: "—",
      hint: "پس از ارزیابی ریسک نمایش داده می‌شود",
      icon: <Wallet size={18} />,
      tone: "neutral" as const,
    },
    {
      label: "بازده پیش‌بینی‌شده ۱۲ ماهه",
      value: "—",
      hint: "بر مبنای داده‌های تاریخی",
      icon: <ArrowUpRight size={18} />,
      tone: "positive" as const,
    },
    {
      label: "ریسک تخمینی (انحراف معیار)",
      value: "—",
      hint: "محاسبه‌شده با مدل MPT",
      icon: <ArrowDownRight size={18} />,
      tone: "warning" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIs.map((k) => (
          <div key={k.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 36,
                  height: 36,
                  background:
                    k.tone === "positive"
                      ? "rgba(21,128,61,0.1)"
                      : k.tone === "warning"
                      ? "rgba(180,83,9,0.1)"
                      : "var(--surface-2)",
                  color:
                    k.tone === "positive"
                      ? "var(--success)"
                      : k.tone === "warning"
                      ? "var(--warning)"
                      : "var(--navy)",
                }}
              >
                {k.icon}
              </span>
            </div>
            <div className="text-xs font-bold mb-1" style={{ color: "var(--text-3)" }}>
              {k.label}
            </div>
            <div
              className="font-display text-lg font-bold"
              style={{ color: "var(--navy-deep)" }}
            >
              {k.value}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
              {k.hint}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <h3
          className="font-display font-bold text-lg mb-3"
          style={{ color: "var(--navy-deep)" }}
        >
          گام‌های پیشنهادی
        </h3>
        <ol className="space-y-3">
          {[
            { n: "۱", t: "ارزیابی پروفایل ریسک",        d: "آزمون ۲۲ سؤالی برای تعیین سطح تحمل ریسک شما (~۱۰ دقیقه)." },
            { n: "۲", t: "بررسی پرتفوی پیشنهادی",       d: "بر اساس پروفایل، تخصیص دارایی متناسب پیشنهاد می‌شود." },
            { n: "۳", t: "تأیید و فعال‌سازی",          d: "پس از تأیید، گزارش‌های ادواری برای شما ارسال می‌شود." },
          ].map((s) => (
            <li key={s.n} className="flex items-start gap-4">
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold"
                style={{
                  width: 32,
                  height: 32,
                  background: "var(--navy-deep)",
                  color: "var(--gold-soft)",
                }}
              >
                {s.n}
              </span>
              <div>
                <div className="font-bold text-sm" style={{ color: "var(--navy-deep)" }}>
                  {s.t}
                </div>
                <div className="text-sm mt-0.5" style={{ color: "var(--text-2)" }}>
                  {s.d}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Portfolio placeholder ───────────────────────────────────────────────
function PortfolioPlaceholder() {
  return (
    <div className="card p-10 text-center">
      <div
        className="mx-auto mb-5 flex items-center justify-center rounded-2xl"
        style={{
          width: 64,
          height: 64,
          background: "var(--gold-tint)",
          color: "var(--navy-deep)",
        }}
      >
        <PieChart size={28} />
      </div>
      <h3
        className="font-display font-bold text-xl mb-2"
        style={{ color: "var(--navy-deep)" }}
      >
        پرتفوی شما هنوز آماده نیست
      </h3>
      <p className="text-sm leading-7 mb-5 max-w-md mx-auto" style={{ color: "var(--text-2)" }}>
        برای مشاهده پرتفوی پیشنهادی، ابتدا از تب «ارزیابی ریسک» پرسشنامه را تکمیل کنید.
        موتور تحلیل کمی (Quant-Engine) سپس سبد بهینه را برای شما طراحی می‌کند.
      </p>
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        موتور تحلیل کمی به‌صورت Python و مبتنی بر MPT اجرا می‌شود.
      </p>
    </div>
  );
}
