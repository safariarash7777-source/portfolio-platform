// nav-blacklist.mjs — C1: فهرست سیاه دائمی NAV (اخطار رسمی BrsApi)
//
// نمادی که در ۲ دور NAV پاسخ معتبر برنگرداند → بلک‌لیست دائمی؛ دیگر هرگز
// درخواست NAV برایش نمی‌رود. برای بقا در ریاستارت رله، وضعیت در
// ir_market_snapshots (کلید nav_blacklist) ذخیره/بارگذاری می‌شود.
//
// ساختار payload: { blacklist: string[], failCounts: {l18: n}, updatedAt }

const FAIL_THRESHOLD = 2;

const failCounts = new Map(); // l18 → تعداد دورهای ناموفق پیاپی
const blacklist = new Set();
let loaded = false;
let dirty = false;
let lastSaveError = null;

export function navBlacklistStatus() {
  return {
    loaded,
    size: blacklist.size,
    pendingFailCounts: failCounts.size,
    threshold: FAIL_THRESHOLD,
    lastSaveError,
  };
}

export function isNavBlacklisted(l18) {
  return blacklist.has((l18 || "").trim());
}

/** ثبت نتیجهٔ یک دور NAV برای نماد: ok=true شمارنده را صفر می‌کند؛
 *  ok=false بعد از FAIL_THRESHOLD دور، نماد را دائمی بلک‌لیست می‌کند. */
export function recordNavResult(l18, ok) {
  const s = (l18 || "").trim();
  if (!s || blacklist.has(s)) return;
  if (ok) {
    if (failCounts.delete(s)) dirty = true;
    return;
  }
  const n = (failCounts.get(s) || 0) + 1;
  failCounts.set(s, n);
  dirty = true;
  if (n >= FAIL_THRESHOLD) {
    blacklist.add(s);
    failCounts.delete(s);
    console.log(`nav blacklist: «${s}» بعد از ${n} دور ناموفق دائمی شد (اخطار BrsApi)`);
  }
}

function sbHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

/** بارگذاری وضعیت از Supabase — یک‌بار در شروع (idempotent). */
export async function loadNavBlacklist({ supabaseUrl, serviceKey }) {
  if (loaded || !supabaseUrl || !serviceKey) return;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ir_market_snapshots?key=eq.nav_blacklist&select=payload&limit=1`,
      { headers: sbHeaders(serviceKey), signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) throw new Error(`http ${res.status}`);
    const rows = await res.json();
    const p = rows?.[0]?.payload;
    if (p && typeof p === "object") {
      for (const s of Array.isArray(p.blacklist) ? p.blacklist : []) blacklist.add(String(s));
      const fc = p.failCounts && typeof p.failCounts === "object" ? p.failCounts : {};
      for (const [k, v] of Object.entries(fc)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) failCounts.set(k, n);
      }
    }
    loaded = true;
    console.log(`nav blacklist: loaded — ${blacklist.size} دائمی، ${failCounts.size} در انتظار`);
  } catch (e) {
    // خطای بارگذاری مانع کار رله نمی‌شود؛ دور بعدی دوباره تلاش می‌شود.
    console.error("nav blacklist load:", e?.message ?? String(e));
  }
}

/** ذخیرهٔ وضعیت در Supabase — فقط وقتی تغییری هست. */
export async function saveNavBlacklist({ supabaseUrl, serviceKey }) {
  if (!dirty || !supabaseUrl || !serviceKey) return;
  try {
    const body = JSON.stringify({
      key: "nav_blacklist",
      payload: {
        blacklist: [...blacklist].sort(),
        failCounts: Object.fromEntries(failCounts),
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });
    const res = await fetch(`${supabaseUrl}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: { ...sbHeaders(serviceKey), Prefer: "resolution=merge-duplicates,return=minimal" },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    dirty = false;
    lastSaveError = null;
  } catch (e) {
    lastSaveError = e?.message ?? String(e);
  }
}
