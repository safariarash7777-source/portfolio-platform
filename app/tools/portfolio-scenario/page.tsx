import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PortfolioScenario from "@/components/tools/PortfolioScenario";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  title: "سناریوی سبد",
  description:
    "اثر فرض‌های خودتان را روی یک سبد فرضی ببینید: بازدهٔ اسمی و واقعی، سود و زیان و سهم هر دارایی. ابزار محاسبه است، نه پیش‌بینی.",
  path: "/tools/portfolio-scenario",
});

export default function PortfolioScenarioPage() {
  return (
    <>
      <Navbar />
      <main className="container-narrow pt-24 pb-16 sm:pt-28">
        <header className="mb-6">
          <p className="eyebrow">ابزار</p>
          <h1 className="text-[26px] sm:text-[32px] font-black mt-1" style={{ color: "var(--heading)" }}>
            سناریوی سبد
          </h1>
          <div className="divider-gold mt-3 mb-4" />
          <p className="text-[13.5px] leading-8 max-w-3xl" style={{ color: "var(--text-2)" }}>
            فرض‌های خودتان را وارد کنید و ببینید هرکدام سبد را کجا می‌برد: چقدر از نتیجه از کدام
            دارایی آمده، بازدهٔ اسمی چقدر است و اگر تورم را هم بگویید، چه چیزی از آن واقعاً
            می‌ماند.
          </p>
          <p className="text-[12.5px] leading-7 mt-3 max-w-3xl rounded-[var(--r)] px-3.5 py-3"
             style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
            <strong>این ابزار پیش‌بینی نمی‌کند.</strong> هر عددی که می‌بینید نتیجهٔ حسابِ فرض‌های
            خودِ شماست. هیچ احتمالی به سناریوها نسبت داده نمی‌شود، هیچ دادهٔ بازاری خوانده
            نمی‌شود و هیچ توصیه‌ای ساخته نمی‌شود.
          </p>
        </header>

        <PortfolioScenario />
      </main>
      <Footer />
    </>
  );
}
