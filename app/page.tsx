import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/landing/Hero";
import MarketTicker from "@/components/market/MarketTicker";
import LiveMarket from "@/components/landing/LiveMarket";
import InsightsPreview from "@/components/landing/InsightsPreview";
import Method from "@/components/landing/Method";
import TwoProducts from "@/components/landing/TwoProducts";
import TrackRecordStrip from "@/components/landing/TrackRecordStrip";
import AboutStrip from "@/components/landing/AboutStrip";
import Footer from "@/components/layout/Footer";

/**
 * صفحهٔ اصلی — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * ترتیب (۷ سکشن، از ۱۲):
 *  1. Hero — انسانی و کوتاه، محورِ آرش. بدونِ فرم، بدونِ داشبوردِ ساختگی.
 *  2. MarketTicker + LiveMarket — آخرین وضعیتِ واقعیِ بازار (لنگرِ `#market`).
 *  3. InsightsPreview — تحلیلِ اخیرِ واقعی. بدونِ محتوا ⇒ خودش را مخفی می‌کند.
 *  4. Method — روشِ کار، سه گزاره (لنگرِ `#features`).
 *  5. TwoProducts — وبینار و مشاورهٔ اختصاصی (لنگرِ `#waitlist`).
 *  6. TrackRecordStrip — کارنامه. بدونِ رکوردِ بسته‌شدهٔ واقعی ⇒ رندر نمی‌شود.
 *  7. AboutStrip — معرفیِ کوتاهِ آرش → `/about`.
 *
 * حذف‌شده: ProductFacts · ThreeSteps · Capabilities · WhyArash · LandingFAQ ·
 * FinalCTA (+ PortfolioPreviewCardِ مرده). دلیلِ هر کدام در
 * `docs/P2-PUBLIC-REBASELINE-AUDIT.md`.
 */
export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <MarketTicker />
        <LiveMarket />
        <InsightsPreview />
        <Method />
        <TwoProducts />
        <TrackRecordStrip />
        <AboutStrip />
      </main>
      <Footer />
    </>
  );
}
