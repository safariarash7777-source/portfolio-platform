import {
  ShieldCheck,
  PieChart,
  RefreshCw,
  TrendingUp,
  FileText,
  Lock,
} from "lucide-react";
import Reveal from "./Reveal";

/**
 * قابلیت‌ها — بنتو گرید (اسکیل: information-hierarchy + style-match).
 * دو سلولِ بزرگ برای دو قابلیتِ محوری (آزمون ریسک، رصد زنده) با ویژوالِ
 * تزئینیِ بدونِ عدد؛ چهار سلولِ عادی. همه فقط با توکن‌ها.
 */
const CAPS = [
  {
    icon: <ShieldCheck size={20} />,
    title: "سنجش علمی پروفایل ریسک",
    desc: "آزمون استاندارد ۲۲ سؤالی در ۶ بخش رفتاری و مالی برای تعیین دقیق سطح تحمل ریسک، افق و اهداف شما.",
    featured: "risk" as const,
  },
  {
    icon: <PieChart size={20} />,
    title: "ساختار سبد متناسب با پروفایل",
    desc: "نتیجهٔ آزمون ریسک، نمونهٔ ساختار دارایی متناسب با پروفایل شما را نشان می‌دهد؛ طراحی سبد اختصاصی در جلسهٔ مشاوره و بر اساس شرایط واقعی شما انجام می‌شود.",
  },
  {
    icon: <RefreshCw size={20} />,
    title: "بازنگری دوره‌ای",
    desc: "چشم‌انداز هفتگی و یادداشت‌های بازار، مبنای بازنگری منظم سبد؛ در دورهٔ مشاوره، به‌روزرسانی سبد نیز همراه شماست.",
  },
  {
    icon: <FileText size={20} />,
    title: "کارنامهٔ قابل راستی‌آزمایی",
    desc: "هر تحلیل در لحظهٔ انتشار با مهر زمانی ثبت می‌شود و نتیجه‌اش — درست یا غلط — عمومی می‌ماند؛ چیزی حذف یا ویرایش نمی‌شود.",
  },
  {
    icon: <Lock size={20} />,
    title: "امنیت و حریم خصوصی",
    desc: "داده‌های شما رمزنگاری می‌شود، با هیچ شخص ثالثی به اشتراک گذاشته نمی‌شود و تحت کنترل خودتان است.",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "رصد زنده و هشدار قیمت",
    desc: "دیده‌بانِ بازار با قیمت‌های لحظه‌ای، واچ‌لیست شخصی و هشدار قیمت مستقیم در تلگرام — هر ۵ دقیقه پایش می‌شود.",
    featured: "live" as const,
  },
];

/** ویژوالِ تزئینیِ سلولِ «ریسک» — پنج پلهٔ پروفایل، بدونِ هیچ عددی. */
function RiskDeco() {
  return (
    <div aria-hidden className="mt-5">
      <div className="grid grid-cols-5 gap-1.5 mb-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-2 rounded-full"
            style={{ background: i === 2 ? "var(--gold)" : "var(--line)" }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: "var(--text-3)" }}>
        <span>کم‌ریسک</span>
        <span>پرریسک</span>
      </div>
    </div>
  );
}

/** ویژوالِ تزئینیِ سلولِ «رصد زنده» — سه ردیفِ قیمتِ شماتیک، بدونِ عدد. */
function LiveDeco() {
  return (
    <div aria-hidden className="mt-5 space-y-2">
      {[52, 40, 61].map((w, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="h-2 rounded-full" style={{ width: `${w}%`, background: "var(--line)" }} />
          <span
            className="h-4 w-12 rounded-full flex-shrink-0"
            style={{ background: i === 1 ? "rgba(185,28,28,0.12)" : "rgba(21,128,61,0.14)" }}
          />
        </div>
      ))}
      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-bold" style={{ color: "var(--success)" }}>
        <span className="live-dot" style={{ width: 6, height: 6 }} />
        زنده
      </div>
    </div>
  );
}

export default function Capabilities() {
  return (
    <section
      id="features"
      className="section border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="flex flex-col items-center text-center gap-3 mb-12">
          <span className="eyebrow">قابلیت‌ها</span>
          <h2
            className="font-display"
            style={{
              color: "var(--navy-deep)",
              fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            یک پلتفرم یکپارچه برای تصمیم‌گیری مالی
          </h2>
          <div className="divider-gold" />
        </Reveal>

        {/* بنتو: در lg چهار ستون؛ سلول‌های featured دوتایی. موبایل تک‌ستونه. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAPS.map((c, i) => (
            <Reveal
              key={c.title}
              delay={(i % 4) * 70}
              className={c.featured ? "sm:col-span-2" : ""}
            >
              <div
                className="u-lift h-full rounded-2xl p-6 flex flex-col"
                style={{
                  background: c.featured ? "var(--surface-2)" : "var(--bg)",
                  border: "1px solid var(--line)",
                }}
              >
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl mb-4"
                  style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
                >
                  {c.icon}
                </div>
                <h3 className="font-display text-base font-bold mb-1.5" style={{ color: "var(--navy-deep)" }}>
                  {c.title}
                </h3>
                <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                  {c.desc}
                </p>
                {c.featured === "risk" && <RiskDeco />}
                {c.featured === "live" && <LiveDeco />}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
