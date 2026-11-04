import React from "react";
import { toPersianDigits } from "@/lib/format";
import CodalSourceLink from "./CodalSourceLink";
import type { MonthlyPointSource } from "./monthly-point-provenance";

type TooltipItem = { dataKey?: unknown; name?: unknown; value?: unknown; payload?: unknown };

/** Default Recharts wraps its label in a paragraph: use phrasing elements only.
 * Exact row metadata is optional; the bundle's URL/date is never a substitute.
 */
export default function MonthlyPointSourceLabel({ label, payload, sources }: {
  label: unknown;
  payload: ReadonlyArray<TooltipItem> | undefined;
  sources: ReadonlyMap<string, MonthlyPointSource>;
}) {
  const shown = new Set<string>();
  const entries = (payload ?? []).flatMap(item => {
    if ((item.dataKey !== "current" && item.dataKey !== "prior") || shown.has(item.dataKey)
      || typeof item.value !== "number" || !Number.isFinite(item.value)
      || item.payload === null || typeof item.payload !== "object") return [];
    shown.add(item.dataKey);
    const point = item.payload as Record<string, unknown>;
    const key = point[item.dataKey === "current" ? "currentMonthKey" : "priorMonthKey"];
    const source = typeof key === "string" ? sources.get(key) : undefined;
    return [{ series: typeof item.name === "string" ? item.name : item.dataKey === "current" ? "سال جاری" : "سال قبل", source }];
  });
  const text = (value: string | null | undefined) => value ? toPersianDigits(value) : "نامعلوم";
  return <span data-monthly-point-source=""
    onClick={event => event.stopPropagation()}
    onFocus={event => event.stopPropagation()}
    onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }}
  >
    <span>{typeof label === "string" || typeof label === "number" ? toPersianDigits(label) : ""}</span>
    {entries.map(({ series, source }) => <span key={series} className="mt-2 block border-t border-border pt-2 text-xs leading-5" dir="rtl">
      <span className="block font-semibold">منشأ {series}</span>
      <span className="block">پایان دورهٔ گزارش: {text(source?.periodEnd)}</span>
      <span className="block">واحد مبلغ گزارش: {text(source?.amountUnit)}</span>
      {source?.record ? <>
        <span className="block">انتشار در کدال (زمان محلی): {text(source.record.publishedAt)}</span>
        <span className="block">دریافت رکورد (متن اصلی): <bdi dir="ltr" style={{ display: "block", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-all", textAlign: "left" }}>{source.record.capturedAtRaw ?? "نامعلوم"}</bdi></span>
        <span className="block">دریافت رکورد (UTC): <bdi dir="ltr" style={{ display: "block", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-all", textAlign: "left" }}>{source.record.capturedAt ?? "نامعلوم"}</bdi></span>
        <span className="block">پایان دورهٔ ذخیره‌شده: {text(source.record.storedPeriodEnd)}</span>
        {source.record.amendment ? <span className="block">اصلاحیهٔ گزارش</span> : null}
        <CodalSourceLink url={source.record.sourceUrl} className="block underline" fallback={<span className="block">پیوند دقیق این رکورد نامعلوم است.</span>}>اطلاعیهٔ همین رکورد</CodalSourceLink>
      </> : <span className="block">منشأ دقیق این نقطه نامعلوم است؛ مرجع بستهٔ گزارش‌ها جای آن نیست.</span>}
    </span>)}
  </span>;
}
