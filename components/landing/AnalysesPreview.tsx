import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchAnalyses } from "@/lib/track/analyses";
import { formatJalali } from "@/lib/format";
import Reveal from "./Reveal";

/**
 * پیش‌نمایشِ کارنامه در صفحهٔ اصلی — P2-PUBLIC-MEGA-001
 * آخرین ۳ تحلیل از جدول signals. اگر هیچ داده‌ای نباشد، سکشن ظاهر نمی‌شود.
 * هیچ عدد ساختگی — داده‌ٔ ناموجود = حالت خالی صادقانه.
 */
export default async function AnalysesPreview() {
  const analyses = await fetchAnalyses(3);
  if (analyses.length === 0) return null;

  return (
    <section className="section" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <span className="eyebrow">کارنامهٔ قابل راستی‌آزمایی</span>
            <h2
              className="font-display font-bold mt-1"
              style={{ color: "var(--navy-deep)", fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}
            >
              آخرین تحلیل‌ها
            </h2>
          </div>
          <Link
            href="/analyses"
            className="btn btn-outline"
            style={{ fontSize: "0.85rem" }}
          >
            مشاهدهٔ کارنامهٔ کامل
            <ArrowLeft size={14} />
          </Link>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {analyses.map((a, i) => {
            const hasOutcome = a.outcome !== null;
            const outcomeLabel =
              a.outcome?.outcome === "target"
                ? "به هدف رسید"
                : a.outcome?.outcome === "stop"
                  ? "حد ضرر"
                  : a.outcome?.outcome === "manual_close"
                    ? "بسته‌شده"
                    : a.outcome?.outcome === "expired"
                      ? "منقضی"
                      : null;

            return (
              <Reveal key={a.id} delay={i * 60}>
                <Link
                  href="/analyses"
                  className="u-lift block rounded-2xl p-5 h-full"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {/* symbol + direction */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className="font-display text-lg font-bold"
                      style={{ color: "var(--navy-deep)" }}
                      dir="ltr"
                    >
                      {a.symbol}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{
                        background:
                          a.direction === "buy"
                            ? "rgba(21,128,61,0.10)"
                            : "rgba(185,28,28,0.08)",
                        color:
                          a.direction === "buy"
                            ? "rgb(21,128,61)"
                            : "rgb(185,28,28)",
                      }}
                    >
                      {a.direction === "buy" ? "دیدگاه صعودی" : "دیدگاه نزولی"}
                    </span>
                  </div>

                  {/* date */}
                  <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>
                    {formatJalali(a.entry_date)}
                    {a.horizon ? ` · افق: ${a.horizon}` : ""}
                  </p>

                  {/* outcome badge */}
                  {hasOutcome && outcomeLabel ? (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-2)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      {outcomeLabel}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                      style={{
                        background: "rgba(212,162,43,0.10)",
                        color: "var(--gold)",
                        border: "1px solid rgba(212,162,43,0.25)",
                      }}
                    >
                      در جریان
                    </span>
                  )}
                </Link>
              </Reveal>
            );
          })}
        </div>

        {/* disclaimer */}
        <p
          className="mt-6 text-xs text-center"
          style={{ color: "var(--text-3)" }}
        >
          این تحلیل‌ها صرفاً اطلاع‌رسانی‌اند و توصیهٔ خرید یا فروش نیستند.
        </p>
      </div>
    </section>
  );
}
