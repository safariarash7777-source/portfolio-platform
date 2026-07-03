import { ClipboardCheck, PieChart, Send } from "lucide-react";
import Reveal from "./Reveal";

const STEPS = [
  {
    num: "۰۱",
    icon: <ClipboardCheck size={22} />,
    title: "آزمون ریسک ۲۲ سؤالی",
    desc: "در ۶ بخش رفتاری و مالی، سطح تحمل ریسک، افق زمانی و اهداف شما دقیق مشخص می‌شود — حدود ۱۰ دقیقه.",
  },
  {
    num: "۰۲",
    icon: <PieChart size={22} />,
    title: "پرتفوی متناسب با پروفایل",
    desc: "بر پایهٔ نظریهٔ مدرن پرتفوی (MPT) و داده‌های بازار سرمایهٔ ایران، سبدی متناسب با شرایط شما طراحی می‌شود.",
  },
  {
    num: "۰۳",
    icon: <Send size={22} />,
    title: "همراهی و به‌روزرسانی",
    desc: "هشدارهای ریبالانس و به‌روزرسانی‌های تحلیلی را در کانال تلگرام دنبال کنید و سبد را به‌موقع بازنگری کنید.",
  },
];

export default function ThreeSteps() {
  return (
    <section id="steps" className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="flex flex-col items-center text-center gap-3 mb-14">
          <span className="eyebrow">مسیر شما</span>
          <h2
            className="font-display"
            style={{
              color: "var(--navy-deep)",
              fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            از سنجش ریسک تا سبد اختصاصی، در سه قدم
          </h2>
          <div className="divider-gold" />
        </Reveal>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5">
          {/* connecting thread (desktop) */}
          <div
            aria-hidden
            className="hidden md:block absolute top-7 right-[16.6%] left-[16.6%] h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--gold) 15%, var(--gold) 85%, transparent)",
              opacity: 0.5,
            }}
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.num} delay={i * 90}>
              <div className="relative flex flex-col items-center text-center">
                <div
                  className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl mb-5"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    color: "var(--navy)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {s.icon}
                  <span
                    className="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: "var(--gold)", color: "var(--text-on-gold)" }}
                  >
                    {s.num}
                  </span>
                </div>
                <h3
                  className="font-display text-lg font-bold mb-2"
                  style={{ color: "var(--navy-deep)" }}
                >
                  {s.title}
                </h3>
                <p className="text-sm leading-7 max-w-xs" style={{ color: "var(--text-2)" }}>
                  {s.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
