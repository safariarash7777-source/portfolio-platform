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
import { codalTest, codalRawExcel, codalDebugDump, CODAL_INTERVAL_MS, fetchAnnouncementsPage } from "./codal.mjs";
import { runEngineCycle, engineStatus } from "./codal-engine.mjs";
import { runArchiveCycle, archiveStatus } from "./codal-archive.mjs";
import { fetchOptions, optionsStatus } from "./options.mjs";
import { runCandleBackfill, candleStatus } from "./candle-backfill.mjs";
import { pushDailyBreadth, breadthStatus } from "./breadth.mjs";
// T5 — سرویس‌های تکمیلی BrsApi
import { getSymbolDetail, symbolDetailStatus, refreshSymbolDetailsRotation, symbolRotationStatus } from "./symbol-detail.mjs";
import { refreshCertificates, certificatesForPayload, pushCertEod, runPhysicalDaily, imeStatus } from "./ime.mjs";
import { refreshCommodities, commoditiesForPayload, commodityStatus } from "./commodity.mjs";
// C1 — قرنطینهٔ زیرنمادها و فهرست سیاه NAV (اخطار رسمی BrsApi)
import { isSubTicker, isRightsIssue } from "./symbols-util.mjs";
import { isNavBlacklisted, recordNavResult, loadNavBlacklist, saveNavBlacklist, navBlacklistStatus } from "./nav-blacklist.mjs";

const PORT = Number(process.env.PORT || 3400);
const TOKEN = process.env.RELAY_TOKEN || "";
const BRSAPI_KEY = process.env.BRSAPI_KEY || "";
// آدرس پایهٔ BrsApi — قابل تغییر با env بدون deploy مجدد کد (اطلاعیهٔ تغییر لینک ۱۴۰۵/۰۲/۰۵).
const BRSAPI_BASE = (process.env.BRSAPI_BASE || "https://Api.BrsApi.ir").replace(/\/+$/, "");
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

// انتشار به Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// User-Agent مرورگر — فایروال BrsApi UA غیرمرورگر را بن می‌کند (حداقل ۲ ساعت).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HDRS = { Accept: "application/json", "User-Agent": BROWSER_UA };

let cache = null; // { body: string, at: number }
// T5-2 — کش ۱۰دقیقه‌ای فهرست اطلاعیه‌های کدال (هر نماد یک entry)
const codalListCache = new Map(); // symbol → { body, at }
// فهرست نمادهای آخرین اسنپ‌شات (سهام+صندوق) — ورودی صف بک‌فیل کندل (M8-الف).
let latestSnapshotSymbols = [];

// وضعیتِ تشخیصی — برای /debug. هیچ سکرتی اینجا نیست.
const status = {
  lastRefresh: 0,
  lastError: null,
  sources: {
    brsapi_gold_currency: { ok: false, gold: 0, currency: 0, error: null },
    brsapi_stocks: { ok: false, funds: 0, stocks: 0, error: null },
    brsapi_index: { ok: false, error: null },
    brsapi_nav: { ok: false, mode: null, cached: 0, updated: 0, failed: 0, error: null },
    brsapi_fund_meta: { ok: false, cached: 0, updated: 0, failed: 0, error: null },
  },
  supabase: { enabled: false, ok: false, status: null, at: 0, error: null },
};

const errMsg = (e) => (e && e.name === "TimeoutError" ? "timeout" : e?.message ?? String(e));

// ردیابیِ گذارِ «خطا → سالم» برای لاگِ بازیابی (بدونِ شلوغ‌کردنِ لاگ در حالت پایدار).
const wasFailing = { stocks: false, push: false };
function recoveredFrom(k) {
  const r = wasFailing[k];
  wasFailing[k] = false;
  return r;
}

// ── BrsApi: طلا/سکه + ارز + کریپتو ──────────────────────────────────────────
async function fetchGoldCurrency() {
  if (!BRSAPI_KEY) {
    status.sources.brsapi_gold_currency = { ok: false, gold: 0, currency: 0, error: "BRSAPI_KEY ست نشده" };
    return { gold: [], currency: [], crypto: [] };
  }
  const url = `${BRSAPI_BASE}/Market/Gold_Currency.php?key=${BRSAPI_KEY}`;
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
  const url = `${BRSAPI_BASE}/Tsetmc/AllSymbols.php?key=${BRSAPI_KEY}&type=1`;
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

      // M7 — فیلدهای best-effort: سقف/کف روز و تعداد معامله‌گران حقیقی.
      // نام فیلد در پاسخ BrsApi ممکن است سبک tsetmc (pmax/pmin) یا سبک مستندات (PriceMax/PriceMin) باشد؛
      // هر دو چک می‌شود. اگر هیچ‌کدام نبود، کلید در payload درج نمی‌شود — هیچ عدد ساختگی.
      const dayHighRial = Number(item.pmax ?? item.PriceMax ?? item.tmax);
      const dayLowRial = Number(item.pmin ?? item.PriceMin ?? item.tmin);
      if (isFinite(dayHighRial) && dayHighRial > 0) row.dayHigh = Math.round(dayHighRial / 10);
      if (isFinite(dayLowRial) && dayLowRial > 0) row.dayLow = Math.round(dayLowRial / 10);
      const buyCountI = Number(item.Buy_CountI ?? item.Buy_I_Count);
      const sellCountI = Number(item.Sell_CountI ?? item.Sell_I_Count);
      if (isFinite(buyCountI) && buyCountI > 0) row.buyCountI = buyCountI;
      if (isFinite(sellCountI) && sellCountI > 0) row.sellCountI = sellCountI;

      // داشبورد «امروز بازار» — فیلدهای تشخیص صف (best-effort، مستند brsapi.ir):
      // tmin/tmax = آستانهٔ مجاز دامنه؛ pd1/qd1 = قیمت/حجم بهترین تقاضا؛ po1/qo1 = بهترین عرضه.
      // قیمت‌ها ریال → تومان (همان قاعدهٔ موجود). غایب → کلید درج نمی‌شود — هیچ عدد ساختگی.
      const bandLow = Number(item.tmin);
      const bandHigh = Number(item.tmax);
      if (isFinite(bandHigh) && bandHigh > 0) row.bandHigh = Math.round(bandHigh / 10);
      if (isFinite(bandLow) && bandLow > 0) row.bandLow = Math.round(bandLow / 10);
      const bidP = Number(item.pd1), bidQ = Number(item.qd1);
      const askP = Number(item.po1), askQ = Number(item.qo1);
      if (isFinite(bidP) && bidP > 0) row.bestBidPrice = Math.round(bidP / 10);
      if (isFinite(bidQ) && bidQ >= 0) row.bestBidVolume = bidQ;
      if (isFinite(askP) && askP > 0) row.bestAskPrice = Math.round(askP / 10);
      if (isFinite(askQ) && askQ >= 0) row.bestAskVolume = askQ;

      // C1 — فیلتر در مبدأ ingest: زیرنماد رقم‌دار (فملی2، آوند4، …) اصلاً وارد
      // خروجی stocks/funds نمی‌شود (نه اسنپ‌شات، نه UI، نه هیچ صفی).
      if (isSubTicker(row.id)) continue;

      // cs_id === 68 → صندوق ETF — حق تقدم هرگز صندوق نیست؛ حق‌تقدم‌ها فقط
      // در تابلوی لحظه‌ای سهام می‌مانند (تصمیم C1).
      if (Number(item.cs_id) === 68 && !isRightsIssue(row.id)) {
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
    // لاگِ موفقیت — فقط در گذار «خطا → سالم» تا لاگ شلوغ نشود.
    if (recoveredFrom("stocks")) console.log(`brsapi stocks/funds recovered: ${stocks.length} stocks, ${funds.length} funds`);
    return { funds, stocks };
  } catch (e) {
    const err = errMsg(e);
    status.sources.brsapi_stocks = { ok: false, funds: 0, stocks: 0, error: err };
    wasFailing.stocks = true;
    console.error("brsapi stocks/funds error:", err);
    return { funds: [], stocks: [] };
  }
}

// ── BrsApi: NAV صندوق‌ها (Tsetmc/Nav.php — صدور psubtran / ابطال predtran، ریال) ──
// مستندات BrsApi این endpoint را «تک‌نمادی» تعریف کرده (پارامتر l18)؛ برای رعایت
// سهمیهٔ روزانهٔ کلید (۱۰هزار درخواست) NAV هر NAV_REFRESH_MS یک‌بار و فقط برای
// NAV_TOP صندوقِ پرمعامله تازه می‌شود و بین دورها کشِ نمادی می‌ماند.
// در شروعِ هر دور یک‌بار حالتِ bulk (بدون l18) امتحان می‌شود؛ اگر آرایهٔ چندنماده
// برگردد از همان استفاده می‌کنیم (یک درخواست به‌جای صدها).
const NAV_REFRESH_MS = 60 * 60 * 1000; // هر ساعت
const NAV_TOP = 150;                   // سقف صندوق‌ها در حالت تک‌نمادی
const NAV_CONCURRENCY = 4;
const NAV_STALE_MS = 24 * 60 * 60 * 1000; // NAV کهنه‌تر از یک روز منتشر نمی‌شود
const navCache = new Map(); // l18 → { nav, navIssue, navDate, navTime, at } (ریال)
let lastNavRound = 0;
let navBulkMode = null; // null = هنوز نامشخص

function cacheNavRow(l18, d, now) {
  const nav = Number(d?.predtran);
  if (!l18 || !isFinite(nav) || nav <= 0) return false;
  navCache.set(l18, {
    nav,
    navIssue: Number(d.psubtran) > 0 ? Number(d.psubtran) : null,
    navDate: typeof d.date === "string" ? d.date : null,
    navTime: typeof d.time === "string" ? d.time : null,
    at: now,
  });
  return true;
}

async function refreshNavs(funds) {
  if (!BRSAPI_KEY || funds.length === 0) return;
  if (Date.now() - lastNavRound < NAV_REFRESH_MS) return;
  lastNavRound = Date.now(); // اول ست می‌شود تا دورِ موازی شروع نشود
  const base = `${BRSAPI_BASE}/Tsetmc/Nav.php?key=${BRSAPI_KEY}`;

  // ۱) تلاش bulk
  if (navBulkMode !== false) {
    try {
      const res = await fetch(base, { headers: HDRS, signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 1 && json[0] && json[0].l18) {
          navBulkMode = true;
          const now = Date.now();
          let updated = 0;
          for (const it of json) if (cacheNavRow(it.l18, it, now)) updated++;
          status.sources.brsapi_nav = { ok: updated > 0, mode: "bulk", cached: navCache.size, updated, failed: 0, error: null };
          return;
        }
      }
      navBulkMode = false;
    } catch {
      navBulkMode = false;
    }
  }

  // ۲) تک‌نمادی برای پرمعامله‌ترین‌ها
  // C1 — قبل از صف‌کردن: زیرنماد، حق تقدم و بلک‌لیست دائمی NAV حذف می‌شوند.
  const top = funds
    .filter((f) => !isSubTicker(f.id) && !isRightsIssue(f.id) && !isNavBlacklisted(f.id))
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, NAV_TOP);
  let updated = 0;
  let failed = 0;
  const queue = [...top];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      if (!f) return;
      try {
        const res = await fetch(`${base}&l18=${encodeURIComponent(f.id)}`, {
          headers: HDRS,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) { failed++; recordNavResult(f.id, false); continue; }
        const j = await res.json();
        const d = Array.isArray(j) ? j[0] : j;
        if (cacheNavRow(f.id, d, Date.now())) { updated++; recordNavResult(f.id, true); }
        else { failed++; recordNavResult(f.id, false); }
      } catch {
        failed++;
        // خطای شبکه/timeout تقصیر نماد نیست — در بلک‌لیست ثبت نمی‌شود.
      }
    }
  }
  await Promise.all(Array.from({ length: NAV_CONCURRENCY }, worker));
  status.sources.brsapi_nav = {
    ok: updated > 0,
    mode: "per-symbol",
    cached: navCache.size,
    updated,
    failed,
    error: updated === 0 && top.length > 0 ? "no nav fetched" : null,
  };
  // C1 — ذخیرهٔ دائمی بلک‌لیست بعد از هر دور
  saveNavBlacklist({ supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""), serviceKey: SUPABASE_SERVICE_ROLE_KEY }).catch(() => {});
}

// T5-3 — دور تکمیلی NAV: ۲ بار در روز فقط برای صندوق‌هایی که NAV ندارند
// (خارج از NAV_TOP پرمعامله). هدف: پوشش حباب از ~۱۵۰ به کل صندوق‌ها (~۳۹۰).
// اگر حالت bulk فعال باشد همه را یک‌جا می‌گیرد و این دور لازم نیست.
// بودجه: حداکثر NAV_COMPLETION_CAP درخواست در هر دور × ۲ دور/روز ≤ ۸۰۰/روز.
const NAV_COMPLETION_MS = 12 * 60 * 60 * 1000; // هر ۱۲ ساعت
const NAV_COMPLETION_CAP = 400;
let lastCompletionRound = 0;
let navCompletionState = { lastRoundAt: null, targeted: 0, updated: 0, failed: 0, skipped: null };

async function refreshNavCompletion(funds) {
  if (!BRSAPI_KEY || funds.length === 0) return;
  if (navBulkMode === true) { navCompletionState.skipped = "bulk mode covers all funds"; return; }
  if (Date.now() - lastCompletionRound < NAV_COMPLETION_MS) return;
  lastCompletionRound = Date.now();
  const now = Date.now();
  // فقط صندوق‌هایی که NAV تازه ندارند (خارج از کش یا کهنه)
  // C1 — زیرنماد، حق تقدم و بلک‌لیست دائمی هرگز وارد دور تکمیلی نمی‌شوند
  // (ریشهٔ اخطار BrsApi: ریکوئست NAV برای نمادهای فاقد NAV مثل آوند4).
  const missing = funds
    .filter((f) => !isSubTicker(f.id) && !isRightsIssue(f.id) && !isNavBlacklisted(f.id))
    .filter((f) => { const c = navCache.get(f.id); return !c || now - c.at > NAV_STALE_MS; })
    .slice(0, NAV_COMPLETION_CAP);
  navCompletionState = { lastRoundAt: now, targeted: missing.length, updated: 0, failed: 0, skipped: null };
  if (missing.length === 0) return;
  const base = `${BRSAPI_BASE}/Tsetmc/Nav.php?key=${BRSAPI_KEY}`;
  const queue = [...missing];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      if (!f) return;
      try {
        const res = await fetch(`${base}&l18=${encodeURIComponent(f.id)}`, { headers: HDRS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) { navCompletionState.failed++; recordNavResult(f.id, false); continue; }
        const j = await res.json();
        const d = Array.isArray(j) ? j[0] : j;
        if (cacheNavRow(f.id, d, Date.now())) { navCompletionState.updated++; recordNavResult(f.id, true); }
        else { navCompletionState.failed++; recordNavResult(f.id, false); }
      } catch {
        navCompletionState.failed++;
        // خطای شبکه — در بلک‌لیست ثبت نمی‌شود.
      }
    }
  }
  await Promise.all(Array.from({ length: NAV_CONCURRENCY }, worker));
  // C1 — ذخیرهٔ دائمی بلک‌لیست بعد از دور تکمیلی
  saveNavBlacklist({ supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""), serviceKey: SUPABASE_SERVICE_ROLE_KEY }).catch(() => {});
}

// NAV کش‌شده را روی ردیف‌های صندوق سوار می‌کند (ریال → تومان) + حباب.
// نگهبان: اگر نسبت قیمت/NAV خارج از بازهٔ منطقی بود (ناهماهنگیِ واحد یا دادهٔ
// خراب)، هیچ NAV/حبابی منتشر نمی‌شود — عدد مشکوک بهتر است غایب باشد.
function applyNav(funds) {
  const now = Date.now();
  for (const f of funds) {
    const c = navCache.get(f.id);
    if (!c || now - c.at > NAV_STALE_MS) continue;
    const navToman = c.nav / 10;
    if (navToman <= 0 || !isFinite(navToman)) continue;
    const ratio = f.price / navToman;
    if (ratio < 0.5 || ratio > 2) continue;
    f.nav = Math.round(navToman);
    f.navIssue = c.navIssue ? Math.round(c.navIssue / 10) : null;
    f.navDate = c.navDate;
    f.navTime = c.navTime;
    f.bubblePercent = Number((((f.price - navToman) / navToman) * 100).toFixed(2));
  }
}

// ── BrsApi: نوع صندوق از دیتای جامع نماد (Tsetmc/Symbol.php → cs_sub) ────────
// نوع صندوق (زیرگروه صنعت) تقریباً ثابت است؛ یک‌بار برای هر صندوق گرفته و
// هفته‌ای یک‌بار تازه می‌شود. در هر دورِ ساعتی حداکثر META_BATCH درخواست —
// بعد از چند ساعت همهٔ صندوق‌ها برچسبِ نوعِ منبع را دارند (بدون هیچ نگاشتِ حدسی).
const META_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // هفتگی
const META_ROUND_MS = 60 * 60 * 1000;            // هر ساعت یک دسته
const META_BATCH = 50;
const META_CONCURRENCY = 4;
const fundMetaCache = new Map(); // l18 → { type, at }
let lastMetaRound = 0;

async function refreshFundMeta(funds) {
  if (!BRSAPI_KEY || funds.length === 0) return;
  if (Date.now() - lastMetaRound < META_ROUND_MS) return;
  lastMetaRound = Date.now();
  const now = Date.now();
  const pending = funds
    .filter((f) => {
      const c = fundMetaCache.get(f.id);
      return !c || now - c.at > META_REFRESH_MS;
    })
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, META_BATCH);
  if (pending.length === 0) return;

  let updated = 0;
  let failed = 0;
  const queue = [...pending];
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      if (!f) return;
      try {
        const res = await fetch(
          `${BRSAPI_BASE}/Tsetmc/Symbol.php?key=${BRSAPI_KEY}&l18=${encodeURIComponent(f.id)}`,
          { headers: HDRS, signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) { failed++; continue; }
        const j = await res.json();
        const d = Array.isArray(j) ? j[0] : j;
        const type = typeof d?.cs_sub === "string" && d.cs_sub.trim() ? d.cs_sub.trim() : null;
        if (type) {
          fundMetaCache.set(f.id, { type, at: Date.now() });
          updated++;
        } else {
          // پاسخ بدون cs_sub → دوبارهٔ زودهنگام نخواهیم؛ برچسبِ خالی ثبت می‌شود
          fundMetaCache.set(f.id, { type: null, at: Date.now() });
          failed++;
        }
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: META_CONCURRENCY }, worker));
  status.sources.brsapi_fund_meta = {
    ok: updated > 0,
    cached: fundMetaCache.size,
    updated,
    failed,
    error: updated === 0 && pending.length > 0 ? "no meta fetched" : null,
  };
}

function applyFundTypes(funds) {
  for (const f of funds) {
    const c = fundMetaCache.get(f.id);
    if (c?.type) f.type = c.type;
  }
}

// ── BrsApi: شاخص بورس ────────────────────────────────────────────────────────
async function fetchIndex() {
  if (!BRSAPI_KEY) {
    status.sources.brsapi_index = { ok: false, error: "BRSAPI_KEY ست نشده" };
    return null;
  }
  const url = `${BRSAPI_BASE}/Tsetmc/Index.php?key=${BRSAPI_KEY}&type=1`;
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
  const [gc, sf, indices, options] = await Promise.all([
    fetchGoldCurrency(),
    fetchStocksAndFunds(),
    fetchIndex(),
    // M8-ب: تابلوی آپشن — یک درخواست در هر چرخه (~۲۸۸/روز)
    fetchOptions(BRSAPI_BASE, BRSAPI_KEY),
  ]);
  // دورهای NAV و نوعِ صندوق در پس‌زمینه (ساعتی؛ درونشان سهمیه‌بندی شده) —
  // payload فعلی از کشِ موجود پر می‌شود و دورِ بعدی نتیجهٔ تازه را برمی‌دارد.
  refreshNavs(sf.funds).catch((e) => console.error("nav refresh error:", errMsg(e)));
  // T5-3 — دور تکمیلی NAV برای صندوق‌های فاقد NAV (۲ بار در روز)
  refreshNavCompletion(sf.funds).catch((e) => console.error("nav completion error:", errMsg(e)));
  refreshFundMeta(sf.funds).catch((e) => console.error("fund meta error:", errMsg(e)));
  // T5-4/6 — گواهی کالایی (هر ۳۰ دقیقه در ساعات بازار) و کامودیتی جهانی (کلید جدا)
  refreshCertificates({ base: BRSAPI_BASE, key: BRSAPI_KEY, headers: HDRS }).catch((e) => console.error("ime cert error:", errMsg(e)));
  refreshCommodities(HDRS).catch((e) => console.error("commodity error:", errMsg(e)));
  applyNav(sf.funds);
  applyFundTypes(sf.funds);
  const payload = {
    gold: gc.gold,
    currency: gc.currency,
    crypto: gc.crypto,
    funds: sf.funds,
    stocks: sf.stocks,
    options,
    imeCertificates: certificatesForPayload(), // T5-4 — گواهی سپردهٔ کالایی (تومان)
    commodities: commoditiesForPayload(),      // T5-6 — کامودیتی جهانی (دلار، کلید جدا)
    indices,
    fetchedAt: Date.now(),
  };
  // صف بک‌فیل کندل (M8-الف) از همین فهرست نمادهای زنده تغذیه می‌شود.
  latestSnapshotSymbols = [...sf.stocks, ...sf.funds];
  return JSON.stringify(payload);
}

// ── Push به Supabase ──────────────────────────────────────────────────────────
// شبکهٔ بین‌المللِ هاستِ داخل ایران گاهی ناپایدار است (قطعی/کندی)؛ push تا
// PUSH_RETRIES بار با فاصلهٔ فزاینده تکرار می‌شود تا اسنپ‌شات از دست نرود.
const PUSH_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pushToSupabase(body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    status.supabase = { enabled: false, ok: false, status: null, at: 0, error: null };
    return;
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= PUSH_RETRIES; attempt++) {
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
      if (res.ok) {
        if (recoveredFrom("push") || attempt > 1) console.log(`supabase push ok (attempt ${attempt})`);
        return;
      }
      lastErr = `HTTP ${res.status}`;
      // خطای 4xx تکرار نمی‌شود — مشکل از درخواست است نه شبکه.
      if (res.status >= 400 && res.status < 500) break;
    } catch (e) {
      lastErr = errMsg(e);
    }
    if (attempt < PUSH_RETRIES) await sleep(2000 * attempt);
  }
  status.supabase = { enabled: true, ok: false, status: null, at: Date.now(), error: lastErr };
  wasFailing.push = true;
  console.error("supabase push error:", lastErr);
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
      pruneHistory(); // نگهداشت ۱۸۰ روز — تصمیم T8
    } else {
      console.error(`history push: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("history push error:", errMsg(e));
  }
}

// ── نگهداشت ir_market_history — حذف ردیف‌های کهنه‌تر از ۱۸۰ روز (روزی یک‌بار) ──
const HISTORY_RETENTION_DAYS = Number(process.env.HISTORY_RETENTION_DAYS || 180);
let lastHistoryPrune = 0;
let pruneStatus = { lastRun: null, error: null };
async function pruneHistory() {
  if (Date.now() - lastHistoryPrune < 24 * 3600 * 1000) return;
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/ir_market_history?captured_at=lt.${encodeURIComponent(cutoff)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (res.ok) {
      lastHistoryPrune = Date.now();
      pruneStatus = { lastRun: new Date().toISOString(), error: null };
      console.log(`history prune ok (retention ${HISTORY_RETENTION_DAYS}d)`);
    } else {
      pruneStatus = { lastRun: null, error: `HTTP ${res.status}` };
      console.error(`history prune: HTTP ${res.status}`);
    }
  } catch (e) {
    pruneStatus = { lastRun: null, error: errMsg(e) };
    console.error("history prune error:", errMsg(e));
  }
}

// ── تاریخچهٔ روزانهٔ نمادها (symbol_history، append-only، روزی یک‌بار بعد از بستن بازار) ──
// منبع: اسنپ‌شات جاری. قیمت‌های اسنپ‌شات تومان است → ×۱۰ ریال تا با بک‌فیل (ریال)
// یکدست بماند. صداقت داده: اسنپ‌شات فقط حجم حقیقی/حقوقی دارد (نه ارزش)، پس
// ستون‌های ارزش null می‌ماند و حجم‌ها در raw ثبت می‌شود. OHLC هم نیست → null.
const EOD_AFTER_HOUR = Number(process.env.EOD_AFTER_HOUR || 14); // ساعت تهران
let eodStatus = { lastRun: null, lastDate: null, rows: 0, skipped: null, error: null };

function tehranNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), weekday: get("weekday") };
}

async function pushDailyHistory(body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const t = tehranNow();
  // فقط بعد از بسته‌شدن بازار و فقط روزهای معاملاتی (شنبه–چهارشنبه)
  if (t.hour < EOD_AFTER_HOUR) return;
  if (t.weekday === "Thu" || t.weekday === "Fri") return;
  if (eodStatus.lastDate === t.date) return; // امروز نوشته شده
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const H = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  try {
    // دفع تکرار بعد از ری‌دیپلوی: اگر برای امروز ردیف relay_eod هست، رد شو
    const chk = await fetch(
      `${base}/rest/v1/symbol_history?select=id&trade_date=eq.${t.date}&source=eq.relay_eod&limit=1`,
      { headers: H, signal: AbortSignal.timeout(10000) },
    );
    if (chk.ok) {
      const ex = await chk.json();
      if (Array.isArray(ex) && ex.length > 0) {
        eodStatus = { ...eodStatus, lastDate: t.date, skipped: "already written today" };
        return;
      }
    }
    const p = typeof body === "string" ? JSON.parse(body) : body;
    const all = [...(p.stocks || []), ...(p.funds || [])];
    const rows = [];
    for (const r of all) {
      if (!r?.id || !(Number(r.value) > 0)) continue; // فقط نمادهای معامله‌شدهٔ امروز
      // C1 — زیرنماد و حق تقدم هرگز وارد symbol_history نمی‌شوند.
      if (isSubTicker(r.id) || isRightsIssue(r.id)) continue;
      const raw = {
        eod: true,
        buy_i_vol: Number(r.buyI) || null,
        sell_i_vol: Number(r.sellI) || null,
        buy_n_vol: Number(r.buyN) || null,
        sell_n_vol: Number(r.sellN) || null,
        change_percent: typeof r.changePercent === "number" ? r.changePercent : null,
      };
      if (Number(r.nav) > 0) raw.nav_toman = Number(r.nav);
      if (typeof r.bubblePercent === "number") raw.bubble_percent = r.bubblePercent;
      rows.push({
        symbol: r.id,
        trade_date: t.date,
        close: r.closingPrice > 0 ? r.closingPrice * 10 : null, // تومان → ریال
        last_price: r.price > 0 ? r.price * 10 : null,
        volume: Number(r.volume) || null,
        value_traded: Number(r.value) || null,
        raw,
        source: "relay_eod",
      });
    }
    if (rows.length === 0) {
      eodStatus = { ...eodStatus, skipped: `no traded rows ${t.date}` };
      return;
    }
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await fetch(`${base}/rest/v1/symbol_history`, {
        method: "POST",
        headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify(rows.slice(i, i + 500)),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} @batch ${i}`);
      inserted += Math.min(500, rows.length - i);
    }
    eodStatus = { lastRun: Date.now(), lastDate: t.date, rows: inserted, skipped: null, error: null };
    console.log(`eod history ok: ${inserted} rows for ${t.date}`);
  } catch (e) {
    eodStatus = { ...eodStatus, error: errMsg(e) };
    console.error("eod history error:", eodStatus.error);
  }
}

// ── نرخ دلار روزانه (fx_rates، append-only، روزی یک‌بار بعد از ساعت بازار) — T6 ──
// منبع: ردیف USD بخش currency اسنپ‌شات (تومان). درج فقط وقتی نرخ معتبر هست.
// جدول append-only است — روزی یک ردیف؛ تکرار (409 به دلیل unique rate_date) بی‌خطر رد می‌شود.
let fxStatus = { lastDate: null, lastRate: null, error: null };
async function pushDailyFx(body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const t = tehranNow();
  if (t.hour < EOD_AFTER_HOUR) return; // بعد از ساعت بازار — نرخ پایان روز
  if (fxStatus.lastDate === t.date) return;
  const p = typeof body === "string" ? JSON.parse(body) : body;
  const usd = (p.currency || []).find((r) => r?.id === "USD");
  const rate = Number(usd?.price);
  if (!isFinite(rate) || rate <= 0) return; // نرخ نامعتبر → هیچ درجی
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/fx_rates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{ rate_date: t.date, usd_toman: rate, source: "brsapi" }]),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok || res.status === 409) {
      // 409 = امروز قبلاً درج شده (مثلاً بعد از ری‌دیپلوی) — هدف محقق است.
      fxStatus = { lastDate: t.date, lastRate: rate, error: null };
      if (res.ok) console.log(`fx push ok: ${rate} toman for ${t.date}`);
    } else if (res.status === 404) {
      // جدول هنوز ساخته نشده (phase13 اجرا نشده) — بی‌صدا ولی در /debug پیداست.
      fxStatus = { ...fxStatus, error: "fx_rates table missing (run phase13)" };
    } else {
      fxStatus = { ...fxStatus, error: `HTTP ${res.status}` };
      console.error(`fx push: HTTP ${res.status}`);
    }
  } catch (e) {
    fxStatus = { ...fxStatus, error: errMsg(e) };
    console.error("fx push error:", fxStatus.error);
  }
}

// ── تاریخچهٔ روزانهٔ شاخص (M5 رصد بازار) ─────────────────────────────────────────────
// روزی یک ردیف EOD از بخش indices اسنپ‌شات (شاخص کل/هم‌وزن + ارزش/حجم بازار).
// کلید dedup: jdate unique (تاریخ جلالی خود منبع) — روز تعطیل درج نمی‌شود چون
// indices.date همان آخرین روز معاملاتی می‌ماند و یونیک رد می‌کند (409 بی‌خطر).
let indexHistStatus = { lastJdate: null, error: null };
async function pushDailyIndex(body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const t = tehranNow();
  if (t.hour < EOD_AFTER_HOUR) return; // پس از ساعت بازار — رقم پایان روز
  const p = typeof body === "string" ? JSON.parse(body) : body;
  const ix = p.indices;
  const jdate = ix?.date ? String(ix.date).trim() : null;
  if (!jdate || !isFinite(Number(ix.total)) || Number(ix.total) <= 0) return; // بدون دادهٔ معتبر → هیچ درجی
  if (indexHistStatus.lastJdate === jdate) return; // همین روز قبلاً درج شد
  const row = {
    jdate,
    total_index: Number(ix.total),
    total_change: isFinite(Number(ix.totalChange)) ? Number(ix.totalChange) : null,
    equal_weight_index: Number(ix.equalWeight) > 0 ? Number(ix.equalWeight) : null,
    equal_weight_change: isFinite(Number(ix.equalWeightChange)) ? Number(ix.equalWeightChange) : null,
    market_value: Number(ix.marketValue) > 0 ? Number(ix.marketValue) : null,
    trade_value: Number(ix.value) > 0 ? Number(ix.value) : null,
    trade_volume: Number(ix.volume) > 0 ? Number(ix.volume) : null,
    trades: Number(ix.trades) > 0 ? Number(ix.trades) : null,
    source: "relay_eod",
  };
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/index_history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok || res.status === 409) {
      // 409 = این روز قبلاً درج شده (مثلاً پس از ری‌دیپلوی یا روز تعطیل) — هدف محقق است.
      indexHistStatus = { lastJdate: jdate, error: null };
      if (res.ok) console.log(`index history push ok: ${jdate} total=${row.total_index}`);
    } else if (res.status === 404) {
      indexHistStatus = { ...indexHistStatus, error: "index_history table missing (run phase14)" };
    } else {
      indexHistStatus = { ...indexHistStatus, error: `HTTP ${res.status}` };
      console.error(`index history push: HTTP ${res.status}`);
    }
  } catch (e) {
    indexHistStatus = { ...indexHistStatus, error: errMsg(e) };
    console.error("index history push error:", indexHistStatus.error);
  }
}

// ── پل دریافت اکسل کدال از طریق Supabase (برای توسعه از خارج ایران) ──────────────
// sandbox درخواست را در ir_market_snapshots (key='codal_fetch_request') می‌نویسد؛
// رله هر ۴۵ ثانیه چک می‌کند، اکسل را از excel.codal.ir می‌گیرد و نتیجه را در
// key='codal_fetch_result' می‌نویسد (HTML در payload.html، مطابقت با payload.id).
let bridgeStatus = { lastId: null, lastError: null, lastAt: 0 };
async function codalFetchBridge() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const qs = "key=eq.codal_fetch_request&select=payload";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?${qs}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return;
    const rows = await r.json();
    const req0 = rows?.[0]?.payload;
    if (!req0?.id || !req0?.url) return;
    if (req0.id === bridgeStatus.lastId) return; // قبلاً پردازش شد
    if (!/^https:\/\/excel\.codal\.ir\//.test(req0.url)) return;
    console.log(`codal bridge: fetching ${req0.id}`);
    let result;
    try {
      const html = await codalRawExcel(req0.url);
      result = { id: req0.id, url: req0.url, ok: true, bytes: html.length, html, at: Date.now() };
    } catch (e) {
      result = { id: req0.id, url: req0.url, ok: false, error: errMsg(e), at: Date.now() };
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([{ key: "codal_fetch_result", payload: result }]),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) {
      bridgeStatus = { lastId: req0.id, lastError: null, lastAt: Date.now() };
      console.log(`codal bridge: result pushed for ${req0.id} (ok=${result.ok})`);
    } else {
      bridgeStatus = { ...bridgeStatus, lastError: `push HTTP ${res.status}` };
    }
  } catch (e) {
    bridgeStatus = { ...bridgeStatus, lastError: errMsg(e) };
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
      await pushDailyHistory(body);
      await pushDailyFx(body);
      await pushDailyIndex(body);
      await pushDailyBreadth({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EOD_AFTER_HOUR }, body);
      // T5-1 فیکس معماری: چرخش دیتای جامع نمادهای پرارزش ← Supabase (ترانسپورت به سایت)
      try {
        const p = JSON.parse(body);
        const topSymbols = (p.stocks || [])
          .filter((s) => s && s.l18 && Number.isFinite(Number(s.value)))
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((s) => s.l18);
        await refreshSymbolDetailsRotation({
          base: BRSAPI_BASE,
          key: BRSAPI_KEY,
          headers: HDRS,
          supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""),
          serviceKey: SUPABASE_SERVICE_ROLE_KEY,
          symbols: topSymbols,
        });
      } catch (e) {
        console.error("symbol rotation:", errMsg(e));
      }
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
        options: p.options?.length ?? 0,
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
    codalEngine: engineStatus,
    codalArchive: archiveStatus, // T4 — بک‌فیل آرشیو + پوشش لحظه‌ای n30/n10
    eodHistory: eodStatus,
    indexHistory: indexHistStatus,
    marketBreadth: breadthStatus,
    historyPrune: pruneStatus,
    fxRates: fxStatus,
    options: optionsStatus,
    candleBackfill: candleStatus,
    symbolDetail: symbolDetailStatus(), // T5-1
    symbolRotation: symbolRotationStatus(), // T5-1 فیکس معماری — چرخش Supabase
    navBlacklist: navBlacklistStatus(),  // C1 — فهرست سیاه دائمی NAV
    navCompletion: navCompletionState,  // T5-3
    ime: imeStatus(),                   // T5-4/5
    commodity: commodityStatus(),       // T5-6
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

  // دریافت خام اکسل کدال از داخل ایران — فقط برای توسعه، محافظت‌شده با RELAY_TOKEN.
  if (url.pathname === "/codal-raw") {
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401); return res.end("unauthorized");
    }
    const u = url.searchParams.get("url") || "";
    try {
      const html = await codalRawExcel(u);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: e?.message ?? String(e) }));
    }
  }

  // T5-1 — دیتای جامع نماد (کش ۳دقیقه‌ای، سقف روزانه درون ماژول) — محافظت‌شده با RELAY_TOKEN.
  if (url.pathname === "/symbol.json") {
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401); return res.end("unauthorized");
    }
    const l18 = (url.searchParams.get("l18") || "").trim();
    if (!l18) { res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }); return res.end('{"error":"l18 required"}'); }
    const r = await getSymbolDetail(l18, { base: BRSAPI_BASE, key: BRSAPI_KEY, headers: HDRS });
    if (!r.ok) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: r.error }));
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ stale: r.stale, data: r.data }));
  }

  // T5-2 — فهرست زندهٔ اطلاعیه‌های کدال یک نماد (کش ۱۰دقیقه‌ای) — محافظت‌شده با RELAY_TOKEN.
  if (url.pathname === "/codal-list") {
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401); return res.end("unauthorized");
    }
    const sym = (url.searchParams.get("symbol") || "").trim();
    if (!sym) { res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }); return res.end('{"error":"symbol required"}'); }
    const cacheKey = sym;
    const c = codalListCache.get(cacheKey);
    if (c && Date.now() - c.at < 10 * 60 * 1000) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(c.body);
    }
    try {
      const page = await fetchAnnouncementsPage({ l18: sym });
      const body = JSON.stringify({ at: Date.now(), items: page?.data ?? page ?? [] });
      codalListCache.set(cacheKey, { body, at: Date.now() });
      if (codalListCache.size > 200) { const k = codalListCache.keys().next().value; codalListCache.delete(k); }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(body);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: e?.message ?? String(e) }));
    }
  }

  // تست زندهٔ پارسر کدال (بدون درج در دیتابیس) — محافظت‌شده با RELAY_TOKEN.
  if (url.pathname === "/codal-test") {
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401); return res.end("unauthorized");
    }
    const sym = url.searchParams.get("symbol") || "فملی";
    try {
      const r = await codalTest(sym);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(r, null, 2));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: e?.message ?? String(e) }));
    }
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
  console.log(`ir-market relay v2 (BrsApi) on :${PORT} | codal=${process.env.CODAL_ENABLED === "1" ? "on" : "off"}`);
  // C1 — بارگذاری بلک‌لیست دائمی NAV قبل از اولین رفرش (تا با ریاستارت پاک نشود)
  loadNavBlacklist({ supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""), serviceKey: SUPABASE_SERVICE_ROLE_KEY })
    .catch(() => {})
    .finally(() => refresh());
  setInterval(refresh, CACHE_MS).unref();
  // پل دریافت اکسل کدال — هر ۴۵ ثانیه (سبک؛ فقط یک SELECT کوچک وقتی درخواستی نیست).
  setInterval(() => { codalFetchBridge().catch(() => {}); }, 45 * 1000).unref();
  setTimeout(() => { codalFetchBridge().catch(() => {}); }, 15 * 1000).unref();
  // بک‌فیل کندل (M8-الف) — هر ۱۰ دقیقه یک دسته؛ سقف ساعتی/روزانه درون ماژول اعمال می‌شود.
  // اولین اجرا ۳ دقیقه بعد از بوت تا اسنپ‌شات اول آماده باشد.
  if (process.env.CANDLE_BACKFILL_ENABLED !== "0") {
    setTimeout(() => { runCandleBackfill(latestSnapshotSymbols).catch((e) => console.error("candle backfill:", errMsg(e))); }, 3 * 60 * 1000).unref();
    setInterval(() => { runCandleBackfill(latestSnapshotSymbols).catch((e) => console.error("candle backfill:", errMsg(e))); }, 10 * 60 * 1000).unref();
  }
  // T5-4/5 — بورس کالا: append پایان‌روز گواهی‌ها + فیزیکی روزانه (گیت زمانی درون ماژول‌ها)
  if (process.env.IME_ENABLED !== "0") {
    setInterval(() => {
      pushCertEod({ supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""), serviceKey: SUPABASE_SERVICE_ROLE_KEY }).catch((e) => console.error("ime cert eod:", errMsg(e)));
      runPhysicalDaily({ base: BRSAPI_BASE, key: BRSAPI_KEY, headers: HDRS, supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""), serviceKey: SUPABASE_SERVICE_ROLE_KEY }).catch((e) => console.error("ime physical:", errMsg(e)));
    }, 20 * 60 * 1000).unref();
  }
  // دامپ تشخیصی ساختار اکسل کدال (فقط وقتی CODAL_DEBUG_EXCEL_URL ست باشد) — هر ۳ دقیقه تا موفقیت.
  if (process.env.CODAL_DEBUG_EXCEL_URL) {
    let dumped = false;
    const tryDump = async () => {
      if (dumped) return;
      dumped = await codalDebugDump().then((ok) => !!ok).catch(() => false);
    };
    setTimeout(tryDump, 20 * 1000).unref();
    setInterval(tryDump, 3 * 60 * 1000).unref();
  }
  // کدال — CODAL_ENABLED=1 برای فعال‌سازی موتور v3 (فید سراسری + بک‌فیل اولویت‌دار).
  // مسیر legacy نمادبه‌نماد در پاک‌سازی C3 حذف شد (موتور v3 از ۱۶ تیر سالم، ۱۶۵ گزارش).
  if (process.env.CODAL_ENABLED === "1") {
    const job = runEngineCycle;
    const name = "codal engine v3";
    console.log(`${name} armed: first run in 90s`);
    setTimeout(() => {
      console.log(`${name} starting`);
      job().catch((e) => console.error(`${name} error:`, e?.message ?? e));
    }, 90 * 1000).unref();
    setInterval(() => {
      job().catch((e) => console.error(`${name} error:`, e?.message ?? e));
    }, CODAL_INTERVAL_MS).unref();

    // T4 — بک‌فیل آرشیو کدال (صفحه‌گردی تا ۱۴۰۲/۱۴۰۱، سقف صریح ۲۰۰ درخواست/روز).
    // با فاصله از چرخهٔ موتور اجرا می‌شود تا هم‌زمان فشار نیاورند.
    if (process.env.CODAL_ARCHIVE_ENABLED !== "0") {
      console.log("codal archive (T4) armed: first run in 6m");
      setTimeout(() => {
        runArchiveCycle().catch((e) => console.error("codal archive error:", e?.message ?? e));
      }, 6 * 60 * 1000).unref();
      setInterval(() => {
        runArchiveCycle().catch((e) => console.error("codal archive error:", e?.message ?? e));
      }, 45 * 60 * 1000).unref();
    }
  }
});
