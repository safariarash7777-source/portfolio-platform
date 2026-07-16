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

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        {/* نبضِ صفحه: نوارِ قیمتِ زنده بلافاصله زیر هیرو */}
        <MarketTicker />
        {/* بازار-اول: طلا/ارز/صندوق/سهام بلافاصله بعد از هیرو — چیزی که بازدیدکننده برایش می‌آید */}
        <LiveMarket />
        {/* دو محصول اصلی: وبینار فصلی + مشاورهٔ اختصاصی (مسیرهای دسترسی کامل) */}
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
