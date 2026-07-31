import Link from "next/link";
import { ShieldCheck, BarChart3, ArrowLeft } from "lucide-react";
import WaitlistForm from "./WaitlistForm";

/**
 * Hero — P2-PUBLIC-MEGA-002 — Truthfulness Audit
 *
 * تغییرات:
 *  - «مجوز رسمی» از عنوان TRUST_PILLARS حذف شد (Owner Decision OD-001)
 *  - «کارنامهٔ عمومی» فقط در صورت وجود داده واقعی نمایش داده می‌شود
 *  - AnalysesPreview موقتاً پنهان است تا Backend فیلد is_public را اضافه کند
 */

const TRUST_PILLARS = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    title: "مسئولیت‌پذیری حرفه‌ای",
    desc: "تحلیل و مشاوره با نام مشخص و مسئولیت حرفه‌ای — نه پیج بی‌نام.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: "شفافیت کامل روش",
    desc: "هر تحلیل با ذکر فروض و دادهٔ پشتوانه — در کارنامهٔ عمومی قابل پیگیری.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    ),
    title: "بدون وعدهٔ سود",
    desc: "هیچ بازدهی تضمین نمی‌شود. تمرکز بر تصمیم‌گیری منطقی و کاهش ریسک.",
  },
];
export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%)",
      }}
    >
      {/* grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 60% 0%, #000 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 60% 0%, #000 20%, transparent 75%)",
        }}
      />
      {/* gold glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "-10%",
          insetInlineEnd: "-5%",
          width: 560,
          height: 560,
          background: "radial-gradient(circle, rgba(212,162,43,0.14) 0%, transparent 65%)",
        }}
      />
      {/* enso arc */}
      <svg
        aria-hidden
        className="absolute hidden sm:block"
        style={{ width: 480, height: 480, top: -60, insetInlineEnd: -90, opacity: 0.55 }}
        viewBox="0 0 200 200"
        fill="none"
      >
        <path d="M100 22 A78 78 0 1 1 44 56" stroke="var(--gold-light)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M44 56 l-9 -21 l24 6 z" fill="var(--gold-light)" />
      </svg>

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-16 pb-20 sm:pt-20 sm:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-start">

          {/* ستون اصلی — متن و CTA */}
          <div className="lg:col-span-7 text-right">
            <span
              className="anim-rise anim-d1 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold mb-7"
              style={{
                background: "rgba(212,162,43,0.12)",
                color: "var(--gold-light)",
                border: "1px solid rgba(212,162,43,0.30)",
              }}
            >
              <ShieldCheck size={14} />
              تحلیلگر و مشاور سرمایه‌گذاری · بازار سرمایهٔ ایران
            </span>

            <h1
              className="font-display anim-rise anim-d2"
              style={{
                color: "var(--text-on-navy)",
                fontSize: "clamp(2rem, 5vw, 3.8rem)",
                fontWeight: 900,
                lineHeight: 1.14,
                letterSpacing: "-0.02em",
                marginBottom: "1.25rem",
              }}
            >
              آرش صفری —{" "}
              <span style={{ color: "var(--gold-light)" }}>
                تصمیمِ سرمایه‌گذاری
              </span>
              {" "}بر پایهٔ داده
            </h1>

            <p
              className="text-base sm:text-lg max-w-xl mb-8 anim-rise anim-d3"
              style={{ color: "rgba(248,250,252,0.80)", lineHeight: 1.85 }}
            >
              پروفیل ریسک شما را علمی می‌سنجم و سبدی متناسب با هدف، افق زمانی
              و توان مالی شما طراحی می‌کنم — با مسئولیت حرفه‌ای مشخص و
              کارنامه‌ای که هر کسی می‌تواند راستی‌آزمایی کند.
            </p>

            <div id="waitlist" className="scroll-mt-24 anim-rise anim-d4">
              <WaitlistForm tone="onNavy" />
            </div>

            <div className="mt-6 flex flex-wrap gap-3 anim-rise anim-d5">
              <Link href="/analyses" className="btn btn-on-navy">
                <BarChart3 size={16} />
                مشاهدهٔ کارنامه
              </Link>
              <Link href="/dashboard" className="btn btn-ghost" style={{ color: "rgba(248,250,252,0.65)", fontSize: "0.9rem" }}>
                ورود به داشبورد
                <ArrowLeft size={14} />
              </Link>
            </div>
          </div>

          {/* ستون اعتماد — سه ستون عمودی */}
          <div className="lg:col-span-5 anim-rise anim-d4">
            <div className="flex flex-col gap-4">
              {TRUST_PILLARS.map((p, i) => (
                <div
                  key={p.title}
                  className="rounded-xl p-5"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderInlineStart: "3px solid var(--gold)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex-shrink-0 flex items-center justify-center rounded-lg"
                      style={{
                        width: 36,
                        height: 36,
                        background: "rgba(212,162,43,0.15)",
                        color: "var(--gold-light)",
                      }}
                    >
                      {p.icon}
                    </span>
                    <div>
                      <h3
                        className="text-sm font-bold mb-1"
                        style={{ color: "var(--text-on-navy)" }}
                      >
                        {p.title}
                      </h3>
                      <p
                        className="text-xs leading-6"
                        style={{ color: "rgba(248,250,252,0.65)" }}
                      >
                        {p.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
