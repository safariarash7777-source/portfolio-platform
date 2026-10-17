import Navbar from "@/components/layout/Navbar";
import MarketTicker from "@/components/market/MarketTicker";
import LiveMarket from "@/components/landing/LiveMarket";
import Method from "@/components/landing/Method";
import TwoProducts from "@/components/landing/TwoProducts";
import TrackRecordStrip from "@/components/landing/TrackRecordStrip";
import Footer from "@/components/layout/Footer";
import PublicDesignFrame from "@/components/public-design/PublicDesignFrame";
import PublicHome from "@/components/public-design/PublicHome";
import PublicHomeMedia from "@/components/public-design/PublicHomeMedia";
import { createClient } from "@/lib/supabase/server";
import { readHomeMedia } from "@/lib/public-design/home-media";
import PublicMarketProvenance from "@/components/public-design/PublicMarketProvenance";
import MarketKpiRow from "@/components/market/MarketKpiRow";
import { readIranMarket } from "@/lib/market-bounded";
import { buildMarketHeadline } from "@/lib/core/marketHeadline";
import { publicLayout } from "@/lib/public-design/layout";
import { publicMetricLabels } from "@/lib/public-design/metrics";
import s from "@/components/public-design/PublicDesign.module.css";

/**
 * صفحهٔ اصلی — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * ترتیب محصول در هر سه زبان بصری ثابت است:
 *  1. معرفی واقعی آرش؛ 2. رسانهٔ موجود (حتی حالت خالی/خطا)؛
 *  3. نمای عمومی بازار؛ 4. خدمات و روش همکاری.
 * لنگرهای #market، #features و #waitlist و منطق دسترسی قبلی محفوظ‌اند.
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
  const supabase = await createClient();
  const [market, media] = await Promise.all([
    readIranMarket(),
    readHomeMedia(supabase),
  ]);
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
      <PublicHomeMedia read={media} />
      <section className={s.homeMarket} id="market-glance">
        <header>
          <h2>نمای عمومی بازار</h2>
          <a href="/market">مشاهدهٔ کامل بازار</a>
        </header>
        <div className={s.marketRibbon}>
          <MarketKpiRow
            metrics={publicMetricLabels(headline.metrics, market.data !== null)}
          />
        </div>
        <PublicMarketProvenance
          ir={market.data}
          availability={market.availability}
        />
        <div className={s.homeMarketTools}>
          <MarketTicker />
          <LiveMarket />
        </div>
      </section>
      <div className={s.legacySections}>
        <TwoProducts />
        <Method />
        <TrackRecordStrip />
      </div>
    </PublicDesignFrame>
  );
}
