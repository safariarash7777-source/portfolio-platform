import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, FileText, ShieldOff, ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "درباره آرش صفری",
  description:
    "آرش صفری — تحلیلگر و مشاور سرمایه‌گذاری. آشنایی با رویکرد، روش کار و اصول حرفه‌ای.",
  openGraph: {
    title: "درباره آرش صفری · تحلیلگر و مشاور سرمایه‌گذاری",
    description: "آرش صفری — تحلیلگر و مشاور سرمایه‌گذاری. آشنایی با رویکرد، روش کار و اصول حرفه‌ای.",
    url: "https://arashsafari.ir/about",
    type: "profile",
  },
};

/**
 * Truthfulness Audit — P2-PUBLIC-MEGA-002
 * حذف‌شده‌ها:
 *  - ادعای «مجوز رسمی» از PILLARS (نیاز به تأیید مالک — Owner Decision OD-001)
 *  - ادعای «داده‌ها رمزنگاری می‌شود / به شخص ثالث فروخته نمی‌شود / قابل حذف کامل» (ادعای حقوقی/امنیتی بدون مدرک)
 *  - «هیچ‌کس نمی‌تواند تاریخچه را تغییر دهد» (ادعای فنی مطلق — جایگزین با توضیح دقیق‌تر)
 *  - «۲۲ سؤال در ۶ بخش» (عدد مشخص بدون تأیید — Owner Decision OD-002)
 *  - «۳ ماه دسترسی کامل» (وعده مدت بدون تأیید — Owner Decision OD-003)
 */
const PILLARS = [
  {
    icon: <BadgeCheck size={22} />,
    title: "مسئولیت‌پذیری حرفه‌ای",
    desc: "تحلیل و مشاوره توسط آرش صفری — با نام مشخص، نه پیج بی‌نام.",
  },
  {
    icon: <FileText size={22} />,
    title: "شفافیت کامل روش",
    desc: "تحلیل‌های ساختاریافته و تأییدشدهٔ این پلتفرم با ذکر فروض و دادهٔ پشتوانه منتشر می‌شوند؛ ارزش‌گذاری‌ها بازه‌ای و سناریومحورند، نه عدد قطعی — و در کارنامهٔ تحلیل‌های منتشرشده قابل مشاهده‌اند.",
  },
  {
    icon: <ShieldOff size={22} />,
    title: "بدون وعدهٔ سود",
    desc: "هیچ بازدهی تضمین نمی‌شود. تمرکز بر تصمیم‌گیریِ منطقی و کاهش ریسک‌های شناختی است، نه وعدهٔ سود.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section
          className="relative overflow-hidden"
          style={{
            background: "linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "52px 52px",
            }}
          />
          <div className="relative mx-auto w-full max-w-4xl px-5 pt-16 pb-20 text-right">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold mb-6"
              style={{
                background: "rgba(212,162,43,0.12)",
                color: "var(--gold-light)",
                border: "1px solid rgba(212,162,43,0.30)",
              }}
            >
              <BadgeCheck size={14} />
              تحلیلگر و مشاور سرمایه‌گذاری
            </span>
            <h1
              className="font-display"
              style={{
                color: "var(--text-on-navy)",
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                fontWeight: 900,
                lineHeight: 1.14,
                letterSpacing: "-0.02em",
                marginBottom: "1.25rem",
              }}
            >
              آرش صفری
            </h1>
            <p
              className="text-base sm:text-lg max-w-2xl"
              style={{ color: "rgba(248,250,252,0.80)", lineHeight: 1.85 }}
            >
              تحلیلگر و مشاور سرمایه‌گذاری با تمرکز بر بازار سرمایهٔ ایران.
              رویکرد کار: تصمیم‌گیری مبتنی بر داده، شفافیت کامل در روش، و
              مسئولیت‌پذیری حرفه‌ای در برابر تحلیل‌های ساختاریافته و تأییدشدهٔ منتشرشده.
            </p>
          </div>
        </section>

        {/* رویکرد و اصول */}
        <section className="section" style={{ background: "var(--bg)" }}>
          <div className="mx-auto w-full max-w-4xl px-5">
            <div className="text-center mb-12">
              <span className="eyebrow">اصول کار</span>
              <h2
                className="font-display font-bold mt-2"
                style={{
                  color: "var(--navy-deep)",
                  fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
                  fontWeight: 800,
                }}
              >
                اعتماد بر پایهٔ شفافیت، نه اعداد بزرگ
              </h2>
              <div className="divider-gold mx-auto mt-4" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PILLARS.map((p) => (
                <div
                  key={p.title}
                  className="u-lift h-full rounded-2xl p-6"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderInlineStart: "3px solid var(--gold)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-xl mt-0.5"
                      style={{
                        width: 42,
                        height: 42,
                        background: "var(--gold-tint)",
                        color: "var(--gold)",
                        border: "1px solid rgba(184,134,11,0.25)",
                      }}
                    >
                      {p.icon}
                    </span>
                    <div>
                      <h3
                        className="font-bold mb-2"
                        style={{ color: "var(--navy-deep)", fontSize: "1rem" }}
                      >
                        {p.title}
                      </h3>
                      <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
                        {p.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* روش کار */}
        <section className="section" style={{ background: "var(--surface)" }}>
          <div className="mx-auto w-full max-w-4xl px-5">
            <div className="text-center mb-10">
              <span className="eyebrow">روش کار</span>
              <h2
                className="font-display font-bold mt-2"
                style={{
                  color: "var(--navy-deep)",
                  fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
                  fontWeight: 800,
                }}
              >
                چگونه کار می‌کنم
              </h2>
            </div>
            <div className="prose-like max-w-2xl mx-auto text-right">
              <p className="text-base leading-8 mb-5" style={{ color: "var(--text-2)" }}>
                تحلیل‌های ساختاریافته و تأییدشدهٔ این پلتفرم بر پایهٔ نظریهٔ مدرن پرتفوی، تحلیل بنیادی و
                ارزیابی رفتاری بازار انجام می‌شود. این تحلیل‌ها با ذکر صریح فروض،
                بازهٔ ارزش‌گذاری (نه عدد قطعی) و سناریوهای مختلف منتشر می‌شوند.
              </p>
              <p className="text-base leading-8 mb-5" style={{ color: "var(--text-2)" }}>
                تحلیل‌های ساختاریافته و تأییدشدهٔ این پلتفرم با قیمت ورود، تاریخ و
                وضعیت نتیجه ثبت می‌شوند — با هش زنجیره‌ای برای حفظ یکپارچگی داده.
                این شفافیت، پایهٔ اعتماد است.
              </p>
              <p className="text-base leading-8" style={{ color: "var(--text-2)" }}>
                مشاورهٔ اختصاصی شامل ارزیابی پروفایل ریسک، طراحی سبد متناسب
                با شرایط شما، و دسترسی به ابزارهای تحلیلی پلتفرم است.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section" style={{ background: "var(--bg)" }}>
          <div className="mx-auto w-full max-w-4xl px-5 text-center">
            <h2
              className="font-display font-bold mb-4"
              style={{
                color: "var(--navy-deep)",
                fontSize: "clamp(1.4rem, 2.8vw, 2rem)",
                fontWeight: 800,
              }}
            >
              آمادهٔ شروع هستید؟
            </h2>
            <p className="text-base mb-8" style={{ color: "var(--text-2)" }}>
              کارنامهٔ تحلیل‌ها را ببینید یا درخواست خود را ثبت کنید.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/analyses" className="btn btn-navy">
                مشاهدهٔ کارنامه
                <ArrowLeft size={14} />
              </Link>
              <Link href="/#waitlist" className="btn btn-gold">
                ثبت درخواست
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
