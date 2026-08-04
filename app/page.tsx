import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/landing/Hero";
import MarketTicker from "@/components/market/MarketTicker";
import ProductFacts from "@/components/landing/ProductFacts";
import ThreeSteps from "@/components/landing/ThreeSteps";
import LiveMarket from "@/components/landing/LiveMarket";
import TwoProducts from "@/components/landing/TwoProducts";
import InsightsPreview from "@/components/landing/InsightsPreview";
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
 *  3. LiveMarket (آخرین وضعیت بازار)
 *  4. TwoProducts
 *  5. ProductFacts
 *  6. ThreeSteps
 *  7. InsightsPreview
 *  8. Capabilities
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
