"use client";
import {useEffect,useState} from "react";
import {LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer} from "recharts";
type Point={end:string;revenue:number|null;profit:number|null;margin:number|null;docs:{id:number;url:string|null;end:string;months:number}[]};
type Series={symbol:string;state:string;points:Point[]};
const nf=new Intl.NumberFormat("fa-IR",{maximumFractionDigits:2});
const fmt=(v:number|null|undefined)=>v==null?"ناموجود":nf.format(v);
export default function QuarterlyComparison({symbols,period}:{symbols:string[];period:string}){
  const [open,setOpen]=useState(false);
  const [series,setSeries]=useState<Series[]>([]);
  const [error,setError]=useState(false);
  const [selected,setSelected]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    setSeries([]);setError(false);setSelected("");
    Promise.all(symbols.map(async symbol=>{
      const r=await fetch("/api/screener/quarterly-margins?"+new URLSearchParams({symbol}),{signal:controller.signal});
      if(!r.ok)throw new Error();
      const s:Series=await r.json();
      if(s.symbol!==symbol||!Array.isArray(s.points))throw new Error();
      return s;
    })).then(s=>{if(!controller.signal.aborted)setSeries(s)}).catch(()=>{if(!controller.signal.aborted)setError(true)});
    return ()=>controller.abort();
  },[open,symbols,attempt]);
  const periods=[...new Set(series.flatMap(s=>s.points.map(p=>p.end)).filter(p=>p.slice(0,7)<=period))].sort().slice(-12);
  const chart=periods.map(end=>Object.fromEntries([["end",end],...series.map((s,i)=>[String(i),s.points.find(p=>p.end===end)?.margin??null])]));
  const end=periods.includes(selected)?selected:periods.at(-1);
  return <details className="card space-y-3 p-4" onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer py-2 font-bold">مقایسهٔ حاشیهٔ سود خالص فصلی</summary>
    {open && (error?<p role="alert">خواندن گزارش فصلی ممکن نشد. <button onClick={()=>setAttempt(a=>a+1)}>تلاش دوباره</button></p>:!series.length?<p role="status">در حال خواندن صورت‌های مالی…</p>:!end?<p>در بازهٔ انتخابی گزارش فصلی قابل مقایسه موجود نیست.</p>:<>
    <p>صورت مستقل شرکت · سود خالص فصل تقسیم بر درآمد همان فصل × ۱۰۰</p>
    {series.some(s=>s.state==="stale"||s.state==="partial")&&<p>بخشی از داده‌های خوانده‌شده قدیمی یا ناقص است.</p>}
    <div style={{height:200}} dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} onClick={state=>{if(typeof state.activeLabel==="string")setSelected(state.activeLabel)}}><XAxis dataKey="end"/><YAxis unit="%"/><Tooltip/>{series.map((s,i)=><Line key={s.symbol} name={s.symbol} type="linear" dataKey={String(i)} connectNulls={false} stroke={i?"#a86b26":"#225778"} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div>
    <label>پایان فصل <select value={end} onChange={e=>setSelected(e.target.value)}>{periods.map(p=><option key={p}>{p}</option>)}</select></label>
    <ul aria-live="polite">{series.map(s=>{const p=s.points.find(v=>v.end===end);return <li key={s.symbol} className="py-2"><strong>{s.symbol}</strong> · {p?.margin==null?"دادهٔ قابل مقایسه ندارد":fmt(p.margin)+"٪"}{p&&<><p>سود خالص {fmt(p.profit)} · درآمد {fmt(p.revenue)} میلیون ریال</p>{p.docs.map(d=><span key={d.id} className="me-3">{d.url?<a className="underline" href={d.url} target="_blank" rel="noreferrer">سند {fmt(d.months)}ماههٔ {d.end}</a>:"شناسهٔ گزارش "+d.id}</span>)}</>}</li>})}</ul></>)}
  </details>;
}
