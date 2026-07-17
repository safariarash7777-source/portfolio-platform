import { BadgeCheck, FileText, ShieldOff, Lock } from "lucide-react";
import Reveal from "./Reveal";

/**
 * چرا آرش صفری — اعتمادِ واقعی به‌جای عددِ جعلی.
 * چهار ستونِ اعتماد با لهجهٔ طلاییِ لبه.
 */
const PILLARS = [
  {
    icon: <BadgeCheck size={22} />,
    title: "مشاور دارای مجوز رسمی",
    desc: "تحلیل و مشاوره توسط آرش صفری، تحلیلگر و مشاور سرمایه‌گذاری — با مسئولیت حرفه‌ای مشخص.",
  },
  {
    icon: <FileText size={22} />,
    title: "شفافیت کامل روش",
    desc: "هر تحلیل با ذکر منطق علمی و دادهٔ پشتوانه منتشر می‌شود؛ پایبند به اصول MPT و بهینه‌سازی Mean-Variance.",
  },
  {
    icon: <ShieldOff size={22} />,
    title: "بدون وعدهٔ سود",
    desc: "هیچ بازدهی تضمین نمی‌شود. تمرکز ما بر تصمیم‌گیریِ منطقی و کاهش ریسک‌های شناختی است، نه وعدهٔ سود.",
  },
  {
    icon: <Lock size={22} />,
    title: "حریم خصوصی و امنیت",
    desc: "داده‌های شما رمزنگاری می‌شود، به شخص ثالث فروخته نمی‌شود و در هر زمان قابل حذف کامل است.",
  },
];

export default function WhyArash() {
  return (
    <section id="why" className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="flex flex-col items-center text-center gap-3 mb-14">
          <span className="eyebrow">چرا آرش صفری</span>
          <h2
            className="font-display"
            style={{
              color: "var(--navy-deep)",
              fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            اعتماد بر پایهٔ شفافیت، نه اعداد بزرگ
          </h2>
          <div className="divider-gold" />
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 90}>
              <div
                className="u-lift h-full rounded-2xl p-6"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRight: "3px solid var(--gold)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: "var(--navy-deep)", color: "var(--gold-soft)" }}
                  >
                    {p.icon}
                  </span>
                  <h3
                    className="font-display text-lg font-bold"
                    style={{ color: "var(--navy-deep)" }}
                  >
                    {p.title}
                  </h3>
                </div>
                <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                  {p.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
