"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Clock,
  User,
  Wallet,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  QUESTIONS,
  SECTIONS,
  RISK_PROFILES,
  calculateRiskCategory,
  type RiskCategory,
} from "./quizData";
import RiskProfileResult from "./RiskProfileResult";

// ─── Supabase (logic preserved exactly) ─────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ─── Section icons ──────────────────────────────────────────────────────
const SECTION_ICONS = [
  <User key={0} size={16} />,
  <Wallet key={1} size={16} />,
  <BarChart3 key={2} size={16} />,
  <Clock key={3} size={16} />,
  <ShieldCheck key={4} size={16} />,
  <TrendingUp key={5} size={16} />,
];

interface RiskProfileQuizProps {
  userId?: string;
  onComplete?: (score: number, category: RiskCategory, answers: Record<number, number>) => void;
}

export default function RiskProfileQuiz({ userId, onComplete }: RiskProfileQuizProps) {
  const [currentStep, setCurrentStep] = useState(0); // 0 = intro, 1..22 = questions
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [riskCategory, setRiskCategory] = useState<RiskCategory | null>(null);
  const [showError, setShowError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const totalQuestions = QUESTIONS.length;
  const isIntro = currentStep === 0;
  const currentQuestion = isIntro ? null : QUESTIONS[currentStep - 1];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;
  const progress = useMemo(
    () => (isIntro ? 0 : (currentStep / totalQuestions) * 100),
    [isIntro, currentStep, totalQuestions]
  );

  // ── Selection (auto-advance) ──────────────────────────────────────────
  const selectAnswer = useCallback(
    (questionId: number, score: number) => {
      const next = { ...answers, [questionId]: score };
      setAnswers(next);
      setShowError(false);
      window.setTimeout(() => {
        if (currentStep < totalQuestions) {
          setCurrentStep((s) => s + 1);
        } else {
          const total = Object.values(next).reduce((a, b) => a + b, 0);
          const cat = calculateRiskCategory(total);
          setTotalScore(total);
          setRiskCategory(cat);
          setIsFinished(true);
          onComplete?.(total, cat, next);
        }
      }, 350);
    },
    [answers, currentStep, totalQuestions, onComplete]
  );

  const goNext = useCallback(() => {
    if (isIntro) return setCurrentStep(1);
    if (currentAnswer == null) {
      setShowError(true);
      window.setTimeout(() => setShowError(false), 2200);
      return;
    }
    if (currentStep === totalQuestions) {
      const total = Object.values(answers).reduce((a, b) => a + b, 0);
      const cat = calculateRiskCategory(total);
      setTotalScore(total);
      setRiskCategory(cat);
      setIsFinished(true);
      onComplete?.(total, cat, answers);
      return;
    }
    setCurrentStep((s) => s + 1);
  }, [isIntro, currentAnswer, currentStep, totalQuestions, answers, onComplete]);

  const goBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  // ── Persist to Supabase (logic preserved) ─────────────────────────────
  const saveToSupabase = useCallback(async () => {
    if (!riskCategory || !supabase) {
      setSaveSuccess(true); // graceful demo when env not configured
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from("risk_profiles").insert({
        user_id: userId ?? null,
        total_score: totalScore,
        risk_category: riskCategory,
        answers_json: answers,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setSaveSuccess(true);
    } catch (err) {
      console.error("Supabase save error:", err);
    } finally {
      setIsSaving(false);
    }
  }, [riskCategory, totalScore, answers, userId]);

  const restart = useCallback(() => {
    setCurrentStep(0);
    setAnswers({});
    setIsFinished(false);
    setTotalScore(0);
    setRiskCategory(null);
    setSaveSuccess(false);
  }, []);

  // ── Result view ───────────────────────────────────────────────────────
  if (isFinished && riskCategory) {
    return (
      <RiskProfileResult
        profile={RISK_PROFILES[riskCategory]}
        totalScore={totalScore}
        onRestart={restart}
        onSave={saveToSupabase}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
      />
    );
  }

  // ── Intro screen ──────────────────────────────────────────────────────
  if (isIntro) {
    return (
      <div className="card-elevated p-8 md:p-10 text-right">
        <div className="flex items-start gap-4 mb-6">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{
              width: 56,
              height: 56,
              background: "var(--navy-deep)",
              color: "var(--gold-soft)",
            }}
          >
            <BarChart3 size={26} />
          </div>
          <div>
            <span className="eyebrow">آرش صفری · تحلیلگر سرمایه‌گذاری</span>
            <h2
              className="font-display text-2xl md:text-3xl font-bold mt-1"
              style={{ color: "var(--navy-deep)" }}
            >
              ارزیابی پروفایل ریسک سرمایه‌گذاری
            </h2>
          </div>
        </div>

        <p
          className="text-base leading-8 mb-7"
          style={{ color: "var(--text-2)" }}
        >
          کاربر گرامی، شناخت دقیق میزان تحمل ریسک، نخستین و مهم‌ترین گام در طراحی
          یک استراتژی سرمایه‌گذاری موفق است. پاسخ‌های شما کاملاً محرمانه است و
          تنها برای تحلیل شخصی شما به کار می‌رود.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-7">
          {[
            { v: "۲۲", l: "تعداد سؤال" },
            { v: "۱۰", l: "دقیقه" },
            { v: "۶",  l: "بخش اصلی" },
          ].map((s) => (
            <div
              key={s.l}
              className="text-center py-4 rounded-xl"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
              }}
            >
              <div
                className="font-display text-2xl font-bold"
                style={{ color: "var(--navy)" }}
              >
                {s.v}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>

        {/* Sections preview */}
        <div className="space-y-2 mb-8">
          {SECTIONS.map((s, i) => (
            <div
              key={s}
              className="flex items-center gap-3 text-sm py-2 px-3 rounded-md"
              style={{ color: "var(--text-2)" }}
            >
              <span style={{ color: "var(--gold)" }}>{SECTION_ICONS[i]}</span>
              <span>
                <strong style={{ color: "var(--navy-deep)" }}>
                  بخش {["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم"][i]}:
                </strong>{" "}
                {s}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          className="btn btn-gold w-full"
        >
          شروع پرسشنامه
          <ChevronLeft size={16} />
        </button>
      </div>
    );
  }

  // ── Question screen ───────────────────────────────────────────────────
  return (
    <div className="card-elevated p-6 md:p-8">
      {/* Header bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{
              background: "var(--gold-tint)",
              color: "var(--navy-deep)",
              border: "1px solid rgba(184,134,11,0.3)",
            }}
          >
            <span style={{ color: "var(--gold)" }}>
              {currentQuestion && SECTION_ICONS[currentQuestion.sectionIndex]}
            </span>
            <span>{currentQuestion?.section}</span>
          </div>
          <span className="text-sm" style={{ color: "var(--text-3)" }}>
            سؤال{" "}
            <span
              className="font-bold"
              style={{ color: "var(--navy)" }}
            >
              {currentStep}
            </span>{" "}
            از <span style={{ color: "var(--text)" }}>{totalQuestions}</span>
          </span>
        </div>

        {/* Progress */}
        <div
          className="relative h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--line)" }}
        >
          <div
            className="absolute inset-y-0 right-0 rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background:
                "linear-gradient(90deg, var(--gold) 0%, var(--gold-soft) 100%)",
            }}
          />
        </div>
      </div>

      {/* Question */}
      <div
        className="rounded-xl p-5 mb-5"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold text-sm"
            style={{
              width: 36,
              height: 36,
              background: "var(--navy-deep)",
              color: "var(--gold-soft)",
            }}
          >
            {currentStep}
          </span>
          <h3
            className="font-display text-lg md:text-xl leading-8 font-bold pt-1"
            style={{ color: "var(--navy-deep)" }}
          >
            {currentQuestion?.text}
          </h3>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2.5 mb-5">
        {currentQuestion?.options.map((option) => {
          const isSelected = currentAnswer === option.score;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() =>
                currentQuestion &&
                selectAnswer(currentQuestion.id, option.score)
              }
              className="w-full flex items-center gap-4 p-4 rounded-xl text-right transition-all"
              style={{
                background: isSelected ? "var(--gold-tint)" : "var(--surface)",
                border: `1px solid ${
                  isSelected ? "var(--gold)" : "var(--line)"
                }`,
                boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                cursor: "pointer",
              }}
            >
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-lg font-bold text-sm"
                style={{
                  width: 34,
                  height: 34,
                  background: isSelected ? "var(--navy-deep)" : "var(--surface-2)",
                  color: isSelected ? "var(--gold-soft)" : "var(--text-2)",
                }}
              >
                {option.label}
              </span>
              <span
                className="flex-1 text-sm md:text-base leading-7 text-right"
                style={{
                  color: isSelected ? "var(--navy-deep)" : "var(--text-2)",
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {option.text}
              </span>
              {isSelected && (
                <CheckCircle
                  size={18}
                  style={{ color: "var(--navy)", flexShrink: 0 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {showError && (
        <div
          className="flex items-center gap-2 text-sm rounded-xl px-4 py-3 mb-5"
          style={{
            background: "rgba(185,28,28,0.08)",
            border: "1px solid rgba(185,28,28,0.25)",
            color: "var(--danger)",
          }}
        >
          <AlertCircle size={16} />
          <span>لطفاً یک گزینه انتخاب کنید.</span>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={currentStep === 1}
          className="btn btn-outline"
        >
          <ChevronRight size={16} />
          قبلی
        </button>
        <button
          type="button"
          onClick={goNext}
          className="btn btn-primary flex-1"
        >
          {currentStep === totalQuestions ? "مشاهده نتیجه" : "بعدی"}
          {currentStep < totalQuestions ? (
            <ChevronLeft size={16} />
          ) : (
            <BarChart3 size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
