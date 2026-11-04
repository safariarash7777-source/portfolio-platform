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
 * خطا همیشه در جهتِ **کم‌مصرفی** است: اجارهٔ خرج‌نشدهٔ یک فرایندِ مرده سوخته
 * حساب می‌شود، نه آزاد. حداکثر اتلافِ هر restart = اندازهٔ یک بلوک.
 *
 * ── وقتی انبار در دسترس نیست ────────────────────────────────────────────────
 * بدون اجاره تأییدشده، درخواست تازه مجاز نیست؛ سهمیه نامعلوم
 * مجوز اضطراری ایجاد نمی‌کند. اجاره قبلاً تأییدشده قابل مصرف می‌ماند.
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
      const text = await res.text().catch(() => "");
      // متنِ خطا ممکن است حاویِ چیزی نباشد که بخواهیم لاگ کنیم؛ فقط کد و
      // ۲۰۰ نویسهٔ اول. کلید هرگز در این مسیر لاگ نمی‌شود.
      throw new Error(`rpc ${fn} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  return {
    async lease(dayKey, want, hardCeiling) {
      const rows = await rpc("brsapi_budget_lease", {
        p_day: dayKey, p_want: want, p_hard: hardCeiling,
      });
      const r = Array.isArray(rows) && rows.length === 1 ? rows[0]
        : !Array.isArray(rows) ? rows : null;
      const isCounter = (value) => Number.isInteger(value) && value >= 0 && value <= 2147483647;
      // Missing/invalid accounting data is unknown, never a zero baseline.
      // Do not compensate or retry: the remote lease may already be committed.
      if (!r || !isCounter(r.granted) || !isCounter(r.leased_before)
        || !isCounter(r.hard_ceiling) || r.hard_ceiling <= 0
        || r.granted > want || r.hard_ceiling > hardCeiling
        || r.leased_before + r.granted > r.hard_ceiling) {
        throw new Error("rpc brsapi_budget_lease پاسخِ بی‌شکل داد");
      }
      return {
        granted: r.granted,
        leasedBefore: r.leased_before,
        hardCeiling: r.hard_ceiling,
      };
    },
    async release(dayKey, back) {
      const out = await rpc("brsapi_budget_release", { p_day: dayKey, p_back: back });
      if (!Number.isInteger(out) || out < 0 || out > 2147483647 || out > Math.max(0, back)) {
        throw new Error("rpc brsapi_budget_release پاسخِ بی‌شکل داد");
      }
      return out;
    },
  };
}
