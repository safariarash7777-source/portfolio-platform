import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import MonthlySalesCharts from "../../../components/symbol/MonthlySalesCharts";
import QuarterlyCharts from "../../../components/symbol/QuarterlyCharts";
import FundamentalCharts from "../../../components/symbol/FundamentalCharts";
import HistoryChart from "../../../components/terminal/HistoryChart";
import { toPersianDigits, formatJalali } from "../../../lib/format";
import { boundedPrototypeQuery, parsePrototypeSelection, prototypeComparisonHref } from "./query-state";
import { ANNUAL, DATASET_ID, HISTORY, QUARTER_PRICES, SOURCE, STATES, fundamentalsFor, hasMonthlyGap, monthlyFor, productReports, quarterlyFor, type DemoState } from "./chart-data";

const tabs = [{id:"overview",label:"نمای کلی"},{id:"fundamental",label:"بنیادی"},{id:"reports",label:"گزارش‌ها"},{id:"meetings",label:"مجامع"}] as const;
type Tab = typeof tabs[number]["id"];
const stateLabels: Record<DemoState,string> = {ready:"دادهٔ آماده", "month-gap":"یک ماه مفقود", "no-prior":"سال قبل ناموجود", "quarter-gap":"زنجیرهٔ فصلی ناقص",empty:"بدون داده",error:"خطای دریافت"};
const nf = new Intl.NumberFormat("fa-IR", {maximumFractionDigits:3});
const value = (n: unknown) => n == null ? "ناموجود" : typeof n === "number" ? nf.format(n) : toPersianDigits(String(n));
const isTab = (s: string): s is Tab => tabs.some(t => t.id === s);
const sourceTitle = "ورودی آموزشی؛ فاقد گزارش رسمی";
type Row = { key:string; period:string; kind:string; cells:unknown[]; raw:unknown };

function Source({record,context}: {record:unknown;context:string}) {
  const [open,setOpen]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const id=useId(),heading=`source-heading-${id}`,description=`source-description-${id}`;
  useEffect(()=>{if(open && dialog.current && !dialog.current.open)dialog.current.showModal();},[open]);
  const close=()=>{if(dialog.current?.open)dialog.current.close();setOpen(false);trigger.current?.focus();};
  return <><button ref={trigger} type="button" className="source-trigger" aria-haspopup="dialog" onClick={()=>setOpen(true)}>جزئیات همین رکورد آموزشی</button>
    {open ? createPortal(<dialog ref={dialog} className="source-panel" aria-labelledby={heading} aria-describedby={description} onCancel={event=>{event.preventDefault();event.stopPropagation();close();}} onClose={event=>{event.stopPropagation();close();}}>
      <header className="source-panel-heading"><div><h2 id={heading}>اطلاعات مبنای رکورد</h2><p className="record-context">{context}</p></div><button type="button" onClick={close}>بستن اطلاعات مبنا</button></header>
      <div className="source-panel-body"><p id={description}>{SOURCE.label}. شناسهٔ گزارش رسمی، نشانی منبع، زمان انتشار، زمان دریافت و اصلاحیه: ناموجود.</p>
        <p>دامنه: شرکت اصلی؛ مجموعه: <bdi>{DATASET_ID}</bdi>؛ این شناسه مربوط به دادهٔ آموزشی است.</p>
        <h3>رکورد کامل و ورودی محاسبه</h3><pre dir="ltr">{JSON.stringify(record,null,2)}</pre>
      </div>
    </dialog>,document.body) : null}
  </>;
}

function DataTable({title,columns,rows}: {title:string;columns:string[];rows:Row[]}) {
  return <details className="data-table"><summary>جدول دقیق و سند — {title} ({toPersianDigits(rows.length)})</summary>
    <p>اعداد این جدول در واحد خام نوشته‌شده در سرستون هستند. مقیاس نمودار در خود نمودار مشخص است. منبع همهٔ سطرها آموزشی و تأییدنشده است.</p>
    {rows.length ? <div className="table-scroll" role="region" aria-label={`جدول ${title}`} tabIndex={0}><table><caption>{title} · شرکت اصلی · {DATASET_ID}</caption>
      <thead><tr>{columns.map(c=><th key={c} scope="col">{c}</th>)}<th scope="col">اطلاعات مبنا</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.key}>{r.cells.map((c,i)=><td key={i}>{value(c)}</td>)}<td><Source record={r.raw} context={`${title} · ${toPersianDigits(r.period)}`}/></td></tr>)}</tbody>
    </table></div> : <p>رکورد قابل نمایش وجود ندارد؛ مقدار غایب صفر نشده است.</p>}
  </details>;
}

function ChartGroup({title,note,children,table,className=""}: {title:string;note:string;children:ReactNode;table:ReactNode;className?:string}) {
  const [expanded,setExpanded]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const heading=useId();
  useEffect(()=>{if(expanded && dialog.current && !dialog.current.open) dialog.current.showModal();},[expanded]);
  const close=()=>{dialog.current?.close();setExpanded(false);trigger.current?.focus();};
  const body=<><p className="section-note">{note}</p><div className={`chart-content ${className}`}>{children}</div>{table}</>;
  return <section className="chart-group" aria-label={title}><header className="group-heading"><h2>{title}</h2>
    <button ref={trigger} type="button" onClick={()=>setExpanded(true)}>نمای بزرگ‌تر</button></header>
    {expanded ? <p>نمودار در نمای بزرگ‌تر باز است.</p> : body}
    {expanded ? <dialog ref={dialog} className="chart-dialog" aria-labelledby={heading} onCancel={e=>{e.preventDefault();close();}} onClose={close}>
      <header className="group-heading"><h2 id={heading}>{title} · آموزشی</h2><button type="button" onClick={close}>بستن نمای بزرگ‌تر</button></header>{body}
    </dialog> : null}
  </section>;
}

function EmptyState({state,onRetry}: {state:DemoState;onRetry:()=>void}) {
  return <section className="empty-state" role="status"><h2>{state==="error" ? "خطای دریافت در سناریوی آموزشی" : "داده‌ای برای نمایش وجود ندارد"}</h2>
    <p>{state==="error" ? "این خطا شبیه‌سازی شده است؛ هیچ درخواست شبکه‌ای انجام نشده. دادهٔ غایب با صفر جایگزین نمی‌شود." : "با انتخاب حالت آماده، ورودی آموزشی را ببینید؛ این صفحه به بازار واقعی وصل نیست."}</p>
    <button type="button" onClick={onRetry}>بازگشت به دادهٔ آموزشی آماده</button></section>;
}

function App() {
  const [initial]=useState(()=>parsePrototypeSelection(location.search,location.hash));
  const [state,setState]=useState<DemoState>(initial.state);
  const [tab,setTab]=useState<Tab>(initial.tab);
  const [fy,setFy]=useState(initial.fy), [product,setProduct]=useState(initial.product), [market,setMarket]=useState(initial.market);
  const [range,setRange]=useState(initial.range), [priceRange,setPriceRange]=useState(initial.priceRange);
  const [query,setQuery]=useState(initial.query), [kind,setKind]=useState(initial.kind);
  const dossier=document.body.dataset.view==="dossier";
  const comparisonHref=prototypeComparisonHref(dossier?"decision":"dossier",{state,tab,fy,product,market,range,priceRange,query,kind});
  useEffect(()=>{const onHash=()=>{const t=location.hash.slice(1);if(isTab(t))setTab(t);};window.addEventListener("hashchange",onHash);return()=>window.removeEventListener("hashchange",onHash);},[]);
  const changeTab=(id:Tab)=>{setTab(id);history.replaceState(null,"",`${location.pathname}${location.search}#${id}`);};
  const changeState=(s:DemoState)=>{setState(s);const url=new URL(location.href);url.searchParams.set("state",s);history.replaceState(null,"",url);};
  const reports=useMemo(()=>monthlyFor(state,fy),[state,fy]);
  const focused=product!=="all" || market!=="all";
  const monthly=useMemo(()=>focused ? productReports(reports.filter(r=>r.fiscal_year===fy),product,market):reports,[reports,product,market,focused,fy]);
  const monthlyGap=focused && hasMonthlyGap(monthly);
  const quarter=useMemo(()=>quarterlyFor(state),[state]);
  const fundamentals=useMemo(()=>fundamentalsFor(state,reports),[state,reports]);
  const ready=state!=="empty" && state!=="error";
  const prices=ready ? HISTORY.slice(-priceRange):[];
  const monthlyRows:Row[]=monthly.flatMap(r=>r.products.map((p,i)=>({key:`${r.period_end}-${i}`,period:r.period_end,kind:"monthly",cells:[r.period_end,p.product_name,p.market,p.production_qty,p.sales_qty,p.sales_rate,p.sales_amount,r.period_total_amount,r.fy_cumulative_amount],raw:{report:r,selectedProduct:p,source:SOURCE}})));
  const fundamentalMonthlyRows:Row[]=(fundamentals.n30?.data ?? []).flatMap(r=>r.products.map((p,i)=>({key:`${r.period_end}-${i}`,period:r.period_end,kind:"monthly",cells:[r.period_end,p.product_name,p.market,p.production_qty,p.sales_qty,p.sales_rate,p.sales_amount,r.period_total_amount,r.fy_cumulative_amount],raw:{report:r,selectedProduct:p,source:SOURCE}})));
  const quarterRows:Row[]=quarter.quarters.slice(-range).map(q=>({key:q.periodEnd,period:q.periodEnd,kind:"quarterly",cells:[q.label,q.periodEnd,q.revenue,q.grossProfit,q.operatingProfit,q.netProfit,q.grossMargin,q.operatingMargin,q.netMargin],raw:{derived:q,cumulativeInputs:quarter.inputs,source:SOURCE}}));
  const priceRows:Row[]=prices.map(p=>({key:String(p.time),period:formatJalali(new Date(p.time*1000)),kind:"price",cells:[formatJalali(new Date(p.time*1000)),p.close,p.netFlow],raw:{...p,adjustment:"تعریف تعدیل برای سری آموزشی کاربرد ندارد",source:SOURCE}}));
  const peRows:Row[]=quarter.quarters.slice(-range).map(q=>{const p=quarter.ttm.find(t=>t.periodEnd===q.periodEnd);return {key:q.periodEnd,period:q.periodEnd,kind:"pe",cells:[q.label,QUARTER_PRICES[q.periodEnd]??null,p?.netProfitTtm??null,p?.epsTtm??null,quarter.peSeries.find(s=>s.label===q.label)?.pe??null],raw:{quarter:q.label,ttm:p??null,priceRial:QUARTER_PRICES[q.periodEnd]??null,capitalMillionRial:q.capital,pe:quarter.peSeries.find(s=>s.label===q.label),priceBasis:"قیمت آموزشی همان پایان فصل؛ بدون نرخ جاری جایگزین",source:SOURCE}};});
  const documents:Row[]=[...reports.map(r=>({key:`n30-${r.period_end}`,period:r.period_end,kind:"monthly",cells:["فعالیت ماهانهٔ آموزشی",r.period_end,"شرکت اصلی","میلیون ریال؛ تن؛ ریال/تن"],raw:{...r,source:SOURCE}})),...quarter.inputs.map(r=>({key:`n10-${r.id}`,period:r.period_end,kind:"quarterly",cells:[`صورت مالی تجمیعی ${r.period_months}ماههٔ آموزشی`,r.period_end,"شرکت اصلی",r.unit],raw:{...r,source:SOURCE}}))];
  const filtered=documents.filter(r=>(kind==="all"||r.kind===kind)&&toPersianDigits(r.cells.join(" ")).includes(toPersianDigits(query.trim())));
  const controls=<><label>سال مالی ماهانه<select value={fy} onChange={e=>setFy(Number(e.target.value))}><option value={1405}>۱۴۰۵</option><option value={1404}>۱۴۰۴</option></select></label>
    <label>محصول<select value={product} onChange={e=>setProduct(e.target.value)}><option value="all">کل شرکت</option><option>ورق گرم</option><option>ورق سرد</option></select></label>
    <label>بازار<select value={market} onChange={e=>setMarket(e.target.value)}><option value="all">داخلی و صادراتی</option><option>داخلی</option><option>صادراتی</option></select></label></>;
  const monthlyTable=<DataTable title="فعالیت ماهانه" columns={["دورهٔ جلالی","محصول","بازار","تولید (تن)","مقدار (تن)","نرخ (ریال/تن)","مبلغ محصول (میلیون ریال)","کل ماه شرکت (میلیون ریال)","تجمیعی شرکت (میلیون ریال)"]} rows={monthlyRows}/>;
  const monthlySection=<ChartGroup title="فروش، نرخ و مقدار ماهانه" note={focused ? "نمای محصول/بازار انتخاب‌شده فقط سال مالی انتخاب‌شده را پوشش می‌دهد: نرخ و تولید/مقدار. کل ماه و تجمیعیِ جدول همچنان مربوط به کل شرکت‌اند. برای ترکیب و مقایسهٔ کل شرکت فیلترها را بازنشانی کنید." : "مقایسه با ماه مشابه سال قبل و تجمیعی گزارش‌شده جدا هستند. برای نمودار نرخ و مقدار، یک محصول یا بازار انتخاب کنید. ماه غایب گپ است. مبالغ خام میلیون ریال، نرخ ریال بر تن و مقدار تن؛ دامنه شرکت اصلی."} table={monthlyTable} className={focused?"product-focus":"company-focus"}>
    <div className="controls">{controls}{focused?<button onClick={()=>{setProduct("all");setMarket("all");}}>بازگشت به کل شرکت</button>:null}</div>
    {monthlyGap ? <p role="status">برای ماه بدون گزارش، خط نرخ قطع و جای ستون مقدار روی محور خالی می‌ماند؛ مقدار نامعلوم صفر نشده است. رکوردهای موجود در جدول هستند.</p> : null}
    {monthly.some(r=>r.products.length) ? <MonthlySalesCharts reports={monthly} sourceTitle={sourceTitle} sourceUrl={null}/> : <p role="status">برای این ترکیب محصول و بازار رکوردی وجود ندارد؛ سری ساختگی نمایش داده نمی‌شود.</p>}
  </ChartGroup>;
  const quarterlySection=<ChartGroup title="درآمد، سود و حاشیه‌های فصلی" note="فصل مستقل از تفاضل زنجیرهٔ تجمیعیِ هم‌سال و هم‌دامنه ساخته می‌شود. حلقهٔ مفقود، فصل نامعلوم می‌سازد. حاشیهٔ سود ماهانه محاسبه نشده است. مبالغ میلیون ریال و حاشیه‌ها درصدند. P/E نمایشی با قیمت همان پایان فصل محاسبه می‌شود؛ برچسب جاریِ مؤلفه هم آخرین نقطهٔ همین مجموعهٔ آموزشی است." table={<><DataTable title="فصل مستقل" columns={["فصل","پایان دوره","درآمد (میلیون ریال)","سود ناخالص (میلیون ریال)","سود عملیاتی (میلیون ریال)","سود خالص (میلیون ریال)","حاشیه ناخالص (%)","حاشیه عملیاتی (%)","حاشیه خالص (%)"]} rows={quarterRows}/><DataTable title="P/E و مبنای TTM" columns={["فصل","قیمت پایان فصل (ریال)","سود TTM (میلیون ریال)","EPS TTM (ریال)","P/E (مرتبه)"]} rows={peRows}/></>}>
    <label className="range-control">افق فصلی<select value={range} onChange={e=>setRange(Number(e.target.value))}><option value={4}>چهار فصل آخر</option><option value={8}>هشت فصل آخر</option><option value={12}>کل فصل‌های موجود</option></select></label>
    <QuarterlyCharts quarters={quarter.quarters.slice(-range)} ttm={quarter.ttm.slice(-range)} peSeries={quarter.peSeries.slice(-range)} currentPe={quarter.currentPe} sourceTitle={sourceTitle}/>
  </ChartGroup>;
  const priceSection=<ChartGroup title="تاریخچهٔ قیمت و خالص پول" note="۱۲ روز آموزشی؛ قیمت ریال و خالص پول ریال (نمای نمودار: میلیارد ریال). صفر پول در روز سوم واقعیِ همین نمونه و روز پنجم ناموجود است. این داده از معاملهٔ واقعی یا سری تعدیل‌شده نیامده است. نمودار موجود ابزار پیمایش دارد؛ جدول مسیر خواندن با صفحه‌کلید است." table={<DataTable title="قیمت و پول" columns={["تاریخ جلالی","قیمت (ریال)","خالص پول (ریال)"]} rows={priceRows}/>}>
    <label className="range-control">افق قیمت<select value={priceRange} onChange={e=>setPriceRange(Number(e.target.value))}><option value={6}>شش روز آخر</option><option value={12}>همهٔ روزهای موجود</option></select></label><HistoryChart points={prices}/>
  </ChartGroup>;
  return <><div className="demo-banner"><strong>نمونهٔ نمایشی آموزشی</strong><span>فاقد دادهٔ زنده · ظاهر انتخاب نشده · {DATASET_ID}</span><a href={comparisonHref}>دیدن چیدمان {dossier?"الف":"ب"} با همین داده</a></div>
    <header className="brand-header"><a href="#overview" onClick={()=>changeTab("overview")}><img src="../../brand/mark.png" alt=""/><span>آرش صفری<small>تحلیلگر و مشاور سرمایه‌گذاری</small></span></a><span>پژوهش شرکت‌ها · طرح {dossier?"ب — پرونده":"الف — روند"}</span></header>
    <div className={`study-shell ${dossier?"layout-dossier":"layout-decision"}`}><aside className="study-rail"><p className="eyebrow">پروندهٔ آموزشی</p><h1>شرکت نمونهٔ صنعتی</h1><p>نماد: آموزشی · صنعت: فلزات</p><nav aria-label="بخش‌های شرکت">{tabs.map(t=><button key={t.id} onClick={()=>changeTab(t.id)} aria-pressed={tab===t.id}>{t.label}</button>)}</nav>
      <details className="study-guide" open={dossier}><summary>مسیر مطالعه</summary><ol><li>روند فروش را با ماه مشابه بسنجید.</li><li>اثر نرخ، مقدار و بازار را جدا ببینید.</li><li>سود و حاشیه را فقط در فصل معتبر بخوانید.</li><li>برای هر عدد جدول و اطلاعات مبنا را باز کنید.</li></ol><p>ارزش‌گذاری، مدل پیش‌بینی و نتیجهٔ سرمایه‌گذاری در این نمونه وجود ندارد.</p></details></aside>
    <main id="main"><div className="page-toolbar"><div><p className="eyebrow">{tabs.find(t=>t.id===tab)?.label}</p><p>همان ورودی‌ها و محاسبات در هر دو چیدمان</p></div><label>سناریوی داده<select value={state} onChange={e=>changeState(e.target.value as DemoState)}>{STATES.map(s=><option key={s} value={s}>{stateLabels[s]}</option>)}</select></label></div>
      <p className="persistent-source">{SOURCE.label}. مبالغ و دوره‌ها در هر بخش مشخص‌اند؛ هیچ سند رسمی به این نمونه پیوند نشده است.</p>
      {state!=="ready" && ready?<p className="scenario-note" role="status">سناریو: {stateLabels[state]}. فقط بخش مربوط به این کمبود تغییر می‌کند؛ دادهٔ سالانه یا قیمت مستقل از آن جعل نمی‌شود.</p>:null}
      {!ready ? <EmptyState state={state} onRetry={()=>changeState("ready")}/> : tab==="overview" ? <>{monthlySection}{priceSection}</> : tab==="fundamental" ? <>{quarterlySection}<ChartGroup title="صورت مالی و ترکیب سالانه" note="مقایسهٔ دو دورهٔ دوازده‌ماههٔ شرکت اصلی؛ این مقادیر سالانه‌اند و نباید ماهانه خوانده شوند. نرخ ارز ناموجود است و نمایش دلاری غیرفعال می‌ماند. تاریخچه فقط دو سال دارد؛ روند پنج‌ساله ادعا نمی‌شود." table={<><DataTable title="صورت مالی سالانه" columns={["دوره","درآمد (میلیون ریال)","بهای تمام‌شده (میلیون ریال)","سود خالص (میلیون ریال)"]} rows={[{key:"annual",period:ANNUAL.period_end,kind:"annual",cells:[ANNUAL.period_end,ANNUAL.standalone.revenue,ANNUAL.standalone.cogs,ANNUAL.standalone.net_profit],raw:{...ANNUAL,source:SOURCE}}]}/><DataTable title="ورودی ماهانهٔ همین نمودارهای بنیادی" columns={["دورهٔ جلالی","محصول","بازار","تولید (تن)","مقدار (تن)","نرخ (ریال/تن)","مبلغ محصول (میلیون ریال)","کل ماه شرکت (میلیون ریال)","تجمیعی شرکت (میلیون ریال)"]} rows={fundamentalMonthlyRows}/></>}><p className="section-note">نمودارهای ماهانهٔ این بخش کل شرکت در سال {toPersianDigits(fy)} هستند؛ فیلتر محصولِ نمای کلی روی آن‌ها اعمال نمی‌شود.{state==="month-gap" && !fundamentals.n30 ? " به‌دلیل گپ ماهانه، نمودارهای ن-۳۰ این بخش کنار گذاشته شده‌اند؛ ورودی‌های موجود در تب گزارش‌ها هستند." : ""}</p><FundamentalCharts fundamentals={fundamentals} fxRate={null} fxRateDate={null} quarterlyPeChartReady={quarter.peSeries.slice(-range).filter(p=>p.pe!==null).length>=2}/></ChartGroup></> : tab==="reports" ? <section className="reports-panel"><h2>گزارش‌های مبنای نمودارها</h2><p>فقط زیرمجموعهٔ آموزشی همین پرونده؛ پوشش کامل کدال نیست. گزارش‌های ن-۱۰ زیر تجمیعی‌اند، جدول تب بنیادی فصل‌های مستقل را جدا نشان می‌دهد.</p><div className="controls"><label>جست‌وجوی عنوان یا دوره<input type="search" maxLength={160} value={query} onChange={e=>setQuery(boundedPrototypeQuery(e.target.value))}/></label><label>نوع سند<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">همهٔ اسناد موجود</option><option value="monthly">فعالیت ماهانه</option><option value="quarterly">صورت مالی تجمیعی</option></select></label></div><DataTable title="اسناد دریافت‌شدهٔ آموزشی" columns={["نوع","دورهٔ جلالی","دامنه","واحد"]} rows={filtered}/></section> : <section className="empty-state"><h2>مجامع</h2><p>تب حفظ شده، اما هیچ آگهی یا تصمیم مجمع در این مجموعهٔ آموزشی وجود ندارد. زمان، سود تقسیمی و تصمیمات نامعلوم‌اند؛ از دادهٔ صورت مالی استنتاج نمی‌شوند.</p></section>}
      <footer className="prototype-footer">این صفحه برای بررسی طراحی است؛ اتصال بازار، اجرای مالی، انتشار محصول اصلی و پذیرش تعاملی آن تأیید نشده‌اند.</footer>
    </main></div></>;
}
const root=document.getElementById("app");
if(root)createRoot(root).render(<App/>);
