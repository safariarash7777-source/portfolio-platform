import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/landing/Hero";
import MarketTicker from "@/components/market/MarketTicker";
import ProductFacts from "@/components/landing/ProductFacts";
import ThreeSteps from "@/components/landing/ThreeSteps";
import LiveMarket from "@/components/landing/LiveMarket";
import TwoProducts from "@/components/landing/TwoProducts";
import InsightsPreview from "@/components/landing/InsightsPreview";
// TODO(B-001): AnalysesPreview موقتاً غیرفعال — منتظر اضافه شدن فیلد is_public به جدول signals توسط Backend
// import AnalysesPreview from "@/components/landing/AnalysesPreview";
import Capabilities from "@/components/landing/Capabilities";
import WhyArash from "@/components/landing/WhyArash";
import LandingFAQ from "@/components/landing/LandingFAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/layout/Footer";

/**
 * صفحهٔ اصلی — P2-PUBLIC-MEGA-002 (Truthfulness Audit)
 * ترتیب:
 *  1. Hero (هویت‌محور، بدون PortfolioPreviewCard ساختگی)
 *  2. MarketTicker
 *  3. LiveMarket (بازارهای لحظه‌ای)
 *  4. [B-001] AnalysesPreview — غیرفعال تا Backend فیلد is_public را اضافه کند
 *  5. TwoProducts
 *  6. ProductFacts
 *  7. ThreeSteps
 *  8. InsightsPreview
 *  9. Capabilities
 * 10. WhyArash
 * 11. LandingFAQ
 * 12. FinalCTA
 */
export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        {/* نبضِ صفحه: نوارِ قیمتِ زنده بلافاصله زیر هیرو */}
        <MarketTicker />
        {/* بازار-اول: طلا/ارز/صندوق/سهام */}
        <LiveMarket />
        {/* B-001: AnalysesPreview غیرفعال — منتظر is_public field در signals */}
        {/* <AnalysesPreview /> */}
        {/* دو محصول اصلی: وبینار فصلی + مشاورهٔ اختصاصی */}
        <TwoProducts />
        <ProductFacts />
        <ThreeSteps />
        <InsightsPreview />
        <Capabilities />
        <WhyArash />
        <LandingFAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
