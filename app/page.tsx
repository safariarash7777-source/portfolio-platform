import { Suspense } from "react";
import Navbar from "@/components/layout/Navbar";
import HomeMarketBoard from "@/components/public-design/HomeMarketBoard";
import { buildQuoteBubbles } from "@/lib/quote-board";
import Method from "@/components/landing/Method";
import TwoProducts from "@/components/landing/TwoProducts";
import TrackRecordStrip from "@/components/landing/TrackRecordStrip";
import Footer from "@/components/layout/Footer";
import PublicDesignFrame from "@/components/public-design/PublicDesignFrame";
import PublicHome from "@/components/public-design/PublicHome";
import PublicHomeMedia from "@/components/public-design/PublicHomeMedia";
import { createClient } from "@/lib/supabase/server";
import { readPublicMedia } from "@/lib/media/public-read.server";
import { latestPublicArticle } from "@/lib/media/public-media";

import { readIranMarket } from "@/lib/market-bounded";
import { homeMarketSummary } from "@/lib/public-design/home-market-summary";
import { readSiteAppearance } from "@/lib/appearance/site-layout-server";
import s from "@/components/public-design/PublicDesign.module.css";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
type HomeProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default function LandingPage(props: HomeProps) {
  return <Suspense fallback={<><Navbar prefetch={false} /><main className="dos dos-home" aria-busy="true"><header className="dos-heading"><div><h1>آرش صفری</h1><p>تحلیلگر و مشاور سرمایه‌گذاری</p></div></header></main></>}>
    <HomeContent {...props} />
  </Suspense>;
}

async function HomeContent({
  searchParams,
}: HomeProps) {
  const sp = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const marketRead = readIranMarket();
  const mediaRead = readPublicMedia();
  const appearance = await readSiteAppearance(supabase, sp);
  return (
    <PublicDesignFrame
      appearance={appearance}
      page="home"
      navigation={<Navbar />}
      footer={<Footer />}
    >
      <Suspense fallback={<header className="dos-heading"><div><h1>آرش صفری</h1><p>تحلیلگر و مشاور سرمایه‌گذاری</p></div></header>}>
        <HomeMedia read={mediaRead} />
      </Suspense>
      <Suspense fallback={<section className={s.homeMarket} aria-busy="true"><h2>نمای عمومی بازار</h2></section>}>
        <HomeMarket read={marketRead} />
      </Suspense>
      <div className={s.legacySections}>
        <TwoProducts />
        <Method />
        <Suspense fallback={null}><TrackRecordStrip /></Suspense>
      </div>
    </PublicDesignFrame>
  );
}

async function HomeMedia({ read }: { read: ReturnType<typeof readPublicMedia> }) {
  const media = await read;
  return <>
    <PublicHome analysis={latestPublicArticle(media.items)} mediaState={media.state} />
    <PublicHomeMedia read={{ ...media, items: media.items.slice(0, 4) }} />
  </>;
}

async function HomeMarket({ read }: { read: ReturnType<typeof readIranMarket> }) {
  const market = await read;
  return (
    <section className={s.homeMarket} id="market-glance">
        <header>
          <h2>نمای عمومی بازار</h2>
          <a href="/market">مشاهدهٔ کامل بازار</a>
        </header>
        <HomeMarketBoard initial={homeMarketSummary(market.data, market.availability)} quotes={market.data ? {
            ir: { gold: market.data.gold, currency: market.data.currency },
            quoteBubbles: buildQuoteBubbles(market.data.gold, market.data.currency, market.availability.readAt),
            availability: { iran: market.availability },
          } : null} />
      </section>
  );
}
