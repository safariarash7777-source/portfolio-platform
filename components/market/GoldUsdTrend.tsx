// بخش «روند طلا و دلار» در /market — server component؛ داده از ir_market_history.
// دادهٔ ناکافی (کمتر از ۲ روز) → کارت نمایش داده نمی‌شود (حالت خالی صادقانه).

import { getGoldUsdTrend } from "@/lib/core/trend";
import TrendChart from "./TrendChart";

export default async function GoldUsdTrend() {
  const series = await getGoldUsdTrend(180);
  const hasEnough = series.some((s) => s.points.length >= 2);
  if (!hasEnough) return null;

  return (
    <section className="card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">روند بازار</p>
          <h2 className="mt-1 font-display text-xl font-bold" style={{ color: "var(--navy-deep)" }}>
            روند طلا و دلار
          </h2>
        </div>
      </div>
      <div className="mt-4">
        <TrendChart series={series} />
      </div>
    </section>
  );
}
