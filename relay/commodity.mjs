// commodity.mjs — T5-6: کامودیتی جهانی (Market/Commodity.php) — کلید رایگان جدا
//
// مستند رسمی (راستی‌آزمایی‌شده): https://brsapi.ir/free-api-commodity-webservice/
//   GET https://BrsApi.ir/Api/Market/Commodity.php?key=FREE_KEY
//   (بیس متفاوت از Api.BrsApi.ir! با env جدا قابل تغییر)
//   پاسخ: آرایهٔ آیتم‌ها با فیلدهای symbol, name (فارسی), price, change_percent,
//   unit (دلار/اونس و ...)، date, time.
//
// قواعد:
//   - کلید جدا BRSAPI_COMMODITY_KEY (پلن رایگان ~۱۵۰۰ درخواست/روز).
//   - هر چرخهٔ ۵دقیقه‌ای یک درخواست (~۲۸۸/روز) — کاملاً داخل سهمیهٔ رایگان.
//   - بدون کلید → غیرفعالِ صادق (status: disabled)، هیچ خطای مزاحمی.
//   - اعداد دلاری همان خام می‌ماند (هیچ تبدیل ریالی) — واحد در فیلد unit صریح است.

const COMMODITY_BASE = (process.env.BRSAPI_COMMODITY_BASE || "https://BrsApi.ir/Api").replace(/\/+$/, "");
const COMMODITY_KEY = process.env.BRSAPI_COMMODITY_KEY || "";

let rows = [];
let at = null;
let lastError = null;
let reqToday = 0;
let dayKey = "";

function rollDay() {
  const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  if (k !== dayKey) { dayKey = k; reqToday = 0; }
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function mapCommodityRow(d) {
  return {
    id: typeof d.symbol === "string" ? d.symbol : null,
    name: typeof d.name === "string" ? d.name : null,
    price: num(d.price),
    changePercent: num(d.change_percent),
    unit: typeof d.unit === "string" ? d.unit : null,
    date: typeof d.date === "string" ? d.date : null,
    time: typeof d.time === "string" ? d.time : null,
  };
}

export async function refreshCommodities(headers) {
  if (!COMMODITY_KEY) return; // غیرفعالِ صادق
  rollDay();
  try {
    reqToday++;
    const res = await fetch(`${COMMODITY_BASE}/Market/Commodity.php?key=${COMMODITY_KEY}`, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const j = await res.json();
    const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
    const mapped = arr.map(mapCommodityRow).filter((r) => r.id && r.price !== null);
    if (mapped.length === 0) throw new Error("empty commodity response");
    rows = mapped;
    at = Date.now();
    lastError = null;
  } catch (e) {
    lastError = e?.message ?? String(e);
  }
}

export function commoditiesForPayload() {
  return rows;
}

export function commodityStatus() {
  return {
    enabled: Boolean(COMMODITY_KEY),
    rows: rows.length,
    lastFetchAt: at,
    reqToday,
    lastError: COMMODITY_KEY ? lastError : "BRSAPI_COMMODITY_KEY not set (disabled)",
  };
}
