// Local-only, synthetic data, no upstream request, no credential or user data.
import { createServer } from "node:http";
let mode = "ready";
const clock = at => {
  const p = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const get = k => p.find(x => x.type === k)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
};
function payload() {
  const now = Date.now(); const source = clock(now - (mode === "stale" ? 8 * 86400_000 : 5 * 60_000));
  const row = { price: 362, closingPrice: 362, unit: "toman", sourceDate: source.date, sourceTime: source.time, changePercent: 0.5, closingChangePercent: 0.5, volume: 1_000_000, value: 5_600_000_000_000, marketValue: 7_004_700_000_000_000, buyI: 100_000, sellI: 80_000, industry: "نمونهٔ صنعت", pe: null };
  return { fetchedAt: mode === "unknown" ? null : now, indices: { total: 3_000_000, totalChange: 10_000, equalWeight: 900_000, equalWeightChange: 1_000, marketValue: 70_000_000_000_000, value: 500_000_000_000, volume: 100_000_000, trades: 10_000, state: "بازار بسته است", date: mode === "unknown" ? null : source.date, time: source.time }, stocks: Array.from({ length: 60 }, (_, i) => ({ ...row, id: i === 0 ? "فولاد" : `نمونه${"ابتثجحخدذرزسشصضطظعغفقکگلمنوهی"[Math.floor(i / 28)]}${"ابتثجحخدذرزسشصضطظعغفقکگلمنوهی"[i % 28]}`, faName: "نمونهٔ نمایشی", changePercent: i % 3 === 0 ? -0.5 : 0.5 })), funds: [ { ...row, id: "نمونهطلا", faName: "صندوق نمونهٔ نمایشی", type: "طلا", nav: mode === "wrong-unit" ? 3600 : mode === "null" ? null : 360, navDate: source.date, navTime: source.time }, { ...row, id: "نمونهثابت", faName: "صندوق نمونهٔ نمایشی", type: "درآمد ثابت", nav: null, navDate: null, navTime: null } ], gold: [{ id: "IR_GOLD_18K", faName: "طلای ۱۸ عیار — نمونه", price: 20_000_000, unit: "toman", changePercent: 0, sourceDate: source.date, sourceTime: source.time }], currency: [{ id: "USD", faName: "دلار — نمونه", price: 100_000, unit: "toman", changePercent: null, sourceDate: source.date, sourceTime: source.time }], options: [], crypto: [] };
}
createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:15886");
  const send = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/fixture-state") { const value = url.searchParams.get("mode"); if (["ready", "stale", "unknown", "null", "wrong-unit", "unavailable", "empty"].includes(value)) mode = value; return send({ fixture: true, mode }); }
  if (url.pathname.startsWith("/auth/")) return send({ message: "No fixture user session" }, 401);
  if (mode === "unavailable") return send({ message: "Synthetic unavailable fixture" }, 503);
  const table = url.pathname.split("/").at(-1);
  if (table === "ir_market_snapshots") return send(mode === "empty" ? [] : [{ payload: payload() }]);
  if (table === "index_history") return send(mode === "empty" ? [] : [{ jdate: "1405/07/06", total_index: 2_900_000, equal_weight_index: 890_000 }, { jdate: "1405/07/07", total_index: 2_950_000, equal_weight_index: 895_000 }, { jdate: "1405/07/08", total_index: 3_000_000, equal_weight_index: 900_000 }]);
  if (table === "ir_market_history") return send(mode === "empty" ? [] : ["2026-09-28", "2026-09-29", "2026-09-30"].flatMap((date, i) => [ { captured_at: `${date}T10:00:00Z`, section: "gold", payload: [{ id: "IR_GOLD_18K", price: 19_000_000 + i * 500_000, unit: "toman", faName: "طلای نمونه" }] }, { captured_at: `${date}T10:00:00Z`, section: "currency", payload: [{ id: "USD", price: 98_000 + i * 1000, unit: "toman", faName: "دلار نمونه" }] } ]));
  if (table === "symbol_history") return send(mode === "empty" ? [] : Array.from({ length: 100 }, (_, i) => ({ id: i + 1, symbol: (url.searchParams.get("symbol") ?? "eq.نمونهطلا").replace(/^eq\./, ""), trade_date: new Date(Date.parse("2026-09-30T00:00:00Z") - (99 - i) * 86400_000).toISOString().slice(0, 10), close: 3000 + i * 6, last_price: 3000 + i * 6, volume: 1000, value_traded: 3_000_000, raw: { nav_toman: 300 + i * 0.5 }, source: "fixture" })).sort((a,b) => url.searchParams.get("order")?.includes("trade_date.desc") ? b.trade_date.localeCompare(a.trade_date) : a.trade_date.localeCompare(b.trade_date)));
  if (table === "symbol_details") return send([]);
  return send([]);
}).listen(15886, "127.0.0.1", () => process.stdout.write("Local synthetic market fixture listening on 15886; zero upstream calls\n"));
