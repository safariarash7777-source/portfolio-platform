import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";

/** CTA پایانی — باند تیرهٔ navy.deep (قرینهٔ Hero)، یک اقدام اصلی. */
export default function FinalCTA() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%)",
      }}
    >
      {/* subtle gold glow + brand enso echo (mirror of hero) */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          bottom: "-30%",
          insetInlineEnd: "-6%",
          width: 560,
          height: 560,
          background: "radial-gradient(circle, rgba(212,162,43,0.14) 0%, transparent 62%)",
        }}
      />
      <svg
        aria-hidden
        className="enso-arc hidden sm:block"
        style={{ width: 420, height: 420, bottom: -120, insetInlineStart: -90 }}
        viewBox="0 0 200 200"
        fill="none"
      >
        <path d="M100 22 A78 78 0 1 1 44 56" stroke="var(--gold-soft)" strokeWidth="5" strokeLinecap="round" />
        <path d="M44 56 l-9 -21 l24 6 z" fill="var(--gold-soft)" />
      </svg>

      <div className="relative mx-auto w-full max-w-4xl px-5 py-20 text-center">
        <Reveal>
          <h2
            className="font-display mb-4"
            style={{
              color: "var(--text-on-navy)",
              fontSize: "clamp(1.75rem, 3.6vw, 2.75rem)",
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            سرمایه‌گذاری علمی، از همین‌جا شروع می‌شود
          </h2>
          <p
            className="mx-auto max-w-xl mb-8 text-base"
            style={{ color: "rgba(248,250,252,0.78)", lineHeight: 1.85 }}
          >
            به لیست انتظار بپیوندید تا به‌محض آماده‌شدن پلتفرم، پیش از دیگران
            دسترسی داشته باشید.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/#waitlist" className="btn btn-gold">
              عضویت در لیست انتظار
              <ArrowLeft size={16} />
            </Link>
            <Link href="/dashboard" className="btn btn-on-navy">
              ورود به داشبورد
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
