import { BadgeCheck, FileText, ShieldOff, Eye } from "lucide-react";
import Reveal from "./Reveal";

/**
 * چرا آرش صفری — P2-PUBLIC-MEGA-002 Truthfulness Audit
 * حذف‌شده‌ها:
 *  - «مجوز رسمی» از عنوان (Owner Decision OD-001 — نیاز به تأیید مالک)
 *  - «داده‌های شما رمزنگاری می‌شود / به شخص ثالث فروخته نمی‌شود» (ادعای حقوقی/امنیتی بدون مدرک)
 * جایگزین‌ها:
 *  - «مسئولیت‌پذیری حرفه‌ای» (واقعی و قابل تأیید)
 *  - «کارنامهٔ تحلیل‌ها» (محدود به تحلیل‌های منتشرشده — تصمیم CC-005)
 *  - «هر تحلیل» → «تحلیل‌های ساختاریافته و تأییدشده» (Owner Decision OD-004/OD-005)
 */
const PILLARS = [
  {
    icon: <BadgeCheck size={22} />,
    title: "مسئولیت‌پذیری حرفه‌ای",
    desc: "تحلیل و مشاوره توسط آرش صفری — با نام مشخص و مسئولیت حرفه‌ای، نه پیج بی‌نام.",
  },
  {
    icon: <FileText size={22} />,
    title: "شفافیت کامل روش",
    desc: "تحلیل‌های ساختاریافته و تأییدشده این پلتفرم با ذکر فروض و دادهٔ پشتوانه منتشر می‌شوند؛ ارزش‌گذاری‌ها بازه‌ای و سناریومحورند، نه عدد قطعی.",
  },
  {
    icon: <ShieldOff size={22} />,
    title: "بدون وعدهٔ سود",
    desc: "هیچ بازدهی تضمین نمی‌شود. تمرکز بر تصمیم‌گیریِ منطقی و کاهش ریسک‌های شناختی است، نه وعدهٔ سود.",
  },
  {
    icon: <Eye size={22} />,
    title: "کارنامهٔ تحلیل‌ها",
    desc: "تحلیل‌های منتشرشده با قیمت ورود، تاریخ و وضعیت نتیجه ثبت می‌شوند.",
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
