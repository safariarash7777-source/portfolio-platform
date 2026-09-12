// symbol-detail.mjs — T5-1: دیتای جامع نماد (Tsetmc/Symbol.php) با کش ۳دقیقه‌ای per-symbol
//
// مستند رسمی: https://brsapi.ir/bourse-api-symbol-webservice/
//   GET https://Api.BrsApi.ir/Tsetmc/Symbol.php?key=KEY&l18=نماد
//   پاسخ: آبجکت (یا آرایهٔ تک‌عضوی) با فیلدهای هویتی، قیمتی (ریال)، حقیقی/حقوقی،
//   عمق ۵سطحی (zd/qd/pd/zo/qo/po) و assembly[] (مجامع).
//
// قواعد:
//   - کش per-symbol با TTL سه دقیقه — درخواست تکراری در بازهٔ کش هیچ مصرفی ندارد.
//   - سقف روزانهٔ صریح SYMBOL_DETAIL_DAILY_CAP (پیش‌فرض ۵۰۰) — بعد از سقف فقط کش
//     (حتی کهنه) برمی‌گردد یا 429. شمارنده هر روز (تهران) صفر می‌شود.
//   - هیچ تبدیل واحدی انجام نمی‌شود — پاسخ خام BrsApi (ریال) برگردانده می‌شود و
//     تبدیل/گارد در سایت انجام می‌شود تا رله سادهٔ ساده بماند.
import { isMainTicker } from "./symbols-util.mjs"; // C1 — قرنطینهٔ زیرنماد/حق‌تقدم
const TTL_MS = 3 * 60 * 1000; // ۳ دقیقه
const DAILY_CAP = Number(process.env.SYMBOL_DETAIL_DAILY_CAP || 500);

// کشِ کران‌دار (LRU).
//
// ── چرا کران لازم شد ────────────────────────────────────────────────────────
// نسخهٔ قبل یک `Map` بی‌کران بود. هر نمادی که از مسیرِ on-demand (`/symbol.json`)
// یا از چرخشِ قدیمی وارد می‌شد **تا ابد** می‌ماند، و کلِ کش در هر دورِ چرخش
// یک‌جا در Supabase آپسرت می‌شد. اندازه‌گیریِ ۱۴۰۵/۰۶/۱۹: **۲۶۶ نماد در کش**
// در حالی که فهرستِ چرخش `ROTATION_TOP_N = 60` است — یعنی بیش از چهار برابرِ
// چیزی که قرار بود نگه داریم، و همان حجم در هر push روی شبکه می‌رفت.
//
// `Map` در جاوااسکریپت ترتیبِ درج را نگه می‌دارد، پس LRU با حذف و درجِ دوباره
// در هر دسترسی ساخته می‌شود — بدونِ وابستگی.
const CACHE_MAX = Number(process.env.SYMBOL_DETAIL_CACHE_MAX || 120);
const cache = new Map(); // l18 → { data, at } — قدیمی‌ترینِ دست‌نخورده اولِ Map

/** خواندن با به‌روزرسانیِ ترتیبِ LRU. */
function cacheGet(l18) {
  const v = cache.get(l18);
  if (v === undefined) return undefined;
  cache.delete(l18);
  cache.set(l18, v);
  return v;
}

/** نوشتن با رعایتِ سقف — کهنه‌ترینِ کم‌استفاده حذف می‌شود. */
function cacheSet(l18, v) {
  if (cache.has(l18)) cache.delete(l18);
  cache.set(l18, v);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
    evicted += 1;
  }
}

let evicted = 0;
let dayKey = "";          // کلید روز تهران برای ریست شمارنده
let usedToday = 0;
let lastError = null;

function tehranDayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

function rollDay() {
  const k = tehranDayKey();
  if (k !== dayKey) { dayKey = k; usedToday = 0; }
}

export function symbolDetailStatus() {
  return {
    cached: cache.size,
    cacheMax: CACHE_MAX,
    evicted,
    usedToday,
    dailyCap: DAILY_CAP,
    day: dayKey || tehranDayKey(),
    lastError,
  };
}

// دیتای جامع یک نماد — از کش ۳دقیقه‌ای یا با یک درخواست به BrsApi.
// خروجی: { ok, data?, stale?, error? }
// --- چرخش Supabase-transport (T5-1 فیکس معماری) ---
// Vercel→Liara inbound کار نمی‌کند (بن‌بست ثبت‌شده)؛ پس رله دیتای جامع نمادهای
// پرارزش را چرخشی می‌گیرد و در ir_market_snapshots (key='symbol_details') آپسرت می‌کند؛
// سایت فقط از Supabase می‌خواند. بودجه همان سقف روزانهٔ موجود است.
const ROTATION_TOP_N = Number(process.env.SYMBOL_DETAIL_ROTATION_N || 60);
const ROTATION_PER_CYCLE = Number(process.env.SYMBOL_DETAIL_PER_CYCLE || 6);

/* ── بودجه‌آگاهیِ چرخش ──────────────────────────────────────────────────────
 *
 * ── نقصی که این بخش می‌بندد ───────────────────────────────────────────────
 * چرخش از داخلِ `refresh()` و **بدونِ هیچ گیتِ زمانی** صدا زده می‌شد، یعنی
 * هر چرخهٔ ۵ دقیقه‌ای ۶ درخواست ⇒ **۱٬۷۲۸ درخواست در روز**، در حالی که سقفِ
 * روزانهٔ خودش `DAILY_CAP = 500` است.
 *
 * نتیجه‌اش «صرفه‌جویی» نبود، **بدترشدن** بود: سهمیه در حدودِ ۷ ساعتِ اولِ روز
 * تمام می‌شد و ۱۷ ساعتِ باقی‌مانده کاربر دادهٔ کهنه می‌دید — و بدتر، تمام‌شدنِ
 * سهمیه در ساعتِ ۱۴ تهران یعنی دقیقاً **پایانِ بازار**، جایی که تازه‌ترین داده
 * بیشترین ارزش را دارد.
 *
 * راهِ‌حل: به‌جای «۶ تا در هر چرخه»، بودجه روی **زمانِ باقی‌ماندهٔ روز** پخش
 * می‌شود. انباشتِ اعشاری نگه داشته می‌شود تا نرخِ زیرِ یک در چرخه هم گم نشود
 * (۵۰۰ ÷ ۲۸۸ ≈ ۱٫۷۴ در هر چرخه؛ با `floor` ساده به ۱ می‌افتاد و ۲۱۳ درخواست
 * از بودجه هدر می‌رفت).
 */
let rotationCredit = 0;        // انباشتِ اعشاریِ سهمیهٔ خرج‌نشده
let rotationDayKey = "";

/** میلی‌ثانیه تا نیمه‌شبِ تهران — پایهٔ پخشِ بودجه. */
export function msUntilTehranMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran", hour12: false,
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return 86_400_000 - elapsed;
}

/**
 * چند نماد در این چرخه تازه شود.
 *
 * بودجهٔ باقی‌مانده را بر تعدادِ چرخه‌های باقی‌ماندهٔ روز پخش می‌کند و هرگز از
 * `ROTATION_PER_CYCLE` (سقفِ انفجار) بالاتر نمی‌رود.
 */
export function rotationBudgetForCycle({
  remaining, msLeft, cycleMs, perCycleMax = ROTATION_PER_CYCLE, credit = 0,
}) {
  if (!(remaining > 0)) return { take: 0, credit: 0 };
  const cyclesLeft = Math.max(1, Math.ceil(msLeft / cycleMs));
  const share = remaining / cyclesLeft;
  const total = credit + share;
  const take = Math.min(perCycleMax, remaining, Math.floor(total));
  return { take, credit: total - take };
}

let rotationCursor = 0;
let lastRotationAt = 0;
let lastRotationPushed = 0;
let lastRotationError = null;
let lastRotationTake = 0;

/** طولِ چرخهٔ میزبان (`CACHE_MS` در server.mjs) — مبنای پخشِ بودجه. */
const ROTATION_CYCLE_MS = Number(process.env.RELAY_CACHE_MS || 5 * 60 * 1000);

export function symbolRotationStatus() {
  return {
    topN: ROTATION_TOP_N,
    perCycleMax: ROTATION_PER_CYCLE,
    lastTake: lastRotationTake,
    creditCarried: Math.round(rotationCredit * 100) / 100,
    budgetRemaining: Math.max(0, DAILY_CAP - usedToday),
    cursor: rotationCursor,
    lastRunAt: lastRotationAt || null,
    lastPushed: lastRotationPushed,
    lastError: lastRotationError,
  };
}

// یک قدم چرخش: K نماد بعدی از فهرست پرارزش‌ترین‌ها را تازه می‌کند
// و کل کش موجود را یک‌جا در Supabase آپسرت می‌کند. symbols: آرایهٔ l18 مرتب به ارزش.
export async function refreshSymbolDetailsRotation({ base, key, headers, supabaseUrl, serviceKey, symbols, client = null, countLegacy = null }) {
  try {
    // C1 — فقط نمادهای اصلی وارد چرخش دیتای جامع می‌شوند (نه زیرنماد، نه حق تقدم).
    const top = (symbols || []).filter((s) => isMainTicker(s)).slice(0, ROTATION_TOP_N);
    if (!top.length || !supabaseUrl || !serviceKey) return;

    // بودجهٔ این چرخه از سهمیهٔ باقی‌ماندهٔ روز درمی‌آید، نه از یک عددِ ثابت.
    rollDay();
    if (rotationDayKey !== dayKey) { rotationDayKey = dayKey; rotationCredit = 0; }
    const { take, credit } = rotationBudgetForCycle({
      remaining: Math.max(0, DAILY_CAP - usedToday),
      msLeft: msUntilTehranMidnight(),
      cycleMs: ROTATION_CYCLE_MS,
      credit: rotationCredit,
    });
    rotationCredit = credit;
    lastRotationTake = take;
    if (take === 0) {
      // بودجه‌ای برای این چرخه نیست — ولی کشِ موجود همچنان push می‌شود تا
      // سایت از آخرین دادهٔ سالم محروم نشود.
      lastRotationAt = Date.now();
    }

    const picked = [];
    for (let i = 0; i < take && top.length; i++) {
      picked.push(top[rotationCursor % top.length]);
      rotationCursor = (rotationCursor + 1) % top.length;
    }
    for (const l18 of picked) {
      await getSymbolDetail(l18, { base, key, headers, client, countLegacy });
    }
    // آپسرت کل کش (فقط نمادهای داخل فهرست چرخش + هر نماد تازهٔ دیگر در کش)
    const details = {};
    for (const [l18, c] of cache) details[l18] = { at: c.at, data: c.data };
    const body = JSON.stringify({
      key: "symbol_details",
      payload: { at: Date.now(), count: Object.keys(details).length, details },
      updated_at: new Date().toISOString(),
    });
    const res = await fetch(`${supabaseUrl}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    lastRotationAt = Date.now();
    lastRotationPushed = Object.keys(details).length;
    lastRotationError = null;
  } catch (e) {
    lastRotationError = e?.message ?? String(e);
  }
}

export async function getSymbolDetail(l18, { base, key, headers, client = null, budgetClass = "bulk", countLegacy = null }) {
  rollDay();
  const now = Date.now();
  const c = cacheGet(l18);
  if (c && now - c.at < TTL_MS) return { ok: true, data: c.data, stale: false };

  if (usedToday >= DAILY_CAP) {
    // سقف روزانه — کش کهنه بهتر از هیچ است؛ صادقانه stale برمی‌گردد.
    if (c) return { ok: true, data: c.data, stale: true };
    return { ok: false, error: "daily cap reached" };
  }

  try {
    usedToday++;
    const url = `${base}/Tsetmc/Symbol.php?key=${key}&l18=${encodeURIComponent(l18)}`;
    let j;
    if (client) {
      j = await client.request({
        endpoint: "Tsetmc/Symbol.php", params: { l18 },
        producer: "symbol-detail", priority: "background",
        budgetClass,
        // کشِ داخلیِ این ماژول ۳ دقیقه است؛ dedupe کوتاه‌تر از آن فقط
        // هم‌زمانی‌های لحظه‌ای را می‌گیرد و کشِ خودمان را دور نمی‌زند.
        dedupeTtlMs: 60_000, timeoutMs: 15_000,
      });
    } else {
      // سقفِ روزانهٔ همین ماژول جای بودجهٔ سراسری را نمی‌گیرد — پس وقتی
      // کلاینت نیست، مصرف دستِ‌کم **شمرده** می‌شود.
      if (countLegacy) await countLegacy("symbol-detail", budgetClass);
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      j = await res.json();
    }
    const d = Array.isArray(j) ? j[0] : j;
    if (!d || typeof d !== "object" || !d.l18) throw new Error("empty response");
    cacheSet(l18, { data: d, at: now });
    lastError = null;
    return { ok: true, data: d, stale: false };
  } catch (e) {
    lastError = e?.message ?? String(e);
    if (c) return { ok: true, data: c.data, stale: true };
    return { ok: false, error: lastError };
  }
}
