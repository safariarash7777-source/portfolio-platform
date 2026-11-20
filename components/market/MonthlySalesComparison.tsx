"use client";

import { useEffect, useState } from "react";
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
  const [histories, setHistories] = useState<History[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(symbols.map(async symbol => {
      const query = new URLSearchParams({ symbol, period });
      const response = await fetch("/api/screener/monthly-sales?" + query, { signal: controller.signal });
      if (!response.ok) throw new Error("history read failed");
      const history: History = await response.json();
      if (history.symbol !== symbol || !Array.isArray(history.points)) throw new Error("invalid history");
      return history;
    })).then(data => { if (!controller.signal.aborted) setHistories(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [symbols, period, attempt]);
  if (error) return <p role="alert">دریافت تاریخچه ممکن نشد. <button className="underline" onClick={() => {setError(false); setAttempt(n => n + 1);}}>تلاش دوباره</button></p>;
  if (!histories) return <p role="status">در حال دریافت تاریخچهٔ فروش…</p>;
  const data = alignMonths(period, histories);
  return <section id="sales-comparison" aria-label="مقایسه فروش ماهانه" className="card scroll-mt-24 space-y-3 p-4">
    <h2 className="text-lg font-bold">{symbols.join(" و ")} · فروش ماهانه</h2>
    {histories.map(h => <SalesReadNotice key={h.symbol} label={"تاریخچهٔ " + h.symbol} readState={h.readState} checkedAt={h.checkedAt}/>)}
    <p className="text-sm">۱۲ ماه منتهی به {toPersianDigits(period)} · میلیون ریال</p>
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{left: 20, right: 8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)"/>
          <XAxis dataKey="label" tickFormatter={toPersianDigits} tick={{fontSize: 10}}/>
          <YAxis tickFormatter={v => new Intl.NumberFormat("fa-IR",{notation:"compact"}).format(v)} tick={{fontSize: 10}}/>
          <Tooltip labelFormatter={v => toPersianDigits(String(v))} formatter={v => number.format(Number(v)) + " میلیون ریال"}/>
          <Legend />
          <Bar dataKey="first" name={symbols[0]} fill="var(--navy-ink)" isAnimationActive={false}/>
          {symbols.length === 2 && <Bar dataKey="second" name={symbols[1]} fill="var(--gold)" isAnimationActive={false}/>}
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details><summary className="cursor-pointer py-2 underline">مبلغ و سند هر ماه</summary>
      <table className="w-full text-start text-sm"><thead><tr><th scope="col">ماه</th>{symbols.map(s => <th scope="col" key={s}>{s}</th>)}</tr></thead>
        <tbody>{data.map(month => <tr key={month.label}><th scope="row">{toPersianDigits(month.label)}</th>
          {month.values.map((p, index) => <td className="p-1 text-center" key={symbols[index]}>{p ? <a className="underline" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{number.format(p.amount)}</a> : "فاقد دادهٔ قابل مقایسه"}</td>)}
        </tr>)}</tbody>
      </table>
    </details>
  </section>;
}
