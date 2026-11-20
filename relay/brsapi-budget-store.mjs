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
 * دو رفتارِ بد ممکن است: «همه را رد کن» (یک قطعیِ لحظه‌ایِ دیتابیس رله را
 * می‌خواباند) و «همه را بپذیر» (بودجه دور زده می‌شود). هیچ‌کدام.
 * رفتارِ انتخابی: یک **مجوزِ اضطراریِ کوچک، شمرده‌شده و فقط برای `critical`** —
 * محدود و قابلِ‌مشاهده. بعد از آن رد می‌شود.
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
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || typeof r.granted !== "number") {
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
