// خواندن گزارش‌های کدال از Supabase (جدول codal_reports که رلهٔ لیارا پر می‌کند).
// قرارداد خروجی همان SymbolFundamentals رجیستری است تا UI بدون تغییر کار کند.
//
// قواعد انتخاب (append-only بودن جدول یعنی نسخه‌های تکراری وجود دارد):
// ۱) فقط ردیف‌هایی که data دارند (پارس موفق).
// ۲) بالاترین raw.parser_version برای هر اطلاعیه (پسوند #pvN در source_url).
// ۳) برای هر (period_end, period_months): «حسابرسی‌شده» بر نشده مقدم است؛
//    بعد جدیدترین id (اصلاحیهٔ متأخر).
// ۴) n10 اصلی صفحه = جدیدترین گزارش سالانه (۱۲ماهه)؛ اگر نبود جدیدترین میان‌دوره.
// ۵) سری روند فروش از دل همهٔ دوره‌های ۱۲ماههٔ موجود ساخته می‌شود.

import type {
  CodalN10Data,
  CodalN30Data,
  SymbolFundamentals,
} from "./types";

interface CodalRow {
  id: number;
  symbol: string;
  report_kind: string;
  period_end: string | null;
  title: string | null;
  source_url: string | null;
  data: (CodalN10Data | CodalN30Data) & Record<string, unknown>;
  raw: {
    parser_version?: number;
    audited?: boolean;
    period_months?: number;
    period_end_jalali?: string;
    announcement_link?: string | null;
  } | null;
}

const REVALIDATE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: SymbolFundamentals | null }>();

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

async function fetchRows(symbol: string): Promise<CodalRow[] | null> {
  const e = env();
  if (!e) return null;
  const qs = new URLSearchParams({
    select: "id,symbol,report_kind,period_end,title,source_url,data,raw",
    symbol: `eq.${symbol}`,
    data: "not.is.null",
    order: "id.desc",
    limit: "120", // T1: جا برای ۲۶ گزارش ن-۳۰ + نسخه‌های تکراری/اصلاحیه + ن-۱۰ها
  });
  try {
    const res = await fetch(`${e.url}/rest/v1/codal_reports?${qs}`, {
      headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as CodalRow[];
  } catch {
    return null;
  }
}

/** آدرس اطلاعیهٔ codal.ir بدون پسوند نسخهٔ پارسر. */
function cleanUrl(row: CodalRow): string | null {
  const link = row.raw?.announcement_link ?? row.source_url;
  return link ? link.replace(/#pv\d+$/, "") : null;
}

function parserVersion(row: CodalRow): number {
  if (row.raw?.parser_version) return row.raw.parser_version;
  const m = String(row.source_url ?? "").match(/#pv(\d+)$/);
  return m ? Number(m[1]) : 1;
}

/** حذف نسخه‌های تکراری: هر اطلاعیه فقط با بالاترین نسخهٔ پارسر. */
function latestParserRows(rows: CodalRow[]): CodalRow[] {
  const byAnnouncement = new Map<string, CodalRow>();
  for (const r of rows) {
    const key = cleanUrl(r) ?? String(r.id);
    const prev = byAnnouncement.get(key);
    if (!prev || parserVersion(r) > parserVersion(prev)) byAnnouncement.set(key, r);
  }
  return [...byAnnouncement.values()];
}

/** برای هر دورهٔ مالی یک گزارش: حسابرسی‌شده مقدم، بعد جدیدترین id. */
function dedupeByPeriod(rows: CodalRow[]): CodalRow[] {
  const byPeriod = new Map<string, CodalRow>();
  for (const r of rows) {
    const d = r.data as CodalN10Data;
    const key = `${d.period_end}|${d.period_months}`;
    const prev = byPeriod.get(key);
    if (!prev) { byPeriod.set(key, r); continue; }
    const pa = (prev.data as CodalN10Data).audited === true;
    const ca = d.audited === true;
    if (ca && !pa) byPeriod.set(key, r);
    else if (ca === pa && r.id > prev.id) byPeriod.set(key, r);
  }
  return [...byPeriod.values()];
}

/** سال مالی جلالی از period_end مثل "1404-12-29" → 1404. */
function fyOf(d: CodalN10Data): number {
  return Number(String(d.period_end).slice(0, 4)) || 0;
}

function buildFundamentals(symbol: string, rows: CodalRow[]): SymbolFundamentals | null {
  const fresh = latestParserRows(rows);

  const n10all = dedupeByPeriod(
    fresh.filter((r) => r.report_kind === "ن-۱۰" && (r.data as CodalN10Data).standalone),
  ).sort((a, b) => {
    const da = a.data as CodalN10Data;
    const db = b.data as CodalN10Data;
    return db.period_end.localeCompare(da.period_end) || db.period_months - da.period_months;
  });

  const annuals = n10all.filter((r) => (r.data as CodalN10Data).period_months === 12);
  const main = annuals[0] ?? n10all[0] ?? null;

  const n30rows = fresh
    .filter((r) => r.report_kind === "ن-۳۰" && Array.isArray((r.data as CodalN30Data).products))
    .sort((a, b) =>
      (b.data as CodalN30Data).period_end.localeCompare((a.data as CodalN30Data).period_end),
    )
    .slice(0, 26); // T1: تا ۲۶ گزارش ماهانه — پوشش سال مالی جاری + سال قبل برای مقایسه

  if (!main && n30rows.length === 0) return null;

  let n10: SymbolFundamentals["n10"] = null;
  if (main) {
    const d = { ...(main.data as CodalN10Data) };
    // روند فروش چندساله از خود گزارش‌های سالانهٔ موجود (فقط دوره‌های ۱۲ماهه).
    if (!d.sales_trend_5y && annuals.length >= 2) {
      d.sales_trend_5y = annuals
        .map((r) => {
          const a = r.data as CodalN10Data;
          return { fy: fyOf(a), revenue: a.standalone.revenue, cogs: a.standalone.cogs };
        })
        .filter((t) => t.fy > 0 && t.revenue > 0)
        .sort((x, y) => x.fy - y.fy);
    }
    const faDigits = (v: number | string) =>
      String(v).replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[Number(c)]);
    const periodLabel = d.period_months === 12 ? "۱۲ماههٔ" : `${faDigits(d.period_months)}ماههٔ`;
    n10 = {
      data: d,
      source: {
        title: `صورت‌های مالی ${periodLabel} ${d.audited ? "حسابرسی‌شدهٔ" : "حسابرسی‌نشدهٔ"} سال مالی ${faDigits(fyOf(d))} (کدال)`,
        source_url: cleanUrl(main),
        verified: true,
        verification_note: "استخراج خودکار از اکسل رسمی کدال با اعتبارسنجی حسابی (ناخالص = فروش − بها)",
      },
    };
  }

  let n30: SymbolFundamentals["n30"] = null;
  if (n30rows.length > 0) {
    n30 = {
      data: n30rows.map((r) => r.data as CodalN30Data),
      source: {
        title: "گزارش‌های فعالیت ماهانه (ن-۳۰) کدال",
        source_url: cleanUrl(n30rows[0]),
        verified: true,
      },
    };
  }

  return { symbol, n10, n30 };
}

/** دادهٔ بنیادی نماد از Supabase؛ نبودِ داده یا خطا → null (بدون عدد ساختگی). */
export async function getFundamentalsFromSupabase(
  symbol: string,
): Promise<SymbolFundamentals | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) return hit.value;
  const rows = await fetchRows(symbol);
  const value = rows && rows.length > 0 ? buildFundamentals(symbol, rows) : null;
  // خطای شبکه (rows=null) کش نمی‌شود تا درخواست بعدی دوباره تلاش کند.
  if (rows !== null) cache.set(symbol, { at: Date.now(), value });
  return value;
}
