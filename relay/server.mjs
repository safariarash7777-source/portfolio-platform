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

// User-Agent مرورگر برای همهٔ درخواست‌های خروجی. فایروالِ brsapi (و بعضی
// WAFهای ایرانی) UA پیش‌فرضِ زبان‌ها را می‌بندند و IP را حداقل ۲ ساعت بن
// می‌کنند — پس همیشه UA معتبرِ مرورگر می‌فرستیم.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HDRS = { Accept: "application/json", "User-Agent": BROWSER_UA };

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
      const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(10000) });
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
// دستهٔ فارسیِ صندوق از روی typeOfInvest/fundType/نام (دفاعی؛ ناشناخته → «سایر»).
function fundTypeFa(f) {
  const t = String(f?.typeOfInvest ?? f?.fundType ?? "").toLowerCase();
  const n = String(f?.name ?? "");
  if (t.includes("gold") || /طلا|سکه|نقره/.test(n)) return /نقره/.test(n) ? "نقره" : "طلا";
  if (/اهرم/.test(n)) return "اهرمی";
  if (/شاخص/.test(n)) return "شاخصی";
  if (/املاک|مستغلات/.test(n)) return "املاک";
  if (t.includes("fixed") || /درآمد ثابت/.test(n)) return "درآمد ثابت";
  if (t.includes("mixed") || /مختلط/.test(n)) return "مختلط";
  if (t.includes("stock") || t.includes("equity") || /سهام/.test(n)) return "سهامی";
  if (/کالا/.test(n)) return "کالایی";
  if (/بخش/.test(n)) return "بخشی";
  return "سایر";
}

// صندوق‌ها از fipiran (fundcompare). خروجی غنی‌شده برای «دیده‌بان صندوق‌ها»:
// price(NAV تومان)، change(بازده روز ٪)، type(دستهٔ فا)، assetB(خالص دارایی، میلیارد تومان).
// netAsset ریال → میلیارد تومان = /1e10. تا ۴۰ صندوقِ بزرگ (بر اساس دارایی) از همهٔ انواع.
async function fetchFunds() {
  try {
    const res = await fetch("https://fund.fipiran.ir/api/v1/fund/fundcompare", {
      headers: HDRS,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
    return items
      .map((f) => {
        const nav = Number(f?.navPerUnit ?? f?.issueNav);
        const net = Number(f?.netAsset);
        if (!Number.isFinite(nav) || nav <= 0) return null;
        const change = Number(f?.dailyEfficiency);
        return {
          id: `fund-${f?.regNo ?? f?.name}`,
          faName: String(f?.name ?? "").trim(),
          type: fundTypeFa(f),
          price: Math.round(nav / 10),                       // NAV ریال → تومان
          unit: "toman",
          change: Number.isFinite(change) ? change : null,
          assetB: Number.isFinite(net) && net > 0 ? Math.round(net / 1e10) : null, // میلیارد تومان
        };
      })
      .filter((f) => f && f.faName)
      .sort((a, b) => (b.assetB ?? 0) - (a.assetB ?? 0))
      .slice(0, 40);
  } catch {
    return [];
  }
}

// ── سهام (بورس تهران) از brsapi.ir — فقط وقتی هر دو env ست باشند فعال است ──
// BRSAPI_KEY        = کلیدِ وب‌سرویس (فقط env؛ هرگز در کد/ریپو نوشته نشود)
// BRSAPI_STOCKS_URL = آدرسِ endpoint بورس، عیناً از مستندات/نمونه‌کدِ خودِ
//                     brsapi.ir کپی شود (بدون key؛ اینجا اضافه می‌شود).
// چرا URL از env؟ فایروالِ brsapi درخواستِ غلط/حدسی را با بنِ ≥۲ساعتهٔ IP
// جواب می‌دهد؛ پس endpoint را حدس نمی‌زنیم — از مستندات کپی می‌شود.
// پارسر عمداً تحمل‌پذیر است (نام‌گذاری‌های رایجِ tsetmc-محور: l18/l30، pl/plp،
// pc/pcp، last/close/changePercent…). قیمت ریال → تومان.
const BRSAPI_KEY = process.env.BRSAPI_KEY || "";
const BRSAPI_STOCKS_URL = process.env.BRSAPI_STOCKS_URL || "";
const STOCKS_MAX = 10;

function pickNum(o, keys, { allowZero = false } = {}) {
  for (const k of keys) {
    if (o?.[k] == null || o[k] === "") continue;
    const n = Number(String(o[k]).replace(/,/g, ""));
    if (Number.isFinite(n) && (allowZero || n !== 0)) return n;
  }
  return null;
}
function pickStr(o, keys) {
  for (const k of keys) {
    const s = String(o?.[k] ?? "").trim();
    if (s) return s;
  }
  return "";
}

async function fetchStocks() {
  if (!BRSAPI_KEY || !BRSAPI_STOCKS_URL) return [];
  try {
    const sep = BRSAPI_STOCKS_URL.includes("?") ? "&" : "?";
    const res = await fetch(`${BRSAPI_STOCKS_URL}${sep}key=${encodeURIComponent(BRSAPI_KEY)}`, {
      headers: HDRS, // UA مرورگر — الزامِ فایروالِ brsapi
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`brsapi stocks: HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    const list = Array.isArray(json) ? json
      : Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.items) ? json.items
      : Array.isArray(json?.result) ? json.result
      : [];
    return list.slice(0, STOCKS_MAX * 3).flatMap((s) => {
      const name = pickStr(s, ["l18", "symbol", "namad", "name", "l30"]);
      const priceRial = pickNum(s, ["pl", "pc", "last", "close", "price", "p"]);
      if (!name || priceRial == null || priceRial <= 0) return [];
      const change = pickNum(s, ["plp", "pcp", "changePercent", "change_percent", "dp"], { allowZero: true });
      return [{
        id: `stock-${pickStr(s, ["l18", "symbol", "insCode", "name"]) || name}`,
        faName: name,
        price: Math.round(priceRial / 10), // ریال → تومان
        unit: "toman",
        change: change,
      }];
    }).slice(0, STOCKS_MAX);
  } catch (e) {
    console.error("brsapi stocks error:", e?.message ?? e);
    return [];
  }
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
