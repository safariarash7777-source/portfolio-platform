"use client";

import { useState } from "react";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "خطایی رخ داد.");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch {
      setStatus("error");
      setErrorMessage("اتصال به سرور برقرار نشد.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white font-sans" dir="rtl">

      {/* Header */}
      <header className="container mx-auto px-5 py-5 flex justify-between items-center border-b border-white/10">
        <div className="text-xl font-bold tracking-tight text-white">
          [BRAND_NAME] <span className="text-blue-400 text-xs font-normal">AI</span>
        </div>
        <a href="#waitlist" className="text-xs text-blue-400 border border-blue-400/40 px-4 py-2 rounded-full hover:bg-blue-400/10 transition-all">
          عضویت در لیست انتظار
        </a>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-5 pt-16 pb-10 text-center max-w-3xl">
        <div className="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-bold mb-8 border border-blue-500/20 tracking-wider">
          دستیار علمی سرمایه‌گذاری در بازار ایران
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold leading-[1.25] mb-6 text-white">
          پرتفوی اختصاصی شما، <br />
          <span className="text-blue-400">طراحی‌شده توسط هوش مصنوعی</span>
        </h1>

        <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-xl mx-auto mb-10">
          بر اساس پروفایل ریسک، اهداف مالی و شرایط شما — یک سبد سرمایه‌گذاری علمی و بهینه دریافت کنید. مبتنی بر نظریه مدرن پرتفوی (MPT) و هوش مصنوعی Claude.
        </p>

        {/* Waitlist Form */}
        <div id="waitlist" className="bg-white/5 border border-white/10 p-2 rounded-2xl max-w-md mx-auto">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ایمیل شما..."
              required
              disabled={status === "loading" || status === "success"}
              dir="ltr"
              className="flex-1 bg-transparent px-4 py-3 outline-none text-white placeholder:text-white/30 text-sm w-full"
            />
            <button
              type="submit"
              disabled={status === "loading" || status === "success"}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold transition-all ${
                status === "success"
                  ? "bg-green-500 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {status === "loading" ? "در حال ثبت..." : status === "success" ? "ثبت شدید ✓" : "عضویت رایگان"}
            </button>
          </form>
        </div>

        <div className="h-6 mt-3">
          {status === "success" && <p className="text-sm text-green-400">سپاسگزاریم! به محض آماده شدن پلتفرم خبرتان می‌دهیم.</p>}
          {status === "error" && <p className="text-sm text-red-400">{errorMessage}</p>}
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-y border-white/10 bg-white/[0.02] py-8 my-6">
        <div className="container mx-auto px-5 text-center">
          <p className="text-[11px] text-white/30 uppercase tracking-widest mb-6 font-bold">
            مورد اعتماد متخصصین مالی و رسانه‌های معتبر
          </p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-40">
            <span className="text-base font-black text-white">دنیای اقتصاد</span>
            <span className="text-base font-black text-white">تجارت فردا</span>
            <span className="text-base font-black text-white">بورس‌نیوز</span>
            <span className="text-base font-black text-white">شبکه اقتصاد</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-5 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">معماری ۳ لایه هوش مصنوعی</h2>
          <p className="text-white/40 text-sm">طراحی‌شده برای بازار سرمایه ایران</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { num: "۰۱", title: "سنجش ریسک علمی", desc: "آزمون ۱۵ مرحله‌ای برای تحلیل دقیق افق زمانی، تحمل ریسک و اهداف مالی شما." },
            { num: "۰۲", title: "موتور ساخت پرتفوی", desc: "تخصیص دارایی مبتنی بر MPT با هوش مصنوعی برای بازار بورس تهران." },
            { num: "۰۳", title: "ریبالانس ماهانه", desc: "پایش مداوم و هشدارهای دقیق برای تنظیم وزن دارایی‌ها در سبد شما." },
          ].map((f, i) => (
            <div key={i} className="border border-white/10 rounded-2xl p-6 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all">
              <div className="text-blue-400/40 text-xs font-black mb-4 tracking-widest">{f.num}</div>
              <h3 className="text-base font-bold mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-5 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">طرح‌های اشتراک</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { name: "پایه", price: "۲۹", features: ["پروفایل ریسک", "پرتفوی اولیه", "گزارش ماهانه"], highlight: false },
            { name: "حرفه‌ای", price: "۷۹", features: ["همه امکانات پایه", "ریبالانس خودکار", "چت با هوش مصنوعی", "پشتیبانی اولویت‌دار"], highlight: true },
            { name: "ویژه", price: "۱۹۹", features: ["همه امکانات حرفه‌ای", "مشاوره شخصی", "دسترسی API"], highlight: false },
          ].map((p, i) => (
            <div key={i} className={`relative border rounded-2xl p-6 transition-all ${p.highlight ? "border-blue-500 bg-blue-500/10" : "border-white/10 hover:border-white/20"}`}>
              {p.highlight && <div className="absolute -top-3 right-6 bg-blue-500 text-white text-[10px] font-black px-3 py-1 rounded-full">محبوب‌ترین</div>}
              <div className="text-white/50 text-sm mb-2">{p.name}</div>
              <div className="text-3xl font-black mb-1">${p.price}<span className="text-sm font-normal text-white/40">/ماه</span></div>
              <div className="border-t border-white/10 mt-4 pt-4 space-y-2">
                {p.features.map((f, j) => (
                  <div key={j} className="text-sm text-white/60 flex items-center gap-2">
                    <span className="text-blue-400 text-xs">✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer / Disclaimer */}
      <footer className="border-t border-white/10 py-10">
        <div className="container mx-auto px-5 max-w-4xl">
          <div className="bg-yellow-500/5 border border-yellow-500/20 p-4 rounded-xl mb-8 text-xs text-yellow-200/60 leading-loose text-justify">
            <strong className="text-yellow-200/80">سلب مسئولیت:</strong> این پلتفرم صرفاً یک ابزار پشتیبان تصمیم‌گیری مالی است. هیچ‌گونه تضمینی برای کسب سود وجود ندارد. مسئولیت نهایی تصمیمات سرمایه‌گذاری بر عهده کاربر است.
          </div>
          <p className="text-center text-white/20 text-xs">© ۱۴۰۴ تمامی حقوق محفوظ است.</p>
        </div>
      </footer>
    </div>
  );
}
