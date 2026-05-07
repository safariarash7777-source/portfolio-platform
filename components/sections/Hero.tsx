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
          "linear-gradient(180deg, var(--bg) 0%, var(--surface-2) 100%)",
      }}
    >
      {/* Subtle institutional grid */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
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
                background: "var(--gold-tint)",
                color: "var(--navy-deep)",
                border: "1px solid rgba(184,134,11,0.3)",
              }}
            >
              <ShieldCheck size={14} />
              پلتفرم تخصصی تحلیل سرمایه‌گذاری · بازار سرمایه ایران
            </div>

            <h1
              className="font-display"
              style={{
                color: "var(--navy-deep)",
                fontSize: "clamp(2rem, 4.6vw, 3.5rem)",
                lineHeight: 1.2,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginBottom: "1.25rem",
              }}
            >
              تصمیم سرمایه‌گذاری شما،
              <br />
              <span style={{ color: "var(--navy)" }}>بر پایه‌ی </span>
              <span style={{ color: "var(--gold)" }}>داده و تحلیل علمی</span>
            </h1>

            <p
              className="text-base sm:text-lg leading-8 max-w-xl"
              style={{ color: "var(--text-2)", marginBottom: "2rem" }}
            >
              <strong style={{ color: "var(--navy-deep)" }}>آرش صفری</strong>،
              تحلیلگر و مشاور سرمایه‌گذاری — پروفایل ریسک شخصی شما را با دقت علمی
              ارزیابی می‌کند و سبدی متناسب با اهداف، افق زمانی و توان مالی شما طراحی می‌کند.
            </p>

            {/* Waitlist form */}
            <div id="waitlist" className="mb-6 max-w-lg">
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  boxShadow: "var(--shadow-sm)",
                }}
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
                  <p className="text-sm" style={{ color: "var(--success)" }}>
                    سپاسگزاریم! به محض آماده شدن پلتفرم، اطلاع‌رسانی می‌شود.
                  </p>
                )}
                {status === "error" && (
                  <p className="text-sm" style={{ color: "var(--danger)" }}>
                    {errorMessage}
                  </p>
                )}
                {status === "idle" && (
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    اطلاعات شما محرمانه است و فروخته نمی‌شود.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn btn-primary">
                <BarChart3 size={16} />
                ورود به داشبورد
              </Link>
              <Link href="/#features" className="btn btn-outline">
                مشاهده خدمات
                <ArrowLeft size={16} />
              </Link>
            </div>
          </div>

          {/* Left column — visual */}
          <div className="lg:col-span-5">
            <div
              className="relative rounded-2xl overflow-hidden card-elevated p-8"
              style={{ background: "var(--surface)" }}
            >
              {/* Logo lockup hero card */}
              <div className="flex flex-col items-center text-center gap-5">
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%)",
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  <Image
                    src="/logo.png"
                    alt="نشان آرش صفری"
                    width={96}
                    height={96}
                    priority
                  />
                </div>

                <div>
                  <p
                    className="font-display text-xl font-bold"
                    style={{ color: "var(--navy-deep)" }}
                  >
                    آرش صفری
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--gold)" }}>
                    تحلیلگر و مشاور سرمایه‌گذاری
                  </p>
                </div>

                <div
                  className="grid grid-cols-3 w-full pt-5 border-t"
                  style={{ borderColor: "var(--line)" }}
                >
                  {[
                    { v: "۲۲", l: "سؤال" },
                    { v: "۶",  l: "بخش تحلیل" },
                    { v: "۱۰", l: "دقیقه" },
                  ].map((s) => (
                    <div key={s.l} className="text-center">
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

                <Link
                  href="/dashboard"
                  className="btn btn-gold w-full mt-2"
                >
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
