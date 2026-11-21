"use client";

import QuarterlyComparison from "./QuarterlyComparison";
import { useCallback, useState } from "react";
import { useSalesRead } from "./useSalesRead";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SalesReadNotice } from "./SalesReadNotice";
import { toPersianDigits } from "@/lib/format";
import type { MonthlySalesScreen } from "@/lib/fundamental/monthly-sales-screen";

type Point = NonNullable<MonthlySalesScreen["rows"][number]["current"]>;
type History = { symbol: string; points: Point[]; checkedAt?: string; readState?: "fresh" | "retained" };
const number = new Intl.NumberFormat("fa-IR", {maximumFractionDigits: 3});

export function alignMonths(period: string, histories: History[]) {
  const [year, month] = period.split("-").map(Number);
  const end = year * 12 + month - 1;
  return Array.from({ length: 12 }, (_, index) => {
    const key = end - 11 + index;
    const label = `${Math.floor(key / 12)}-${String(key % 12 + 1).padStart(2, "0")}`;
    const values = histories.map(history => {
      const matches = history.points.filter(p => p.period === label);
      return matches.length === 1 && matches[0].unit === "میلیون ریال" ? matches[0] : null;
    });
    return {label, values, first: values[0]?.amount ?? null, second: values[1]?.amount ?? null};
  });
}

export default function MonthlySalesComparison({ symbols, period }: { symbols: string[]; period: string }) {
  const [selectedPeriod, selectPeriod] = useState(period);
  const load = useCallback(async (signal: AbortSignal) => {
    const data = await Promise.allSettled(symbols.map(async symbol => {
      const query = new URLSearchParams({ symbol, period });
      const response = await fetch("/api/screener/monthly-sales?" + query, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("دریافت تاریخچه ممکن نشد.");
      const history: History = await response.json();
      if (history.symbol !== symbol || !Array.isArray(history.points)) throw new Error("تاریخچهٔ نماد قابل تأیید نیست.");
      return history;
    }));
    const histories = data.map(item => {
      if (item.status === "rejected") throw item.reason;
      return item.value;
    });
    return {data: histories, clocks: histories.map(h => h.checkedAt)};
  }, [symbols, period]);
  const { data: histories, error, retry } = useSalesRead(load);
  const warning = error && <p role="alert">{error} {histories && "آخرین نتیجهٔ کامل نمایش داده شده است."} <button className="underline" onClick={retry}>تلاش دوباره</button></p>;
  if (!histories && warning) return warning;
  if (!histories) return <p role="status">در حال دریافت تاریخچهٔ فروش…</p>;
  const data = alignMonths(period, histories);
  const selectBar = (bar: { originalDataIndex: number }) => {
    const month = data[bar.originalDataIndex];
    if (month) selectPeriod(month.label);
  };
  const selectedMonth = data.find(month => month.label === selectedPeriod);
  return <section id="sales-comparison" aria-label="مقایسه فروش ماهانه" className="card scroll-mt-24 space-y-3 p-4">
    {warning}
    <h2 className="text-lg font-bold">{symbols.join(" و ")} · فروش ماهانه</h2>
    {histories.map(h => <SalesReadNotice key={h.symbol} label={"تاریخچهٔ " + h.symbol} readState={h.readState} checkedAt={h.checkedAt}/>)}
    <p className="text-sm">۱۲ ماه منتهی به {toPersianDigits(period)} · میلیون ریال</p>
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} onClick={state => {
          if (typeof state.activeLabel === "string" && data.some(month => month.label === state.activeLabel)) selectPeriod(state.activeLabel);
        }} margin={{left: 20, right: 8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
          <XAxis dataKey="label" tickFormatter={toPersianDigits} tick={{fontSize: 10}}/>
          <YAxis tickFormatter={v => new Intl.NumberFormat("fa-IR",{notation:"compact"}).format(v)} tick={{fontSize: 10}}/>
          <Tooltip labelFormatter={v => toPersianDigits(String(v))} formatter={v => number.format(Number(v)) + " میلیون ریال"}/>
          <Legend />
          <Bar dataKey="first" onClick={selectBar} name={symbols[0]} fill="var(--navy-ink)" isAnimationActive={false}/>
          {symbols.length === 2 && <Bar dataKey="second" onClick={selectBar} name={symbols[1]} fill="var(--gold)" isAnimationActive={false}/>}
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="space-y-2">
      <label className="flex flex-wrap items-center gap-2">سند نقطهٔ نمودار
        <select className="rounded border p-2" value={selectedPeriod} onChange={event=>selectPeriod(event.target.value)}>
          {data.map(month=><option key={month.label} value={month.label}>{toPersianDigits(month.label)}</option>)}
        </select>
      </label>
      <ul aria-live="polite" className="flex flex-wrap gap-4">{selectedMonth?.values.map((point,index)=><li key={symbols[index]}>{symbols[index]} · {point
        ? <a href={point.sourceUrl} className="underline" target="_blank" rel="noopener noreferrer">{number.format(point.amount)} میلیون ریال · سند کدال</a>
        : "فاقد دادهٔ قابل مقایسه"}</li>)}</ul>
    </div>
    <details><summary className="cursor-pointer py-2 underline">مبلغ و سند هر ماه</summary>
      <table className="w-full text-start text-sm"><thead><tr><th scope="col">ماه</th>{symbols.map(s => <th scope="col" key={s}>{s}</th>)}</tr></thead>
        <tbody>{data.map(month => <tr key={month.label}><th scope="row">{toPersianDigits(month.label)}</th>
          {month.values.map((p, index) => <td className="p-1 text-center" key={symbols[index]}>{p ? <a className="underline" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{number.format(p.amount)}</a> : "فاقد دادهٔ قابل مقایسه"}</td>)}
        </tr>)}</tbody>
      </table>
    </details>
    <QuarterlyComparison symbols={symbols} period={period} />
  </section>;
}
