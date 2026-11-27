import { buildMarketHeadline } from "@/lib/core/marketHeadline";
import type { IrMarket } from "@/lib/market-ir";
import type { SourceAvailability } from "@/lib/market-bounded";
import { publicMetricLabels } from "./metrics";

export function homeMarketSummary(data: IrMarket | null, availability: SourceAvailability) {
  const headline = buildMarketHeadline({
    indices: data?.indices ?? null,
    stocks: data?.stocks ?? [],
    gold: data?.gold ?? [],
    currency: data?.currency ?? [],
  });
  return {
    metrics: publicMetricLabels(headline.metrics, data !== null),
    indices: data?.indices ?? null,
    availability,
    hasSnapshot: data !== null,
  };
}

export type HomeMarketSummary = ReturnType<typeof homeMarketSummary>;
