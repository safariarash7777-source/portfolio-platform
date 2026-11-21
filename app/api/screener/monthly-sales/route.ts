import { NextResponse } from "next/server";
import { jalaliYmdToGregorian } from "@/lib/core/jalali";
import { fundamentalReadPair } from "@/lib/fundamental/read-config.server";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { logStoredReadFailure, type StoredReadPhase } from "@/lib/stored-read-diagnostics";
import { createMonthlyCache, applySalesThreshold, MonthlySourceFailure } from "@/lib/fundamental/monthly-sales-cache";
import { MONTHLY_SCREEN_FRESH_MS } from "@/lib/fundamental/monthly-sales-clocks";
import type { MonthlySalesScreen, ScreenUniverse } from "@/lib/fundamental/monthly-sales-screen";
import { monthOffset, monthlySalesScreen, salesHistory, type SalesFiling, type SalesNotice, type ScreenIssuer } from "@/lib/fundamental/monthly-sales-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const projection = [
  "id,symbol,title,source_url,captured_at,storedPeriod:period_end",
  "reportPeriod:data->>period_end,reportSymbol:data->>symbol,amount:data->period_total_amount",
  "unit:data->>unit,measure:data->>monthly_measure,months:raw->>period_months,parser:raw->>parser_version",
  "publicationDate:raw->>date_publish,publicationTime:raw->>time_publish",
].join(",");
type Binding = { url:string; anon:string };
function binding(): Binding | null {
  const pair = { FUNDAMENTAL_READ_URL:process.env.FUNDAMENTAL_READ_URL, FUNDAMENTAL_READ_ANON_KEY:process.env.FUNDAMENTAL_READ_ANON_KEY };
  if (pair.FUNDAMENTAL_READ_URL !== undefined || pair.FUNDAMENTAL_READ_ANON_KEY !== undefined) {
    const override = fundamentalReadPair(pair);
    return override && override.expiresAt > Date.now()/1000 ? override : null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? {url,anon} : null;
}
type BoundedBinding = Binding & { deadline:AbortSignal };
async function read<T>(db:BoundedBinding, table:string, filters:URLSearchParams): Promise<T[]> {
  const url=db.url.replace(/\/+$/,"")+"/rest/v1/"+table+"?"+filters;
  for (let attempt=0; attempt<2; attempt++) {
    const started=Date.now();
    let phase:StoredReadPhase="request";
    let status:number|undefined;
    try {
      const response=await fetch(url,{credentials:"omit",redirect:"error",cache:"no-store",
        headers:{apikey:db.anon,Authorization:"Bearer "+db.anon},
        signal:AbortSignal.any([db.deadline,AbortSignal.timeout(attempt === 0 ? 10000 : 18000)])});
      status=response.status;
      phase="headers";
      if (!response.ok) {
        await response.body?.cancel();
        throw new MonthlySourceFailure(status===408 || status===429 || status>=500);
      }
      phase="body";
      const records:unknown=await response.json();
      if (!Array.isArray(records)) throw new MonthlySourceFailure(false);
      return records;
    } catch (error) {
      logStoredReadFailure({route:"monthly-sales",phase,elapsedMs:Date.now()-started,upstreamStatus:status,error});
      const cause=(error as {cause?:{code?:string}} | null)?.cause?.code;
      const transient=error instanceof MonthlySourceFailure ? error.transient :
        error instanceof Error && (["TimeoutError","AbortError"].includes(error.name) ||
          ["ECONNRESET","ETIMEDOUT","UND_ERR_CONNECT_TIMEOUT","UND_ERR_HEADERS_TIMEOUT","UND_ERR_BODY_TIMEOUT","UND_ERR_SOCKET","EAI_AGAIN"].includes(cause ?? ""));
      if (!transient || status===429 || db.deadline.aborted || attempt===1) throw new MonthlySourceFailure(transient);
    }
  }
  throw new MonthlySourceFailure(true);
}
// Capture the upper ID once. New inserts belong to the next refresh. Never
// treat the API's per-request row cap or a failed continuation as end-of-data.
async function pages<T extends {id:number}>(db:BoundedBinding,table:string,filters:URLSearchParams):Promise<T[]> {
  const head = new URLSearchParams(filters);
  head.set("select","id"); head.set("order","id.desc"); head.set("limit","1");
  const [last] = await read<{id:number}>(db,table,head);
  if (!last) return [];
  const max = last.id;
  if (!Number.isSafeInteger(max) || max < 1) throw new Error("Invalid boundary");
  filters.set("order","id.asc"); filters.set("limit","800"); filters.append("id","lte."+max);
  const all:T[] = [];
  let cursor = 0;
  while (cursor < max) {
    const query = new URLSearchParams(filters);
    query.append("id","gt."+cursor);
    const batch = await read<T>(db,table,query);
    if (!batch.length) throw new Error("Incomplete ordered read");
    for (const row of batch) {
      if (!Number.isSafeInteger(row.id) || row.id <= cursor || row.id > max) throw new Error("Invalid order");
      cursor=row.id;
      all.push(row);
    }
    if (all.length > 30000) throw new Error("Read too large");
  }
  return all;
}
function interval(first:string,last:string) {
  const a = jalaliYmdToGregorian(first+"-01"), b = jalaliYmdToGregorian(monthOffset(last,1)+"-01");
  return "and(period_end.gte."+a+",period_end.lt."+b+")";
}
function monthPatterns(month:string) {
  const [year,mm] = month.split("-");
  const variants=new Set<string>();
  for (const m of [mm,String(Number(mm))]) for (const sep of ["/","-"]) {
    const pattern = year+sep+m+sep;
    for (const digits of ["0123456789","۰۱۲۳۴۵۶۷۸۹","٠١٢٣٤٥٦٧٨٩"]) variants.add("title.like.*"+pattern.replace(/\d/g,n=>digits[Number(n)])+"*");
  }
  return [...variants];
}
type History = ReturnType<typeof salesHistory> & {checkedAt:string};
const cached = createMonthlyCache<MonthlySalesScreen | History>();
async function load(db:BoundedBinding, period:string, symbol:string|null, universe:ScreenUniverse) {
    const prior=monthOffset(period,-12);
    const ranges=symbol ? [interval(monthOffset(period,-11),period)] : [interval(prior,prior),interval(period,period)];
    const reports=new URLSearchParams({select:projection, report_kind:"eq.ن-۳۰",data:"not.is.null",or:"("+ranges.join(",")+")"});
    const feed=new URLSearchParams({select:"id,symbol,title,link,report_code",category:"eq.ماهانه"});
    if (symbol) { reports.set("symbol","eq."+symbol); feed.set("symbol","eq."+symbol); }
    else feed.set("or","("+[...monthPatterns(prior),...monthPatterns(period)].join(",")+")");
    const [filings,notices,rosters] = await Promise.all([
      pages<SalesFiling>(db,"codal_reports",reports),pages<SalesNotice & {id:number}>(db,"codal_feed",feed),
      symbol ? [] : read<{stocks:ScreenIssuer[];receivedAt:number|null}>(db,"ir_market_snapshots",new URLSearchParams({select:"stocks:payload->stocks,receivedAt:payload->snapshotQuality->families->stocks->receivedAt",key:"eq.latest",limit:"1"})),
    ]);
    if (symbol) return {...salesHistory(period,symbol,filings,notices), checkedAt:new Date().toISOString()};
    if (!Array.isArray(rosters[0]?.stocks) || !rosters[0].stocks.length) throw new Error("Missing stock roster");
    const familyClock = rosters[0].receivedAt;
    const rosterReceivedAt = typeof familyClock === "number" && Number.isSafeInteger(familyClock) && familyClock > 0 && familyClock <= Date.now() ? new Date(familyClock).toISOString() : null;
    return monthlySalesScreen(period,0,rosters[0].stocks,filings,notices,new Date().toISOString(),rosterReceivedAt,universe);
}

export async function GET(req:Request) {
  const params=new URL(req.url).searchParams;
  const period=params.get("period") ?? "";
  const text=params.get("minGrowth") ?? "0";
  const minGrowth=Number(text);
  const symbol=params.get("symbol");
  const universe=params.get("universe") ?? "board";
  if (universe !== "board" && universe !== "reported-outside") return NextResponse.json({error:"جامعهٔ نامعتبر"},{status:400});
  if (!/^(13\d{2}|14\d{2})-(0[1-9]|1[0-2])$/.test(period) || !text.trim() || !Number.isFinite(minGrowth) ||
      (symbol !== null && !/^[\p{L}\p{N}‌ -]{1,40}$/u.test(symbol))) return NextResponse.json({error:"دوره، حد رشد یا نماد معتبر نیست"},{status:400});
  const db=binding();
  if (!db) return NextResponse.json({error:"اتصال خواندن پایگاه داده تنظیم نشده است"},{status:503});
  try {
    const digest = createHash("sha256").update(JSON.stringify([db.url,db.anon])).digest("hex");
    const key=JSON.stringify([digest,period,symbol,universe]);
    const refresh = () => load({...db,deadline:AbortSignal.timeout(46000)},period,symbol,universe);
    // The hosted Next data cache shares complete snapshots across cold workers.
    // Only public results enter it; neither credentials nor thresholds enter its key.
    const hosted = process.env.VERCEL === "1"
      ? unstable_cache(refresh,["monthly-sales-complete-v3",key],{revalidate:MONTHLY_SCREEN_FRESH_MS/1000})
      : refresh;
    const {snapshot,readState} = await cached(key,hosted,hosted === refresh ? undefined : refresh);
    const body = "rows" in snapshot ? applySalesThreshold(snapshot,minGrowth) : snapshot;
    return NextResponse.json({...body,readState},{headers:{"Cache-Control":readState==="retained"?"no-store":"public, max-age=0, s-maxage=30, must-revalidate"}});
  } catch {
    return NextResponse.json({error:"خواندن کامل گزارش‌ها یا جامعهٔ بازار ممکن نشد."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
