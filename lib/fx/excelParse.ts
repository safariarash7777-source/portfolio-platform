// پارس اکسل‌های کلان آرش در سرور — پورت دقیق scripts/fx-refresh-seeds.py
// (که خودش همان data_sources.py داشبورد Streamlit است).
//
// توابع خالص‌اند (ورودی: ArrayBuffer اکسل؛ خروجی: ردیف‌های JSON seed) تا در
// engine.test.ts بدون شبکه تست شوند. هیچ عدد جعلی: سلول نامعتبر → null.

import * as XLSX from "xlsx";
import type { MacroRow } from "./engine";
import type { CpiMonthlyRow, YtmMonthlyRow } from "./dataLoader"; // type-only — زنجیرهٔ ماژول را نمی‌کشد

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

// نگاشت ردیف‌های شیت Data اکسل PPP (همان _ROW_MAP پایتون)
const ROW_MAP: Record<number, string> = {
  3: "cpi_cbi", 4: "infl_cbi", 5: "cpi_sci", 6: "infl_sci",
  7: "m2_irr", 8: "m2_growth", 9: "gdp_growth", 10: "gdp_usd",
  11: "oil_exports", 12: "usa_cpi", 13: "usa_infl", 14: "usa_m2",
  15: "usa_m2_growth", 16: "usa_gdp_growth", 17: "usa_gdp",
};
const FIRST_DATA_COL = 5;

/** «..»، خالی، متن → null؛ اعداد با کاما/فاصله → عدد (همان _to_float پایتون). */
export function toFloat(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === ".." || s === "" || s === "nan" || s === "None") return null;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** ماتریس سلول‌ها (row-major) از یک شیت — مثل pandas header=None. */
function sheetMatrix(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

export interface ParseResult<T> {
  rows: T[];
  range: string;
}

/** اکسل PPP (شیت «Data») → ردیف‌های macro_annual. */
export function parseMacroXlsx(buf: ArrayBuffer): ParseResult<MacroRow> {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["Data"];
  if (!ws) throw new Error("شیت «Data» در اکسل PPP یافت نشد.");
  const m = sheetMatrix(ws);
  if (m.length < 18) throw new Error("ساختار شیت Data ناقص است (کمتر از ۱۸ ردیف).");

  const rows: MacroRow[] = [];
  const yearRow = m[2] ?? [];
  for (let j = FIRST_DATA_COL; j < yearRow.length; j++) {
    const ys = toFloat(yearRow[j]);
    if (ys == null) continue;
    const ym = toFloat((m[1] ?? [])[j]);
    const rec: Record<string, number | null> = {
      year_shamsi: Math.trunc(ys),
      year_miladi: ym != null ? Math.trunc(ym) : null,
    };
    for (const [r, name] of Object.entries(ROW_MAP)) {
      rec[name] = toFloat((m[Number(r)] ?? [])[j]);
    }
    rows.push(rec as unknown as MacroRow);
  }
  if (rows.length < 10) throw new Error(`فقط ${rows.length} سال معتبر پیدا شد — فایل درست است؟`);
  rows.sort((a, b) => a.year_shamsi - b.year_shamsi);
  return { rows, range: `${rows[0].year_shamsi}..${rows[rows.length - 1].year_shamsi}` };
}

/** اکسل سری کامل تورم (شیت اول) → ردیف‌های cpi_monthly با بازسازی CPI لنگر-pp. */
export function parseCpiXlsx(buf: ArrayBuffer): ParseResult<CpiMonthlyRow> {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const recs = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true, defval: null });
  if (!recs.length) throw new Error("اکسل تورم خالی است.");

  const colPeriod = "دوره (سال/ماه)";
  const colMonthly = "تورم ماهانه (درصد)";
  const colPp = "تورم نقطه به نقطه (درصد)";
  const colAnnual = "تورم سالانه (درصد)";
  const keys = Object.keys(recs[0]);
  for (const c of [colPeriod, colMonthly, colPp, colAnnual]) {
    if (!keys.includes(c)) throw new Error(`ستون «${c}» در اکسل تورم یافت نشد. ستون‌ها: ${keys.join("، ")}`);
  }

  const m2n = new Map(PERSIAN_MONTHS.map((name, i) => [name, i + 1]));
  interface Tmp { ym: string; m: number | null; pp: number | null; annual: number | null }
  const tmp: Tmp[] = [];
  for (const r of recs) {
    const s = String(r[colPeriod] ?? "").trim();
    const sp = s.lastIndexOf(" ");
    if (sp < 0) continue;
    const mn = m2n.get(s.slice(0, sp).trim());
    const yr = Number(s.slice(sp + 1));
    if (!mn || !Number.isFinite(yr)) continue;
    tmp.push({
      ym: `${Math.trunc(yr)}/${String(mn).padStart(2, "0")}`,
      m: toFloat(r[colMonthly]),
      pp: toFloat(r[colPp]),
      annual: toFloat(r[colAnnual]),
    });
  }
  if (tmp.length < 12) throw new Error(`فقط ${tmp.length} ماه معتبر پیدا شد — فایل درست است؟`);

  // بازسازی CPI با لنگر نقطه‌به‌نقطه (همان منطق پایتون/Streamlit)
  const n = tmp.length;
  const cpi = new Array<number>(n).fill(NaN);
  cpi[0] = 100;
  for (let i = 1; i < Math.min(12, n); i++) {
    const seed = tmp[i].m ?? 0;
    cpi[i] = cpi[i - 1] * (1 + seed / 100);
  }
  for (let i = 12; i < n; i++) {
    const anchor = tmp[i].pp ?? 0;
    cpi[i] = cpi[i - 12] * (1 + anchor / 100);
  }
  const round4 = (x: number | null): number | null =>
    x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000;

  const rows: CpiMonthlyRow[] = tmp.map((t, i) => ({
    ym: t.ym,
    infl_pp: round4(t.pp),
    infl_monthly: i === 0 ? null : round4((cpi[i] / cpi[i - 1] - 1) * 100),
    infl_annual: round4(t.annual),
    cpi_index: round4(cpi[i]),
  }));
  return { rows, range: `${rows[0].ym}..${rows[rows.length - 1].ym}` };
}

/** اکسل Macroeconomics-data (YTM اخزا، header ردیف ۴) → میانگین ماهانه ×۱۰۰. */
export function parseYtmXlsx(buf: ArrayBuffer): ParseResult<YtmMonthlyRow> {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const m = sheetMatrix(ws);
  // header=3 در پانداس یعنی داده از ردیف ۵ (اندیس ۴)
  const acc = new Map<string, { sum: number; n: number }>();
  for (let i = 4; i < m.length; i++) {
    const row = m[i] ?? [];
    const shamsi = row[1];
    const val = toFloat(row[2]);
    if (shamsi == null || val == null) continue;
    const ym = String(shamsi).slice(0, 7).replace("-", "/");
    if (!/^\d{4}\/\d{2}$/.test(ym)) continue;
    const cur = acc.get(ym) ?? { sum: 0, n: 0 };
    cur.sum += val;
    cur.n += 1;
    acc.set(ym, cur);
  }
  if (acc.size < 6) throw new Error(`فقط ${acc.size} ماه معتبر YTM پیدا شد — فایل درست است؟`);
  const rows: YtmMonthlyRow[] = [...acc.entries()]
    .map(([ym, { sum, n }]) => ({ ym, ytm: Math.round((sum / n) * 100 * 10000) / 10000 }))
    .sort((a, b) => (a.ym < b.ym ? -1 : 1));
  return { rows, range: `${rows[0].ym}..${rows[rows.length - 1].ym}` };
}

/** base_rates: JSON دستی {سال: نرخ تومان} — از textarea (نه اکسل). */
export function parseBaseRatesJson(text: string): { rows: Record<string, number>; range: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("JSON نامعتبر است.");
  }
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("انتظار می‌رود شیء {\"سال\": نرخ} باشد.");
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const y = Number(k);
    const rate = toFloat(v);
    if (!Number.isInteger(y) || y < 1300 || y > 1500) throw new Error(`سال نامعتبر: «${k}»`);
    if (rate == null || rate <= 0) throw new Error(`نرخ نامعتبر برای سال ${k}: «${v}»`);
    out[String(y)] = rate;
  }
  const ys = Object.keys(out).map(Number).sort((a, b) => a - b);
  if (ys.length < 5) throw new Error("حداقل ۵ سال لازم است.");
  return { rows: out, range: `${ys[0]}..${ys[ys.length - 1]}` };
}
