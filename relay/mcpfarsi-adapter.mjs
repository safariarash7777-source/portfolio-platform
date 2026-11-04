// Isolated candidate: no network, credentials, repository imports or automatic fallbacks.
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const string = value => typeof value === 'string' && value.trim() ? value : null;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const routes = Object.freeze({
  quote: {server:'tsetmc-mcp',tool:'ts_get_quote'},
  policyRates: {server:'cbi',tool:'cb_policy_rates'},
  codal: {server:'codal',tool:'cd_search_letters'},
});

export function decode(response) {
  if (response?.status !== 200) throw Error('transport_error');
  const envelope = response.data;
  if (envelope?.error || envelope?.result?.isError) throw Error('provider_error');
  const texts = envelope?.result?.content?.filter(c => c.type === 'text');
  if (texts?.length !== 1) throw Error('unexpected_content');
  const data = JSON.parse(texts[0].text);
  if (!object(data) || data.error || data.isError) throw Error('invalid_payload');
  return data;
}

function evidence(route, receivedAtUtc, sourceUrl, official) {
  if (receivedAtUtc !== null && (!string(receivedAtUtc) || !Number.isFinite(Date.parse(receivedAtUtc)))) throw Error('receipt_time_invalid');
  return {router:'https://mcp.mcpfarsi.ir/mcp',...route,sourceUrl,
    sourceOfficial:official,connectorOfficial:false,receivedAtUtc,
    sourceAtUtc:null,freshness:'unknown',coverage:'partial'};
}

export function quote(response, receivedAtUtc, requestedSymbol) {
  const data = decode(response);
  if (data.unit !== 'rial' || !string(data.ins_code) || !string(data.symbol)) throw Error('quote_schema_mismatch');
  if (requestedSymbol && data.symbol !== requestedSymbol && data.ins_code !== requestedSymbol) throw Error('symbol_mismatch');
  return {...evidence(routes.quote,receivedAtUtc,'https://www.tsetmc.com/',true),
    symbol:data.symbol,instrumentCode:data.ins_code,unit:'rial',
    sourceDateRaw:string(data.date),sourceDateCalendar:'gregorian',sourceTimeRaw:string(data.time),
    // The payload has no timezone/UTC offset. Keep source date/time separate; never use capture time as trade time.
    last:finite(data.last),close:finite(data.close),
    lastRial:finite(data.last),lastToman:finite(data.last) === null ? null : data.last / 10,
    closeRial:finite(data.close),closeToman:finite(data.close) === null ? null : data.close / 10,
    volume:finite(data.volume),
    valueRial:finite(data.value),trades:finite(data.trades),
    lastChangePct:finite(data.change_pct),closeChangePct:finite(data.close_change_pct)};
}

export function policyRates(response, receivedAtUtc) {
  const data = decode(response);
  if (!Array.isArray(data.rows)) throw Error('policy_schema_mismatch');
  return {...evidence(routes.policyRates,receivedAtUtc,'https://www.cbi.ir/',true),
    sourceDateCalendar:'jalali',unit:'percent',sourceYear:finite(data.year),
    totalRowsReported:finite(data.count),returnedRows:data.rows.length,
    order:'provider_order',rows:data.rows.map(row => {
      if (!object(row)) throw Error('policy_row_mismatch');
      return {sourceDateRaw:string(row.date),interbankPct:finite(row.interbank_pct),
        repoMinimumPct:finite(row.repo_min_pct),standingLendingPct:finite(row.standing_lending_pct),
        standingDepositPct:finite(row.standing_deposit_pct)};
    })};
}

// Host integration must provide a read-only caller. Errors keep the old snapshot and its source clocks.
// No BRSAPI fallback, synthetic zero, empty-on-error, scheduling or persistence is performed here.
export async function refresh({kind,arguments:args,call,now=()=>new Date().toISOString(),previous=null}) {
  if (!['quote','policyRates'].includes(kind)) throw Error('unsupported_route');
  if (typeof call !== 'function') throw Error('caller_required');
  const route = routes[kind];
  try {
    const response = await call({name:'call_tool',arguments:{...route,arguments:args}});
    const receivedAtUtc = now(); // Record after await, never before the network request.
    const snapshot = kind === 'quote' ? quote(response,receivedAtUtc,args.symbol) : policyRates(response,receivedAtUtc);
    return {status:'received',snapshot,error:null};
  } catch {
    return {status:'retained',snapshot:previous,error:'mcpfarsi_refresh_failed'};
  }
}
