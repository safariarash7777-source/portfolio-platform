"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ClipboardList,
  BarChart3,
  LogOut,
  PlayCircle,
  CheckCircle2,
  Clock,
  Wallet,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import RiskProfileQuiz from "@/components/quiz/RiskProfileQuiz";
import { RISK_PROFILES } from "@/components/quiz/quizData";
import type { RiskCategory } from "@/components/quiz/quizData";
import LivePortfolio from "@/components/dashboard/LivePortfolio";
import type { HoldingDB, SnapshotDB, TxDB } from "@/components/dashboard/LivePortfolio";
import AllocationDonut from "@/components/dashboard/AllocationDonut";
import AccessCards from "@/components/dashboard/AccessCards";
import type { PaidPayment } from "@/components/dashboard/AccessCards";
import { formatJalali } from "@/lib/format";

interface Assessment {
  id: string;
  total_score: number;
  risk_category: string;
  created_at: string;
  answers_json?: Record<string, number>;
}

interface Allocation {
  asset: string;
  pct: number;
  note?: string;
}

interface Portfolio {
  id: string;
  allocations: Allocation[];
  notes?: string;
  created_at: string;
}

interface Props {
  userId: string;
  userEmail: string;
  userName: string;
  userRole?: string;
  assessment: Assessment | null;
  portfolio: Portfolio | null;
  holdings: HoldingDB[];
  snapshots: SnapshotDB[];
  transactions: TxDB[];
  telegramLinked: boolean;
  payment: PaidPayment | null;
}


export default function DashboardClient({
  userId,
  userEmail,
  userName,
  userRole,
  assessment: initialAssessment,
  portfolio,
  holdings,
  snapshots,
  transactions,
  telegramLinked,
  payment,
}: Props) {
  const isAdmin = userRole === "admin";
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(initialAssessment);
  const [showQuiz, setShowQuiz] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleQuizComplete = useCallback(
    async (score: number, category: RiskCategory, answers: Record<number, number>) => {
      setSaving(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("risk_assessments")
          .insert({
            user_id: userId,
            total_score: score,
            risk_category: category,
            answers_json: answers,
          })
          .select()
          .maybeSingle();
        if (data) {
          setAssessment(data);
          setShowQuiz(false);
        }
        router.refresh();
      } catch (err) {
        console.error("Failed to save assessment:", err);
      } finally {
        setSaving(false);
      }
    },
    [userId, router]
  );

  if (showQuiz) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-10">
        <button
          type="button"
          onClick={() => setShowQuiz(false)}
          className="btn btn-outline mb-6"
        >
          بازگشت به داشبورد
        </button>
        <RiskProfileQuiz userId={userId} onComplete={handleQuizComplete} />
        {saving && (
          <p className="text-center text-sm mt-4" style={{ color: "var(--text-3)" }}>
            در حال ذخیره نتایج...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div>
          <span className="eyebrow">
            {isAdmin ? "پنل مدیریت" : "داشبورد کاربری"}
          </span>
          <h1
            className="font-display text-2xl md:text-3xl font-bold mt-1"
            style={{ color: "var(--navy-deep)" }}
          >
            {isAdmin ? "خوش آمدید، مدیر سیستم" : `خوش آمدید، ${userName}`}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
            {userEmail}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
          {isAdmin && (
            <Link
              href="/admin"
              className="btn btn-gold"
              style={{ fontSize: "0.8rem", padding: "0.5rem 1.25rem" }}
            >
              <Settings size={14} />
              ورود به پنل مدیریت
            </Link>
          )}
          <div
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-3)",
              border: "1px solid var(--line)",
            }}
          >
            <ShieldCheck size={13} style={{ color: "var(--success)" }} />
            داده‌ها رمزنگاری شده
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-outline"
            style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}
          >
            <LogOut size={14} />
            خروج
          </button>
        </div>
      </div>

      {assessment ? (
        <WithAssessment
          assessment={assessment}
          portfolio={portfolio}
          onRetake={() => setShowQuiz(true)}
        />
      ) : (
        <NoAssessment onStart={() => setShowQuiz(true)} />
      )}

      {/* Telegram connection + channel access (payment) */}
      <div className="mt-8">
        <AccessCards telegramLinked={telegramLinked} payment={payment} />
      </div>

      {/* Live portfolio overview — KPIs, allocation donut, performance, holdings */}
      <div className="mt-8 pt-8" style={{ borderTop: "1px solid var(--line)" }}>
        <LivePortfolio holdings={holdings} snapshots={snapshots} transactions={transactions} />
      </div>
    </div>
  );
}

// ─── No assessment state ──────────────────────────────────────────────────
function NoAssessment({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-6">
      <div
        className="card-elevated p-8 md:p-12 text-center max-w-2xl mx-auto"
        style={{ borderTop: "4px solid var(--gold)" }}
      >
        <div
          className="mx-auto mb-6 flex items-center justify-center rounded-2xl"
          style={{
            width: 72,
            height: 72,
            background: "var(--gold-tint)",
            color: "var(--navy-deep)",
          }}
        >
          <ClipboardList size={32} />
        </div>
        <h2
          className="font-display text-2xl font-bold mb-3"
          style={{ color: "var(--navy-deep)" }}
        >
          ارزیابی پروفایل ریسک
        </h2>
        <p
          className="text-sm leading-8 mb-8 max-w-md mx-auto"
          style={{ color: "var(--text-2)" }}
        >
          برای دریافت پرتفوی سرمایه‌گذاری اختصاصی، ابتدا باید پروفایل ریسک شما
          تعیین شود. این فرآیند شامل ۲۲ سؤال است و حدود ۱۰ دقیقه طول می‌کشد.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: <ClipboardList size={18} />, v: "۲۲", l: "سؤال" },
            { icon: <Clock size={18} />, v: "۱۰", l: "دقیقه" },
            { icon: <BarChart3 size={18} />, v: "۶", l: "بخش" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-xl py-4 px-3 flex flex-col items-center gap-2"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
              }}
            >
              <span style={{ color: "var(--gold)" }}>{s.icon}</span>
              <div className="font-display text-xl font-bold" style={{ color: "var(--navy)" }}>
                {s.v}
              </div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>{s.l}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onStart} className="btn btn-gold">
          <PlayCircle size={18} />
          شروع آزمون
        </button>
      </div>

      <div className="card p-6 max-w-2xl mx-auto">
        <h3 className="font-display font-bold text-lg mb-4" style={{ color: "var(--navy-deep)" }}>
          مراحل بعدی
        </h3>
        <ol className="space-y-3">
          {[
            { n: "۱", t: "تکمیل ارزیابی ریسک", d: "پاسخ به ۲۲ سؤال برای تعیین سطح تحمل ریسک شما." },
            { n: "۲", t: "دریافت پرتفوی پیشنهادی", d: "مشاور ما بر اساس پروفایل شما، تخصیص دارایی متناسب طراحی می‌کند." },
            { n: "۳", t: "مدیریت سرمایه‌گذاری", d: "پیگیری عملکرد سبد و دریافت گزارش‌های ادواری." },
          ].map((s) => (
            <li key={s.n} className="flex items-start gap-4">
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold text-sm"
                style={{ width: 32, height: 32, background: "var(--navy-deep)", color: "var(--gold-soft)" }}
              >
                {s.n}
              </span>
              <div>
                <div className="font-bold text-sm" style={{ color: "var(--navy-deep)" }}>{s.t}</div>
                <div className="text-sm mt-0.5" style={{ color: "var(--text-2)" }}>{s.d}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── With assessment ──────────────────────────────────────────────────────
function WithAssessment({
  assessment,
  portfolio,
  onRetake,
}: {
  assessment: Assessment;
  portfolio: Portfolio | null;
  onRetake: () => void;
}) {
  const profile = RISK_PROFILES[assessment.risk_category as RiskCategory];
  const riskColor = profile?.accent ?? "var(--navy)";
  const maxScore = 110;
  const pct = Math.round((assessment.total_score / maxScore) * 100);
  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference - (pct / 100) * circumference;
  const assessmentDate = formatJalali(assessment.created_at);

  return (
    <div className="space-y-6">
      {/* Assessment result card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Score ring */}
        <div
          className="card-elevated p-6 flex flex-col items-center text-center"
          style={{ borderTop: `4px solid ${riskColor}` }}
        >
          <span className="eyebrow mb-4">پروفایل ریسک</span>
          <div className="relative" style={{ width: 120, height: 120 }}>
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={riskColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <span className="font-display text-2xl font-bold" style={{ color: riskColor }}>
                {assessment.total_score}
              </span>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>از ۱۱۰</span>
            </div>
          </div>
          <h3 className="font-display text-xl font-bold mt-4 mb-1" style={{ color: riskColor }}>
            {profile?.category ?? assessment.risk_category}
          </h3>
          <p className="text-xs leading-6" style={{ color: "var(--text-3)" }}>
            تاریخ ارزیابی: {assessmentDate}
          </p>
          <button
            type="button"
            onClick={onRetake}
            className="btn btn-outline mt-4 w-full"
            style={{ fontSize: "0.8rem" }}
          >
            انجام مجدد آزمون
          </button>
        </div>

        {/* Profile description */}
        <div className="card p-6 md:col-span-2">
          <span className="eyebrow mb-3 block">توضیحات پروفایل</span>
          <p className="text-sm leading-8 mb-5" style={{ color: "var(--text-2)" }}>
            {profile?.description ?? "پروفایل ریسک شما ارزیابی شده است."}
          </p>
          {profile?.portfolio && (
            <div>
              <div className="text-xs font-bold mb-3" style={{ color: "var(--text-3)" }}>
                تخصیص پیشنهادی دارایی
              </div>
              <ul className="space-y-2">
                {profile.portfolio.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--text-2)" }}
                  >
                    <span
                      className="flex-shrink-0 w-2 h-2 rounded-full"
                      style={{ background: riskColor }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio section */}
      {portfolio ? (
        <AdminPortfolio portfolio={portfolio} />
      ) : (
        <WaitingPortfolio />
      )}
    </div>
  );
}

// ─── Admin-assigned portfolio ─────────────────────────────────────────────
function AdminPortfolio({ portfolio }: { portfolio: Portfolio }) {
  const portfolioDate = formatJalali(portfolio.created_at);

  return (
    <div className="card-elevated p-6" style={{ borderTop: "4px solid var(--gold)" }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <span className="eyebrow">پرتفوی اختصاصی</span>
          <h3 className="font-display text-xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
            سبد سرمایه‌گذاری پیشنهادی مشاور
          </h3>
        </div>
        <span
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: "rgba(21,128,61,0.1)", color: "var(--success)" }}
        >
          <CheckCircle2 size={13} />
          تأیید شده توسط مشاور
        </span>
      </div>

      <div className="mb-5">
        <AllocationDonut
          data={portfolio.allocations.map((a) => ({ label: a.asset, value: a.pct }))}
          centerLabel="سبد"
          centerValue="پیشنهادی"
        />
      </div>

      {portfolio.notes && (
        <div
          className="rounded-xl p-4 text-sm leading-7"
          style={{
            background: "var(--gold-tint)",
            border: "1px solid rgba(184,134,11,0.2)",
            color: "var(--navy-deep)",
          }}
        >
          <strong>یادداشت مشاور:</strong> {portfolio.notes}
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--text-3)" }}>
        تاریخ صدور: {portfolioDate}
      </p>
    </div>
  );
}

// ─── Waiting for portfolio ────────────────────────────────────────────────
function WaitingPortfolio() {
  return (
    <div className="card p-8 text-center">
      <div
        className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
        style={{ width: 56, height: 56, background: "var(--gold-tint)", color: "var(--navy-deep)" }}
      >
        <Wallet size={24} />
      </div>
      <h3 className="font-display font-bold text-lg mb-2" style={{ color: "var(--navy-deep)" }}>
        در انتظار تخصیص پرتفوی
      </h3>
      <p className="text-sm leading-7 max-w-sm mx-auto" style={{ color: "var(--text-2)" }}>
        ارزیابی ریسک شما ثبت شده است. مشاور ما در حال بررسی پروفایل شما بوده و
        به‌زودی سبد سرمایه‌گذاری اختصاصی برای شما طراحی خواهد شد.
      </p>
    </div>
  );
}
