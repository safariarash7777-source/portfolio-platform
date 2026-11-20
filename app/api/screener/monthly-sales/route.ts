import { NextResponse } from "next/server";
import { jalaliYmdToGregorian } from "@/lib/core/jalali";
import { fundamentalReadPair } from "@/lib/fundamental/read-config.server";
import { fetchFundamentalRows } from "@/lib/fundamental/read-transport";
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
async function read<T>(db:Binding, table:string, filters:URLSearchParams): Promise<T[]> {
  const response = await fetchFundamentalRows(db.url.replace(/\/+$/,"")+"/rest/v1/"+table+"?"+filters,
    {apikey:db.anon,Authorization:"Bearer "+db.anon});
  if (!response.ok) throw new Error("Read rejected");
  const records:unknown = await response.json();
  if (!Array.isArray(records)) throw new Error("Invalid read");
  return records;
}
// Capture the upper ID once. New inserts belong to the next refresh. Never
// treat the API's per-request row cap or a failed continuation as end-of-data.
async function pages<T extends {id:number}>(db:Binding,table:string,filters:URLSearchParams):Promise<T[]> {
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
export async function GET(req:Request) {
  const params=new URL(req.url).searchParams;
  const period=params.get("period") ?? "";
  const text=params.get("minGrowth") ?? "0";
  const minGrowth=Number(text);
  const symbol=params.get("symbol");
  if (!/^(13\d{2}|14\d{2})-(0[1-9]|1[0-2])$/.test(period) || !text.trim() || !Number.isFinite(minGrowth) ||
      (symbol !== null && !/^[\p{L}\p{N}‌ -]{1,40}$/u.test(symbol))) return NextResponse.json({error:"دوره، حد رشد یا نماد معتبر نیست"},{status:400});
  const db=binding();
  if (!db) return NextResponse.json({error:"اتصال خواندن پایگاه داده تنظیم نشده است"},{status:503});
  try {
    const prior=monthOffset(period,-12);
    const ranges=symbol ? [interval(monthOffset(period,-11),period)] : [interval(prior,prior),interval(period,period)];
    const reports=new URLSearchParams({select:projection, report_kind:"eq.ن-۳۰",data:"not.is.null",or:"("+ranges.join(",")+")"});
    const feed=new URLSearchParams({select:"id,symbol,title,link",category:"eq.ماهانه"});
    if (symbol) { reports.set("symbol","eq."+symbol); feed.set("symbol","eq."+symbol); }
    else feed.set("or","("+[...monthPatterns(prior),...monthPatterns(period)].join(",")+")");
    const [filings,notices,rosters] = await Promise.all([
      pages<SalesFiling>(db,"codal_reports",reports),pages<SalesNotice & {id:number}>(db,"codal_feed",feed),
      symbol ? [] : read<{stocks:ScreenIssuer[];receivedAt:number|null}>(db,"ir_market_snapshots",new URLSearchParams({select:"stocks:payload->stocks,receivedAt:payload->snapshotQuality->families->stocks->receivedAt",key:"eq.latest",limit:"1"})),
    ]);
    const headers={"Cache-Control":"public, max-age=0, s-maxage=60, must-revalidate"};
    if (symbol) return NextResponse.json(salesHistory(period,symbol,filings,notices),{headers});
    if (!Array.isArray(rosters[0]?.stocks) || !rosters[0].stocks.length) throw new Error("Missing stock roster");
    const familyClock = rosters[0].receivedAt;
    const rosterReceivedAt = typeof familyClock === "number" && Number.isSafeInteger(familyClock) && familyClock > 0 && familyClock <= Date.now() ? new Date(familyClock).toISOString() : null;
    return NextResponse.json(monthlySalesScreen(period,minGrowth,rosters[0].stocks,filings,notices,new Date().toISOString(),rosterReceivedAt),{headers});
  } catch {
    return NextResponse.json({error:"خواندن کامل گزارش‌ها یا جامعهٔ بازار ممکن نشد."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
