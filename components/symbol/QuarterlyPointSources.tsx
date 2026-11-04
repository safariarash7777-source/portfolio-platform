import React from "react";
import type { DerivedQuarter, TtmPoint } from "@/lib/core/quarterly";
import { fiscalChainKey } from "@/lib/core/quarterly";
import type { QuarterAmountsSource, QuarterReportSource } from "@/lib/core/quarterly-provenance";
import { toPersianDigits } from "@/lib/format";
import CodalSourceLink from "./CodalSourceLink";

type Period = Pick<DerivedQuarter, "fy" | "q" | "periodEnd">;
type TooltipItem = { dataKey?: unknown; value?: unknown; payload?: unknown };
const clockStyle = { display: "block", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-all", textAlign: "left" } as const;
const text = (value: string | number | null | undefined) => value == null || value === "" ? "نامعلوم" : toPersianDigits(String(value));
const unknown = <span className="block">منبع این دوره نامعلوم است.</span>;

/** Validate only the presentation binding; never select reports or recalculate values. */
function amountsFor(period: Period, amounts: QuarterAmountsSource | null | undefined): QuarterAmountsSource | null {
  if (!amounts || ![1, 2, 3, 4].includes(period.q)) return null;
  const expected = period.q === 1 ? "reported" : "difference";
  if (amounts.operation !== expected || amounts.contributors.length !== (period.q === 1 ? 1 : 2)) return null;
  const current = amounts.contributors.find(c => c.role === "current")?.report;
  const previous = amounts.contributors.find(c => c.role === "previous")?.report;
  if (!current || current.periodEnd !== period.periodEnd || current.periodMonths !== period.q * 3) return null;
  const chain = fiscalChainKey({ period_end: current.periodEnd, period_months: current.periodMonths });
  if (!chain || Number(chain.slice(0, 4)) !== period.fy) return null;
  if (period.q > 1 && (!previous || previous.periodMonths !== (period.q - 1) * 3
    || fiscalChainKey({ period_end: previous.periodEnd, period_months: previous.periodMonths }) !== chain
    || (current.id !== null && current.id === previous.id))) return null;
  return amounts;
}

function ReportDetails({ source, heading }: { source: QuarterReportSource | null | undefined; heading: string }) {
  const record = source?.record;
  const bound = source?.binding === "matched" && Number.isSafeInteger(source.id) && source.id! > 0
    && record?.id === source.id && record.financialPeriodEnd === source.periodEnd;
  return <span className="mt-2 block border-t border-border pt-2 text-xs leading-5" dir="rtl">
    <span className="block font-semibold">{heading}</span>
    {!bound ? <span className="block">منبع این گزارش نامعلوم است.</span> : <>
      <span className="block">پایان دورهٔ گزارش: {text(source.periodEnd)}؛ دورهٔ {text(source.periodMonths)}ماهه</span>
      <span className="block">واحد ارقام گزارش: {text(source.unit)}</span>
      <span className="block">انتشار گزارش (زمان محلی): {text(record.publishedAt)}</span>
      <span className="block">دریافت گزارش (ثبت اصلی): <bdi dir="ltr" style={clockStyle}>{record.capturedAtRaw ?? "نامعلوم"}</bdi></span>
      <span className="block">دریافت گزارش (UTC): <bdi dir="ltr" style={clockStyle}>{record.capturedAt ?? "نامعلوم"}</bdi></span>
      {record.amendment ? <span className="block">اصلاحیهٔ گزارش</span> : null}
      <CodalSourceLink url={record.sourceUrl} className="block underline" fallback={<span className="block">پیوند گزارش در کدال نامعلوم است.</span>}>
        گزارش {text(source.periodEnd)} در کدال
      </CodalSourceLink>
    </>}
  </span>;
}

function AmountSources({ period, amounts, margins = false }: { period: Period; amounts: QuarterAmountsSource | null | undefined; margins?: boolean }) {
  const matched = amountsFor(period, amounts);
  if (!matched) return unknown;
  return <span className="block" dir="rtl">
    <span className="block font-semibold">{matched.operation === "reported" ? "گزارش همین دوره" : "تفاضل دو گزارش"}</span>
    {matched.operation === "difference" ? <span className="block">رقم فصل از گزارش تجمیعی این دوره منهای گزارش تجمیعی دورهٔ قبل به دست آمده است.</span> : null}
    {margins ? <span className="block">حاشیهٔ سود، نسبت سود به درآمد همان فصل است؛ منشأ هر دو در گزارش‌های زیر آمده است.</span> : null}
    {matched.contributors.map(c => <ReportDetails key={c.role} source={c.report}
      heading={c.role === "current" ? "گزارش همین دوره" : "گزارش تجمیعی دورهٔ قبل"} />)}
  </span>;
}

export function QuarterSourceLabel({ label, payload, margins = false }: { label: unknown; payload: ReadonlyArray<TooltipItem> | undefined; margins?: boolean }) {
  const keys = margins ? ["ناخالص", "عملیاتی", "خالص"] : ["درآمد", "سود خالص"];
  const entries = (payload ?? []).filter(item => typeof item.dataKey === "string" && keys.includes(item.dataKey)
    && typeof item.value === "number" && Number.isFinite(item.value));
  const candidates = entries.map(item => item.payload && typeof item.payload === "object"
    ? (item.payload as { sourceQuarter?: DerivedQuarter }).sourceQuarter : undefined);
  const quarter = candidates.length > 0 && candidates.every(q => q === candidates[0]) ? candidates[0] : undefined;
  return <span data-chart-point-source="" dir="rtl" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
    onClick={event => event.stopPropagation()} onFocus={event => event.stopPropagation()}
    onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }}>
    <span className="block font-semibold">{typeof label === "string" || typeof label === "number" ? text(label) : ""}</span>
    {quarter && !quarter.adjusted ? <AmountSources period={quarter} amounts={quarter.provenance?.amounts} margins={margins} /> : unknown}
  </span>;
}

export function TtmPointSources({ point }: { point: TtmPoint }) {
  const window = point.provenance?.netProfit;
  const last = window?.[3];
  const boundWindow = window?.length === 4 && new Set(window.map(q => q.periodEnd)).size === 4
    && last?.periodEnd === point.periodEnd && point.label === `Q${last.q} ${last.fy}`
    && window.every((quarter, index) => {
      const chain = fiscalChainKey({ period_end: quarter.periodEnd, period_months: quarter.q * 3 });
      if (!chain || Number(chain.slice(0, 4)) !== quarter.fy) return false;
      if (index === 0) return true;
      const previous = window[index - 1];
      const month = (end: string) => Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7));
      return quarter.q === (previous.q === 4 ? 1 : previous.q + 1)
        && quarter.fy === previous.fy + (previous.q === 4 ? 1 : 0)
        && month(quarter.periodEnd) - month(previous.periodEnd) === 3;
    });
  const lastAmounts = last ? amountsFor(last as Period, last.amounts) : null;
  const current = lastAmounts?.contributors.find(c => c.role === "current")?.report;
  const capital = point.provenance?.capital;
  const boundCapital = boundWindow && last && capital && (!current || current.id === capital.id)
    && capital.periodEnd === point.periodEnd && capital.periodMonths === last.q * 3
    && Number(fiscalChainKey({ period_end: capital.periodEnd, period_months: capital.periodMonths })?.slice(0, 4)) === last.fy;
  return <div className="space-y-3 text-xs leading-6" dir="rtl">
    <p className="font-semibold">چهار فصل سازندهٔ دوازده‌ماهه</p>
    {boundWindow ? window.map((quarter, index) => <section key={`${quarter.periodEnd}-${index}`}>
      <h5 className="font-semibold">فصل منتهی به {text(quarter.periodEnd)}</h5>
      <AmountSources period={quarter as Period} amounts={quarter.amounts} />
    </section>) : <p>منابع چهار فصل این بازه نامعلوم است.</p>}
    <section>
      <h5 className="font-semibold">سرمایهٔ مبنای سود هر سهم</h5>
      <p>سرمایه از گزارش فصل آخر این بازه گرفته شده است و منشأ آن جداگانه بررسی می‌شود.</p>
      <ReportDetails source={boundCapital ? capital : null} heading="گزارش سرمایه" />
    </section>
    <p>منبع مستقل قیمت P/E در این بخش نامعلوم است؛ زمان گزارش‌های بالا مربوط به قیمت نیست.</p>
  </div>;
}
