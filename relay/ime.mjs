// ime.mjs — T5-4/5: بورس کالا (IME) — گواهی سپردهٔ کالایی + معاملات فیزیکی
//
// مستندات رسمی (راستی‌آزمایی‌شده):
//   Certificate: https://Api.BrsApi.ir/IME/Certificate.php?key=KEY
//     فیلدها: commodity, contract_code (CD1GOB0001), contract_description,
//     contract_size, contract_currency, py/pf/pl/pmax/pmin (+c/+p), tno, tvol,
//     tval (واحد: «هزار ریال»)، عمق ۳سطحی qd/pd/qo/po، date_update/time_update.
//   Physical: https://Api.BrsApi.ir/IME/Physical.php?key=KEY&date_start=J&date_end=J
//     (تاریخ جلالی خط‌تیره‌دار؛ بدون پارامتر = امروز؛ روز تعطیل →
//      {"code_http":200,"successful":true,"status":"no_data"})
//     فیلدها: l18, l30, market_hall, producer, supplier, broker, type_contract,
//     type_settlement, date_trade (جلالی اسلش‌دار!), price_base_offer,
//     volume_contract, volume_offer, demand, pmin, pmax, pl, pc, tval (هزار ریال).
//
// قواعد:
//   - گواهی: هر ۳۰ دقیقه در ساعات بازار تهران (۸ تا ۱۹) یک درخواست → بخش
//     imeCertificates در payload اسنپ‌شات (قیمت‌ها ریال→تومان مثل بقیهٔ payload).
//   - فیزیکی: روزی یک‌بار (بعد از ۱۵ تهران) + بک‌فیل تدریجی ۷ روز اخیر → جدول
//     append-only ime_physical_trades (تا اجرای migration توسط کلود، 404 بی‌صداست
//     ولی در status پیداست).
//   - append پایان‌روز گواهی‌ها → جدول ime_certificate_history (همان قاعده).
//   - بودجه: گواهی ~۲۲/روز + فیزیکی ۱-۲/روز — در status شمرده می‌شود.

const CERT_INTERVAL_MS = 30 * 60 * 1000;

let lastCertFetch = 0;
let certRows = [];         // آخرین ردیف‌های خام گواهی (ریال)
let certAt = null;         // زمان آخرین دریافت موفق
let certError = null;
let certReqToday = 0;
let physState = { lastRunDay: null, inserted: 0, lastError: null, table: "unknown", backfillCursor: 0 };
let certEodState = { lastPushDay: null, pushed: 0, lastError: null, table: "unknown" };
let dayKey = "";

function tehranDayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}
function tehranHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hour12: false }).format(new Date()));
}
function rollDay() {
  const k = tehranDayKey();
  if (k !== dayKey) { dayKey = k; certReqToday = 0; }
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── گواهی سپردهٔ کالایی ──────────────────────────────────────────────────────
// خروجی برای payload: قیمت‌ها به تومان (ریال ÷ ۱۰)، ارزش معاملات به تومان
// (tval «هزار ریال» × ۱۰۰۰ ÷ ۱۰ = ×۱۰۰).
export function mapCertRow(d) {
  const toToman = (v) => { const n = num(v); return n === null ? null : n / 10; };
  return {
    id: typeof d.contract_code === "string" ? d.contract_code : null,
    commodity: typeof d.commodity === "string" ? d.commodity : null,
    title: typeof d.contract_description === "string" ? d.contract_description : null,
    contractSize: num(d.contract_size),
    price: toToman(d.pl),                 // آخرین قیمت (تومان)
    changePercent: num(d.plp),
    close: toToman(d.pc ?? d.pl),
    yesterday: toToman(d.py),
    high: toToman(d.pmax),
    low: toToman(d.pmin),
    tradeCount: num(d.tno),
    volume: num(d.tvol),
    valueToman: num(d.tval) === null ? null : num(d.tval) * 100, // هزار ریال → تومان
    date: typeof d.date_update === "string" ? d.date_update : null,
    time: typeof d.time_update === "string" ? d.time_update : null,
  };
}

export async function refreshCertificates({ base, key, headers }) {
  rollDay();
  const h = tehranHour();
  if (h < 8 || h >= 19) return; // خارج از ساعات بازار — دیتای صبح فردا تازه می‌شود
  if (Date.now() - lastCertFetch < CERT_INTERVAL_MS) return;
  lastCertFetch = Date.now();
  try {
    certReqToday++;
    const res = await fetch(`${base}/IME/Certificate.php?key=${key}`, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const j = await res.json();
    const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
    const rows = arr.map(mapCertRow).filter((r) => r.id && r.price !== null);
    if (rows.length === 0) throw new Error("empty certificate response");
    certRows = rows;
    certAt = Date.now();
    certError = null;
  } catch (e) {
    certError = e?.message ?? String(e);
  }
}

// ردیف‌های گواهی برای payload اسنپ‌شات (یا [] اگر هنوز دریافت نشده).
export function certificatesForPayload() {
  return certRows;
}

// ── append پایان‌روز گواهی‌ها → ime_certificate_history ─────────────────────
export async function pushCertEod({ supabaseUrl, serviceKey }) {
  rollDay();
  if (!supabaseUrl || !serviceKey) return;
  if (certRows.length === 0 || !certAt) return;
  const day = tehranDayKey();
  if (certEodState.lastPushDay === day) return;
  if (tehranHour() < 19) return; // فقط بعد از پایان بازار
  const rows = certRows.map((r) => ({
    trade_date: day,
    contract_code: r.id,
    commodity: r.commodity,
    title: r.title,
    close_toman: r.close,
    last_toman: r.price,
    high_toman: r.high,
    low_toman: r.low,
    change_percent: r.changePercent,
    trade_count: r.tradeCount,
    volume: r.volume,
    value_toman: r.valueToman,
    source: "brsapi_ime_cert",
  }));
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/ime_certificate_history?on_conflict=trade_date,contract_code`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (res.status === 404) { certEodState.table = "missing (run phase19 SQL)"; return; }
    if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 120)}`);
    certEodState = { lastPushDay: day, pushed: rows.length, lastError: null, table: "ok" };
  } catch (e) {
    certEodState.lastError = e?.message ?? String(e);
  }
}

// ── معاملات فیزیکی ───────────────────────────────────────────────────────────
// جلالی امروز تهران به فرمت خط‌تیره‌دار (پارامتر date_start/date_end).
export function tehranJalaliToday() {
  const p = new Intl.DateTimeFormat("fa-IR-u-nu-latn-ca-persian", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// نگاشت ردیف فیزیکی → ردیف جدول (اعداد خام ریال حفظ می‌شود؛ tval هزارریال است
// و همان خام درج می‌شود تا هیچ ابهام واحدی در دیتابیس نباشد — ستون‌ها صریح‌اند).
export function mapPhysicalRow(d, fetchDay) {
  const jd = typeof d.date_trade === "string" ? d.date_trade.replace(/\//g, "-") : null;
  return {
    trade_jdate: jd,
    fetch_date: fetchDay,
    symbol_code: typeof d.l18 === "string" ? d.l18 : null,
    commodity_name: typeof d.l30 === "string" ? d.l30 : null,
    market_hall: typeof d.market_hall === "string" ? d.market_hall : null,
    producer: typeof d.producer === "string" ? d.producer : null,
    supplier: typeof d.supplier === "string" ? d.supplier : null,
    type_contract: typeof d.type_contract === "string" ? d.type_contract : null,
    unit: typeof d.unit === "string" ? d.unit : null,
    currency: typeof d.currency === "string" ? d.currency : null,
    price_base_rial: num(d.price_base_offer),
    volume_contract: num(d.volume_contract),
    volume_offer: num(d.volume_offer),
    demand: num(d.demand),
    price_min_rial: num(d.pmin),
    price_max_rial: num(d.pmax),
    price_close_rial: num(d.pl),
    price_wavg_rial: num(d.pc),
    value_krial: num(d.tval), // هزار ریال — خام طبق مستند
    source: "brsapi_ime_physical",
  };
}

async function fetchPhysicalDay(jdate, { base, key, headers }) {
  const url = `${base}/IME/Physical.php?key=${key}&date_start=${jdate}&date_end=${jdate}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const j = await res.json();
  if (j && !Array.isArray(j) && j.status === "no_data") return [];
  const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
  return arr;
}

// جلالی n روز قبل (تقریب با شمارش روز میلادی و فرمت مجدد — دقیق است چون
// Intl خودش تقویم را تبدیل می‌کند).
function tehranJalaliDaysAgo(n) {
  const p = new Intl.DateTimeFormat("fa-IR-u-nu-latn-ca-persian", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// روزی یک‌بار (بعد از ۱۵ تهران): امروز + یک روزِ بک‌فیل از ۷ روز اخیر.
export async function runPhysicalDaily({ base, key, headers, supabaseUrl, serviceKey }) {
  if (!supabaseUrl || !serviceKey || !key) return;
  const day = tehranDayKey();
  if (physState.lastRunDay === day) return;
  if (tehranHour() < 15) return;
  physState.lastRunDay = day;
  try {
    const today = tehranJalaliToday();
    // بک‌فیل تدریجی: هر روز یک روزِ گذشته (۱..۷) هم گرفته می‌شود.
    const backDay = tehranJalaliDaysAgo(1 + (physState.backfillCursor % 7));
    physState.backfillCursor++;
    let inserted = 0;
    for (const jd of [today, backDay]) {
      const arr = await fetchPhysicalDay(jd, { base, key, headers });
      const rows = arr.map((d) => mapPhysicalRow(d, day)).filter((r) => r.symbol_code && r.trade_jdate);
      if (rows.length === 0) continue;
      const res = await fetch(`${supabaseUrl}/rest/v1/ime_physical_trades?on_conflict=trade_jdate,symbol_code,producer,price_close_rial,volume_contract`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      });
      if (res.status === 404) { physState.table = "missing (run phase19 SQL)"; return; }
      if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 120)}`);
      inserted += rows.length;
      physState.table = "ok";
    }
    physState.inserted = inserted;
    physState.lastError = null;
  } catch (e) {
    physState.lastError = e?.message ?? String(e);
  }
}

export function imeStatus() {
  return {
    certificate: {
      rows: certRows.length,
      lastFetchAt: certAt,
      reqToday: certReqToday,
      lastError: certError,
      eod: certEodState,
    },
    physical: physState,
  };
}
