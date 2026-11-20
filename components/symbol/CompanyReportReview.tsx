"use client";

import { useMemo, useState } from "react";
import type { SymbolFundamentals } from "@/lib/fundamental/types";
import { changes, companyMonthlyModel, evidenceRecord, observation, type CompanyComparison, type ReportRecord } from "@/lib/fundamental/product-observation";
import { FOOLAD_HOT_DOMESTIC_KEY } from "@/lib/fundamental/foolad-rate-evidence";
import { approvedCodalUrl } from "@/lib/desk/workspace-model";

const nf = new Intl.NumberFormat("fa-IR", {maximumFractionDigits: 2});
const fmt = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "نامعلوم" : nf.format(n);
const fa = (s: string) => s.replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const nameOf = {amount:"مبلغ فروش",qty:"مقدار فروش",rate:"نرخ ضمنی فروش"};
type Metric = keyof typeof nameOf;

function Source({record}: {record?: ReportRecord | null}) {
  if (!record) return <p>پیوند دقیق این رکورد در دسترس نیست.</p>;
  const url = approvedCodalUrl(record.sourceUrl);
  return <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6">
    {url && <a className="underline" href={url} target="_blank" rel="noreferrer">گزارش رسمی کدال ↗</a>}
    <span>رکورد {fmt(record.id)}</span><span>{record.amendment ? "اصلاحیه" : "گزارش اصلی"}</span>
    {(record.publishedAt || record.publishedDateRaw) && <span>انتشار {fa(record.publishedAt ?? record.publishedDateRaw!)}</span>}
    {record.capturedAt && <span>دریافت <bdi>{fa(record.capturedAt)}</bdi></span>}
  </p>;
}

export default function CompanyReportReview({fundamentals, initialComparison}: {fundamentals: SymbolFundamentals; initialComparison?: CompanyComparison | null}) {
  const reviewed = fundamentals.reviewedProductReports;
  const model = useMemo(() => companyMonthlyModel(fundamentals), [fundamentals]);
  const options = Array.from(model?.options ?? []);
  const months = model?.months ?? [];
  const [chosen,setChosen] = useState(initialComparison?.product ?? "");
  const [selected,setSelected] = useState(initialComparison?.month ?? "");
  const [basis,setBasis] = useState(initialComparison?.compare ?? "year");
  const [metric,setMetric] = useState<Metric>("amount");
  const key = model?.options.has(chosen) ? chosen : options.find(([id])=>id===FOOLAD_HOT_DOMESTIC_KEY)?.[0] ?? options[0]?.[0] ?? "";
  const period = months.includes(selected) ? selected : months.at(-1) ?? "";
  const priorKey = basis === "year" ? String(Number(period.slice(0,4))-1)+period.slice(4) : months[months.indexOf(period)-1] ?? "";
  const series = months.map(month=>{
    const report = model?.reports.get(month);
    return observation(report,key,model?.sourceFor(report) ?? undefined);
  });
  const current = series[months.indexOf(period)], prior = series[months.indexOf(priorKey)];
  const change = changes(current,prior);
  const growth = change && prior?.amount != null && prior.amount > 0 ? 100*change.delta/prior.amount : null;
  const effectShare = (effect: number|null|undefined) =>
    effect != null && change?.delta ? " ("+fmt(effect*100/change.delta)+"٪ از تغییر)" : "";
  const read = (which: string) => model?.sourceFor(model.reports.get(which));
  const values = series.map(point => metric === "amount" || point?.unit === current?.unit ? point?.[metric] ?? null : null);
  const max = Math.max(1,...values.map(n=>Math.abs(n??0)));
  const unit = metric === "amount" ? "میلیون ریال" : metric === "rate" ? "ریال / "+(current?.unit??"واحد نامعلوم") : current?.unit??"واحد نامعلوم";
  const financials = [...(fundamentals.n10Periods??[])].filter(p=>p.scope==="company" && p.data.unit?.replace(/\s/g,"")==="میلیونریال")
    .sort((a,b)=>b.data.period_end.localeCompare(a.data.period_end));
  const [selectedId,setSelectedId] = useState<number|null>(null);
  const statement = financials.find(p=>p.id===selectedId)??financials[0];
  const line = statement?.data.standalone;
  const margin = (revenue?: number,profit?: number) => revenue != null && revenue > 0 && profit != null ? 100*profit/revenue : null;
  const now = margin(line?.revenue,line?.gross_profit);
  const then = margin(line?.prior?.revenue,line?.prior?.gross_profit);
  const netNow = margin(line?.revenue,line?.net_profit);
  const netThen = margin(line?.prior?.revenue,line?.prior?.net_profit);
  const [financialMetric,setFinancialMetric] = useState("revenue");
  const comparable = financials.filter(p=>p.data.period_months===statement?.data.period_months);
  const financialValue = (s:typeof comparable[number])=>financialMetric==="revenue" ? s.data.standalone.revenue :
    margin(s.data.standalone.revenue,financialMetric==="gross" ? s.data.standalone.gross_profit : s.data.standalone.net_profit);
  const largest = Math.max(1,...comparable.map(p=>Math.abs(financialValue(p)??0)));
  if(!options.length && !statement) return null;
  return <section id="company-report-review" className="card space-y-5 p-4 sm:p-6 scroll-mt-24">
    <h2 className="font-display text-xl font-bold">تغییر عملکرد شرکت</h2>
    {!!options.length && <>
      <div className="arash-analysis-controls">
        <label>محصول و بازار<select aria-label="محصول و بازار" className="input block" value={key} onChange={e=>setChosen(e.target.value)}>{options.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
        <label>ماه<select aria-label="ماه" className="input block" value={period} onChange={e=>setSelected(e.target.value)}>{months.map(m=><option key={m} value={m}>{fa(m)}</option>)}</select></label>
        <label>مقایسه با<select aria-label="مقایسه با" className="input block" value={basis} onChange={e=>setBasis(e.target.value === "previous" ? "previous" : "year")}><option value="previous">ماه قبل</option><option value="year">همان ماه سال قبل</option></select></label>
        <label>نمای نمودار<select aria-label="نمای نمودار" className="input block" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{Object.entries(nameOf).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label>
      </div>
      <section aria-live="polite" className="arash-analysis-result">
        <h3>{model?.options.get(key)} · {fa(period)} نسبت به {fa(priorKey)}</h3>
        <dl className="arash-metric-grid">
          <div><dt>تغییر فروش</dt><dd>{growth == null ? "نامعلوم" : fmt(growth)+"٪"}</dd><small>{fmt(change?.delta)} میلیون ریال</small></div>
          <div><dt>اثر نرخ</dt><dd>{fmt(change?.rateEffect)}</dd><small>میلیون ریال{effectShare(change?.rateEffect)}</small></div>
          <div><dt>اثر مقدار</dt><dd>{fmt(change?.quantityEffect)}</dd><small>میلیون ریال{effectShare(change?.quantityEffect)}</small></div>
        </dl>
      </section>
      <details className="text-sm"><summary>روش تفکیک تغییر فروش</summary><p>نرخ ضمنی از تقسیم مبلغ گزارش‌شده بر مقدار فروش به دست آمده و مبنای این تفکیک است؛ نرخ چاپ‌شده در گزارش، در صورت تطبیق با سند، جدا می‌آید. اثر مشترک نرخ و مقدار به‌طور مساوی تقسیم شده است. اثر ترکیب محصولات از یک قلم قابل تعیین نیست.</p></details>
      <figure><figcaption>{nameOf[metric]} ({unit})</figcaption>
        <div className="overflow-x-auto"><div dir="ltr" className="flex gap-1 items-stretch py-2" style={{minWidth:months.length*36}}>
        {months.map((month,i)=><button type="button" key={month} onClick={()=>setSelected(month)} aria-pressed={month===period} title={fa(month)+" · "+fmt(values[i])+" "+unit} aria-label={fa(month)+" · "+fmt(values[i])+" "+unit}
          className="flex-1 rounded border py-1 text-center focus-visible:outline" style={{borderColor:month===period?"var(--gold)":"transparent"}}>
          <span className="relative block h-24" style={{background:"linear-gradient(transparent 49%,var(--line) 50%,transparent 51%)"}}>
            {values[i]!=null && <span className="absolute inset-x-1 rounded-sm" style={{[values[i]!>=0?"bottom":"top"]:"50%",height:Math.max(1,Math.abs(values[i]!)/max*48),background:month===period?"var(--gold)":"var(--navy)"}}/>}
          </span><small>{fa(month.slice(2)).replace("-","/")}</small>
        </button>)}</div></div>
      </figure>
      <div className="overflow-x-auto"><table className="w-full text-right text-sm"><caption className="text-right font-bold">{model?.options.get(key)}</caption>
        <thead><tr>{["دوره","مبلغ (میلیون ریال)","مقدار","نرخ ضمنی","نرخ گزارش‌شده"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{[period,priorKey].filter(Boolean).map(m=>{const pt=series[months.indexOf(m)];return <tr key={m}><th className="p-2">{fa(m)}</th><td>{fmt(pt?.amount)}</td><td>{fmt(pt?.qty)} {pt?.unit}</td><td>{fmt(pt?.rate)}{pt?.rate != null && ` ریال به‌ازای ${pt.unit}`}</td>
          <td>{fmt(pt?.reportedRate?.rate)}{pt?.reportedRate && ` ریال به‌ازای ${pt.unit}`}</td></tr>})}</tbody></table></div>
            {[period,priorKey].filter(Boolean).map(m=>{
        const supplement = reviewed?.find(item=>item.report.period_end===model?.reports.get(m)?.period_end);
        const rateSheet = series[months.indexOf(m)]?.reportedRate;
        return <div key={m}><small>{fa(m)}</small><Source record={read(m)}/>
          {(rateSheet || supplement) && <a className="text-xs underline" href={rateSheet?.workbook ?? supplement?.workbook} target="_blank" rel="noreferrer">{rateSheet ? "فایل رسمی مقدار، نرخ (P5) و مبلغ" : "فایل رسمی تطبیق مقدار و مبلغ"}</a>}
        </div>;
      })}
    </>}
    {statement && <section className="space-y-2 border-t pt-4"><h3 className="font-bold">درآمد و حاشیه سود ناخالص</h3>
      <label>دوره صورت مالی<select aria-label="دوره صورت مالی" className="input block" value={statement.id} onChange={e=>setSelectedId(Number(e.target.value))}>{financials.map(s=><option value={s.id} key={s.id}>{fmt(s.data.period_months)} ماهه تجمعی تا {fa(s.data.period_end)}</option>)}</select></label>
      <label>شاخص گزارش‌های هم‌طول<select aria-label="شاخص گزارش‌های هم‌طول" className="input block" value={financialMetric} onChange={e=>setFinancialMetric(e.target.value)}>
        <option value="revenue">درآمد (میلیون ریال)</option><option value="gross">حاشیه سود ناخالص (٪)</option><option value="net">حاشیه سود خالص (٪)</option>
      </select></label>
      <div className="overflow-x-auto"><div dir="ltr" className="flex items-end gap-2 py-2">
        {comparable.slice().reverse().map(s=>{
          return <button type="button" key={s.id} onClick={()=>setSelectedId(s.id)} aria-pressed={s.id===statement.id} aria-label={fa(s.data.period_end)+"، "+fmt(financialValue(s))+(financialMetric==="revenue"?" میلیون ریال":" درصد")} className="min-w-16 flex-1 rounded border p-1" style={{borderColor:s.id===statement.id?"var(--gold)":"transparent"}}>
                        <span className="relative block h-16" style={{background:"linear-gradient(transparent 49%,var(--line) 50%,transparent 51%)"}}>
              {financialValue(s)!=null && <span className="absolute inset-x-1 rounded-sm" style={{[financialValue(s)!>=0?"bottom":"top"]:"50%",height:Math.max(1,Math.abs(financialValue(s)!)/largest*32),background:s.id===statement.id?"var(--gold)":"var(--navy)"}}/>}
            </span>
            <small>{fa(s.data.period_end.slice(0,7))}</small></button>;
        })}
      </div></div>
      <p>درآمد {fmt(line?.revenue)} میلیون ریال · حاشیه سود ناخالص {fmt(now)}٪</p>
      <p>دوره مقایسه‌ای سند · درآمد {fmt(line?.prior?.revenue)} میلیون ریال · حاشیه {fmt(then)}٪ · تغییر {fmt(now!==null && then!==null ? now-then : null)} واحد درصد</p>
      <p>حاشیه سود خالص کل شرکت {fmt(netNow)}٪ · دوره مقایسه‌ای {fmt(netThen)}٪ · تغییر {fmt(netNow!==null && netThen!==null ? netNow-netThen : null)} واحد درصد</p>
      <Source record={statement.record ?? evidenceRecord(fundamentals.n10?.source.records,statement.data.period_end)}/>
    </section>}
  </section>;
}
