"use client";

import { useState } from "react";
import Link from "next/link";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import type { HistoryPoint } from "@/lib/portfolio/dossier-history";

export default function DossierTrend({ history }: { history?: { state: "empty" | "ready" | "unavailable"; points: HistoryPoint[] } }) {
  const points = history?.points ?? [];
  const [selectedId, select] = useState<string | null>(null);
  const selected = points.find(point => point.id === selectedId) ?? points.at(-1);
  const timed = points.filter(point => Number.isFinite(Date.parse(point.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const plotted = timed.map(point => ({ ...point, amount: point.pricedAmount ?? point.amount }));
  const values = plotted.filter((point): point is HistoryPoint & { amount: number } => point.amount !== null);
  const from = Date.parse(timed[0]?.date ?? ""), to = Date.parse(timed.at(-1)?.date ?? "");
  const show = values.length > 1 && to > from && new Set(values.map(point => Date.parse(point.date))).size > 1;
  const max = Math.max(...values.map(point => point.amount), 1);
  const x = (point: HistoryPoint) => 8 + (Date.parse(point.date) - from) / (to - from) * 284;
  const y = (amount: number) => 82 - amount / max * 67;
  const segments: string[][] = [];
  if (show) for (const point of plotted) {
    if (point.amount === null) { segments.push([]); continue; }
    if (!segments.length) segments.push([]);
    segments[segments.length - 1].push(`${x(point)},${y(point.amount)}`);
  }
  return <>
    <p className="dos-muted">نمودار جمع بخش قیمت‌دار هر نسخه را نشان می‌دهد. این روند از ثبت اطلاعات و اصلاح ارزش اظهارشده ساخته شده است؛ تغییر آن، سود یا تغییر قیمت بازار نیست.</p>
    {show ? <svg className="dos-plot" viewBox="0 0 300 94" role="group" aria-label="انتخاب نسخه روی نمودار ارزش ثبت‌شده">
      <line x1="8" x2="292" y1="82" y2="82" stroke="var(--rule)" />
      {segments.filter(segment => segment.length > 1).map((segment, index) => <polyline key={index} points={segment.join(" ")} fill="none" stroke="var(--chart-stroke)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      {values.map(point => <g key={point.id}>
        <circle cx={x(point)} cy={y(point.amount)} r="3" fill="var(--chart-stroke)" aria-hidden="true" />
        <circle cx={x(point)} cy={y(point.amount)} r="10" fill="transparent" role="button" tabIndex={0}
          aria-label={`نمایش نسخهٔ ${toPersianDigits(point.version)}، ${formatJalali(point.date)}، ${formatToman(point.amount)}`}
          aria-pressed={selected?.id === point.id} onClick={() => select(point.id)}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(point.id); } }} />
      </g>)}
    </svg> : <p className="dos-empty">{history?.state === "unavailable" ? "خواندن تاریخچه کامل نشد؛ نسخهٔ فعلی جداگانه نمایش داده می‌شود." : "برای رسم روند، دو نسخه با ارزش ثبت‌شده و زمان متفاوت لازم است."}</p>}
    {points.length > 0 && <>
      <div className="flex flex-wrap gap-2 my-3" role="group" aria-label="انتخاب نسخهٔ پرونده">
        {points.map(point => <button key={point.id} type="button" className="btn btn-outline min-h-11" aria-pressed={selected?.id === point.id} onClick={() => select(point.id)}>نسخهٔ {toPersianDigits(point.version)}</button>)}
      </div>
      {selected && <div role="status" aria-live="polite" className="rounded-xl border p-4 space-y-2">
        <p>نسخهٔ {toPersianDigits(selected.version)} · {formatJalali(selected.date)}</p>
        <p>{selected.amount === null ? "ارزش کامل این نسخه نامشخص است." : `ارزش ثبت‌شده: ${formatToman(selected.amount)}`}</p>
        {selected.pricedAmount != null && selected.amount === null && <p>بخش دارای ارزش: {formatToman(selected.pricedAmount)}</p>}
        {selected.assetCount != null && selected.pricedCount != null && <p>{toPersianDigits(selected.pricedCount)} از {toPersianDigits(selected.assetCount)} دارایی ارزش ثبت‌شدهٔ معتبر دارد.</p>}
        <p>{selected.estimated ? "منبع: ارزش اظهارشدهٔ عضو، شامل برآورد." : "منبع: اطلاعات اظهارشدهٔ همان نسخه؛ قیمت روز اعمال نشده است."}</p>
        <Link href={`/dashboard/holdings?v=${encodeURIComponent(selected.id)}`} className="dos-link">بازکردن همین نسخه</Link>
      </div>}
    </>}
  </>;
}
