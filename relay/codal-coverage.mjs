// Coverage here means stored row count only, not validated financial coverage.
// PostgREST may return fewer rows than requested; only an empty page ends a read.
export async function readStoredReportCounts(symbols, { baseUrl, headers, fetch: read = globalThis.fetch }) {
  const counts = new Map();
  if (!symbols.length) return counts;
  const wanted = new Set(symbols);
  const list = [...wanted].map(s => `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",");
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const qs = new URLSearchParams({ select: "id,symbol", symbol: `in.(${list})`, order: "id.desc", limit: "1000" });
    if (cursor !== null) qs.set("id", `lt.${cursor}`);
    const res = await read(`${baseUrl}/rest/v1/codal_reports?${qs}`, {
      headers, signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`covered reports HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("covered reports invalid schema");
    if (!rows.length) return counts;
    for (const row of rows) {
      const id = row?.id;
      const validId = (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
        (typeof id === "string" && /^[1-9]\d*$/.test(id));
      if (!validId || !wanted.has(row.symbol) || (cursor !== null && BigInt(id) >= BigInt(cursor))) {
        throw new Error("covered reports invalid identity/order");
      }
      cursor = String(id);
      counts.set(row.symbol, (counts.get(row.symbol) || 0) + 1);
    }
  }
  throw new Error("covered reports page limit reached");
}

// Trading value is not eligibility: halted/illiquid issuers still publish reports.
// Stable ordering prevents daily value/rank changes from starving small issuers.
export function companyUniverse(stocks) {
  if (!Array.isArray(stocks)) throw new Error("company universe invalid schema");
  return [...new Set(stocks.map(s => String(s?.id ?? "").trim())
    .filter(id => id && !/[0-9۰-۹٠-٩]$/.test(id) && !/ح$/.test(id)))].sort();
}

// Inventory is storage presence, never proof of freshness or financial validity.
// Read every keyset page; a short server-capped page is not the end.
export async function readStoredReportInventory({baseUrl, headers, fetch:read=globalThis.fetch}) {
  const bySymbol = new Map(); let cursor=null, rowsRead=0;
  for(let page=0;page<100;page++) {
    const qs=new URLSearchParams({select:'id,symbol,report_kind',data:'not.is.null',order:'id.desc',limit:'1000'});
    if(cursor!==null)qs.set('id',`lt.${cursor}`);
    const res=await read(`${baseUrl}/rest/v1/codal_reports?${qs}`,{headers,signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error(`report inventory HTTP ${res.status}`);
    const rows=await res.json();if(!Array.isArray(rows))throw Error('report inventory invalid schema');
    if(!rows.length)return {bySymbol,rowsRead};
    for(const row of rows){
      const id=row?.id;
      const validId=typeof id==='number' && Number.isSafeInteger(id) && id>0 || typeof id==='string' && /^[1-9]\d*$/.test(id);
      if(!validId || typeof row.symbol!=='string' || !row.symbol.trim() || cursor!==null && BigInt(id)>=BigInt(cursor))throw Error('report inventory invalid identity/order');
      cursor=String(id);rowsRead++;
      const kind=row.report_kind==='ن-۳۰'?'monthly':row.report_kind==='ن-۱۰'?'financial':null;
      if(!kind)continue;
      const entry=bySymbol.get(row.symbol) ?? {monthly:false,financial:false};entry[kind]=true;bySymbol.set(row.symbol,entry);
    }
  }
  throw Error('report inventory page limit reached');
}
export function summarizeReportInventory(universe, inventory){
  const symbols=[...new Set(universe)];
  return {basis:'stored-presence-not-freshness',universeSize:symbols.length,storedRows:inventory.rowsRead,
    n30Symbols:[...inventory.bySymbol.values()].filter(x=>x.monthly).length,
    n10Symbols:[...inventory.bySymbol.values()].filter(x=>x.financial).length,
    universeMonthly:symbols.filter(s=>inventory.bySymbol.get(s)?.monthly).length,
    universeFinancial:symbols.filter(s=>inventory.bySymbol.get(s)?.financial).length,
    withoutReports:symbols.filter(s=>!inventory.bySymbol.has(s)).length};
}
