// ─────────────────────────────────────────────────────────────────────────────
// بک‌فیل تاریخچهٔ کل بازار — M8-الف (رصد بازار)
//
// منبع: BrsApi ‏Tsetmc/Candlestick.php?key=…&type=2&l18=نماد
//   type=2 = کندل روزانهٔ «تعدیل‌نشده» — هم‌واحد و هم‌ماهیت با relay_eod (خام).
//   type=3 (تعدیل‌شده) عمداً گرفته نمی‌شود — تصمیم جدا می‌خواهد (ناسازگاری با دادهٔ خام
//   بعد از افزایش سرمایه). type=1 (لحظه‌ای) هم در این فاز نه.
//   فیلدها: date (جلالی)، time، open/high/low/close، volume — قیمت‌ها ریال.
//
// رفتار:
//   • صف = همهٔ نمادهای اسنپ‌شات (سهام+صندوق) که در symbol_history پوشش ندارند.
//   • cursor پایدار در Supabase (ir_market_snapshots key='candle_backfill_state')
//     تا بعد از ری‌دیپلوی از همان‌جا ادامه دهد — الگوی codal_engine_state.
//   • فقط درج تاریخ‌های غایب (diff با ردیف‌های موجود نماد) — هیچ UPDATE؛
//     dedup روی نماد+تاریخ+source در همین لایه.
//   • سهمیه: سقف ساعتی HOURLY_CAP نماد و سقف روزانهٔ صریح DAILY_CAP درخواست
//     تا فیدهای اصلی (اسنپ‌شات/شاخص/NAV) امن بمانند. ادامهٔ خودکار روزهای بعد.
//   • وضعیت کامل در /debug: صف باقی‌مانده، درج‌شده، خطاها، مصرف امروز.
//
// هیچ endpoint حدسی — فقط Candlestick.php طبق مستندات پلن AIO (سند آرش، ۲۷ تیر ۱۴۰۵).
// ─────────────────────────────────────────────────────────────────────────────
import { codalEnv, jalaliTextToIso, jalaliYmdToGregorian } from "./codal.mjs";

const { BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = codalEnv;
const BRSAPI_BASE = (process.env.BRSAPI_BASE || "https://Api.BrsApi.ir").replace(/\/+$/, "");
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HDRS = { Accept: "application/json", "User-Agent": BROWSER_UA };

// بودجهٔ صریح سهمیه (env-پذیر) — در PR مستند شده.
const HOURLY_CAP = Number(process.env.CANDLE_HOURLY_CAP || 300);   // حداکثر نماد در ساعت
const DAILY_CAP = Number(process.env.CANDLE_DAILY_CAP || 4000);    // حداکثر درخواست BrsApi در روز
const BATCH_PER_RUN = Number(process.env.CANDLE_BATCH || 50);      // هر اجرا (۱۰دقیقه‌ای) چند نماد
const CONCURRENCY = Number(process.env.CANDLE_CONCURRENCY || 3);
const COVERED_MIN_ROWS = Number(process.env.CANDLE_COVERED_MIN || 30); // این‌قدر ردیف = پوشش کافی
const SOURCE = "brsapi_candle";
const STATE_KEY = "candle_backfill_state";

const SB = () => SUPABASE_URL.replace(/\/+$/, "");
const SB_HDRS = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
});
const errMsg = (e) => (e && e.name === "TimeoutError" ? "timeout" : e?.message ?? String(e));

// وضعیت تشخیصی برای /debug — هیچ سکرتی اینجا نیست.
export const candleStatus = {
  enabled: true,
  queueRemaining: null,   // چند نماد هنوز در صف است
  doneCount: 0,           // نمادهای تمام‌شده (پوشش‌دار یا بک‌فیل‌شده)
  insertedTotal: 0,       // ردیف‌های درج‌شده از شروع پروسهٔ بک‌فیل (state پایدار)
  insertedToday: 0,
  reqToday: 0,            // مصرف امروز از سهمیهٔ BrsApi
  reqDate: null,          // روز شمارش (تهران)
  hourWindowStart: 0,
  reqThisHour: 0,
  lastSymbol: null,
  lastRun: 0,
  lastError: null,
  errors: 0,              // شمار خطاهای از بوت
  emptyResponses: 0,      // پاسخ‌های خالی/بی‌کندل (نماد کم‌معامله یا حذف‌شده)
};

/* ── state پایدار (Supabase) — الگوی codal_engine_state ────────────────────── */
let state = null; // { done: {symbol: rowsInserted}, failed: {symbol: count}, insertedTotal, reqDate, reqToday }
async function loadState() {
  if (state) return state;
  try {
    const qs = new URLSearchParams({ select: "payload", key: `eq.${STATE_KEY}`, limit: "1" });
    const res = await fetch(`${SB()}/rest/v1/ir_market_snapshots?${qs}`, {
      headers: SB_HDRS(), signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows[0]?.payload && typeof rows[0].payload === "object") state = rows[0].payload;
    }
  } catch { /* از نو شروع می‌کنیم */ }
  if (!state || typeof state !== "object") state = {};
  state.done ??= {};
  state.failed ??= {};
  state.insertedTotal ??= 0;
  state.reqDate ??= null;
  state.reqToday ??= 0;
  // مهاجرت یک‌باره (v2): نسخهٔ اول به دلیل شکل پاکت پاسخ، همه را «تمام‌شده با ۰ ردیف» ثبت کرد؛
  // آن ورودی‌ها پاک می‌شوند تا دوباره تلاش شود. فقط یک بار اجرا می‌شود (مارکر schemaV).
  if ((state.schemaV || 1) < 3) {
    for (const [sym, n] of Object.entries(state.done)) {
      if (!n) delete state.done[sym];
    }
    state.schemaV = 3;
  }
  // مهاجرت یک‌باره (v4): بعد از ساخت ایندکس یکتا (فاز ۱۶)، نمادهایی که با برخورد
  // به ایندکس fail خورده بودند پاک می‌شوند تا یک بار دیگر از مسیر ignore-duplicates رد شوند.
  if ((state.schemaV || 1) < 4) {
    state.failed = {};
    state.schemaV = 4;
  }
  return state;
}
async function saveState() {
  if (!state) return;
  try {
    const res = await fetch(`${SB()}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: STATE_KEY, payload: state, updated_at: new Date().toISOString() }]),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error("candle state save:", errMsg(e));
  }
}

/* ── سهمیه ─────────────────────────────────────────────────────────────────── */
function tehranDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}
function quotaAvailable() {
  const today = tehranDate();
  if (state.reqDate !== today) { state.reqDate = today; state.reqToday = 0; }
  candleStatus.reqDate = today;
  candleStatus.reqToday = state.reqToday;
  if (state.reqToday >= DAILY_CAP) return 0;
  const now = Date.now();
  if (now - candleStatus.hourWindowStart > 3600_000) {
    candleStatus.hourWindowStart = now;
    candleStatus.reqThisHour = 0;
  }
  const hourLeft = HOURLY_CAP - candleStatus.reqThisHour;
  const dayLeft = DAILY_CAP - state.reqToday;
  return Math.max(0, Math.min(hourLeft, dayLeft));
}
function countReq(n = 1) {
  state.reqToday += n;
  candleStatus.reqToday = state.reqToday;
  candleStatus.reqThisHour += n;
}

/* ── دادهٔ کندل یک نماد ─────────────────────────────────────────────────────── */
/** پاسخ Candlestick type=2 → ردیف‌های symbol_history (ریال، تاریخ میلادی). */
function mapCandles(symbol, json) {
  // برخی پاسخ‌های BrsApi آرایهٔ خالصند، برخی داخل envelope — هر دو چک می‌شود
  // (endpoint همان مستند است؛ فقط شکل پاکت محافظه‌کارانه بررسی می‌شود).
  // شکل واقعی پاسخ (مشاهدهٔ زنده ۲۷ تیر ۱۴۰۵): {l18, type, count, candle_daily:[{date:"1405-04-24", open, high, low, close, volume}]}
  const arr = Array.isArray(json) ? json
    : Array.isArray(json?.candle_daily) ? json.candle_daily
    : Array.isArray(json?.candle_intraday) ? json.candle_intraday
    : Array.isArray(json?.candles) ? json.candles
    : Array.isArray(json?.data) ? json.data
    : Array.isArray(json?.result) ? json.result
    : [];
  const out = [];
  for (const c of arr) {
    const rawDate = String(c?.date ?? "");
    let gdate = null;
    const dashy = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dashy && Number(dashy[1]) > 1700) {
      // میلادی آمده — مستقیم استفاده (بدون تبدیل)
      gdate = rawDate;
    } else if (dashy) {
      // جلالی با خط تیره «1405-04-24» — فرمت واقعی Candlestick.php
      gdate = jalaliToG(dashy[1], dashy[2], dashy[3]);
    } else {
      // جلالی با اسلش «1404/04/25» یا ارقام فارسی → ایزو جلالی → میلادی
      const iso = jalaliTextToIso(rawDate);
      if (!iso) continue;
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) continue;
      gdate = jalaliToG(m[1], m[2], m[3]);
    }
    if (!gdate) continue;
    const close = num(c.close);
    if (close == null || close <= 0) continue; // بدون قیمت پایانی معتبر → درج نمی‌شود
    out.push({
      symbol,
      trade_date: gdate,
      close,                       // ریال — هم‌واحد با بقیهٔ symbol_history
      last_price: null,            // کندل قیمت آخرین معامله ندارد — صداقت داده
      volume: num(c.volume),
      value_traded: null,          // کندل ارزش معاملات ندارد
      raw: {
        candle: true,
        open: num(c.open),
        high: num(c.high),
        low: num(c.low),
        jdate: rawDate || null,
        time: c.time ?? null,
      },
      source: SOURCE,
    });
  }
  return out;
}
function num(x) {
  const n = Number(x);
  return isFinite(n) ? n : null;
}
// جلالی → میلادی (الگوریتم استاندارد jalaali — همان codal.mjs)
function jalaliToG(jy, jm, jd) {
  try { return jalaliYmdToGregorian(jy, jm, jd); } catch { return null; }
}

/** بک‌فیل یک نماد: fetch کندل → درج ضدتکرار با on_conflict. خروجی: تعداد ردیف‌های ارسال‌شده.
 * ضدتکرار در سطح دیتابیس: ایندکس یکتای symbol_history_symbol_trade_date_key (فاز ۱۶) +
 * on_conflict=symbol,trade_date + Prefer: resolution=ignore-duplicates → تکراری‌ها بی‌صدا نادیده
 * گرفته می‌شوند (ردیف موجود دست‌نخورده می‌ماند — همچنان فقط INSERT، هیچ UPDATE/DELETE).
 * دیگر SELECT «تاریخ‌های موجود» لازم نیست (existingDates حذف شد — با Max Rows پستگرست ناقص می‌شد).
 */
async function backfillSymbol(symbol) {
  const url = `${BRSAPI_BASE}/Tsetmc/Candlestick.php?key=${BRSAPI_KEY}&type=2&l18=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(25000) });
  countReq(1);
  if (!res.ok) throw new Error(`candle HTTP ${res.status}`);
  const json = await res.json();
  const rows = mapCandles(symbol, json);
  if (rows.length === 0) {
    candleStatus.emptyResponses++;
    // تشخیص از راه دور (سندباکس به Liara دسترسی مستقیم ندارد): نمونهٔ پاسخ خالی در state پایدار
    state.lastEmptySample = { symbol, at: new Date().toISOString(), body: JSON.stringify(json).slice(0, 400) };
    return 0;
  }
  let sent = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r2 = await fetch(`${SB()}/rest/v1/symbol_history?on_conflict=symbol,trade_date`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
      signal: AbortSignal.timeout(25000),
    });
    if (!r2.ok) throw new Error(`insert HTTP ${r2.status} @${i}`);
    sent += Math.min(500, rows.length - i);
  }
  // توجه: با ignore-duplicates تعداد «واقعاً درج‌شده» از PostgREST برنمی‌گردد؛
  // این عدد «ارسال‌شده» است (سقف بالا). پوشش واقعی از خود دیتابیس چک می‌شود.
  return sent;
}

/* ── یک دور اجرا (از server.mjs هر ۱۰ دقیقه صدا زده می‌شود) ────────────────── */
let running = false;
/**
 * @param {Array<{id:string}>} snapshotSymbols همهٔ نمادهای اسنپ‌شات جاری (سهام+صندوق)
 */
export async function runCandleBackfill(snapshotSymbols) {
  if (running) return;
  if (!BRSAPI_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    candleStatus.lastError = "env ناقص (BRSAPI_KEY/SUPABASE)";
    return;
  }
  if (!Array.isArray(snapshotSymbols) || snapshotSymbols.length === 0) return;
  running = true;
  try {
    await loadState();
    // صف: نمادهای اسنپ‌شات که هنوز done نیستند و ≥MAX_FAILS شکست نخورده‌اند.
    const queue = snapshotSymbols
      .map((s) => s.id)
      .filter((id) => id && state.done[id] == null && (state.failed[id] || 0) < 3);
    candleStatus.queueRemaining = queue.length;
    candleStatus.doneCount = Object.keys(state.done).length;
    candleStatus.insertedTotal = state.insertedTotal;
    if (queue.length === 0) { candleStatus.lastRun = Date.now(); return; }

    const budget = Math.min(quotaAvailable(), BATCH_PER_RUN, queue.length);
    if (budget <= 0) { candleStatus.lastRun = Date.now(); return; }

    const batch = queue.slice(0, budget);
    let idx = 0;
    async function worker() {
      while (idx < batch.length) {
        const symbol = batch[idx++];
        candleStatus.lastSymbol = symbol;
        try {
          const inserted = await backfillSymbol(symbol);
          state.done[symbol] = inserted;
          state.insertedTotal += inserted;
          candleStatus.insertedToday += inserted;
          candleStatus.insertedTotal = state.insertedTotal;
        } catch (e) {
          state.failed[symbol] = (state.failed[symbol] || 0) + 1;
          candleStatus.errors++;
          candleStatus.lastError = `${symbol}: ${errMsg(e)}`;
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    state.lastErrorSample = candleStatus.lastError;
    state.emptyResponses = candleStatus.emptyResponses;
    candleStatus.queueRemaining = Math.max(0, queue.length - batch.length);
    candleStatus.doneCount = Object.keys(state.done).length;
    candleStatus.lastRun = Date.now();
    await saveState();
    if (batch.length > 0) {
      console.log(
        `candle backfill: batch=${batch.length} done=${candleStatus.doneCount} queue=${candleStatus.queueRemaining} reqToday=${state.reqToday}/${DAILY_CAP}`
      );
    }
  } finally {
    running = false;
  }
}
