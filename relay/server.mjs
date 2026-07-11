// ─────────────────────────────────────────────────────────────────────────────
// رلهٔ بازارِ ایران — باید روی هاستِ «داخل ایران» اجرا شود (لیارا/آروان/پارس‌پک).
// چرا: منابعِ ایرانی (tgju، fipiran، …) به IPِ خارجی ۴۰۳ می‌دهند؛ این سرویسِ
// کوچک داده را از داخل می‌کشد و به سایت (روی Vercel) تحویل می‌دهد.
//
// اجرا:  node server.mjs        (Node 18+ ، بدون هیچ وابستگی)
// env:   PORT (پیش‌فرض 3400) · RELAY_TOKEN (اختیاری — اگر ست شود، هدر
//        Authorization: Bearer <token> الزامی می‌شود)
// خروجی: GET /market.json → { gold[], currency[], funds[], stocks[], fetchedAt }
//        GET /healthz     → ok
// هر ردیف: { id, faName, price, unit: "toman"|"usd", change }
// اگر منبعی پاسخ ندهد، بخشِ مربوطه آرایهٔ خالی می‌ماند — هیچ عددِ ساختگی.
// ─────────────────────────────────────────────────────────────────────────────
import http from "node:http";

const PORT = Number(process.env.PORT || 3400);
const TOKEN = process.env.RELAY_TOKEN || "";
const CACHE_MS = 5 * 60 * 1000;

let cache = null; // { body: string, at: number }

// ── tgju: طلا/سکه + ارزِ بازارِ آزاد ────────────────────────────────────────
// ajax.json عمومیِ tgju؛ قیمت‌ها ریال‌اند (جز ons که دلاری است) → تبدیل به تومان.
const TGJU_URLS = ["https://call1.tgju.org/ajax.json", "https://www.tgju.org/ajax.json"];
const TGJU_GOLD = [
  ["geram18", "طلای ۱۸ عیار"],
  ["sekee", "سکهٔ امامی"],
  ["sekeb", "سکهٔ بهار آزادی"],
  ["nim", "نیم‌سکه"],
  ["rob", "ربع‌سکه"],
];
const TGJU_ONS = ["ons", "انس جهانی طلا"]; // USD
const TGJU_CURRENCY = [
  ["price_dollar_rl", "دلار آمریکا"],
  ["price_eur", "یورو"],
  ["price_gbp", "پوند انگلیس"],
  ["price_aed", "درهم امارات"],
  ["price_try", "لیر ترکیه"],
];

function tgjuNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function tgjuChange(item) {
  const dp = Number(item?.dp);
  if (!Number.isFinite(dp)) return null;
  return item?.dt === "low" ? -dp : dp;
}

async function fetchTgju() {
  for (const url of TGJU_URLS) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const json = await res.json();
      const cur = json?.current;
      if (!cur) continue;

      const row = (key, faName, unit) => {
        const item = cur[key];
        const raw = tgjuNum(item?.p);
        if (raw == null) return null;
        // ریال → تومان برای اقلامِ داخلی؛ ons دلاری می‌ماند
        const price = unit === "toman" ? Math.round(raw / 10) : raw;
        return { id: key, faName, price, unit, change: tgjuChange(item) };
      };

      const gold = [
        ...TGJU_GOLD.map(([k, fa]) => row(k, fa, "toman")),
        row(TGJU_ONS[0], TGJU_ONS[1], "usd"),
      ].filter(Boolean);
      const currency = TGJU_CURRENCY.map(([k, fa]) => row(k, fa, "toman")).filter(Boolean);
      return { gold, currency };
    } catch {
      /* try next url */
    }
  }
  return { gold: [], currency: [] };
}

// ── fipiran: صندوق‌های سرمایه‌گذاری (تمرکز: صندوق‌های طلا) ───────────────────
async function fetchFunds() {
  try {
    const res = await fetch("https://fund.fipiran.ir/api/v1/fund/fundcompare", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
    const goldish = items.filter(
      (f) => f?.typeOfInvest === "InGold" || /طلا|سکه/.test(String(f?.name ?? ""))
    );
    goldish.sort((a, b) => (Number(b?.netAsset) || 0) - (Number(a?.netAsset) || 0));
    return goldish.slice(0, 8).flatMap((f) => {
      const nav = Number(f?.navPerUnit ?? f?.issueNav);
      if (!Number.isFinite(nav) || nav <= 0) return [];
      const change = Number(f?.dailyEfficiency);
      return [{
        id: `fund-${f?.regNo ?? f?.name}`,
        faName: String(f?.name ?? "").trim(),
        price: Math.round(nav / 10), // NAV ریال → تومان
        unit: "toman",
        change: Number.isFinite(change) ? change : null,
      }];
    });
  } catch {
    return [];
  }
}

// ── سهام: در نسخهٔ ۱ خالی است (منبعِ پایدارِ نمادها کلیدِ brsapi می‌خواهد؛
//    رجوع به README برای فعال‌سازی). آرایهٔ خالی = حالتِ صادقانه در UI. ──────
async function fetchStocks() {
  return [];
}

async function buildPayload() {
  const [tgju, funds, stocks] = await Promise.all([fetchTgju(), fetchFunds(), fetchStocks()]);
  return JSON.stringify({
    gold: tgju.gold,
    currency: tgju.currency,
    funds,
    stocks,
    fetchedAt: Date.now(),
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
  if (url.pathname !== "/market.json") { res.writeHead(404); return res.end("not found"); }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401); return res.end("unauthorized");
  }

  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      cache = { body: await buildPayload(), at: Date.now() };
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(cache.body);
  } catch (e) {
    console.error("relay error:", e?.message ?? e);
    res.writeHead(502);
    res.end("{}");
  }
});

server.listen(PORT, () => console.log(`ir-market relay on :${PORT}`));
