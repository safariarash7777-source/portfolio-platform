/**
 * رلهٔ بازار ایران — Node.js (≥18) بدون هیچ وابستگی خارجی
 *
 * وظیفه: گرفتن قیمت طلا/سکه/ارز از tgju.org و صندوق‌های طلا از fipiran.ir
 * و ارائه به‌صورت JSON ساده به سایت اصلی (Vercel).
 *
 * Env:
 *   PORT          — پورت سرور (پلتفرم هاست ست می‌کند؛ پیش‌فرض 3000)
 *   RELAY_TOKEN   — اگر ست شود، فقط درخواست‌های Bearer <token> جواب می‌گیرند
 *
 * Endpoints:
 *   GET /healthz      → "ok"
 *   GET /market.json  → JSON بازار ایران
 */

import http from "node:http";
import https from "node:https";

const PORT = parseInt(process.env.PORT || "3000", 10);
const TOKEN = process.env.RELAY_TOKEN || "";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Cache ────────────────────────────────────────────────────────────────────
let cache = null; // { data, fetchedAt }

// ─── TGJU Mappings ───────────────────────────────────────────────────────────
// کلیدهای tgju برای طلا و سکه
const TGJU_GOLD = [
  { key: "geram18", faName: "طلای ۱۸ عیار (گرم)" },
  { key: "geram24", faName: "طلای ۲۴ عیار (گرم)" },
  { key: "mesghal", faName: "مثقال طلا" },
  { key: "ounce", faName: "اونس جهانی طلا" },
  { key: "sekee", faName: "سکه امامی" },
  { key: "sekeb", faName: "سکه بهار آزادی" },
  { key: "nim", faName: "نیم‌سکه" },
  { key: "rob", faName: "ربع‌سکه" },
];

// کلیدهای tgju برای ارز
const TGJU_CURRENCY = [
  { key: "price_dollar_rl", faName: "دلار آمریکا" },
  { key: "price_eur", faName: "یورو" },
  { key: "price_gbp", faName: "پوند انگلیس" },
  { key: "price_aed", faName: "درهم امارات" },
  { key: "price_try", faName: "لیر ترکیه" },
  { key: "price_cny", faName: "یوان چین" },
];

// صندوق‌های طلای بزرگ ایران (کد fipiran)
const GOLD_FUNDS = [
  { id: "11143", faName: "صندوق طلای لوتوس" },
  { id: "11365", faName: "صندوق طلای کیان" },
  { id: "11446", faName: "صندوق طلای مفید" },
  { id: "11578", faName: "صندوق طلای زر" },
  { id: "11579", faName: "صندوق طلای عیار" },
  { id: "11580", faName: "صندوق طلای گوهر" },
  { id: "11640", faName: "صندوق طلای آگاه" },
  { id: "11733", faName: "صندوق طلای ویستا" },
];

// ─── HTTP Fetch Helper ───────────────────────────────────────────────────────
function fetchJSON(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error("Invalid JSON"));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// ─── Data Fetchers ───────────────────────────────────────────────────────────

async function fetchGold() {
  try {
    // tgju API for gold/coin prices
    const data = await fetchJSON("https://api.tgju.org/v1/market/indicator/summary-table-data/gold_coin");
    // data.response.indicators is an object keyed by indicator name
    const indicators = data?.response?.indicators || data?.data || {};
    const result = [];
    for (const item of TGJU_GOLD) {
      const ind = indicators[item.key];
      if (!ind) continue;
      // Price is in Rial → convert to Toman
      const priceRial = parseFloat(String(ind.p || ind.price || "0").replace(/,/g, ""));
      const price = Math.round(priceRial / 10);
      // Change percentage
      const change = parseFloat(String(ind.dp || ind.percent || "0").replace(/,/g, "")) || 0;
      result.push({ id: item.key, faName: item.faName, price, unit: "toman", change });
    }
    return result;
  } catch (e) {
    console.error("relay error: fetchGold:", e.message);
    return [];
  }
}

async function fetchCurrency() {
  try {
    const data = await fetchJSON("https://api.tgju.org/v1/market/indicator/summary-table-data/currency");
    const indicators = data?.response?.indicators || data?.data || {};
    const result = [];
    for (const item of TGJU_CURRENCY) {
      const ind = indicators[item.key];
      if (!ind) continue;
      const priceRial = parseFloat(String(ind.p || ind.price || "0").replace(/,/g, ""));
      const price = Math.round(priceRial / 10);
      const change = parseFloat(String(ind.dp || ind.percent || "0").replace(/,/g, "")) || 0;
      result.push({ id: item.key, faName: item.faName, price, unit: "toman", change });
    }
    return result;
  } catch (e) {
    console.error("relay error: fetchCurrency:", e.message);
    return [];
  }
}

async function fetchFunds() {
  try {
    // fipiran mutual fund NAV API
    const data = await fetchJSON("https://fund.fipiran.ir/api/v1/fund/fundcompare");
    if (!Array.isArray(data)) return [];
    const fundIds = new Set(GOLD_FUNDS.map((f) => f.id));
    const nameMap = new Map(GOLD_FUNDS.map((f) => [f.id, f.faName]));
    const result = [];
    for (const fund of data) {
      const regNo = String(fund.regNo || fund.id || "");
      if (!fundIds.has(regNo)) continue;
      const nav = fund.nav || fund.cancelNav || 0;
      const prevNav = fund.previousNav || fund.previousCancelNav || nav;
      const change = prevNav > 0 ? +((nav - prevNav) / prevNav * 100).toFixed(2) : 0;
      result.push({
        id: `fund-${regNo}`,
        faName: nameMap.get(regNo) || fund.name || regNo,
        price: Math.round(nav),
        unit: "toman",
        change,
      });
    }
    return result;
  } catch (e) {
    console.error("relay error: fetchFunds:", e.message);
    return [];
  }
}

// fetchStocks — placeholder for future brsapi.ir integration
async function fetchStocks() {
  // TODO: Requires brsapi.ir API key — separate task
  return [];
}

// ─── Main Data Aggregator ────────────────────────────────────────────────────
async function getMarketData() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL) return cache.data;

  const [gold, currency, funds, stocks] = await Promise.all([
    fetchGold(),
    fetchCurrency(),
    fetchFunds(),
    fetchStocks(),
  ]);

  const data = { gold, currency, funds, stocks, fetchedAt: now };
  cache = { data, fetchedAt: now };
  return data;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Health check — no auth required
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  // Auth check
  if (TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "unauthorized" }));
    }
  }

  // Market data
  if (url.pathname === "/market.json") {
    try {
      const data = await getMarketData();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(data));
    } catch (e) {
      console.error("relay error: handler:", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "internal" }));
    }
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`[relay] Iran market relay running on port ${PORT}`);
  if (TOKEN) console.log("[relay] Token auth enabled");
  else console.log("[relay] WARNING: No RELAY_TOKEN set — open access!");
});
