"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpLeft, Bitcoin, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Coins, Gem, RefreshCw, Search, Wallet } from "lucide-react";
import { acceptsQuoteTick, quoteDirection, quoteGroups, QUOTE_ORDER, type QuoteBoardFeed, type QuoteGroup, type Quote } from "@/lib/quote-board";
import type { TrendPoint } from "@/lib/core/trend";
import s from "./QuoteBoard.module.css";

const names: Record<string,string> = {USD:"دلار آزاد", IR_GOLD_18K:"طلای ۱۸ عیار", IR_COIN_EMAMI:"سکهٔ امامی"};
const unitNames: Record<string,string> = { USD:"هر دلار", IR_GOLD_18K:"هر گرم", IR_COIN_EMAMI:"هر قطعه", bitcoin:"هر بیت‌کوین" };
const icons = { USD:Wallet, IR_GOLD_18K:Gem, IR_COIN_EMAMI:Coins, bitcoin:Bitcoin };
const f = (v: number, precision = 0) => new Intl.NumberFormat("fa-IR", {maximumFractionDigits: precision}).format(v);
const signed = (v: number, p = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v),p);
const fmt = (v: number, q: Quote) => f(v, q.unit === "usd" ? 2 : 0);
const REFRESH = 30_000;
const PAGE = 8;
type Motion = Record<string,{direction:"up"|"down"; seq:number}>;

function Spark({points, large = false, tone = "neutral"}: {points:TrendPoint[];large?:boolean;tone?:string}) {
  const id = useId();
  if(points.length < 2) return <div className={s.nochart}>روند قابل نمایش نیست</div>;
  const v = points.map(a=>a.price), lo = Math.min(...v), hi = Math.max(...v);
  const H = large ? 106 : 52, W = 300, pad = large ? 8 : 5;
  const xy = v.map((p,i)=>[pad+(W-2*pad)*i/(v.length-1), lo === hi ? H/2 : H-pad-(H-2*pad)*(p-lo)/(hi-lo)]);
  const line = xy.map(([x,y],i)=>`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const [x,y] = xy.at(-1)!;
  return <svg role="img" aria-label="روند روزانهٔ قیمت" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.spark} data-tone={tone}>
    <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".17"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
    {(large ? [.2,.45,.7,.95] : [.93]).map(n=><line key={n} x1="0" x2={W} y1={n*H} y2={n*H} className={s.gridline}/>)}
    <path d={`${line} L${x} ${H} L${pad} ${H}Z`} fill={`url(#${id})`} />
    <path d={line} fill="none" stroke="currentColor" strokeWidth={large ? "2.2" : "1.6"} vectorEffect="non-scaling-stroke"/>
    <circle cx={x} cy={y} r="2.4" fill="currentColor"/>
  </svg>;
}

export default function QuoteBoard({ initial = null, scope = "all", preview = false }: {initial?:QuoteBoardFeed|null;scope?:"all"|"domestic";preview?:boolean}) {
  const [feed,setFeed] = useState<QuoteBoardFeed|null>(initial);
  const [status,setStatus] = useState<"loading"|"ok"|"failed">(initial ? "ok" : "loading");
  const [group,setGroup] = useState<QuoteGroup>("gold"), [query,setQuery] = useState(""), [page,setPage] = useState(0);
  const [open,setOpen] = useState<string|null>(null);
  const [motion,setMotion] = useState<Motion>({});
  const [btcHistory,setBtcHistory] = useState<TrendPoint[]>([]);
  const [simulated,setSimulated] = useState(false);
  const last = useRef<QuoteBoardFeed|null>(initial), seq = useRef(0);
  const [checkedAt,setCheckedAt] = useState<number|null>(null);
  const master = useId();
  const accept = useCallback((next:QuoteBoardFeed,demo = false)=>{
    const previous = new Map(quoteGroups(last.current).flatMap(g=>g.rows.map(q=>[q.id,q] as const)));
    // Missing families are not relabelled as current and do not trigger animation.
    const fresh = quoteGroups(next).flatMap(g=>g.rows.filter(q=>{
      return demo || acceptsQuoteTick(next,g.id,q,previous.get(q.id));
    }));
    const changed:Motion = {};
    for(const q of fresh){
      const direction = quoteDirection(previous.get(q.id)?.price,q.price);
      if(direction) changed[q.id] = {direction,seq: ++seq.current};
    }
    last.current = next; setFeed(next); setMotion(changed); setStatus("ok");
  },[]);
  useEffect(()=>{
    if(preview) return;
    let alive=true, busy=false, nextTrendRead=0;
    const controller=new AbortController();
    const pull=async()=>{
      if(busy || !navigator.onLine || document.visibilityState==="hidden")return;
      busy=true;
      try{
        const withTrends = Date.now() >= nextTrendRead;
        const res=await fetch("/api/market?quoteTrends="+Number(withTrends)+(scope==="domestic"?"&quoteScope=domestic":""),{signal:controller.signal,cache:"no-store"});
        if(!res.ok)throw new Error("quote request failed");
        const next=await res.json() as QuoteBoardFeed;
        if(!alive)return;
        if(quoteGroups(next).some(g=>g.rows.length)){
          if(withTrends) nextTrendRead=Date.now()+300_000;
          else next.quoteTrends=last.current?.quoteTrends;
          accept(next); setCheckedAt(Date.now());
        }
        else setStatus("failed");
      }catch{if(alive)setStatus("failed");}
      finally{busy=false;}
    };
    void pull(); const timer=setInterval(pull,REFRESH);
    return ()=>{alive=false;controller.abort();clearInterval(timer);};
  },[accept,preview,scope]);
  useEffect(()=>{
    if(preview || scope==="domestic")return;
    const controller=new AbortController();
    void fetch("/api/market/ohlc?id=bitcoin",{signal:controller.signal}).then(r=>r.ok?r.json():null).then((r:{candles?:{time:number;close:number}[]}|null)=>{
      const byDay=new Map<string,number>();
      for(const c of (r?.candles??[]).slice().sort((a,b)=>a.time-b.time)){
        if(!Number.isFinite(c.time)|| !Number.isFinite(c.close)||c.close<=0)continue;
        byDay.set(new Date(c.time*1000).toISOString().slice(0,10),c.close);
      }
      if(!controller.signal.aborted)setBtcHistory([...byDay].slice(-12).map(([date,price])=>({date,price})));
    }).catch(()=>{});
    return ()=>controller.abort();
  },[preview,scope]);
  useEffect(()=>{
    if(!Object.keys(motion).length)return;
    const timer=setTimeout(()=>setMotion({}),1900);
    return ()=>clearTimeout(timer);
  },[motion]);

  const groups=useMemo(()=>quoteGroups(feed).filter(g=>scope==="all" || ["gold","currency"].includes(g.id)),[feed,scope]);
  const active=groups.find(g=>g.id===group) ?? groups[0];
  const filterKey=(v:string)=>v.toLowerCase().replace(/[يك]/g,x=>x==="ي"?"ی":"ک").replace(/\u200c/g," ").trim();
  const found=active.rows.filter(q=>filterKey(`${q.faName} ${q.id} ${names[q.id]??""} ${q.symbol??""}`).includes(filterKey(query)));
  const lastPage=Math.max(0,Math.ceil(found.length/PAGE)-1), shownPage=Math.min(page,lastPage);
  const byId = new Map(groups.flatMap(g=>g.rows.map(q=>[q.id,q] as const)));
  const featured = QUOTE_ORDER.map(id=>byId.get(id)).filter((q):q is Quote=>!!q);
  const trends = new Map((feed?.quoteTrends ?? []).map(t=>[t.id,t.points.slice(-12)]));
  const states = feed?.availability?.iran?.families;
  const issue = status === "failed" ? feed ? "دریافت جدید ناموفق · قیمت‌های ذخیره‌شده" : "دادهٔ قیمت در دسترس نیست"
    : status==="loading" ? "در حال دریافت قیمت‌ها" : featured.some(q=>q.id==="bitcoin" ? feed?.availability?.global?.state!=="ready" : states?.[q.id==="USD"?"currency":"gold"]?.state!=="ready") ? "بخشی از قیمت‌ها ذخیره‌شده‌اند" : "قیمت‌های بازار";

  function demonstrate(){
    if(!initial)return;
    if(simulated){accept(initial); setSimulated(false);return;}
    const plus: Record<string,number> = {USD:470,IR_GOLD_18K:-62500,IR_COIN_EMAMI:185000,bitcoin:-40};
    const move=(q:Quote)=>({...q, price:q.price+(plus[q.id]??0)});
    accept({...initial,ir:{...initial.ir,gold:initial.ir?.gold?.map(move),currency:initial.ir?.currency?.map(move)},crypto:initial.crypto?.map(move)},true);
    setSimulated(true);
  }
  function bubble(id:string) {
    if(id!=="IR_GOLD_18K" && id!=="IR_COIN_EMAMI")return null;
    const b=feed?.quoteBubbles?.[id];
    return <div className={s.bubble}>
      <span><i aria-hidden/> حباب {b && <strong dir="ltr">{signed(b.percent,2)}٪</strong>} {b?.quality==="stored" && <small>· بر پایهٔ دادهٔ ذخیره‌شده</small>}</span>
      {b ? <span className={s.bubbleValue} title={b.basis==="world-spot"?"نسبت به ارزش طلای ۱۸ با اونس و دلار آزاد":"نسبت به ارزش طلای خالص سکه با طلای ۱۸ داخلی"}><bdi dir="ltr">{signed(b.amount)}</bdi> <small>تومان</small></span>
        : <small>ورودی هم‌زمان در دسترس نیست</small>}
    </div>;
  }
  function delta(q:Quote) {
    const d=q.changePercent ?? q.change24h;
    const known=typeof d==="number" && Number.isFinite(d);
    return <span className={s.delta} data-tone={known ? d>0?"up":d<0?"down":"neutral" : "neutral"} aria-label={known ? `تغییر: ${signed(d,2)} درصد` : "تغییر نامعلوم"}>{known && d>0 ? <ArrowUpLeft size={14}/> : known && d<0 ? <ArrowDownRight size={14}/> : null}<bdi>{known ? signed(d,2)+"٪" : "—"}</bdi></span>;
  }
  return <section id="market" dir="rtl" className={s.board} aria-labelledby={master+"-heading"}>
    <header className={s.head}>
      <div><div className={s.kicker}><Activity size={16}/> میز بازار</div><h2 id={master+"-heading"}>نمای قیمت‌ها</h2><p>قیمت، جهت تغییر و روند دارایی‌های بازار</p></div>
      <div className={s.signals}>{preview && <span className={s.demo}>پیش‌نمایش طراحی</span>}
      <span className={s.status} role="status"><i aria-hidden/>{simulated?"تغییر نمونه · نه دادهٔ بازار":issue}</span>
      {checkedAt && <small>آخرین بررسی تابلو <time>{new Date(checkedAt).toLocaleTimeString("fa-IR",{timeZone:"Asia/Tehran"})}</time></small>}
      {preview && <button type="button" className={s.replay} onClick={demonstrate}><RefreshCw size={14}/>{simulated?"بازنشانی نمونه":"نمایش تغییر قیمت"}</button>}</div>
    </header>
    <div className={s.feature} data-testid="quote-feature">
      {featured.map(q=>{
        const I=icons[q.id as keyof typeof icons] ?? CircleDollarSign, id=master+"-"+q.id;
        const points=trends.get(q.id)??(q.id==="bitcoin"?btcHistory:[]), m=motion[q.id];
        const historyDirection = points.length > 1 ? quoteDirection(points[0].price,points.at(-1)!.price) : null;
        const expanded=open===q.id;
        const min=points.length ? Math.min(...points.map(p=>p.price)):null, max=points.length ? Math.max(...points.map(p=>p.price)):null;
        return <Fragment key={q.id}><article className={s.card} data-expanded={expanded} data-asset={q.id}>
          <div className={s.cardHead}><span className={s.icon}><I size={21}/></span><div className={s.asset}><h3>{names[q.id]??q.faName}</h3><span>{unitNames[q.id]}</span></div>{delta(q)}</div>
          <div className={s.price}><span key={m?.seq??0} className={m?s.flash:undefined} data-tick={m?.direction}>
            <bdi data-testid="quote-number">{fmt(q.price,q)}</bdi>
          </span><small>{q.unit==="usd"?"دلار":"تومان"}</small></div>
          <div className={s.meta}>{q.change == null || !Number.isFinite(q.change) ? <span>مقدار تغییر: —</span> : <span>مقدار تغییر: <bdi>{signed(q.change,2)}</bdi></span>}</div>
          {points.length > 1 ? <button className={s.chartButton} type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setOpen(expanded ? null:q.id)}>
            <Spark points={points} tone={historyDirection??"neutral"}/>
            <span className={s.chartCaption}>روند روزانه<ChevronDown size={15}/></span>
          </button> : <div className={s.chartButton} data-unavailable><Spark points={points}/><span className={s.chartCaption}>روند روزانه</span></div>}
          {bubble(q.id)}
        </article>
          <div id={id} className={s.detail} hidden={!expanded}>
            <div><strong>{names[q.id]??q.faName} · روند روزانه</strong>{points.length>1 && <span> · {f(points.length)} نقطهٔ ثبت‌شده</span>}</div>
            <Spark points={points} large/>
            {min!=null && max!=null && <div className={s.range}><span>کمترین در نمودار <bdi>{fmt(min,q)}</bdi></span><span>بیشترین در نمودار <bdi>{fmt(max,q)}</bdi></span></div>}
          </div>
        </Fragment>;
      })}
    </div>
    <div className={s.table}>
      <div className={s.tableHead}><div><h3>همهٔ قیمت‌ها</h3><p>دارایی‌ها را بر اساس بازار مرور کنید.</p></div><label className={s.search}><Search size={17}/><input aria-label="جست‌وجوی دارایی" placeholder="جست‌وجوی دارایی…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label></div>
      <div className={s.groups} aria-label="گروه دارایی‌ها">{groups.map(g=><button key={g.id} type="button" aria-pressed={g.id===group} onClick={()=>{setGroup(g.id);setPage(0);setQuery("");}}>{g.label}<span>{f(g.rows.length)}</span></button>)}</div>
      <div className={s.tableLabel}><span>دارایی</span><span>قیمت</span><span>تغییر</span></div>
      <ul className={s.rows}>{found.slice(shownPage*PAGE,(shownPage+1)*PAGE).map(q=><li key={q.id}><span>{group==="stocks"||group==="funds" ? q.id : names[q.id]??q.faName.replace(/[0-9]/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)])}</span><span><bdi key={motion[q.id]?.seq??0} className={motion[q.id]?s.flash:undefined} data-tick={motion[q.id]?.direction}>{fmt(q.price,q)}</bdi> <small>{q.unit==="usd"?"دلار":"تومان"}</small></span>{delta(q)}</li>)}
      {!found.length && <li className={s.empty}>{query?"دارایی مطابق جست‌وجو پیدا نشد.":status==="loading"?"در حال دریافت…":"قیمتی در این گروه در دسترس نیست."}</li>}</ul>
      {lastPage>0 && <div className={s.pages}><span>{f(shownPage*PAGE+1)} تا {f(Math.min((shownPage+1)*PAGE,found.length))} از {f(found.length)}</span><button type="button" aria-label="صفحهٔ قبل" disabled={!shownPage} onClick={()=>setPage(shownPage-1)}><ChevronRight size={18}/></button><button type="button" aria-label="صفحهٔ بعد" disabled={shownPage===lastPage} onClick={()=>setPage(shownPage+1)}><ChevronLeft size={18}/></button></div>}
    </div>
  </section>;
}
