import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/landing/Hero";
import InsightsPreview from "@/components/landing/InsightsPreview";
import Method from "@/components/landing/Method";
import TwoProducts from "@/components/landing/TwoProducts";
import MarketEntry from "@/components/public/MarketEntry";
import CourseCatalog from "@/components/public/CourseCatalog";
export const metadata: Metadata = {
  title: { absolute: "مسیر راه سرمایه‌گذاری · آرش صفری" },
  description:
    "وبینار فصلی و سه ماه همراهی با محتوای دوره و داشبوردهای بازار؛ مشاهدهٔ اطلاعات دوره، ورود اعضا و درخواست وقت مشاوره.",
  alternates: { canonical: "/" },
};
export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" className="public-page">
        <Hero />
        <section className="public-section public-surface">
          <div className="public-container">
            <CourseCatalog compact />
          </div>
        </section>
        <Method />
        <Suspense
          fallback={
            <div className="public-container public-section" role="status">
              در حال دریافت وضعیت دادهٔ بازار…
            </div>
          }
        >
          <MarketEntry />
        </Suspense>
        <Suspense
          fallback={
            <div className="public-container public-section" role="status">
              در حال دریافت مطالب منتشرشده…
            </div>
          }
        >
          <InsightsPreview />
        </Suspense>
        <TwoProducts />
        <section className="public-section public-surface">
          <div className="public-container public-about-row">
            <div>
              <p className="public-eyebrow">دربارهٔ آرش صفری</p>
              <h2>آموزش و تحلیل بازار سرمایه</h2>
              <p className="public-description">
                معرفی، روش کار و کارنامهٔ تحلیل‌ها را در صفحات اختصاصی بخوانید.
              </p>
            </div>
            <div className="public-actions">
              <Link href="/about" className="btn btn-outline">
                معرفی و روش کار
              </Link>
              <Link href="/analyses" className="public-text-link">
                مشاهدهٔ کارنامه
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
