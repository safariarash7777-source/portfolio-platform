import { brsFetch as fetch } from "./brsapi-transport.mjs";
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

import { tehranHour as tehranHourH23, tehranNow, sessionTradeDate } from "./eod.mjs";
const CERT_INTERVAL_MS = 30 * 60 * 1000;

let lastCertFetch = 0;
let certRows = [];         // آخرین ردیف‌های خام گواهی (ریال)
let certAt = null;         // زمان آخرین دریافت موفق
let certError = null;
let certReqToday = 0;
let physState = { lastAttemptDay: null, lastRunDay: null, inserted: 0, lastError: null, table: "unknown", backfillCursor: 0 };
let certEodState = { lastPushDay: null, pushed: 0, lastError: null, table: "unknown" };
let dayKey = "";

function tehranDayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}
// ساعت از `eod.mjs` (h23) — `hour12: false` در بعضی ICUها نیمه‌شب را «24» می‌خواند و
// دروازهٔ «پس از بازار» را باز می‌کرد (B-055). جدول‌های تاریخچهٔ کالا هنوز روی
// Production ساخته نشده‌اند، پس اینجا دادهٔ خرابی نیست؛ این اصلاح پیشگیرانه است.
// تاریخ هر ردیف تاریخچه از date_update همان گواهی می‌آید؛ زمان دریافت جای آن نیست.
function tehranHour() {
  return tehranHourH23();
}
function rollDay() {
  const k = tehranDayKey();
  if (k !== dayKey) { dayKey = k; certReqToday = 0; }
}

const num = (v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && v.trim() === "") return null;
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

/**
 * `client` اختیاری است. وقتی داده شود، درخواست از درگاهِ مرکزی عبور می‌کند؛
 * وقتی نه، مسیرِ قدیمی عیناً اجرا می‌شود. این ماژول هیچ تصمیمی دربارهٔ
 * روشن/خاموش بودنِ پرچم نمی‌گیرد — فراخوان تصمیم می‌گیرد.
 */
export async function refreshCertificates({ base, key, headers, client = null, countLegacy = null }) {
  rollDay();
  const h = tehranHour();
  if (h < 8 || h >= 19) return; // خارج از ساعات بازار — دیتای صبح فردا تازه می‌شود
  if (Date.now() - lastCertFetch < CERT_INTERVAL_MS) return;
  lastCertFetch = Date.now();
  try {
    certReqToday++;
    let j;
    if (client) {
      j = await client.request({
        endpoint: "IME/Certificate.php", producer: "ime-certificate",
        priority: "background",
        // فیدِ مکمل است: اگر بودجه تنگ شد، پیش از چرخهٔ بازار و NAV کنار می‌رود،
        // ولی پیش از بک‌فیل و آرشیو هم نباید قربانی شود.
        budgetClass: "standard",
        dedupeTtlMs: 5 * 60_000, timeoutMs: 20_000,
      });
    } else {
      if (countLegacy) await countLegacy("ime-certificate", "standard");
      const res = await fetch(`${base}/IME/Certificate.php?key=${key}`, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      j = await res.json();
    }
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
// No date is synthesized from receipt time. Retained quotes keep their original
// source day, and missing/future source dates cannot create historical records.
export function planCertEod(rows, now = new Date()) {
  const current = tehranNow(now);
  if (!(current.hour >= 19)) return { rows: [], rejected: 0, skip: "before-close" };
  let rejected = 0;
  const result = [];
  for (const r of rows) {
    const sourceDay = sessionTradeDate(r.date);
    if (!r.id || !sourceDay || sourceDay > current.date) { rejected++; continue; }
    result.push({
      trade_date: sourceDay,
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
    });
  }
  return { rows: result, rejected, skip: result.length ? null : "no-source-session-date" };
}

export async function pushCertEod({ supabaseUrl, serviceKey }) {
  rollDay();
  if (!supabaseUrl || !serviceKey) return;
  if (certRows.length === 0 || !certAt) return;
  const day = tehranDayKey();
  if (certEodState.lastPushDay === day) return;
  const plan = planCertEod(certRows);
  certEodState.skippedSourceDate = plan.rejected;
  if (plan.skip) { certEodState.skip = plan.skip; return; }
  const rows = plan.rows;
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
    certEodState = { lastPushDay: day, pushed: rows.length, lastError: null,
      table: "ok", skippedSourceDate: plan.rejected, skip: null };
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

async function fetchPhysicalDay(jdate, { base, key, headers, client = null, countLegacy = null }) {
  const url = `${base}/IME/Physical.php?key=${key}&date_start=${jdate}&date_end=${jdate}`;
  let j;
  if (client) {
    j = await client.request({
      endpoint: "IME/Physical.php", params: { date_start: jdate, date_end: jdate },
      producer: "ime-physical", priority: "background",
      // معاملاتِ فیزیکیِ روزهای گذشته — تاریخی است و منتظر می‌ماند.
      budgetClass: "bulk",
      dedupeTtlMs: 600_000, timeoutMs: 30_000,
    });
  } else {
    if (countLegacy) await countLegacy("ime-physical", "bulk");
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    j = await res.json();
  }
  if ((j?.successful !== undefined && j.successful !== true)
      || (j?.code_http !== undefined && j.code_http !== 200)) throw new Error("physical source rejected request");
  if (j?.status === "no_data") {
    if (j.successful === true && j.code_http === 200
        && (j.data == null || (Array.isArray(j.data) && j.data.length === 0))) return [];
    throw new Error("unverified physical no_data response");
  }
  if (j?.status !== undefined) throw new Error("unrecognized physical response status");
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.data)) return j.data;
  throw new Error("unknown physical response schema");
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

// One source attempt for each of today's two targets. Only storage is retried.
// State is process-local, single-flight and bounded to one Tehran-day cycle.
const PHYSICAL_STORAGE_MAX_ATTEMPTS = 3;
const PHYSICAL_STORAGE_RETRY_MS = 60 * 60_000;
let physicalCycle = null;
let physicalInflight = null;

function completePhysicalConflictIdentity(raw) {
  const text = value => typeof value === "string" && value.trim().length > 0;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    && text(raw.l18) && text(raw.producer)
    && num(raw.pl) !== null && num(raw.volume_contract) !== null;
}

async function runPhysicalTarget(target, cycle, ports) {
  if (target.complete || target.source === "failed") return;
  if (target.source === "unattempted") {
    // A request that spans midnight must not start the other day's source job.
    if (tehranDayKey() !== cycle.day) return;
    target.source = "failed"; // set before I/O: a failure never refetches today
    target.sourceAttempts++;
    try {
      const arr = await fetchPhysicalDay(target.date, ports);
      // A NULL conflict component makes replay non-idempotent under the existing
      // SQL constraint. Keep the whole target incomplete instead of dropping a
      // bad row silently or manufacturing zero. Do not change the SQL identity.
      target.sourceRows = arr.length;
      target.rejectedRows = arr.filter(raw => !completePhysicalConflictIdentity(raw)).length;
      if (target.rejectedRows > 0) throw new Error("incomplete physical conflict identity");
      const rows = arr.map(raw => mapPhysicalRow(raw, cycle.day));
      target.rejectedRows = rows.filter(row => row.trade_jdate !== target.date).length;
      if (target.rejectedRows > 0) throw new Error("physical source date mismatch");
      target.rows = rows;
      target.source = "ready";
      if (rows.length === 0) { target.complete = true; return; }
    } catch (error) {
      target.error = error?.message ?? String(error);
      return;
    }
  }
  if (target.storageAttempts >= PHYSICAL_STORAGE_MAX_ATTEMPTS || Date.now() < target.nextRetryAt) return;
  target.storageAttempts++;
  try {
    const res = await fetch(`${ports.supabaseUrl}/rest/v1/ime_physical_trades?on_conflict=trade_jdate,symbol_code,producer,price_close_rial,volume_contract`, {
      method: "POST",
      headers: { apikey: ports.serviceKey, Authorization: `Bearer ${ports.serviceKey}`,
        "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(target.rows), signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) {
      physState.table = "missing (run phase19 SQL)";
      throw new Error("physical table missing");
    }
    if (!res.ok) throw new Error(`physical persistence HTTP ${res.status}`);
    target.submitted = target.rows.length;
    target.complete = true;
    target.rows = null;
    target.error = null;
    target.nextRetryAt = 0;
    physState.table = "ok";
  } catch (error) {
    target.error = error?.message ?? String(error);
    target.nextRetryAt = target.storageAttempts < PHYSICAL_STORAGE_MAX_ATTEMPTS
      ? Date.now() + PHYSICAL_STORAGE_RETRY_MS * 2 ** (target.storageAttempts - 1) : null;
  }
}

export function runPhysicalDaily(options) {
  if (physicalInflight) return physicalInflight;
  physicalInflight = runPhysicalDailyOnce(options).finally(() => { physicalInflight = null; });
  return physicalInflight;
}

async function runPhysicalDailyOnce(ports) {
  if (!ports.supabaseUrl || !ports.serviceKey || !ports.key) return;
  const day = tehranDayKey();
  if (physicalCycle && physicalCycle.day !== day) {
    const unresolved = physicalCycle.targets.filter(target => !target.complete);
    physState.expired = { day: physicalCycle.day, incompleteTargets: unresolved.length,
      pendingRows: unresolved.reduce((total, target) => total + (target.rows?.length ?? 0), 0) };
    physicalCycle = null;
  }
  if (!(tehranHour() >= 15)) return;
  if (physState.lastRunDay === day) return;
  if (!physicalCycle) {
    // Daily scope expires completed/failed targets too: later backfill must read
    // the provider again, rather than freezing an old authoritative-empty result.
    physicalCycle = { day, targets: [tehranJalaliToday(), tehranJalaliDaysAgo(1 + (physState.backfillCursor % 7))]
      .map(date => ({ date, source: "unattempted", sourceAttempts: 0, storageAttempts: 0,
        nextRetryAt: 0, rows: null, sourceRows: 0, rejectedRows: 0, submitted: 0, complete: false, error: null })) };
    physState.lastAttemptDay = day;
  }
  for (const target of physicalCycle.targets) await runPhysicalTarget(target, physicalCycle, ports);
  physState.inserted = physicalCycle.targets.reduce((total, target) => total + target.submitted, 0);
  if (physicalCycle.targets.every(target => target.complete)) {
    physState.lastError = null;
    physState.lastRunDay = physicalCycle.day;
    physState.backfillCursor++;
  } else {
    physState.lastError = physicalCycle.targets.find(target => target.error)?.error ?? "physical cycle incomplete";
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
    physical: { ...physState, retryScope: "process-memory-tehran-day", maxProviderRequestsPerDay: 2,
      maxStorageAttemptsPerTarget: PHYSICAL_STORAGE_MAX_ATTEMPTS, cycleDay: physicalCycle?.day ?? null,
      targets: (physicalCycle?.targets ?? []).map(target => ({ date: target.date, source: target.source,
        sourceAttempts: target.sourceAttempts, storageAttempts: target.storageAttempts,
        nextRetryAt: target.nextRetryAt, complete: target.complete, pendingRows: target.rows?.length ?? 0,
        sourceRows: target.sourceRows, rejectedRows: target.rejectedRows, error: target.error })),
    },
  };
}
