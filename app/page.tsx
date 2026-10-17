import Navbar from "@/components/layout/Navbar";
import MarketTicker from "@/components/market/MarketTicker";
import LiveMarket from "@/components/landing/LiveMarket";
import InsightsPreview from "@/components/landing/InsightsPreview";
import Method from "@/components/landing/Method";
import TwoProducts from "@/components/landing/TwoProducts";
import TrackRecordStrip from "@/components/landing/TrackRecordStrip";
import AboutStrip from "@/components/landing/AboutStrip";
import Footer from "@/components/layout/Footer";
import PublicDesignFrame from "@/components/public-design/PublicDesignFrame";
import PublicHome from "@/components/public-design/PublicHome";
import PublicMarketProvenance from "@/components/public-design/PublicMarketProvenance";
import MarketKpiRow from "@/components/market/MarketKpiRow";
import { readIranMarket } from "@/lib/market-bounded";
import { buildMarketHeadline } from "@/lib/core/marketHeadline";
import { publicLayout } from "@/lib/public-design/layout";
import s from "@/components/public-design/PublicDesign.module.css";

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
export default async function LandingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const market = await readIranMarket();
  const headline = buildMarketHeadline({
    indices: market.data?.indices ?? null,
    stocks: market.data?.stocks ?? [],
    gold: market.data?.gold ?? [],
    currency: market.data?.currency ?? [],
  });
  return (
    <PublicDesignFrame
      initialLayout={publicLayout(sp.design)}
      page="home"
      navigation={<Navbar />}
      footer={<Footer />}
    >
      <PublicHome />
      <section className={s.homeMarket} id="market-glance">
        <header>
          <h2>بازار در یک نگاه</h2>
          <a href="/market">مشاهدهٔ کامل بازار</a>
        </header>
        <div className={s.marketRibbon}>
          <MarketKpiRow metrics={headline.metrics} />
        </div>
        <PublicMarketProvenance
          ir={market.data}
          availability={market.availability}
        />
      </section>
      <div className={s.legacySections}>
        <MarketTicker />
        <LiveMarket />
        <InsightsPreview />
        <Method />
        <TwoProducts />
        <TrackRecordStrip />
        <AboutStrip />
      </div>
    </PublicDesignFrame>
  );
}
