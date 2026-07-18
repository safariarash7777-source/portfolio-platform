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

const TTL_MS = 3 * 60 * 1000; // ۳ دقیقه
const DAILY_CAP = Number(process.env.SYMBOL_DETAIL_DAILY_CAP || 500);

const cache = new Map(); // l18 → { data, at }
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
    usedToday,
    dailyCap: DAILY_CAP,
    day: dayKey || tehranDayKey(),
    lastError,
  };
}

// دیتای جامع یک نماد — از کش ۳دقیقه‌ای یا با یک درخواست به BrsApi.
// خروجی: { ok, data?, stale?, error? }
export async function getSymbolDetail(l18, { base, key, headers }) {
  rollDay();
  const now = Date.now();
  const c = cache.get(l18);
  if (c && now - c.at < TTL_MS) return { ok: true, data: c.data, stale: false };

  if (usedToday >= DAILY_CAP) {
    // سقف روزانه — کش کهنه بهتر از هیچ است؛ صادقانه stale برمی‌گردد.
    if (c) return { ok: true, data: c.data, stale: true };
    return { ok: false, error: "daily cap reached" };
  }

  try {
    usedToday++;
    const url = `${base}/Tsetmc/Symbol.php?key=${key}&l18=${encodeURIComponent(l18)}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const j = await res.json();
    const d = Array.isArray(j) ? j[0] : j;
    if (!d || typeof d !== "object" || !d.l18) throw new Error("empty response");
    cache.set(l18, { data: d, at: now });
    lastError = null;
    return { ok: true, data: d, stale: false };
  } catch (e) {
    lastError = e?.message ?? String(e);
    if (c) return { ok: true, data: c.data, stale: true };
    return { ok: false, error: lastError };
  }
}
