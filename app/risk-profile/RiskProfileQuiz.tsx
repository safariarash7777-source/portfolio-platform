"use client";

import Link from "next/link";

// Client shell for the risk-profile quiz.
// All quiz state, step logic, and Supabase writes live here.
export default function RiskProfileQuiz() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white font-sans" dir="rtl">
      {/* Header */}
      <header className="container mx-auto px-5 py-5 flex justify-between items-center border-b border-white/10">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-white"
        >
          [BRAND_NAME] <span className="text-blue-400 text-xs font-normal">AI</span>
        </Link>
        <span className="text-xs text-white/30">آزمون سنجش ریسک</span>
      </header>

      {/* Quiz content */}
      <main className="container mx-auto px-5 py-16 max-w-2xl text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-bold mb-8 border border-blue-500/20 tracking-wider">
          آزمون ۱۵ مرحله‌ای
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold leading-[1.3] mb-4">
          پروفایل ریسک شما
        </h1>
        <p className="text-white/50 text-sm mb-12 max-w-md mx-auto leading-relaxed">
          با پاسخ به ۱۵ سوال کوتاه، یک سبد سرمایه‌گذاری شخصی‌سازی‌شده دریافت کنید.
        </p>

        {/* Quiz steps render here */}
        <div className="border border-white/10 rounded-2xl p-8 text-white/30 text-sm">
          مراحل آزمون در اینجا نمایش داده می‌شوند
        </div>
      </main>
    </div>
  );
}
