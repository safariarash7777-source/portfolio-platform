import { NextResponse } from "next/server";
import { readFundamentals } from "@/lib/fundamental/registry";
import { dedupePeriods, deriveQuarters, fiscalChainKey } from "@/lib/core/quarterly";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim();
  if (!symbol || symbol.length > 64) return NextResponse.json({error:"نماد نامعتبر"}, {status:400});
  const read = await readFundamentals(symbol);
  if (read.state === "error") return NextResponse.json({error:"خواندن گزارش فصلی ممکن نشد."}, {status:503});
  const reports = read.data?.n10Periods ?? [];
  const inputs = reports.map(({id, data, scope}) => ({
    id, period_end:data.period_end, period_months:data.period_months, audited:data.audited,
    scope, unit:data.unit, capital:data.capital, ...data.standalone,
  }));
  const byPeriod = dedupePeriods(inputs);
  const sources = new Map(reports.map(r => [r.id, r.sourceUrl]));
  const points = deriveQuarters(inputs).filter(q => q.periodEnd).map(q => {
    const cur = [...byPeriod.values()].find(r => r.period_end === q.periodEnd && r.period_months === q.q * 3);
    const previous = cur && q.q > 1 ? byPeriod.get(fiscalChainKey(cur) + "|" + ((q.q-1)*3)) : undefined;
    const docs = [cur,previous].flatMap(r => r ? [{id:r.id, url:sources.get(r.id) ?? null, end:r.period_end, months:r.period_months}] : []);
    return {end:q.periodEnd, revenue:q.revenue, profit:q.netProfit, margin:q.netMargin, docs};
  });
  return NextResponse.json({symbol,state:read.state,points}, {headers:{"Cache-Control":"no-store"}});
}
