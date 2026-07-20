// لایهٔ دادهٔ سرور «پنل رصد ادمین» — SPEC-admin-market-radar.md
//
// فقط خواندن از symbol_history و codal_reports (append-only دست‌نخورده).
// آخرین روز معاملاتی هر نماد (همهٔ ستون‌های تابلو) + میانگین حجم ۱۰روزهٔ قبل +
// مشتق‌های ن-۳۰ (YoY فروش ماهانه، شکاف تولید−فروش، سهم صادرات) → RadarRow[].
// فیلتر Z (زیرنماد رقم‌دار) و حق‌تقدم در مبدأ اعمال می‌شود.

import type { HistoryDay } from "./engine";
import {
  computeRadarRow,
  isSubTicker,
  isRightsIssue,
  type RadarRow,
  type FundamentalExtras,
} from "./marketRadar";
import { getAvgVolume10 } from "./avgVolume";
import { buildMonthlyYoY } from "./fundamentalData";

const REVALIDATE_MS = 10 * 60 * 1000;
let cacheAt = 0;
let cacheVal: RadarRow[] | null = null;

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

interface FullRow extends HistoryDay {
  id: number;
  symbol: string;
}

const SELECT_COLS =
  "id,symbol,trade_date,close,last_price,volume,value_traded," +
  "individual_buy_value,individual_sell_value,individual_buy_count," +
  "individual_sell_count,legal_buy_value,legal_sell_value,buyer_power";

/** آخرین روز معاملاتی هر نماد (پنجرهٔ ~۱۰ روز تقویمی؛ dedupe نماد+تاریخ با id بزرگ‌تر). */
async function fetchLatestDays(): Promise<Map<string, FullRow>> {
  const e = env();
  if (!e) return new Map();
  const since = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const rows: FullRow[] = [];
  // سقف PostgREST روی این پروژه ۱۰۰۰ ردیف است (max-rows)؛ کرسر id به‌جای offset عمیق.
  const PAGE = 1_000;
  let cursor = 0;
  try {
    for (let page = 0; page < 40; page++) {
      const qs = new URLSearchParams({
        select: SELECT_COLS,
        trade_date: `gte.${since}`,
        id: `gt.${cursor}`,
        order: "id.asc",
        limit: String(PAGE),
      });
      // 500 گذرای PostgREST (فشار لحظه‌ای) — تا ۳ تلاش با وقفه
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${e.url}/rest/v1/symbol_history?${qs}`, {
          headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
          signal: AbortSignal.timeout(20000),
          next: { revalidate: 600 },
        });
        if (res.ok) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!res || !res.ok) break;
      const batch = (await res.json()) as FullRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      cursor = batch[batch.length - 1].id;
    }
  } catch {
    return new Map();
  }
  // آخرین تاریخ هر نماد؛ در همان تاریخ، id بزرگ‌تر برنده.
  const latest = new Map<string, FullRow>();
  for (const r of rows) {
    if (!r.symbol || !r.trade_date) continue;
    const prev = latest.get(r.symbol);
    if (
      !prev ||
      r.trade_date > prev.trade_date ||
      (r.trade_date === prev.trade_date && r.id > prev.id)
    ) {
      latest.set(r.symbol, r);
    }
  }
  return latest;
}

interface N30Extras {
  prodSalesGap: number | null;
  exportSharePct: number | null;
}

interface CodalRow {
  symbol: string | null;
  data: Record<string, unknown> | null;
}

function num(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return isFinite(n) && x != null && x !== "" ? n : null;
}

/**
 * مشتق‌های ن-۳۰ برای رادار — آخرین ماه گزارش‌شدهٔ هر نماد:
 * شکاف تولید−فروش (Σ production_qty − Σ sales_qty محصولات دارای هر دو مقدار)
 * و سهم صادرات (Σ sales_amount صادراتی ÷ Σ کل، درصد). دادهٔ غایب = null.
 */
export function deriveN30Extras(rows: CodalRow[]): Map<string, N30Extras> {
  // نماد → آخرین period_end دیده‌شده (rows به ترتیب captured_at نزولی می‌آیند)
  const bySymbol = new Map<string, { periodEnd: string; data: Record<string, unknown> }>();
  for (const r of rows) {
    if (!r.symbol || !r.data) continue;
    const pe = String(r.data["period_end"] ?? "");
    if (!/^\d{4}[/-]\d{1,2}/.test(pe)) continue;
    const prev = bySymbol.get(r.symbol);
    // جدیدترین ماه برنده؛ در ماهِ برابر اولین دیده‌شده (جدیدترین نسخه/اصلاحیه) می‌ماند
    if (!prev || pe.localeCompare(prev.periodEnd) > 0) {
      if (!prev) bySymbol.set(r.symbol, { periodEnd: pe, data: r.data });
      else bySymbol.set(r.symbol, { periodEnd: pe, data: r.data });
    }
  }
  const out = new Map<string, N30Extras>();
  for (const [sym, { data }] of bySymbol) {
    const products = Array.isArray(data["products"])
      ? (data["products"] as Array<Record<string, unknown>>)
      : [];
    let prod = 0, sales = 0, seen = 0;
    let expAmt = 0, totalAmt = 0;
    for (const p of products) {
      const pq = num(p["production_qty"]);
      const sq = num(p["sales_qty"]);
      if (pq != null && sq != null) {
        prod += pq;
        sales += sq;
        seen++;
      }
      const amt = num(p["sales_amount"]);
      if (amt != null) {
        totalAmt += amt;
        if (p["market"] === "صادراتی") expAmt += amt;
      }
    }
    out.set(sym, {
      prodSalesGap: seen > 0 ? prod - sales : null,
      exportSharePct: totalAmt > 0 ? (expAmt / totalAmt) * 100 : null,
    });
  }
  return out;
}

async function fetchN30Rows(): Promise<CodalRow[]> {
  const e = env();
  if (!e) return [];
  const url =
    `${e.url}/rest/v1/codal_reports?select=symbol,data` +
    `&report_kind=eq.${encodeURIComponent("ن-۳۰")}` +
    `&order=captured_at.desc&limit=3000`;
  try {
    const res = await fetch(url, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return (await res.json()) as CodalRow[];
  } catch {
    return [];
  }
}

/* ── غنی‌سازی از اسنپشات زنده ──
 * ردیف‌های relay_eod در symbol_history ستون‌های حقیقی/حقوقی ندارند (null صادق).
 * اسنپشات زندهٔ رله (ir_market_snapshots/latest) همین داده را لحظه‌ای دارد:
 * buyI/sellI = حجم خرید/فروش حقیقی (سهم)، buyCountI/sellCountI = تعداد،
 * قیمت/ارزش برحسب تومان (unit=toman). برای هم‌واحدی با مسیر symbol_history
 * (ریال)، مقادیر تومانی ×۱۰ به ریال تبدیل می‌شوند (تثبیت واحد در مرز — D3). */

interface SnapStock {
  id?: string;
  price?: number | null;
  closingPrice?: number | null;
  volume?: number | null;
  value?: number | null;
  buyI?: number | null;
  sellI?: number | null;
  buyCountI?: number | null;
  sellCountI?: number | null;
  sellN?: number | null;
}

async function fetchSnapshotStocks(): Promise<Map<string, SnapStock>> {
  const e = env();
  if (!e) return new Map();
  try {
    const res = await fetch(
      `${e.url}/rest/v1/ir_market_snapshots?key=eq.latest&select=payload`,
      {
        headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
        signal: AbortSignal.timeout(20000),
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return new Map();
    const arr = (await res.json()) as Array<{ payload?: { stocks?: SnapStock[]; funds?: SnapStock[] } }>;
    const out = new Map<string, SnapStock>();
    for (const s of [
      ...(arr[0]?.payload?.stocks ?? []),
      ...(arr[0]?.payload?.funds ?? []),
    ]) {
      if (s.id) out.set(s.id, s);
    }
    return out;
  } catch {
    return new Map();
  }
}

const TOMAN_TO_RIAL = 10;

function snapNum(x: number | null | undefined): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

/**
 * پرکردن ستون‌های غایب آخرین روز از اسنپشات زنده (فقط وقتی ستون در تاریخچه null است).
 * خروجی همه به ریال — همان واحد symbol_history.
 */
export function enrichDayFromSnapshot(day: HistoryDay, s: SnapStock | undefined): HistoryDay {
  if (!s) return day;
  const px = snapNum(s.closingPrice) ?? snapNum(s.price); // تومان
  const pxRial = px != null ? px * TOMAN_TO_RIAL : null;
  const buyI = snapNum(s.buyI);
  const sellI = snapNum(s.sellI);
  const sellN = snapNum(s.sellN);
  const out: HistoryDay = { ...day };
  if (out.individual_buy_value == null && buyI != null && pxRial != null)
    out.individual_buy_value = buyI * pxRial;
  if (out.individual_sell_value == null && sellI != null && pxRial != null)
    out.individual_sell_value = sellI * pxRial;
  if (out.individual_buy_count == null) out.individual_buy_count = snapNum(s.buyCountI);
  if (out.individual_sell_count == null) out.individual_sell_count = snapNum(s.sellCountI);
  // سهم حقوقی فقط وقتی صورت و مخرج هر دو از یک منبع باشند — مخلوط‌کردن
  // sellN زنده با value_traded تاریخی نسبت > ۱ می‌سازد (بازهٔ زمانی متفاوت).
  if (out.legal_sell_value == null && sellN != null && pxRial != null) {
    out.legal_sell_value = sellN * pxRial;
    if (snapNum(s.value) != null) out.value_traded = (s.value as number) * TOMAN_TO_RIAL;
    else out.value_traded = null; // منبع مخرج نامعلوم → نسبت محاسبه نشود (null صادق)
  } else if (out.value_traded == null && snapNum(s.value) != null) {
    out.value_traded = (s.value as number) * TOMAN_TO_RIAL;
  }
  return out;
}

/**
 * ردیف‌های رادار برای همهٔ نمادهای اصلی (پس از فیلتر Z و حق‌تقدم).
 * کش ۱۰ دقیقه‌ای — هم‌گام با چرخهٔ رله.
 */
export async function getRadarRows(): Promise<RadarRow[]> {
  if (cacheVal && Date.now() - cacheAt < REVALIDATE_MS) return cacheVal;
  const [latestDays, avg10, yoyMap, n30Rows, snapStocks] = await Promise.all([
    fetchLatestDays(),
    getAvgVolume10(),
    buildMonthlyYoY(),
    fetchN30Rows(),
    fetchSnapshotStocks(),
  ]);
  const n30Extras = deriveN30Extras(n30Rows);
  const rows: RadarRow[] = [];
  for (const [symbol, day] of latestDays) {
    if (isSubTicker(symbol) || isRightsIssue(symbol)) continue; // قاعدهٔ Z در مبدأ
    const enriched = enrichDayFromSnapshot(day, snapStocks.get(symbol));
    const extras: FundamentalExtras = {
      yoyMonthly: yoyMap.get(symbol) ?? null,
      prodSalesGap: n30Extras.get(symbol)?.prodSalesGap ?? null,
      exportSharePct: n30Extras.get(symbol)?.exportSharePct ?? null,
    };
    rows.push(computeRadarRow(symbol, enriched, avg10.get(symbol) ?? null, extras));
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol, "fa"));
  if (rows.length > 0) {
    cacheAt = Date.now();
    cacheVal = rows;
  }
  return rows;
}
