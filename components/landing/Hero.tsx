import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Hero — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * جهت: Premium Financial Editorial. سرصفحهٔ یک نشریه، نه صفحهٔ فروش.
 *
 * حذف‌شده نسبت به نسخهٔ قبل:
 *  - `WaitlistForm` از داخل هیرو (هیرو صفحهٔ فروش نیست) — فرم با همان `id="waitlist"`
 *    به ناحیهٔ «مشاورهٔ اختصاصی» منتقل شد تا همهٔ لینک‌های `/#waitlist` سالم بمانند.
 *  - سه کارتِ TRUST_PILLARS (عیناً در WhyArash و /about تکرار شده بودند)
 *  - CTAی سومِ «ورود به داشبورد» (ورود در ناوبری هست)
 *  - بافتِ گرید، هالهٔ طلایی و کمانِ تزئینی — سه افکتِ هم‌زمانِ تزئینی
 *
 * باقی‌مانده: یک خطِ طلاییِ نازک به‌عنوان نشانهٔ سرصفحه. همین.
 */
export default function Hero() {
  return (
    <section
      className="relative"
      style={{ background: "linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 pt-20 pb-16 sm:pt-28 sm:pb-20">
        <div className="max-w-2xl">
          <p
            className="anim-rise anim-d1 text-xs sm:text-sm font-bold tracking-wide"
            style={{ color: "var(--gold-light)" }}
          >
            تحلیلگر و مشاور سرمایه‌گذاری · بازار سرمایهٔ ایران
          </p>

          <div
            aria-hidden
            className="anim-rise anim-d1 my-5"
            style={{ height: 2, width: 56, background: "var(--gold)", borderRadius: 2 }}
          />

          <h1
            className="font-display anim-rise anim-d2"
            style={{
              color: "var(--text-on-navy)",
              fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
            }}
          >
            آرش صفری
          </h1>

          <p
            className="anim-rise anim-d3 mt-6 text-base sm:text-lg"
            style={{ color: "rgba(248,250,252,0.82)", lineHeight: 1.9 }}
          >
            بازار ایران را دنبال می‌کنم و آنچه می‌بینم را با فرض‌ها و شواهدش
            منتشر می‌کنم — بازهٔ ارزش‌گذاری و سناریو، نه عددِ قطعی و نه وعدهٔ سود.
          </p>

          <div className="anim-rise anim-d4 mt-9 flex flex-wrap items-center gap-3">
            <Link href="/market" className="btn btn-gold">
              دیدن وضعیت امروز بازار
              <ArrowLeft size={16} />
            </Link>
            <Link href="/about" className="btn btn-on-navy">
              آشنایی با روش تحلیل آرش
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
