// ─────────────────────────────────────────────────────────────────────────────
// تابلوی بازار آپشن — M8-ب (رصد بازار)
//
// منبع: BrsApi ‏Tsetmc/Option.php?key=… — یک درخواست، کل تابلوی اختیار معامله.
// چرخهٔ ۵دقیقه‌ای رله یک‌بار صدا می‌زند (~۲۸۸ درخواست/روز از سهمیهٔ پلن AIO).
//
// نگاشت فیلدهای کلیدی مستندات: base_l18 (نماد پایه)، l18، type (call/put)،
// price_strike، date_end، day_remain، interest_open، قیمت‌ها/حجم/ارزش،
// حقیقی/حقوقی. قیمت‌ها ریال → تومان (÷۱۰) — همان قاعدهٔ موجود اسنپ‌شات.
// عمق سفارش (۵ سطر) در این فاز به payload نمی‌رود — حجم اسنپ‌شات را بی‌دلیل
// بزرگ می‌کند؛ اگر صفحهٔ جزئیات قرارداد خواستیم، فاز جدا.
//
// دادهٔ ناموجود = کلید غایب/null — هیچ عدد ساختگی.
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HDRS = { Accept: "application/json", "User-Agent": BROWSER_UA };

export const optionsStatus = { ok: false, contracts: 0, calls: 0, puts: 0, error: null, lastOk: 0 };

const toToman = (rial) => {
  const n = Number(rial);
  return isFinite(n) && n > 0 ? Math.round(n / 10) : null;
};
const num = (x) => {
  const n = Number(x);
  return isFinite(n) ? n : null;
};

/**
 * دریافت تابلوی کامل آپشن — یک درخواست.
 * @returns {Promise<Array>} آرایهٔ قراردادها (خالی اگر منبع پاسخ ندهد)
 */
export async function fetchOptions(brsapiBase, brsapiKey) {
  if (!brsapiKey) {
    optionsStatus.ok = false;
    optionsStatus.error = "BRSAPI_KEY ست نشده";
    return [];
  }
  const url = `${brsapiBase}/Tsetmc/Option.php?key=${brsapiKey}`;
  try {
    const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(25000) });
    if (!res.ok) {
      optionsStatus.ok = false;
      optionsStatus.error = `HTTP ${res.status}`;
      return [];
    }
    const items = await res.json();
    if (!Array.isArray(items)) {
      optionsStatus.ok = false;
      optionsStatus.error = "response is not array";
      return [];
    }
    const out = [];
    for (const it of items) {
      const id = it?.l18;
      if (!id) continue;
      const type =
        String(it.type ?? "").toLowerCase() === "call" ? "call"
        : String(it.type ?? "").toLowerCase() === "put" ? "put"
        : null;
      if (!type) continue; // بدون نوع معتبر → ردیف کنار گذاشته می‌شود
      out.push({
        id,
        faName: it.l30 || id,
        baseId: it.base_l18 || null,
        type, // call = اختیار خرید | put = اختیار فروش
        strike: toToman(it.price_strike),
        dateEnd: it.date_end ?? null,          // تاریخ سررسید (جلالی متنی منبع)
        dayRemain: num(it.day_remain),
        openInterest: num(it.interest_open),   // موقعیت‌های باز
        price: toToman(it.pl),                 // آخرین قیمت
        closingPrice: toToman(it.pc),
        changePercent: num(it.plp),
        volume: num(it.tvol),
        value: num(it.tval),                   // ریال — UI با همان قاعدهٔ بقیه نمایش می‌دهد
        trades: num(it.tno),
        buyI: num(it.Buy_I_Volume),
        sellI: num(it.Sell_I_Volume),
        buyN: num(it.Buy_N_Volume),
        sellN: num(it.Sell_N_Volume),
      });
    }
    optionsStatus.ok = true;
    optionsStatus.contracts = out.length;
    optionsStatus.calls = out.filter((o) => o.type === "call").length;
    optionsStatus.puts = out.filter((o) => o.type === "put").length;
    optionsStatus.error = null;
    optionsStatus.lastOk = Date.now();
    return out;
  } catch (e) {
    optionsStatus.ok = false;
    optionsStatus.error = e && e.name === "TimeoutError" ? "timeout" : e?.message ?? String(e);
    return [];
  }
}
