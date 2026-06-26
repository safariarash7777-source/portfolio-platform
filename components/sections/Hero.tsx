"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, BarChart3, ArrowLeft } from "lucide-react";
import Container from "../ui/Container";

type Status = "idle" | "loading" | "success" | "error";

export default function Hero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
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
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, var(--navy-deep) 0%, var(--navy) 58%, var(--navy-soft) 100%)",
        color: "#fff",
      }}
    >
      {/* Brand signature — radial gold glows */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "-180px", right: "-160px", width: 520, height: 520, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,208,122,0.18) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          bottom: "-200px", left: "-180px", width: 440, height: 440, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,208,122,0.10) 0%, transparent 70%)",
        }}
      />

      <Container className="relative pt-20 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Right column (RTL) — content */}
          <div className="lg:col-span-7 text-right">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-6"
              style={{
                background: "rgba(245,208,122,0.12)",
                color: "var(--gold-soft)",
                border: "1px solid rgba(245,208,122,0.35)",
              }}
            >
              <ShieldCheck size={14} />
              پلتفرم تخصصی تحلیل سرمایه‌گذاری · بازار سرمایه ایران
            </div>

            <h1
              className="font-display"
              style={{
                color: "#fff",
                fontSize: "clamp(2rem, 4.6vw, 3.5rem)",
                lineHeight: 1.2,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginBottom: "1.25rem",
              }}
            >
              تصمیم سرمایه‌گذاری شما،
              <br />
              <span style={{ color: "rgba(255,255,255,0.92)" }}>بر پایه‌ی </span>
              <span style={{ color: "var(--gold-soft)" }}>داده و تحلیل علمی</span>
            </h1>

            <p
              className="text-base sm:text-lg leading-8 max-w-xl"
              style={{ color: "rgba(255,255,255,0.75)", marginBottom: "2rem" }}
            >
              <strong style={{ color: "#fff" }}>آرش صفری</strong>،
              تحلیلگر و مشاور سرمایه‌گذاری — پروفایل ریسک شخصی شما را با دقت علمی
              ارزیابی می‌کند و سبدی متناسب با اهداف، افق زمانی و توان مالی شما طراحی می‌کند.
            </p>

            {/* Waitlist form (white card pops on navy) */}
            <div id="waitlist" className="mb-6 max-w-lg">
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl"
                style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
              >
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ایمیل شما — مثلاً name@example.com"
                  required
                  disabled={status === "loading" || status === "success"}
                  dir="ltr"
                  className="input flex-1"
                  style={{ border: "none", boxShadow: "none", background: "transparent" }}
                />
                <button
                  type="submit"
                  disabled={status === "loading" || status === "success"}
                  className={status === "success" ? "btn btn-primary" : "btn btn-gold"}
                >
                  {status === "loading"
                    ? "در حال ثبت..."
                    : status === "success"
                    ? "ثبت شدید ✓"
                    : "عضویت رایگان"}
                </button>
              </form>

              <div className="h-6 mt-2 px-1">
                {status === "success" && (
                  <p className="text-sm" style={{ color: "var(--gold-soft)" }}>
                    سپاسگزاریم! به محض آماده شدن پلتفرم، اطلاع‌رسانی می‌شود.
                  </p>
                )}
                {status === "error" && (
                  <p className="text-sm" style={{ color: "#FCA5A5" }}>
                    {errorMessage}
                  </p>
                )}
                {status === "idle" && (
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                    اطلاعات شما محرمانه است و فروخته نمی‌شود.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn btn-gold">
                <BarChart3 size={16} />
                ورود به داشبورد
              </Link>
              <Link
                href="/#features"
                className="btn"
                style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.4)" }}
              >
                مشاهده خدمات
                <ArrowLeft size={16} />
              </Link>
            </div>
          </div>

          {/* Left column — visual (light card so the navy logo stays visible) */}
          <div className="lg:col-span-5">
            <div
              className="relative rounded-2xl overflow-hidden p-8"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
            >
              <div className="flex flex-col items-center text-center gap-5">
                <div
                  className="rounded-2xl p-6"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
                >
                  <Image src="/logo.png" alt="نشان آرش صفری" width={96} height={96} priority />
                </div>

                <div>
                  <p className="font-display text-xl font-bold" style={{ color: "var(--navy-deep)" }}>
                    آرش صفری
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--gold)" }}>
                    تحلیلگر و مشاور سرمایه‌گذاری
                  </p>
                </div>

                <div className="grid grid-cols-3 w-full pt-5 border-t" style={{ borderColor: "var(--line)" }}>
                  {[
                    { v: "۲۲", l: "سؤال" },
                    { v: "۶", l: "بخش تحلیل" },
                    { v: "۱۰", l: "دقیقه" },
                  ].map((s) => (
                    <div key={s.l} className="text-center">
                      <div className="font-display text-2xl font-bold" style={{ color: "var(--navy)" }}>
                        {s.v}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>

                <Link href="/dashboard" className="btn btn-gold w-full mt-2">
                  شروع سنجش پروفایل ریسک
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
