import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "دربارهٔ آرش صفری",
  description:
    "آرش صفری — تحلیلگر و مشاور سرمایه‌گذاری در بازار سرمایهٔ ایران. روش کار، اصول انتشار تحلیل و مسیرهای همکاری.",
};

/**
 * دربارهٔ آرش — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * حذف‌شده نسبت به نسخهٔ قبل:
 *  - سه کارتِ PILLARS — **چهارمین** تکرارِ همان سه ادعا (Hero, WhyArash, FAQ)
 *    با همان عنوانِ سکشن «اعتماد بر پایهٔ شفافیت، نه اعداد بزرگ».
 *  - «با هش زنجیره‌ای برای حفظ یکپارچگی داده» — معماریِ داخلی برای مخاطبِ عمومی.
 *  - «آمادهٔ شروع هستید؟» و «این شفافیت، پایهٔ اعتماد است» — جمله‌های تزئینی.
 *  - عبارتِ تکرارشوندهٔ «تحلیل‌های ساختاریافته و تأییدشدهٔ این پلتفرم» (۴ بار در
 *    یک صفحه) که به یک تیکِ کلامی تبدیل شده بود.
 *
 * ⚠️ بخشِ «مسیر» (بیوگرافی) عمداً **ساخته نشد**. هیچ سابقه، مدرک، سالِ تجربه یا
 * نمونهٔ کارِ تأییدشده‌ای در مخزن نیست و جعلِ آن ممنوع است. طبق قانونِ «بدونِ
 * دادهٔ واقعی، سکشن مخفی می‌شود» چیزی رندر نمی‌شود. متنِ واقعی که آرش بدهد
 * اینجا اضافه خواهد شد — رجوع به `docs/P2-PUBLIC-REBASELINE-AUDIT.md` §۷.
 */
const PRINCIPLES = [
  {
    title: "فرض، قبل از نتیجه",
    body:
      "هر تحلیل با فرضِ صریح شروع می‌شود: چه چیزی باید درست باشد تا این نتیجه بگیرد. اگر فرض عوض شد، نتیجه هم عوض می‌شود.",
  },
  {
    title: "بازه، نه عددِ قطعی",
    body:
      "ارزش‌گذاری در سه سناریو منتشر می‌شود، نه یک قیمتِ هدفِ واحد. عددِ واحد دقتی را نشان می‌دهد که در عمل وجود ندارد.",
  },
  {
    title: "نتیجه پاک نمی‌شود",
    body:
      "تحلیل پس از انتشار قابل ویرایش نیست. هر تحلیل با تاریخ و قیمتِ روزِ انتشار ثبت می‌شود و نتیجه‌اش — درست یا غلط — در کارنامه می‌ماند.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* سرصفحه */}
        <section
          style={{ background: "linear-gradient(180deg, var(--navy-deep) 0%, var(--navy) 100%)" }}
        >
          <div className="mx-auto w-full max-w-6xl px-5 pt-20 pb-16 sm:pt-24 sm:pb-20">
            <div className="max-w-2xl">
              <p className="text-xs sm:text-sm font-bold tracking-wide" style={{ color: "var(--gold-light)" }}>
                تحلیلگر و مشاور سرمایه‌گذاری · بازار سرمایهٔ ایران
              </p>
              <div
                aria-hidden
                className="my-5"
                style={{ height: 2, width: 56, background: "var(--gold)", borderRadius: 2 }}
              />
              <h1
                className="font-display"
                style={{
                  color: "var(--text-on-navy)",
                  fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
                  fontWeight: 900,
                  lineHeight: 1.1,
                  letterSpacing: "-0.03em",
                }}
              >
                آرش صفری
              </h1>
              <p
                className="mt-6 text-base sm:text-lg"
                style={{ color: "rgba(248,250,252,0.82)", lineHeight: 1.9 }}
              >
                بازار ایران را دنبال می‌کنم، تحلیلم را با نامِ خودم منتشر می‌کنم و
                نتیجه‌اش را پاک نمی‌کنم.
              </p>
            </div>
          </div>
        </section>

        {/* اصولِ کار */}
        <section className="section" style={{ background: "var(--bg)" }}>
          <div className="mx-auto w-full max-w-6xl px-5">
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
              سه قاعده‌ای که رعایت می‌کنم
            </h2>
            <div aria-hidden className="divider-gold mt-4" />

            <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
              {PRINCIPLES.map((p, i) => (
                <div
                  key={p.title}
                  className={
                    "h-full" +
                    (i < PRINCIPLES.length - 1
                      ? " md:pe-8 md:border-e md:border-[color:var(--line)]"
                      : "")
                  }
                >
                  <h3 className="font-display text-lg font-bold" style={{ color: "var(--heading)" }}>
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-2)", lineHeight: 1.9 }}>
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* برای چه کسی */}
        <section className="border-y" style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}>
          <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
            <div className="max-w-2xl">
              <h2
                className="font-display"
                style={{
                  color: "var(--heading)",
                  fontSize: "clamp(1.4rem, 2.8vw, 2rem)",
                  fontWeight: 800,
                  lineHeight: 1.35,
                  letterSpacing: "-0.02em",
                }}
              >
                اینجا چه چیزی پیدا می‌کنید — و چه چیزی پیدا نمی‌کنید
              </h2>
              <p className="mt-6 text-base" style={{ color: "var(--text-2)", lineHeight: 1.95 }}>
                وضعیتِ روزِ بازار، تحلیل‌هایی با فرضِ روشن، و کارنامه‌ای که می‌توانید
                خودتان راستی‌آزمایی کنید.
              </p>
              <p className="mt-4 text-base" style={{ color: "var(--text-2)", lineHeight: 1.95 }}>
                اینجا نه وعدهٔ سود می‌بینید، نه بازدهی تضمین‌شده، و نه توصیهٔ خرید و فروشِ نماد.
                تصمیمِ نهایی همیشه با خودِ شماست.
              </p>
            </div>
          </div>
        </section>

        {/* مسیرها */}
        <section className="section" style={{ background: "var(--bg)" }}>
          <div className="mx-auto w-full max-w-6xl px-5">
            <h2
              className="font-display"
              style={{
                color: "var(--heading)",
                fontSize: "clamp(1.4rem, 2.8vw, 2rem)",
                fontWeight: 800,
                lineHeight: 1.35,
                letterSpacing: "-0.02em",
              }}
            >
              از کجا شروع کنید
            </h2>
            <div aria-hidden className="divider-gold mt-4" />
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/market" className="btn btn-gold">
                دیدن وضعیت امروز بازار
                <ArrowLeft size={16} />
              </Link>
              <Link href="/analyses" className="btn btn-outline">
                دیدن کارنامه
              </Link>
              <Link href="/#waitlist" className="btn btn-outline">
                درخواست مشاوره
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
