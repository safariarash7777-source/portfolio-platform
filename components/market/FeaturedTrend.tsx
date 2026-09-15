"use client";

/**
 * نمودارِ منتخبِ نمای کلان — ردیفِ سوم، دوسومِ عرض.
 *
 * ── چرا دو نمودار و نه یکی ───────────────────────────────────────────────
 * شاخصِ بورس واحدش «امتیاز» است و طلا و دلار واحدشان «تومان». کشیدنِ این دو
 * روی یک محورِ خام هیچ معنایی ندارد — شکلِ نمودار فقط اختلافِ بزرگیِ اعداد را
 * نشان می‌دهد، نه رابطهٔ بازارها را. پس اینجا **انتخاب** می‌شود، نه ترکیب؛ و
 * هر نما محورِ خودش را دارد.
 *
 * ── چرا نمودارها را از نو نمی‌نویسیم ─────────────────────────────────────
 * `IndexTrendChart` و `TrendChart` از قبل با `lightweight-charts` ساخته شده‌اند
 * و خودشان بینِ سری‌ها سوییچ می‌کنند. این فایل فقط یک لایهٔ انتخاب و یک
 * **گزارهٔ پوشش** اضافه می‌کند؛ هیچ وابستگیِ تازه‌ای نمی‌آورد.
 */

import { useState } from "react";
import type { IndexSeries } from "@/lib/core/indexTrend";
import type { TrendSeries } from "@/lib/core/trend";
import { toPersianDigits, formatJalali } from "@/lib/format";
import IndexTrendChart from "./IndexTrendChart";
import TrendChart from "./TrendChart";

type ViewKey = "index" | "goldusd";

/** آیا این سری برای رسم بس است؟ یک نقطه «روند» نیست. */
function usable<T extends { points: unknown[] }>(series: readonly T[]): boolean {
  return series.some((s) => s.points.length >= 2);
}

/**
 * گزارهٔ پوشش: **بازهٔ واقعیِ داده**، نه بازه‌ای که کاربر انتخاب کرده.
 * بدونِ این، نموداری که فقط ۹ روز داده دارد شبیهِ «روندِ ۶ ماهه» دیده می‌شود.
 */
function CoverageNote({ days, first, last }: { days: number; first: string | null; last: string | null }) {
  if (days === 0) return null;
  return (
    <p className="mt-2 text-[11px] leading-5" style={{ color: "var(--text-3)" }}>
      {`${toPersianDigits(days)} روزِ ثبت‌شده`}
      {first && last ? ` · از ${first} تا ${last}` : ""}
      {" · ثبتِ پایانِ هر روزِ معاملاتی (درون‌روزی نیست)"}
    </p>
  );
}

/**
 * تاریخِ دو سری دو تقویمِ متفاوت دارند و نباید یکسان رفتار شوند:
 * `index_history` تاریخِ **جلالیِ** متنِ منبع را می‌دهد (`۱۴۰۵/۰۶/۱۵`) و
 * `ir_market_history` تاریخِ **میلادی** (`2026-09-15`). میلادی باید تبدیل شود؛
 * جلالی فقط رقم‌هایش فارسی می‌شود. یکی‌کردنشان یعنی یک سر بازه ۶۲۱ سال غلط.
 */
const jalaliLabel = (jdate: string) => toPersianDigits(jdate);
const gregorianLabel = (date: string) => formatJalali(`${date}T00:00:00Z`, false);

export default function FeaturedTrend({
  indexSeries,
  goldUsdSeries,
}: {
  indexSeries: IndexSeries[];
  goldUsdSeries: TrendSeries[];
}) {
  const hasIndex = usable(indexSeries);
  const hasGold = usable(goldUsdSeries);
  const [view, setView] = useState<ViewKey>(hasIndex ? "index" : "goldusd");

  // هیچ‌کدام داده ندارند → حالتِ خالیِ صادق، نه قابِ محورِ خالی.
  if (!hasIndex && !hasGold) {
    return (
      <div className="card flex flex-col justify-center px-5 py-10 text-center" style={{ minHeight: 320 }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>
          هنوز سری زمانی‌ای برای رسم ثبت نشده
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-6" style={{ color: "var(--text-3)" }}>
          روندِ شاخص و طلا/دلار از ثبتِ پایانِ هر روزِ معاملاتی ساخته می‌شود. تا جمع‌شدنِ حداقل دو
          روز، نموداری رسم نمی‌شود.
        </p>
      </div>
    );
  }

  const active = view === "index" && hasIndex ? "index" : view === "goldusd" && hasGold ? "goldusd" : hasIndex ? "index" : "goldusd";

  const idxPts = indexSeries.find((s) => s.points.length >= 2)?.points ?? [];
  const goldPts = goldUsdSeries.find((s) => s.points.length >= 2)?.points ?? [];

  const tabs: Array<{ key: ViewKey; label: string; enabled: boolean }> = [
    { key: "index", label: "شاخص بورس", enabled: hasIndex },
    { key: "goldusd", label: "طلا و دلار", enabled: hasGold },
  ];

  return (
    <div className="card flex flex-col px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">روند بازار</p>
          <h2 className="mt-1 font-display text-lg font-bold" style={{ color: "var(--heading)" }}>
            {active === "index" ? "روند شاخص بورس" : "روند طلا و دلار"}
          </h2>
        </div>

        {/* تبِ محلی — نمای همین کارت را عوض می‌کند و صفحه را ترک نمی‌کند،
            برخلافِ ناوبریِ بخش‌ها که لینکِ واقعی است. */}
        <div role="tablist" aria-label="انتخاب نمودار" className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-2)" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              disabled={!t.enabled}
              // بازه/نمایی که داده ندارد فعال نمی‌شود — و دلیلش در title می‌آید.
              title={t.enabled ? undefined : "هنوز دادهٔ کافی برای این نما ثبت نشده"}
              onClick={() => setView(t.key)}
              className="rounded-md px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy-ink)] disabled:cursor-not-allowed"
              style={{
                minHeight: 44,
                background: active === t.key ? "var(--surface)" : "transparent",
                color: !t.enabled ? "var(--text-3)" : active === t.key ? "var(--navy-ink)" : "var(--text-2)",
                opacity: t.enabled ? 1 : 0.45,
                boxShadow: active === t.key ? "var(--shadow-sm)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-w-0 flex-1">
        {active === "index" ? (
          <>
            <IndexTrendChart series={indexSeries} />
            <CoverageNote
              days={idxPts.length}
              first={idxPts[0] ? jalaliLabel(idxPts[0].jdate) : null}
              last={idxPts[idxPts.length - 1] ? jalaliLabel(idxPts[idxPts.length - 1].jdate) : null}
            />
          </>
        ) : (
          <>
            <TrendChart series={goldUsdSeries} />
            <CoverageNote
              days={goldPts.length}
              first={goldPts[0] ? gregorianLabel(goldPts[0].date) : null}
              last={goldPts[goldPts.length - 1] ? gregorianLabel(goldPts[goldPts.length - 1].date) : null}
            />
          </>
        )}
      </div>
    </div>
  );
}
