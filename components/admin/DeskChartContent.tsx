"use client";

import IndexTrendChart from "@/components/market/IndexTrendChart";
import type { IndexSeries } from "@/lib/core/indexTrend";
import type { ArashDeskData } from "@/lib/desk/workspace-model";
import { formatCount, toPersianDigits } from "@/lib/format";
import s from "./DeskChartContent.module.css";

/** Presentation of the existing chartWindow result; no fetching or calculations. */
export default function DeskChartContent({
  read,
  series,
  readAtLabel,
}: {
  read: ArashDeskData["chart"];
  series: IndexSeries[];
  readAtLabel: string;
}) {
  const hasPoints = read.state === "ready" && series.some((row) => row.points.length > 0);
  return (
    <div className={s.content}>
      <p className={s.unit}>واحد: شاخص · مقدار پایان روز معاملاتی</p>
      <div className={s.stage}>
        {hasPoints ? <IndexTrendChart series={series} height={220} /> : (
          <p className={s.empty} role={read.state === "unavailable" ? "alert" : "status"}>
            {read.reason ?? (read.state === "unavailable"
              ? "خواندن تاریخچهٔ شاخص ممکن نشد؛ این وضعیت به معنی نبود داده نیست."
              : "در این بازه نقطه‌ای برای نمایش ثبت نشده است.")}
          </p>
        )}
      </div>

      {hasPoints && (
        <>
          <dl className={s.coverage} aria-label="پوشش نقاط نمایش‌داده‌شده">
            {series.map((row) => (
              <div key={row.id}>
                <dt>{row.faName}</dt>
                <dd>
                  <strong>{formatCount(row.points.length)} نقطه</strong>
                  <span>از <bdi>{toPersianDigits(row.points[0]?.jdate ?? "—")}</bdi> تا <bdi>{toPersianDigits(row.points.at(-1)?.jdate ?? "—")}</bdi></span>
                </dd>
              </div>
            ))}
          </dl>
          <details className={s.dataDetails}>
            <summary>خواندن نقاط نمودار در جدول</summary>
            <p className={s.note}>همان نقاطِ بازهٔ انتخاب‌شده؛ مقادیر با گردکردن نمایشی محور نمودار خوانده می‌شوند.</p>
            {series.map((row) => row.points.length > 0 ? (
              <div key={row.id} className={s.tableScroll} role="region" aria-label={`نقاط نمودار ${row.faName}`} tabIndex={0}>
                <table>
                  <caption>{row.faName} · واحد: شاخص</caption>
                  <thead><tr><th scope="col">تاریخ منبع</th><th scope="col">مقدار پایان روز</th></tr></thead>
                  <tbody>
                    {row.points.map((point) => (
                      <tr key={point.jdate}>
                        <td><bdi>{toPersianDigits(point.jdate)}</bdi></td>
                        <td><bdi>{formatCount(point.value)}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null)}
          </details>
        </>
      )}

      <details className={s.source}>
        <summary>
          منبع و زمان تاریخچه · آخرین نقطه:{" "}
          {read.data.map((row) => `${row.faName}: ${toPersianDigits(row.points.at(-1)?.jdate ?? "—")}`).join(" · ") || "ثبت نشده"}
        </summary>
        <p>منبع: تاریخچهٔ شاخص، یک نقطه به‌ازای پایان هر روز معاملاتی.</p>
        <p>زمان دریافت تاریخچه ثبت نشده · خواندن صفحه: {readAtLabel}</p>
      </details>
    </div>
  );
}
