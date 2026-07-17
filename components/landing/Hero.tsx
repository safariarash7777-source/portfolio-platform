import Link from "next/link";
import { ShieldCheck, BarChart3 } from "lucide-react";
import WaitlistForm from "./WaitlistForm";
import PortfolioPreviewCard from "./PortfolioPreviewCard";

/**
 * Hero — تزِ صفحه. باند تیرهٔ navy.deep، تایپوگرافی Black،
 * لهجهٔ طلاییِ محدود، یک CTA اصلی (لیست انتظار) و امضای محصول در کنارش.
 */
export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%)",
      }}
    >
      {/* subtle institutional grid — light asset, no image */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            // استثنای مستند C4: #000 اینجا آلفای ماسک CSS است نه رنگ نمایشی.
            "radial-gradient(ellipse 85% 65% at 70% 0%, #000 25%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 65% at 70% 0%, #000 25%, transparent 78%)",
        }}
      />

      {/* warm gold glow — very subtle, within palette */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "-12%",
          insetInlineStart: "-8%",
          width: 620,
          height: 620,
          background: "radial-gradient(circle, rgba(212,162,43,0.16) 0%, transparent 62%)",
        }}
      />

      {/* faint brand "enso arc" — decorative echo, not clutter */}
      <svg
        aria-hidden
        className="enso-arc hidden sm:block"
        style={{ width: 520, height: 520, top: -70, insetInlineEnd: -110 }}
        viewBox="0 0 200 200"
        fill="none"
      >
        <path d="M100 22 A78 78 0 1 1 44 56" stroke="var(--gold-light)" strokeWidth="5" strokeLinecap="round" />
        <path d="M44 56 l-9 -21 l24 6 z" fill="var(--gold-light)" />
      </svg>

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-16 pb-20 sm:pt-20 sm:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* content — right in RTL */}
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
              پلتفرم تحلیل سرمایه‌گذاری · بازار سرمایهٔ ایران
            </span>

            <h1
              className="font-display anim-rise anim-d2"
              style={{
                color: "var(--text-on-navy)",
                fontSize: "clamp(2.1rem, 5.2vw, 4rem)",
                fontWeight: 900,
                lineHeight: 1.12,
                letterSpacing: "-0.02em",
                marginBottom: "1.25rem",
              }}
            >
              تصمیمِ سرمایه‌گذاری، بر پایهٔ{" "}
              <span style={{ color: "var(--gold-light)" }}>داده و تحلیل علمی</span>
            </h1>

            <p
              className="text-base sm:text-lg max-w-xl mb-8 anim-rise anim-d3"
              style={{ color: "rgba(248,250,252,0.82)", lineHeight: 1.85 }}
            >
              آرش صفری، تحلیلگر و مشاور سرمایه‌گذاری — پروفایل ریسک شما را علمی
              می‌سنجد و سبدی متناسب با هدف، افق زمانی و توان مالی شما طراحی می‌کند.
            </p>

            <div id="waitlist" className="scroll-mt-24 anim-rise anim-d4">
              <WaitlistForm tone="onNavy" />
            </div>

            <div className="mt-6 flex flex-wrap gap-3 anim-rise anim-d5">
              <Link href="/dashboard" className="btn btn-on-navy">
                <BarChart3 size={16} />
                ورود به داشبورد
              </Link>
            </div>
          </div>

          {/* signature */}
          <div className="lg:col-span-5 anim-rise anim-d4">
            <PortfolioPreviewCard />
          </div>
        </div>
      </div>
    </section>
  );
}
