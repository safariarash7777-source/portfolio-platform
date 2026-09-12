import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchAnalyses, computeTrackStats } from "@/lib/track/analyses";
import { toPersianDigits } from "@/lib/format";

/**
 * نوارِ کارنامه — P2-PUBLIC-EXPERIENCE-REBASELINE-001
 *
 * قانونِ سخت: اگر رکوردِ **بسته‌شدهٔ واقعی** وجود نداشته باشد، این سکشن اصلاً
 * رندر نمی‌شود. هیچ Placeholder، هیچ «به‌زودی»، هیچ عددِ نمونه.
 * (همان الگویی که `InsightsPreview` از قبل داشت.)
 *
 * `fetchAnalyses()` بدونِ اتصالِ Supabase آرایهٔ خالی برمی‌گرداند، پس در
 * محیطِ بدونِ کلید هم امن است — فقط مخفی می‌ماند.
 */
export default async function TrackRecordStrip() {
  const records = await fetchAnalyses(100);
  const stats = computeTrackStats(records);

  // بدونِ نتیجهٔ بسته‌شده، کارنامه‌ای برای نشان‌دادن نیست.
  if (stats.closed === 0) return null;

  const cells: { label: string; value: string }[] = [
    { label: "تحلیل منتشرشده", value: toPersianDigits(String(stats.total)) },
    { label: "بسته‌شده با نتیجهٔ ثبت‌شده", value: toPersianDigits(String(stats.closed)) },
  ];
  if (stats.avgReturnPct != null) {
    const sign = stats.avgReturnPct > 0 ? "+" : "";
    cells.push({
      label: "میانگین بازدهٔ محقق‌شده",
      value: toPersianDigits(sign + String(stats.avgReturnPct)) + "٪",
    });
  }

  return (
    <section className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2
              className="font-display"
              style={{
                color: "var(--heading)",
                fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: "-0.02em",
              }}
            >
              کارنامه
            </h2>
            <p className="mt-3 max-w-md text-sm" style={{ color: "var(--text-2)", lineHeight: 1.9 }}>
              آنچه در کارنامه ثبت می‌شود، پس از انتشار قابل ویرایش نیست. نتیجه‌اش — هرچه باشد — می‌ماند.
            </p>
          </div>
          <Link href="/analyses" className="btn btn-outline">
            دیدن کارنامهٔ کامل
            <ArrowLeft size={16} />
          </Link>
        </div>

        <dl className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {cells.map((c) => (
            <div key={c.label}>
              <dd
                className="font-display"
                style={{
                  color: "var(--heading)",
                  fontSize: "clamp(2rem, 4vw, 2.75rem)",
                  fontWeight: 900,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {c.value}
              </dd>
              <dt className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>
                {c.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
