import { brsFetch as fetch } from "./brsapi-transport.mjs";
// Official contract: https://brsapi.ir/free-api-commodity-webservice/
// One account key serves all services; reuse is opt-in, never an implicit activation.
// https://brsapi.ir/tsetmc-exchange-free-bourse-api-key-request/
const COMMODITY_BASE = (process.env.BRSAPI_COMMODITY_BASE || "https://Api.BrsApi.ir").replace(/\/+$/, "");
const explicitKey = process.env.BRSAPI_COMMODITY_KEY?.trim() || "";
const COMMODITY_KEY = explicitKey || (process.env.BRSAPI_COMMODITY_ENABLED === "1" ? process.env.BRSAPI_KEY?.trim() || "" : "");
const ENABLED = process.env.BRSAPI_COMMODITY_ENABLED !== "0" && Boolean(COMMODITY_KEY);
const configuredCap = process.env.BRSAPI_COMMODITY_DAILY_CAP;
const DAILY_CAP = configuredCap === undefined ? 300 :
  (/^\d+$/.test(configuredCap) ? Math.min(300, Number(configuredCap)) : 0);
const GROUPS = ["metal_precious", "metal_base", "energy"];

// Internal wiring only: never expose this object through an HTTP/debug response.
export function commodityConfig() {
  return { enabled: ENABLED, base: COMMODITY_BASE, key: COMMODITY_KEY };
}

let rows = [];
let at = null;
let lastError = null;
let reqToday = 0;
let dayKey = "";
let inflight = null;

function rollDay() {
  const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  if (k !== dayKey) { dayKey = k; reqToday = 0; }
}

const num = (v) => {
  // Missing provider values must not become invented zero quotes or changes.
  if ((typeof v !== "number" && typeof v !== "string") ||
      (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function mapCommodityRow(d, group = null) {
  const unix = num(d.time_unix);
  return {
    id: typeof d.symbol === "string" ? d.symbol : null,
    name: typeof d.name === "string" ? d.name : null,
    price: num(d.price),
    changePercent: num(d.change_percent),
    changeValue: num(d.change_value),
    unit: typeof d.unit === "string" ? d.unit : null,
    date: typeof d.date === "string" ? d.date : null,
    time: typeof d.time === "string" ? d.time : null,
    timeUnix: unix !== null && Number.isSafeInteger(unix) && unix > 0 ? unix : null,
    group,
  };
}

export function parseCommodityResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      GROUPS.some(group => !Array.isArray(payload[group]))) throw new Error("invalid commodity groups");
  const mapped = [];
  const seen = new Set();
  for (const group of GROUPS) {
    for (const raw of payload[group]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
          typeof raw.symbol !== "string" || !raw.symbol.trim() || seen.has(raw.symbol)) {
        throw new Error("invalid commodity row");
      }
      seen.add(raw.symbol);
      mapped.push(mapCommodityRow(raw, group));
    }
  }
  // Keep individual missing quotes as null, but an empty/unusable batch cannot
  // replace a known-good snapshot or advance its receipt timestamp.
  if (!mapped.length || !mapped.some(row => row.price !== null)) throw new Error("empty commodity response");
  return mapped;
}

export function refreshCommodities(headers, options = {}) {
  if (inflight) return inflight;
  if (!ENABLED) return Promise.resolve();
  rollDay();
  if (reqToday >= DAILY_CAP) { lastError = "commodity daily cap reached"; return Promise.resolve(); }
  inflight = refresh(headers, options).finally(() => { inflight = null; });
  return inflight;
}

async function refresh(headers, { client = null, countLegacy = null } = {}) {
  try {
    // A conservative process-local attempt cap, not a claim about provider usage.
    // Existing caller scheduling and shared paced transport remain unchanged.
    reqToday++;
    let j;
    if (client) {
      j = await client.request({
        endpoint: "Market/Commodity.php", params: {},
        producer: "commodity", priority: "background",
        budgetClass: "standard",
        dedupeTtlMs: 60_000, timeoutMs: 20_000,
      });
    } else {
      if (countLegacy) await countLegacy("commodity", "standard");
      const res = await fetch(`${COMMODITY_BASE}/Market/Commodity.php?key=${encodeURIComponent(COMMODITY_KEY)}`, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      j = await res.json();
    }
    const mapped = parseCommodityResponse(j);
    rows = mapped;
    at = Date.now();
    lastError = null;
  } catch (e) {
    // An upstream/client error may contain a URL with its key. Expose only
    // known local contract errors or the HTTP status, never the raw message.
    const message = e?.message || "";
    lastError = /^(invalid commodity (groups|row)|empty commodity response|http \d{3})$/.test(message)
      ? message : "commodity request failed";
  }
}

export function commoditiesForPayload() {
  return rows;
}

export function commodityStatus() {
  rollDay();
  return {
    enabled: ENABLED,
    rows: rows.length,
    lastFetchAt: at,
    reqToday,
    dailyCap: DAILY_CAP,
    remaining: Math.max(0, DAILY_CAP - reqToday),
    counterScope: "process",
    dayKey,
    lastError: ENABLED ? lastError : "commodity disabled (explicit key or enable flag required)",
  };
}
