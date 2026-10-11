/**
 * انبارهٔ ماندگارِ بودجهٔ روزانهٔ BrsApi.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────────
 * `DailyBudget` شمارنده را در حافظه نگه می‌دارد. هر restart آن را صفر می‌کند،
 * پس رله‌ای که روزی سه بار دیپلوی شود سه بار بودجهٔ کاملِ روز را از نو می‌گیرد.
 * سقفی که با restart پاک می‌شود، سقف نیست.
 *
 * ── مدلِ «اجاره» ────────────────────────────────────────────────────────────
 * رزروِ بودجه در کلاینت باید **همگام** بماند (هیچ `await`ی بینِ بررسیِ سقف و
 * `fetch`). پس به‌جای یک round-trip به‌ازای هر درخواست، بلوکی از واحدها یک‌جا
 * و اتمیک اجاره می‌شود و محلی خرج می‌شود.
 *
 * اجارهٔ خرج‌نشده سوخته حساب می‌شود؛ RPC قدیمی release بدون شناسهٔ اجاره
 * نمی‌تواند پس‌دادنِ تکراری را تشخیص دهد و اکنون یک no-op سازگار است.
 *
 * ── وقتی انبار در دسترس نیست ────────────────────────────────────────────────
 * فقط واحدهای قبلاً اجاره‌شده قابل خرج‌اند؛ مجوز اضطراری حافظه‌ای نداریم.
 * بدون اجارهٔ معتبر، ارسال متوقف می‌شود و باقی‌مانده نامعلوم گزارش می‌شود.
 */

/** فراخوانیِ یک تابعِ Postgres از راهِ PostgREST. */
export function makeSupabaseLeaseStore({ url, serviceKey, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  if (!url || !serviceKey) return null;
  const base = String(url).replace(/\/+$/, "");
  const headers = {
    "content-type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  async function rpc(fn, body) {
    const res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      let body;
      try { body = await res.json(); } catch { body = {}; }
      const code = /^[A-Z0-9]{5,12}$/.test(body.code ?? "") ? body.code : "UNKNOWN";
      const error = new Error(`rpc ${fn} → ${res.status} (${code})`);
      error.code = code;
      throw error;
    }
    return res.json();
  }

  return {
    async lease(dayKey, want, hardCeiling) {
      const rows = await rpc("brsapi_budget_lease", {
        p_day: dayKey, p_want: want, p_hard: hardCeiling,
      });
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || !Number.isSafeInteger(r.granted) || r.granted < 0 || r.granted > want
        || !Number.isSafeInteger(r.leased_before) || r.leased_before < 0
        || !Number.isSafeInteger(r.hard_ceiling) || r.hard_ceiling <= 0
        || r.leased_before + r.granted > r.hard_ceiling) {
        throw new Error("rpc brsapi_budget_lease پاسخِ بی‌شکل داد");
      }
      return {
        granted: r.granted,
        leasedBefore: r.leased_before ?? 0,
        hardCeiling: r.hard_ceiling ?? hardCeiling,
      };
    },
    async release(dayKey, back) {
      const out = await rpc("brsapi_budget_release", { p_day: dayKey, p_back: back });
      return typeof out === "number" ? out : 0;
    },
  };
}
