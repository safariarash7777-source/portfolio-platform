import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";
import WaitlistForm from "./WaitlistForm";

/**
 * دو مسیرِ کار با آرش — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * تغییرات نسبت به نسخهٔ قبل:
 *  - `id="waitlist"` و `WaitlistForm` از هیرو به اینجا منتقل شدند. همهٔ لینک‌های
 *    موجودِ `/#waitlist` (ناوبری، فوتر، /about، داشبورد) بدونِ تغییر سالم می‌مانند
 *    و منطقِ `/api/waitlist` عیناً دست‌نخورده است.
 *  - واژگانِ داخلی حذف شد: «چارچوب تحلیلی داخلی»، «کارت امتیاز سه‌محوره»،
 *    «واچ‌لیست امتیازی»، «رژیم بازار» → «ابزارهای تحلیلی پلتفرم».
 *  - ادعای کادنسِ «هر سه ماه یک‌بار» برداشته شد؛ تاریخ‌های واقعی در `/webinars`
 *    است و همان مرجع می‌ماند (آن صفحه در مالکیتِ PR #113 است و دست‌نخورده ماند).
 *  - دو کارتِ جعبه‌ای → دو ستون با یک خطِ جداکنندهٔ نازک.
 */
const WEBINAR_POINTS = [
  "مرور وضعیت بازار و چشم‌انداز دورهٔ پیش‌رو",
  "سهام، طلا، صندوق‌های درآمد ثابت و کالایی",
  "پرسش و پاسخ زنده",
];

const ADVISORY_POINTS = [
  "جلسهٔ اختصاصی با آرش صفری",
  "سنجش پروفایل ریسک و طراحی سبدِ متناسب با شرایط شما",
  "دسترسی به ابزارهای تحلیلی پلتفرم",
];

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((t) => (
        <li
          key={t}
          className="flex items-start gap-2.5 text-sm"
          style={{ color: "var(--text-2)", lineHeight: 1.8 }}
        >
          <span
            aria-hidden
            className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ background: "var(--gold)" }}
          />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function TwoProducts() {
  return (
    <section className="section" style={{ background: "var(--surface)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <h2
            className="font-display"
            style={{
              color: "var(--heading)",
              fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
            }}
          >
            دو مسیر برای کار با آرش
          </h2>
          <div aria-hidden className="divider-gold mt-4" />
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-0">
          {/* وبینار */}
          <Reveal className="md:pe-12 md:border-e md:border-[color:var(--line)]">
            <h3
              className="font-display text-xl font-bold"
              style={{ color: "var(--heading)" }}
            >
              وبینار تحلیل بازار
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>
              دوره‌ای · گروهی
            </p>
            <Points items={WEBINAR_POINTS} />
            <Link href="/webinars" className="btn btn-outline mt-7">
              دیدن وبینارها
              <ArrowLeft size={16} />
            </Link>
          </Reveal>

          {/* مشاورهٔ اختصاصی — میزبانِ لنگرِ waitlist */}
          <Reveal delay={90} className="md:ps-12">
            <div id="waitlist" className="scroll-mt-28">
              <h3
                className="font-display text-xl font-bold"
                style={{ color: "var(--heading)" }}
              >
                مشاورهٔ اختصاصی
              </h3>
              <p className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>
                جلسهٔ شخصی · یک‌به‌یک
              </p>
              <Points items={ADVISORY_POINTS} />
              <div className="mt-7">
                <WaitlistForm />
              </div>
            </div>
          </Reveal>
        </div>

        <p
          className="mt-12 text-xs"
          style={{ color: "var(--text-3)", lineHeight: 1.9 }}
        >
          هیچ‌کدام از خروجی‌ها توصیهٔ خرید یا فروش نیست و مسئولیت تصمیم نهایی با
          سرمایه‌گذار است.
        </p>
      </div>
    </section>
  );
}
