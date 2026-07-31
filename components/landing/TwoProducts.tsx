import Link from "next/link";
import { Presentation, MessagesSquare, Check, ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";

/**
 * TwoProducts — معرفی دو محصول اصلی «قطب‌نمای بازار»:
 *  ۱) وبینار فصلی (هر سه ماه یک‌بار؛ شرکت‌کنندگان تا وبینار بعدی دسترسی کامل دارند)
 *  ۲) مشاورهٔ اختصاصی (دسترسی به پلتفرم — مدت در جلسه تعیین می‌شود)
 * هر دو به سطح «دسترسی کامل» (ترمینال تحلیلگر، واچ‌لیست، رژیم بازار) می‌رسند.
 */
const PRODUCTS = [
  {
    icon: Presentation,
    title: "وبینار فصلی بازار",
    tagline: "هر سه ماه یک‌بار · تحلیل جامع بازار",
    points: [
      "مرور کامل رژیم بازار و چشم‌انداز فصل پیش‌رو",
      "بررسی سبد دارایی‌ها: سهام، طلا، صندوق‌های درآمد ثابت و کالایی",
      "دسترسی کامل به ترمینال تحلیلگر تا وبینار بعدی",
      "پرسش و پاسخ زنده",
    ],
    href: "/webinars",
    cta: "ثبت‌نام وبینار",
    accent: false,
  },
  {
    icon: MessagesSquare,
    title: "مشاورهٔ اختصاصی سرمایه‌گذاری",
    tagline: "جلسهٔ شخصی + دسترسی به پلتفرم",
    points: [
      "سنجش علمی پروفایل ریسک و طراحی سبد متناسب",
      "جلسهٔ اختصاصی با آرش صفری",
      "دسترسی به ابزارهای تحلیلی پلتفرم (مدت در جلسه تعیین می‌شود)",
      "پیگیری و به‌روزرسانی سبد در طول دوره",
    ],
    href: "/#waitlist",
    cta: "درخواست مشاوره",
    accent: true,
  },
];

export default function TwoProducts() {
  return (
    <section className="border-b" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <Reveal>
          <p className="text-[12px] font-bold tracking-wide" style={{ color: "var(--gold)" }}>
            دو مسیر برای دسترسی کامل
          </p>
          <h2
            className="font-display mt-1"
            style={{
              color: "var(--navy-deep)",
              fontSize: "clamp(1.5rem, 3.2vw, 2.2rem)",
              fontWeight: 900,
            }}
          >
            وبینار فصلی یا مشاورهٔ اختصاصی
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "var(--text-2)" }}>
            بانک داده و نمای بازار برای همه رایگان است. برای ترمینال تحلیلگر — کارت امتیاز
            سه‌محوره، واچ‌لیست امتیازی و رژیم بازار — یکی از این دو مسیر را انتخاب کنید.
          </p>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <article
                className="flex h-full flex-col rounded-2xl border p-6 sm:p-7"
                style={{
                  borderColor: p.accent ? "var(--gold)" : "var(--line)",
                  background: p.accent
                    ? "linear-gradient(180deg, rgba(212,162,43,0.07) 0%, var(--surface) 55%)"
                    : "var(--surface)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      background: p.accent ? "rgba(212,162,43,0.14)" : "rgba(16,42,67,0.07)",
                      color: p.accent ? "var(--gold)" : "var(--navy)",
                    }}
                  >
                    <p.icon size={22} />
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold" style={{ color: "var(--navy-deep)" }}>
                      {p.title}
                    </h3>
                    <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
                      {p.tagline}
                    </p>
                  </div>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-[13.5px] leading-6" style={{ color: "var(--text-2)" }}>
                      <Check size={16} className="mt-1 shrink-0" style={{ color: "var(--gold)" }} />
                      {pt}
                    </li>
                  ))}
                </ul>

                <Link
                  href={p.href}
                  className={`btn mt-6 justify-center ${p.accent ? "btn-gold" : ""}`}
                  style={
                    p.accent
                      ? undefined
                      : { border: "1px solid var(--line)", color: "var(--navy-deep)" }
                  }
                >
                  {p.cta}
                  <ArrowLeft size={16} />
                </Link>
              </article>
            </Reveal>
          ))}
        </div>

        <p className="mt-5 text-[11.5px] leading-6" style={{ color: "var(--text-3)" }}>
          دسترسی کامل شامل چارچوب تحلیلی داخلی است؛ هیچ‌کدام از خروجی‌ها توصیهٔ خرید یا فروش
          نیست و مسئولیت تصمیم نهایی با سرمایه‌گذار است.
        </p>
      </div>
    </section>
  );
}
