"use client";

import { useState } from "react";
import type { HomeMarketSummary } from "@/lib/public-design/home-market-summary";
import type { QuoteBoardFeed } from "@/lib/quote-board";
import QuoteBoard from "@/components/market/QuoteBoard";
import MarketKpiRow from "@/components/market/MarketKpiRow";
import PublicMarketProvenance from "./PublicMarketProvenance";
import s from "./PublicDesign.module.css";

export default function HomeMarketBoard({ initial, quotes }: {
  initial: HomeMarketSummary;
  quotes: QuoteBoardFeed | null;
}) {
  const [summary, setSummary] = useState(initial);
  return <>
    <div className={s.marketRibbon}><MarketKpiRow metrics={summary.metrics} /></div>
    <PublicMarketProvenance ir={{ indices: summary.indices }} availability={summary.availability} />
    <div className={s.homeMarketTools}>
      <QuoteBoard initial={quotes} onSummary={setSummary} />
    </div>
  </>;
}
