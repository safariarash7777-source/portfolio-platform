import {
  ShieldCheck,
  PieChart,
  RefreshCw,
  TrendingUp,
  FileText,
  Lock,
} from "lucide-react";
import Reveal from "./Reveal";

/** قابلیت‌ها — متنِ واقعیِ خدماتِ موجود، بازآرایی‌شده در یک گرید فشرده. */
const CAPS = [
  {
    icon: <ShieldCheck size={20} />,
    title: "سنجش علمی پروفایل ریسک",
    desc: "آزمون استاندارد ۲۲ سؤالی در ۶ بخش رفتاری و مالی برای تعیین دقیق سطح تحمل ریسک، افق و اهداف شما.",
  },
  {
    icon: <PieChart size={20} />,
    title: "موتور طراحی پرتفوی",
    desc: "تخصیص دارایی بر پایهٔ نظریهٔ مدرن پرتفوی (MPT) با تکیه بر داده‌های بازار ایران و الگوریتم‌های کمی.",
  },
  {
    icon: <RefreshCw size={20} />,
    title: "ریبالانس ادواری",
    desc: "پایش مستمر و هشدار برای بازنگری ماهانه/فصلی وزن دارایی‌ها، متناسب با شرایط بازار و پروفایل شما.",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "تحلیل بازار ایران",
    desc: "بر پایهٔ داده‌های بورس تهران، فرابورس، صندوق‌های سرمایه‌گذاری، طلا و ارز — متناسب با اقتصاد ایران.",
  },
  {
    icon: <FileText size={20} />,
    title: "گزارش‌های شفاف",
    desc: "گزارش عملکرد سبد همراه با توضیح علمیِ هر تصمیم — هیچ تصمیمی بدون توجیه منطقی گرفته نمی‌شود.",
  },
  {
    icon: <Lock size={20} />,
    title: "امنیت و حریم خصوصی",
    desc: "داده‌های شما رمزنگاری می‌شود، با هیچ شخص ثالثی به اشتراک گذاشته نمی‌شود و تحت کنترل خودتان است.",
  },
];

export default function Capabilities() {
  return (
    <section
      id="features"
      className="section border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="flex flex-col items-center text-center gap-3 mb-14">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-9">
          {CAPS.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 80}>
              <div className="flex gap-4">
                <div
                  className="u-lift flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: "var(--gold-tint)",
                    color: "var(--navy-deep)",
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <h3
                    className="font-display text-base font-bold mb-1.5"
                    style={{ color: "var(--navy-deep)" }}
                  >
                    {c.title}
                  </h3>
                  <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                    {c.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
