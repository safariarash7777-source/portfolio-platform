// ─────────────────────────────────────────────────────────────────────────────
// رلهٔ بازارِ ایران — باید روی هاستِ «داخل ایران» اجرا شود (لیارا/آروان/پارس‌پک).
// چرا: منابعِ ایرانی (BrsApi) به IPِ خارجی ۴۰۳ می‌دهند؛ این سرویسِ
// کوچک داده را از داخل می‌کشد و به Supabase تحویل می‌دهد (push).
//
// اجرا:  node server.mjs        (Node 18+ ، بدون هیچ وابستگی)
// env:   PORT (پیش‌فرض 3400)
//        RELAY_TOKEN (اختیاری — اگر ست شود، هدر Authorization: Bearer <token>
//                     برای /market.json الزامی می‌شود)
//        BRSAPI_KEY (الزامی — کلید وب‌سرویس BrsApi.ir)
//        SUPABASE_URL (اختیاری — URL پروژه Supabase برای push)
//        SUPABASE_SERVICE_ROLE_KEY (اختیاری — کلید service-role برای push)
//
// خروجی: GET /market.json → { gold[], currency[], funds[], stocks[], indices, fetchedAt }
//        GET /healthz     → ok
//        GET /debug       → وضعیتِ هر منبع + شمارِ ردیف‌ها + آخرین خطا (بدونِ سکرت)
//        GET /            → راهنمای ساده
//
// هر ردیف: { id, faName, price, unit: "toman"|"usd"|"rial", change, changePercent }
// اگر منبعی پاسخ ندهد، بخشِ مربوطه آرایهٔ خالی می‌ماند — هیچ عددِ ساختگی.
//
// کش در پس‌زمینه رفرش می‌شود (بوت + هر ۵ دقیقه)، پس /market.json همیشه فوری
// جواب می‌دهد و درخواستِ سایت روی build کندِ منبع تایم‌اوت نمی‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import http from "node:http";

const PORT = Number(process.env.PORT || 3400);
const TOKEN = process.env.RELAY_TOKEN || "";
const BRSAPI_KEY = process.env.BRSAPI_KEY || "";
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

// انتشار به Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// User-Agent مرورگر — فایروال BrsApi UA غیرمرورگر را بن می‌کند (حداقل ۲ ساعت).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HDRS = { Accept: "application/json", "User-Agent": BROWSER_UA };

let cache = null; // { body: string, at: number }

// وضعیتِ تشخیصی — برای /debug. هیچ سکرتی اینجا نیست.
const status = {
  lastRefresh: 0,
  lastError: null,
  sources: {
    brsapi_gold_currency: { ok: false, gold: 0, currency: 0, error: null },
    brsapi_stocks: { ok: false, funds: 0, stocks: 0, error: null },
    brsapi_index: { ok: false, error: null },
  },
  supabase: { enabled: false, ok: false, status: null, at: 0, error: null },
};

const errMsg = (e) => (e && e.name === "TimeoutError" ? "timeout" : e?.message ?? String(e));

// ── BrsApi: طلا/سکه + ارز + کریپتو ──────────────────────────────────────────
async function fetchGoldCurrency() {
  if (!BRSAPI_KEY) {
    status.sources.brsapi_gold_currency = { ok: false, gold: 0, currency: 0, error: "BRSAPI_KEY ست نشده" };
    return { gold: [], currency: [], crypto: [] };
  }
  const url = `https://Api.BrsApi.ir/Market/Gold_Currency.php?key=${BRSAPI_KEY}`;
  try {
    const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const err = `HTTP ${res.status}`;
      status.sources.brsapi_gold_currency = { ok: false, gold: 0, currency: 0, error: err };
      return { gold: [], currency: [], crypto: [] };
    }
    const json = await res.json();

    // Gold items
    const gold = (json.gold || []).map((item) => ({
      id: item.symbol,
      faName: item.name,
      price: Number(item.price) || 0,
      unit: (item.unit || "").includes("دلار") ? "usd" : "toman",
      change: Number(item.change_value) || null,
      changePercent: Number(item.change_percent) || null,
    })).filter((r) => r.price > 0);

    // Currency items (includes tether)
    const currency = (json.currency || []).map((item) => ({
      id: item.symbol,
      faName: item.name,
      price: Number(item.price) || 0,
      unit: "toman",
      change: Number(item.change_value) || null,
      changePercent: Number(item.change_percent) || null,
    })).filter((r) => r.price > 0);

    // Crypto items
    const crypto = (json.cryptocurrency || []).map((item) => ({
      id: item.symbol,
      faName: item.name,
      nameEn: item.name_en,
      price: Number(item.price) || 0,
      unit: "usd",
      changePercent: Number(item.change_percent) || null,
      marketCap: Number(item.market_cap) || null,
      description: item.description || null,
    })).filter((r) => r.price > 0);

    status.sources.brsapi_gold_currency = {
      ok: gold.length + currency.length > 0,
      gold: gold.length,
      currency: currency.length,
      crypto: crypto.length,
      error: null,
    };
    return { gold, currency, crypto };
  } catch (e) {
    const err = errMsg(e);
    status.sources.brsapi_gold_currency = { ok: false, gold: 0, currency: 0, error: err };
    console.error("brsapi gold/currency error:", err);
    return { gold: [], currency: [], crypto: [] };
  }
}

// ── BrsApi: سهام + صندوق‌ها (AllSymbols type=1) ──────────────────────────────
async function fetchStocksAndFunds() {
  if (!BRSAPI_KEY) {
    status.sources.brsapi_stocks = { ok: false, funds: 0, stocks: 0, error: "BRSAPI_KEY ست نشده" };
    return { funds: [], stocks: [] };
  }
  const url = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}&type=1`;
  try {
    const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      const err = `HTTP ${res.status}`;
      status.sources.brsapi_stocks = { ok: false, funds: 0, stocks: 0, error: err };
      return { funds: [], stocks: [] };
    }
    const items = await res.json();
    if (!Array.isArray(items)) {
      status.sources.brsapi_stocks = { ok: false, funds: 0, stocks: 0, error: "response is not array" };
      return { funds: [], stocks: [] };
    }

    const funds = [];
    const stocks = [];

    for (const item of items) {
      // قیمت‌ها ریال هستند — تبدیل به تومان
      const lastPrice = Number(item.pl) || 0;
      if (lastPrice <= 0) continue;
      const priceToman = Math.round(lastPrice / 10);
      const closingPrice = Number(item.pc) || 0;
      const closingToman = closingPrice > 0 ? Math.round(closingPrice / 10) : priceToman;

      const row = {
        id: item.l18,
        faName: item.l30 || item.l18,
        price: priceToman,
        unit: "toman",
        change: Number(item.plc) ? Math.round(Number(item.plc) / 10) : null,
        changePercent: Number(item.plp) || null,
        closingPrice: closingToman,
        closingChangePercent: Number(item.pcp) || null,
        volume: Number(item.tvol) || 0,
        value: Number(item.tval) || 0,
        marketValue: Number(item.mv) || null,
        industry: item.cs || null,
        industryId: Number(item.cs_id) || null,
        eps: Number(item.eps) || null,
        pe: Number(item.pe) || null,
        buyI: Number(item.Buy_I_Volume) || 0,
        buyN: Number(item.Buy_N_Volume) || 0,
        sellI: Number(item.Sell_I_Volume) || 0,
        sellN: Number(item.Sell_N_Volume) || 0,
      };

      // cs_id === 68 → صندوق ETF
      if (Number(item.cs_id) === 68) {
        funds.push(row);
      } else {
        stocks.push(row);
      }
    }

    // مرتب‌سازی بر اساس ارزش معاملات (نزولی)
    stocks.sort((a, b) => (b.value || 0) - (a.value || 0));
    funds.sort((a, b) => (b.value || 0) - (a.value || 0));

    status.sources.brsapi_stocks = {
      ok: funds.length + stocks.length > 0,
      funds: funds.length,
      stocks: stocks.length,
      error: null,
    };
    return { funds, stocks };
  } catch (e) {
    const err = errMsg(e);
    status.sources.brsapi_stocks = { ok: false, funds: 0, stocks: 0, error: err };
    console.error("brsapi stocks/funds error:", err);
    return { funds: [], stocks: [] };
  }
}

// ── BrsApi: شاخص بورس ────────────────────────────────────────────────────────
async function fetchIndex() {
  if (!BRSAPI_KEY) {
    status.sources.brsapi_index = { ok: false, error: "BRSAPI_KEY ست نشده" };
    return null;
  }
  const url = `https://Api.BrsApi.ir/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=1`;
  try {
    const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      status.sources.brsapi_index = { ok: false, error: `HTTP ${res.status}` };
      return null;
    }
    const json = await res.json();
    const data = Array.isArray(json) ? json[0] : json;
    if (!data || !data.index) {
      status.sources.brsapi_index = { ok: false, error: "no index field" };
      return null;
    }
    const indices = {
      total: Number(data.index) || 0,
      totalChange: Number(data.index_change) || 0,
      equalWeight: Number(data.index_equalWeight) || 0,
      equalWeightChange: Number(data.index_equalWeight_change) || 0,
      marketValue: Number(data.mv) || 0,
      trades: Number(data.tno) || 0,
      volume: Number(data.tvol) || 0,
      value: Number(data.tval) || 0,
      state: data.state || null,
      date: data.date || null,
      time: data.time || null,
    };
    status.sources.brsapi_index = { ok: true, error: null };
    return indices;
  } catch (e) {
    const err = errMsg(e);
    status.sources.brsapi_index = { ok: false, error: err };
    console.error("brsapi index error:", err);
    return null;
  }
}

// ── ساختِ payload نهایی ───────────────────────────────────────────────────────
async function buildPayload() {
  const [gc, sf, indices] = await Promise.all([
    fetchGoldCurrency(),
    fetchStocksAndFunds(),
    fetchIndex(),
  ]);
  const payload = {
    gold: gc.gold,
    currency: gc.currency,
    crypto: gc.crypto,
    funds: sf.funds,
    stocks: sf.stocks,
    indices,
    fetchedAt: Date.now(),
  };
  return JSON.stringify(payload);
}

// ── Push به Supabase ──────────────────────────────────────────────────────────
async function pushToSupabase(body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    status.supabase = { enabled: false, ok: false, status: null, at: 0, error: null };
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([{ key: "latest", payload: JSON.parse(body), updated_at: new Date().toISOString() }]),
      signal: AbortSignal.timeout(15000),
    });
    status.supabase = {
      enabled: true,
      ok: res.ok,
      status: res.status,
      at: Date.now(),
      error: res.ok ? null : `HTTP ${res.status}`,
    };
    if (!res.ok) console.error(`supabase push: HTTP ${res.status}`);
  } catch (e) {
    status.supabase = { enabled: true, ok: false, status: null, at: Date.now(), error: errMsg(e) };
    console.error("supabase push error:", status.supabase.error);
  }
}

// ── تاریخچه (append-only) — هر ۳۰ دقیقه یک نمونه ─────────────────────────────
const HISTORY_INTERVAL_MS = 30 * 60 * 1000;
let lastHistoryPush = 0;

async function pushHistory(body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  if (Date.now() - lastHistoryPush < HISTORY_INTERVAL_MS) return;
  const p = typeof body === "string" ? JSON.parse(body) : body;
  const sections = ["gold", "currency", "funds", "stocks"];
  const rows = sections
    .filter((s) => Array.isArray(p[s]) && p[s].length > 0)
    .map((s) => ({ section: s, payload: p[s] }));
  if (rows.length === 0) return;
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/ir_market_history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      lastHistoryPush = Date.now();
      console.log("history push ok:", rows.length, "sections");
    } else {
      console.error(`history push: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("history push error:", errMsg(e));
  }
}

// ── رفرش پس‌زمینه ────────────────────────────────────────────────────────────
let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const body = await buildPayload();
      cache = { body, at: Date.now() };
      status.lastRefresh = Date.now();
      status.lastError = null;
      await pushToSupabase(body);
      await pushHistory(body);
    } catch (e) {
      status.lastError = errMsg(e);
      console.error("relay refresh error:", status.lastError);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ── Debug payload ─────────────────────────────────────────────────────────────
function debugPayload() {
  let counts = null;
  if (cache) {
    try {
      const p = JSON.parse(cache.body);
      counts = {
        gold: p.gold?.length ?? 0,
        currency: p.currency?.length ?? 0,
        crypto: p.crypto?.length ?? 0,
        funds: p.funds?.length ?? 0,
        stocks: p.stocks?.length ?? 0,
      };
    } catch { /* ignore */ }
  }
  return JSON.stringify({
    now: Date.now(),
    warmedUp: Boolean(cache),
    ageSec: cache ? Math.round((Date.now() - cache.at) / 1000) : null,
    lastRefresh: status.lastRefresh,
    lastError: status.lastError,
    brsapiKeyConfigured: Boolean(BRSAPI_KEY),
    tokenRequired: Boolean(TOKEN),
    counts,
    sources: status.sources,
    supabase: status.supabase,
  }, null, 2);
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("ir-market relay v2 (BrsApi): /healthz | /market.json | /debug");
  }

  if (url.pathname === "/debug") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(debugPayload());
  }

  if (url.pathname !== "/market.json") { res.writeHead(404); return res.end("not found"); }

  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401); return res.end("unauthorized");
  }

  try {
    if (!cache) await refresh();
    if (cache && Date.now() - cache.at > CACHE_MS) refresh(); // کهنه → رفرش پس‌زمینه
    if (!cache) {
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      return res.end('{"error":"warming up"}');
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(cache.body);
  } catch (e) {
    console.error("relay error:", e?.message ?? e);
    res.writeHead(502);
    res.end("{}");
  }
});

server.listen(PORT, () => {
  console.log(`ir-market relay v2 (BrsApi) on :${PORT}`);
  refresh();
  setInterval(refresh, CACHE_MS).unref();
});
