"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCount, formatJalali, formatTehranClock, toLatinDigits, toPersianDigits } from "@/lib/format";
import { normalizeFa } from "@/lib/market-nav";
import type { MonthlySalesScreen } from "@/lib/fundamental/monthly-sales-screen";
import MonthlySalesComparison from "./MonthlySalesComparison";

type Row = MonthlySalesScreen["rows"][number];
type Point = NonNullable<Row["current"]>;
const number = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 4 });
const control = "min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm";
const statuses = { pass: "عبورکرده", fail: "زیر حد رشد", missing: "غیرقابل محاسبه", all: "همه نمادها" } as const;
const columns = { industry: "صنعت", current: "فروش ماه جاری", previous: "فروش ماه هم‌دوره" } as const;

function timestamp(value: string | null) {
  if (!value) return "نامشخص";
  if (/^1[34]\d{2}[/-]/.test(toLatinDigits(value))) return toPersianDigits(value);
  if (!Number.isFinite(Date.parse(value))) return toPersianDigits(value);
  return formatJalali(value, false) + " · " + formatTehranClock(value);
}

function PointSource({ label, point }: { label: string; point: Point | null }) {
  return <div className="rounded-lg border border-[var(--line)] p-3">
    <h4 className="font-bold">{label}</h4>
    {point ? <>
      <p>{number.format(point.amount)} {point.unit} · {toPersianDigits(point.period)}</p>
      <p>زمان انتشار {timestamp(point.publishedAt)}</p><p>زمان دریافت {timestamp(point.capturedAt)}</p>
      <a href={point.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">سند کدال{point.amendment ? " (اصلاحیه)" : ""}</a>
    </> : <p>گزارش معتبر این دوره در دسترس نیست.</p>}
  </div>;
}

export function GrowthEvidence({ row, result }: { row: Row; result: MonthlySalesScreen }) {
  return <div className="space-y-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{row.symbol} · مبنای محاسبه</h3><a className="underline" href={"/market/screener?" + new URLSearchParams({ period:result.period, minGrowth:String(result.minGrowth), symbol:row.symbol })}>پیوند این ردیف</a></div>
    <p>{row.reason || (row.passed ? "رشد به حد انتخابی رسیده است." : "رشد کمتر از حد انتخابی است.")}</p>
    <p>درصد رشد = (فروش ماه جاری − فروش ماه هم‌دوره) ÷ فروش ماه هم‌دوره × ۱۰۰</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <PointSource label={"ماه جاری " + toPersianDigits(result.period)} point={row.current}/>
      <PointSource label={"ماه هم‌دوره " + toPersianDigits(result.previousPeriod)} point={row.previous}/>
    </div>
    {row.unitReview?.map(review => <p key={review.reportId}>واحد مبلغ فروش در محاسبه تأیید نشده است. <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">بازبینی سند {toPersianDigits(review.periodEnd)}{review.amendment ? " (اصلاحیه)" : ""}</a></p>)}
  </div>;
}

export function SalesScreenResults({ result, symbol = "" }: { result: MonthlySalesScreen; symbol?:string }) {
  const [status, setStatus] = useState<keyof typeof statuses>(symbol ? "all" : "pass");
  const [search, setSearch] = useState(symbol);
  const [open, setOpen] = useState<string | null>(symbol || null);
  const [selected, setSelected] = useState<string[]>([]);
  const [visible, setVisible] = useState({industry:true, current:true, previous:true});
  const [page, setPage] = useState(1);
  const query = normalizeFa(search);
  const rows = result.rows.filter(row => {
    if (!normalizeFa(row.symbol + " " + (row.industry ?? "")).includes(query)) return false;
    if (status === "pass") return row.passed === true;
    if (status === "fail") return row.passed === false;
    if (status === "missing") return row.passed === null;
    return true;
  });
  const pages = Math.max(1, Math.ceil(rows.length / 40));
  const start = (page - 1) * 40;
  const from = "/market/screener?" + new URLSearchParams({period:result.period, minGrowth:String(result.minGrowth)});
  function compare(symbol: string) {
    setSelected(previous => previous.includes(symbol) ? previous.filter(s => s !== symbol) : previous.length < 2 ? [...previous, symbol] : previous);
  }
  return <div className="space-y-4">
    <details className="card p-4"><summary className="cursor-pointer font-bold">پوشش بازار · {formatCount(result.coverage.calculable)} قابل محاسبه از {formatCount(result.coverage.eligible)} ناشر مشمول</summary>
      <p className="mt-3 text-sm">{result.coverage.universeSource} تاریخ تابلو {timestamp(result.coverage.rosterUpdatedAt)}</p>
      <p className="py-2 text-sm">جامعهٔ بررسی {formatCount(result.coverage.universe)} · مشمول {formatCount(result.coverage.eligible)} · عبورکرده {formatCount(result.coverage.passed)}</p>
      <p className="mb-2 text-sm">ناشران دارای اطلاعیه یا گزارش در این دوره که در تابلو نیستند و شمولشان جداگانه باید بررسی شود · {formatCount(result.coverage.outsideRoster)}</p>
      <ul className="list-inside list-disc text-sm">{Object.entries(result.coverage.excluded).map(([reason, count]) => <li key={reason}>{reason} · {formatCount(count)}</li>)}</ul>
      <p className="mt-2 text-xs">زمان خواندن داده‌ها {timestamp(result.checkedAt)} (تهران)</p>
    </details>
    {selected.length > 0 && <><div className="flex flex-wrap gap-2">{selected.map(s => <button className={control} key={s} onClick={() => compare(s)}>حذف {s} از مقایسه</button>)}</div>
      <MonthlySalesComparison key={selected.join("/") + result.period} symbols={selected} period={result.period}/></>}
    <section className="card space-y-4 p-4" aria-label="جدول غربال فروش">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">نماد یا صنعت<input className={control} type="search" value={search} onChange={e => {setSearch(e.target.value); setPage(1);}}/></label>
        <label className="grid gap-1 text-sm">وضعیت<select value={status} className={control} onChange={e => {setStatus(e.target.value as keyof typeof statuses); setPage(1);}}>
          {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <details className="text-sm"><summary className="cursor-pointer p-2 underline">ستون‌ها</summary>{(Object.keys(columns) as (keyof typeof columns)[]).map(k => <label className="block p-1" key={k}><input type="checkbox" checked={visible[k]} onChange={() => setVisible(prev => ({...prev,[k]:!prev[k]}))}/> {columns[k]}</label>)}</details>
      </div>
      <p role="status" className="text-sm">{formatCount(rows.length)} نماد · {toPersianDigits(result.period)} در مقایسه با {toPersianDigits(result.previousPeriod)} · مبالغ به میلیون ریال</p>
      <div className="overflow-x-auto"><table className="w-full border-collapse whitespace-nowrap text-start text-sm">
        <thead className="bg-[var(--surface-2)] text-start"><tr>{["مقایسه","نماد",...(visible.industry ? ["صنعت"] : []),...(visible.current ? [columns.current] : []),...(visible.previous ? [columns.previous] : []),"رشد و مستندات"].map(s => <th scope="col" className="p-2 text-start" key={s}>{s}</th>)}</tr></thead>
        {rows.slice(start, start + 40).map(row => <tbody key={row.symbol} className="border-b border-[var(--line)]">
          <tr><td className="p-2"><label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input aria-label={"مقایسه " + row.symbol} type="checkbox" checked={selected.includes(row.symbol)} disabled={!selected.includes(row.symbol) && selected.length >= 2} onChange={() => compare(row.symbol)}/></label></td>
            <th scope="row" className="p-2 text-start"><Link prefetch={false} className="underline" href={"/symbol/" + encodeURIComponent(row.symbol) + "?from=" + encodeURIComponent(from) + "#fundamental"}>{row.symbol}</Link></th>
            {visible.industry && <td className="p-2">{row.industry || "نامشخص"}</td>}{visible.current && <td className="p-2">{row.current ? number.format(row.current.amount) : "—"}</td>}{visible.previous && <td className="p-2">{row.previous ? number.format(row.previous.amount) : "—"}</td>}
            <td className="p-2"><button className="min-h-11 underline" aria-expanded={open === row.symbol} onClick={() => setOpen(open === row.symbol ? null : row.symbol)}>{row.growth === null ? row.reason || "علت کنارگذاری" : number.format(row.growth) + "٪"}</button></td>
          </tr>{open === row.symbol && <tr><td className="whitespace-normal bg-[var(--surface-2)] p-3" colSpan={3 + Number(visible.industry) + Number(visible.current) + Number(visible.previous)}><GrowthEvidence row={row} result={result}/></td></tr>}
        </tbody>)}
      </table></div>
      {!rows.length && <p>هیچ نمادی با این انتخاب پیدا نشد.</p>}
      {pages > 1 && <nav aria-label="صفحه‌های نتیجه" className="flex items-center gap-3"><button className={control} disabled={page === 1} onClick={() => setPage(p => p - 1)}>قبلی</button><span>{formatCount(page)} از {formatCount(pages)}</span><button className={control} disabled={page === pages} onClick={() => setPage(p => p + 1)}>بعدی</button></nav>}
    </section>
  </div>;
}

export default function MonthlySalesScreener({ period, minGrowth, symbol }: {period:string; minGrowth:string; symbol:string}) {
  const [result, setResult] = useState<MonthlySalesScreen | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({period:toLatinDigits(period), minGrowth:toLatinDigits(minGrowth).replace("٫",".")});
    async function load() {
      const response = await fetch("/api/screener/monthly-sales?" + query, { signal:controller.signal });
      if (!response.ok) throw new Error(response.status === 400 ? "دوره یا حد رشد معتبر نیست." : "خواندن داده‌های غربالگر ممکن نشد.");
      const data: MonthlySalesScreen = await response.json();
      if (!controller.signal.aborted) setResult(data);
    }
    load().catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "دریافت داده ممکن نشد.");});
    return () => controller.abort();
  }, [period, minGrowth, attempt]);
  return <>
    <form action="/market/screener" className="card flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-1 text-sm">دورهٔ شمسی (سال-ماه)<input className={control} dir="ltr" name="period" required defaultValue={period} placeholder="۱۴۰۵-۰۷" maxLength={7}/></label>
      <label className="grid gap-1 text-sm">حداقل رشد (درصد)<input className={control} name="minGrowth" dir="ltr" required defaultValue={minGrowth} inputMode="decimal" maxLength={12}/></label>
      <button className="min-h-11 rounded-lg bg-[var(--navy)] px-5 text-white">اعمال فیلتر</button>
    </form>
    {error ? <p role="alert" className="card p-4">{error} <button className="underline" onClick={() => {setError(""); setAttempt(n => n + 1);}}>تلاش دوباره</button></p>
      : result ? <SalesScreenResults result={result} symbol={symbol}/> : <p className="card p-4" role="status">در حال خواندن جامعهٔ ناشران و گزارش‌های کدال…</p>}
  </>;
}
