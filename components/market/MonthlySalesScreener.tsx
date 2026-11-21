"use client";

import { useCallback, useState } from "react";
import { useSalesRead } from "./useSalesRead";
import Link from "next/link";
import { formatCount, toLatinDigits, toPersianDigits } from "@/lib/format";
import { normalizeFa } from "@/lib/market-nav";
import type { MonthlySalesScreen } from "@/lib/fundamental/monthly-sales-screen";
import MonthlySalesComparison from "./MonthlySalesComparison";
import { SalesReadNotice, screenTimestamp } from "./SalesReadNotice";

type Row = MonthlySalesScreen["rows"][number];
type Point = NonNullable<Row["current"]>;
const number = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 4 });
const control = "min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm";
const statuses = { pass: "عبورکرده", fail: "زیر حد رشد", missing: "غیرقابل محاسبه", all: "همه نمادها" } as const;
const columns = { industry: "صنعت", current: "فروش ماه جاری", previous: "فروش ماه هم‌دوره" } as const;

function screenQuery(period: string, minGrowth: string, outside: boolean, symbol = "") {
  const query = new URLSearchParams({ period, minGrowth });
  if (outside) query.set("universe", "reported-outside");
  if (symbol) query.set("symbol", symbol);
  return query;
}

function PointSource({ label, point }: { label: string; point: Point | null }) {
  return <div className="rounded-lg border border-[var(--line)] p-3">
    <h4 className="font-bold">{label}</h4>
    {point ? <>
      <p>{number.format(point.amount)} {point.unit} · {toPersianDigits(point.period)}</p>
      <p>زمان انتشار {screenTimestamp(point.publishedAt)}</p><p>زمان دریافت {screenTimestamp(point.capturedAt)}</p>
      <a href={point.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">سند کدال{point.amendment ? " (اصلاحیه)" : ""}</a>
    </> : <p>گزارش معتبر این دوره در دسترس نیست.</p>}
  </div>;
}

export function GrowthEvidence({ row, result, outside = false }: { row: Row; result: MonthlySalesScreen; outside?:boolean }) {
  return <div className="space-y-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{row.symbol} · مبنای محاسبه</h3><a className="underline" href={"/market/screener?" + screenQuery(result.period,String(result.minGrowth),outside,row.symbol)}>پیوند این ردیف</a></div>
    <p>{row.reason || (row.passed ? "رشد به حد انتخابی رسیده است." : "رشد کمتر از حد انتخابی است.")}</p>
    <p>درصد رشد = (فروش ماه جاری − فروش ماه هم‌دوره) ÷ فروش ماه هم‌دوره × ۱۰۰</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <PointSource label={"ماه جاری " + toPersianDigits(result.period)} point={row.current}/>
      <PointSource label={"ماه هم‌دوره " + toPersianDigits(result.previousPeriod)} point={row.previous}/>
    </div>
    {row.unitReview?.map(review => <p key={review.reportId}>واحد مبلغ فروش در محاسبه تأیید نشده است. <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">بازبینی سند {toPersianDigits(review.periodEnd)}{review.amendment ? " (اصلاحیه)" : ""}</a></p>)}
  </div>;
}

export function SalesScreenResults({ result, symbol = "", outside = false }: { result: MonthlySalesScreen; symbol?:string; outside?:boolean }) {
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
  const from = "/market/screener?" + screenQuery(result.period,String(result.minGrowth),outside,symbol);
  function compare(symbol: string) {
    setSelected(previous => previous.includes(symbol) ? previous.filter(s => s !== symbol) : previous.length < 2 ? [...previous, symbol] : previous);
  }
  return <div className="space-y-4">
    <SalesReadNotice label="غربال فروش" readState={result.readState} checkedAt={result.checkedAt}/>
    <details className="card p-4"><summary className="cursor-pointer font-bold">پوشش {outside ? "ناشران خارج از تابلو" : "تابلوی سهام"} · {formatCount(result.coverage.calculable)} قابل محاسبه از {formatCount(result.coverage.eligible)} ناشر مشمول</summary>
      <p className="mt-3 text-sm">{result.coverage.universeSource} آخرین دریافت فهرست نمادها {screenTimestamp(result.coverage.rosterUpdatedAt)}</p>
      <p className="py-2 text-sm">جامعهٔ بررسی {formatCount(result.coverage.universe)} · مشمول {formatCount(result.coverage.eligible)} · عبورکرده {formatCount(result.coverage.passed)}</p>
      {outside ? <p className="mb-2 text-sm">مخرج این غربال فقط ناشران گزارش‌دهندهٔ خارج از آخرین تابلو است. وضعیت پذیرش بورسی این ناشران احراز نشده است.</p>
        : <p className="mb-2 text-sm">گزارش‌دهندگان خارج از آخرین تابلو · {result.coverage.outsideRoster === undefined ? "نامشخص" : formatCount(result.coverage.outsideRoster)} · <Link prefetch={false} className="underline" href={"/market/screener?" + screenQuery(result.period,String(result.minGrowth),true)}>بررسی جداگانهٔ این ناشران</Link></p>}
      <ul className="list-inside list-disc text-sm">{Object.entries(result.coverage.excluded).map(([reason, count]) => <li key={reason}>{reason} · {formatCount(count)}</li>)}</ul>
      <p className="mt-2 text-xs">زمان خواندن داده‌ها {screenTimestamp(result.checkedAt)} (تهران)</p>
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
        <thead className="bg-[var(--surface-2)] text-start"><tr>{["مقایسه","نماد","رشد و مستندات",...(visible.industry ? ["صنعت"] : []),...(visible.current ? [columns.current] : []),...(visible.previous ? [columns.previous] : [])].map(s => <th scope="col" className="p-2 text-start" key={s}>{s}</th>)}</tr></thead>
        {rows.slice(start, start + 40).map(row => <tbody key={row.symbol} className="border-b border-[var(--line)]">
          <tr><td className="p-2"><label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input aria-label={"مقایسه " + row.symbol} type="checkbox" checked={selected.includes(row.symbol)} disabled={!selected.includes(row.symbol) && selected.length >= 2} onChange={() => compare(row.symbol)}/></label></td>
            <th scope="row" className="p-2 text-start"><Link prefetch={false} className="underline" href={"/symbol/" + encodeURIComponent(row.symbol) + "?from=" + encodeURIComponent(from) + "#fundamental"}>{row.symbol}</Link></th>
            <td className="p-2"><button className="min-h-11 max-w-36 whitespace-normal text-start underline" aria-expanded={open === row.symbol} onClick={() => setOpen(open === row.symbol ? null : row.symbol)}>{row.growth === null ? row.reason || "علت کنارگذاری" : number.format(row.growth) + "٪"}</button></td>
            {visible.industry && <td className="p-2">{row.industry || "نامشخص"}</td>}{visible.current && <td className="p-2">{row.current ? number.format(row.current.amount) : "—"}</td>}{visible.previous && <td className="p-2">{row.previous ? number.format(row.previous.amount) : "—"}</td>}
          </tr>{open === row.symbol && <tr><td className="whitespace-normal bg-[var(--surface-2)] p-3" colSpan={3 + Number(visible.industry) + Number(visible.current) + Number(visible.previous)}><GrowthEvidence row={row} result={result} outside={outside}/></td></tr>}
        </tbody>)}
      </table></div>
      {!rows.length && <p>هیچ نمادی با این انتخاب پیدا نشد.</p>}
      {pages > 1 && <nav aria-label="صفحه‌های نتیجه" className="flex items-center gap-3"><button className={control} disabled={page === 1} onClick={() => setPage(p => p - 1)}>قبلی</button><span>{formatCount(page)} از {formatCount(pages)}</span><button className={control} disabled={page === pages} onClick={() => setPage(p => p + 1)}>بعدی</button></nav>}
    </section>
  </div>;
}

export default function MonthlySalesScreener({ period, minGrowth, symbol, outside }: {period:string; minGrowth:string; symbol:string; outside:boolean}) {
  const load = useCallback(async (signal: AbortSignal) => {
    const query = screenQuery(toLatinDigits(period),toLatinDigits(minGrowth).replace("٫","."),outside);
    const response = await fetch("/api/screener/monthly-sales?" + query, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 400 ? "دوره یا حد رشد معتبر نیست." : "خواندن داده‌های غربالگر ممکن نشد.");
    const data: MonthlySalesScreen = await response.json();
    if (outside && data.universeKind !== "reported-outside") throw new Error("جامعهٔ درخواستی برای این خواندن تأیید نشد.");
    return {data, clocks: [data.checkedAt]};
  }, [period, minGrowth, outside]);
  const { data: result, error, retry } = useSalesRead(load);
  return <>
    <form action="/market/screener" className="card flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-1 text-sm">جامعهٔ بررسی<select name="universe" defaultValue={outside ? "reported-outside" : "board"} className={control}>
        <option value="board">تابلوی سهام</option><option value="reported-outside">گزارش‌دهندگان خارج از تابلو</option>
      </select></label>
      <label className="grid gap-1 text-sm">دورهٔ شمسی (سال-ماه)<input className={control} dir="ltr" name="period" required defaultValue={period} placeholder="۱۴۰۵-۰۷" maxLength={7}/></label>
      <label className="grid gap-1 text-sm">حداقل رشد (درصد)<input className={control} name="minGrowth" dir="ltr" required defaultValue={minGrowth} inputMode="decimal" maxLength={12}/></label>
      <button className="min-h-11 rounded-lg bg-[var(--navy)] px-5 text-white">اعمال فیلتر</button>
    </form>
    {error && <p role="alert" className="card p-4">{error} {result && "آخرین نتیجهٔ کامل نمایش داده شده است."} <button className="underline" onClick={retry}>تلاش دوباره</button></p>}
    {result ? <SalesScreenResults result={result} symbol={symbol} outside={outside}/> : !error && <p className="card p-4" role="status">در حال خواندن جامعهٔ ناشران و گزارش‌های کدال…</p>}
  </>;
}
