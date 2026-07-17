// بخش «روند شاخص» در /market — M5 «رصد بازار»؛ server component.
// داده از index_history (روزی یک ردیف EOD که رله می‌نویسد).
// دادهٔ ناکافی (کمتر از ۲ روز) → کارت نمایش داده نمی‌شود (حالت خالی صادقانه).
import { getIndexTrend } from "@/lib/core/indexTrend";
import IndexTrendChart from "./IndexTrendChart";

export default async function IndexTrend() {
  const series = await getIndexTrend(180);
  const hasEnough = series.some((s) => s.points.length >= 2);
  if (!hasEnough) return null;
  return (
    <section className="card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">روند بازار</p>
          <h2 className="mt-1 font-display text-xl font-bold" style={{ color: "var(--navy-deep)" }}>
            روند شاخص بورس
          </h2>
        </div>
      </div>
      <div className="mt-4">
        <IndexTrendChart series={series} />
      </div>
    </section>
  );
}
