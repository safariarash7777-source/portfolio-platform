import { brsFetch as fetch } from "./brsapi-transport.mjs";
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

// Counts describe this attempt's received response, not the full market universe.
// null input/rejected counts mean that no usable array was received; lastOk is
// the receipt time of the last array mapped without rejected rows.
export const optionsStatus = {
  ok: false, contracts: 0, calls: 0, puts: 0,
  inputRows: null, rejectedRows: null,
  rejectionReasons: { invalidRow: 0, invalidId: 0, invalidType: 0 },
  error: null, lastOk: 0,
};

const num = (x) => {
  if ((typeof x !== "number" && typeof x !== "string") || (typeof x === "string" && !x.trim())) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const nonnegative = (x) => {
  const n = num(x);
  return n !== null && n >= 0 ? n : null;
};
const toToman = (rial) => {
  const n = num(rial);
  // Preserve the existing rounding/positive-price boundary. Repository notes
  // do not attest the provider's option price precision or a same-cycle raw
  // sample; changing fractional toman output needs that evidence first.
  return n !== null && n > 0 ? Math.round(n / 10) : null;
};

/**
 * دریافت تابلوی کامل آپشن — یک درخواست.
 * @returns {Promise<Array>} آرایهٔ قراردادها (خالی اگر منبع پاسخ ندهد)
 */
export async function fetchOptions(brsapiBase, brsapiKey, { client = null, countLegacy = null } = {}) {
  Object.assign(optionsStatus, {
    ok: false, contracts: 0, calls: 0, puts: 0,
    inputRows: null, rejectedRows: null,
    rejectionReasons: { invalidRow: 0, invalidId: 0, invalidType: 0 },
    error: null,
  });
  if (!brsapiKey) {
    optionsStatus.ok = false;
    optionsStatus.error = "BRSAPI_KEY ست نشده";
    return [];
  }
  const url = `${brsapiBase}/Tsetmc/Option.php?key=${brsapiKey}`;
  try {
    let items;
    if (client) {
      items = await client.request({
        endpoint: "Tsetmc/Option.php", params: {},
        producer: "options", priority: "background",
        // تابلوی آپشن یک درخواست در هر چرخه است و صفحهٔ اختصاصیِ خودش را
        // تغذیه می‌کند — مهم، ولی نه به‌اندازهٔ خودِ تابلوی بازار.
        budgetClass: "standard",
        dedupeTtlMs: 60_000, timeoutMs: 25_000,
      });
    } else {
      if (countLegacy) await countLegacy("options", "standard");
      const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(25000) });
      if (!res.ok) {
        optionsStatus.ok = false;
        optionsStatus.error = `HTTP ${res.status}`;
        return [];
      }
      items = await res.json();
    }
    if (!Array.isArray(items)) {
      optionsStatus.ok = false;
      optionsStatus.error = "response is not array";
      return [];
    }
    const out = [];
    optionsStatus.inputRows = items.length;
    optionsStatus.rejectedRows = 0;
    // Each rejected row has one primary reason, so reason counts sum exactly
    // to rejectedRows. Missing optional measurements remain nullable fields.
    const reject = (reason) => {
      optionsStatus.rejectedRows++;
      optionsStatus.rejectionReasons[reason]++;
    };
    for (const it of items) {
      if (!it || typeof it !== "object" || Array.isArray(it)) {
        reject("invalidRow");
        continue;
      }
      const id = it.l18;
      if (typeof id !== "string" || !id.trim()) {
        reject("invalidId");
        continue;
      }
      const rawType = typeof it.type === "string" ? it.type.toLowerCase() : null;
      const type =
        rawType === "call" ? "call"
        : rawType === "put" ? "put"
        : null;
      if (!type) {
        reject("invalidType");
        continue;
      }
      const contractSize = num(it.size_contract);
      out.push({
        id,
        sourceDate: typeof it.date === "string" ? it.date : null,
        sourceTime: typeof it.time === "string" ? it.time : null,
        faName: it.l30 || id,
        baseId: it.base_l18 || null,
        type, // call = اختیار خرید | put = اختیار فروش
        contractSize: Number.isSafeInteger(contractSize) && contractSize > 0 ? contractSize : null,
        // Derived price output retains the existing conversion. The source's
        // transaction-value unit is not yet attested by a same-cycle sample.
        priceUnit: "toman",
        valueUnit: null,
        valueSourceField: "tval",
        strike: toToman(it.price_strike),
        dateEnd: it.date_end ?? null,          // تاریخ سررسید (جلالی متنی منبع)
        dayRemain: num(it.day_remain),
        openInterest: nonnegative(it.interest_open), // موقعیت‌های باز؛ منفی نامعتبر است
        price: toToman(it.pl),                 // آخرین قیمت
        closingPrice: toToman(it.pc),
        changePercent: num(it.plp),
        volume: nonnegative(it.tvol),
        value: nonnegative(it.tval),           // raw tval retained; unit unknown until attested
        trades: nonnegative(it.tno),
        buyI: nonnegative(it.Buy_I_Volume),
        sellI: nonnegative(it.Sell_I_Volume),
        buyN: nonnegative(it.Buy_N_Volume),
        sellN: nonnegative(it.Sell_N_Volume),
      });
    }
    optionsStatus.contracts = out.length;
    optionsStatus.calls = out.filter((o) => o.type === "call").length;
    optionsStatus.puts = out.filter((o) => o.type === "put").length;
    optionsStatus.ok = optionsStatus.rejectedRows === 0;
    optionsStatus.error = optionsStatus.ok ? null
      : !out.length ? "option response schema invalid"
      : `option response partially mapped: ${optionsStatus.rejectedRows} of ${items.length} rows rejected`;
    if (optionsStatus.ok) optionsStatus.lastOk = Date.now();
    return out;
  } catch (e) {
    optionsStatus.ok = false;
    optionsStatus.error = e && e.name === "TimeoutError" ? "timeout" : e?.message ?? String(e);
    return [];
  }
}
