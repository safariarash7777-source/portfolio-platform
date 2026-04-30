import {
  ShieldCheck,
  PieChart,
  RefreshCw,
  TrendingUp,
  FileText,
  Lock,
} from "lucide-react";
import Container from "../ui/Container";
import SectionHeader from "../ui/SectionHeader";

const FEATURES = [
  {
    icon: <ShieldCheck size={22} />,
    num: "۰۱",
    title: "سنجش علمی پروفایل ریسک",
    desc: "آزمون استاندارد ۲۲ سؤالی در ۶ بخش رفتاری و مالی برای تعیین دقیق سطح تحمل ریسک، افق سرمایه‌گذاری و اهداف شما.",
  },
  {
    icon: <PieChart size={22} />,
    num: "۰۲",
    title: "موتور طراحی پرتفوی",
    desc: "تخصیص دارایی مبتنی بر نظریه مدرن پرتفوی (MPT) با تکیه بر داده‌های بازار سرمایه ایران و الگوریتم‌های کمی.",
  },
  {
    icon: <RefreshCw size={22} />,
    num: "۰۳",
    title: "ریبالانس ادواری",
    desc: "پایش مستمر و هشدارهای دقیق برای بازنگری ماهانه/فصلی وزن دارایی‌ها، متناسب با شرایط بازار و پروفایل شما.",
  },
  {
    icon: <TrendingUp size={22} />,
    num: "۰۴",
    title: "تحلیل بازار ایران",
    desc: "بر پایه داده‌های بورس تهران، فرابورس، صندوق‌های سرمایه‌گذاری، طلا و ارز — متناسب با اقتصاد ایران.",
  },
  {
    icon: <FileText size={22} />,
    num: "۰۵",
    title: "گزارش‌های شفاف",
    desc: "گزارش ماهانه عملکرد سبد به همراه توضیح علمی هر تصمیم — هیچ تصمیمی بدون توجیه منطقی گرفته نمی‌شود.",
  },
  {
    icon: <Lock size={22} />,
    num: "۰۶",
    title: "امنیت و حریم خصوصی",
    desc: "داده‌های شما رمزنگاری می‌شود، با هیچ شخص ثالثی به اشتراک گذاشته نمی‌شود و کاملاً تحت کنترل خودتان است.",
  },
];

export default function Features() {
  return (
    <section id="features" className="section">
      <Container>
        <SectionHeader
          eyebrow="۰۲ · خدمات"
          title="پلتفرم تخصصی برای تصمیم‌گیری مالی شما"
          subtitle="هر آنچه برای ساخت یک سبد سرمایه‌گذاری علمی و متناسب با شرایط شخصی نیاز دارید — در یک پلتفرم یکپارچه."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.num}
              className="card p-7 transition-all hover:-translate-y-0.5"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="flex items-start justify-between mb-5">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{
                    width: 44,
                    height: 44,
                    background: "var(--gold-tint)",
                    color: "var(--navy-deep)",
                  }}
                >
                  {f.icon}
                </div>
                <span
                  className="text-xs font-bold tracking-widest"
                  style={{ color: "var(--gold)", fontFamily: "Georgia, serif" }}
                >
                  {f.num}
                </span>
              </div>
              <h3
                className="font-display text-lg font-bold mb-2"
                style={{ color: "var(--navy-deep)" }}
              >
                {f.title}
              </h3>
              <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
